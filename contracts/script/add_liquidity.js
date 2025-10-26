const hre = require("hardhat");
const { ethers } = require("hardhat");

// Uniswap V3 addresses on Sepolia
const UNISWAP_V3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";
const NONFUNGIBLE_POSITION_MANAGER =
  "0x1238536071E1c677A632429e3655c799b22cDA52";

// Fee tier: 0.3% = 3000
const FEE_TIER = 3000;

// Default amount: 100,000 tokens (in 6 decimals = 100,000,000,000)
const DEFAULT_AMOUNT = 100_000n * 10n ** 6n;

// Uniswap V3 Factory ABI (minimal)
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
];

// Uniswap V3 Pool ABI (minimal)
const POOL_ABI = [
  "function initialize(uint160 sqrtPriceX96) external",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

// Uniswap V3 NonfungiblePositionManager ABI (minimal)
const NPM_ABI = [
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  "function balanceOf(address owner) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function mint(address to, uint256 amount) external", // For mock tokens
];

// CornerstoneProject ABI (minimal)
const PROJECT_ABI = [
  "function token() external view returns (address)",
  "function stablecoin() external view returns (address)",
  "function deposit(uint256 amount) external",
];

/**
 * Calculate sqrt price for 1:1 ratio
 * sqrtPriceX96 = sqrt(price) * 2^96
 * For 1:1 price: sqrt(1) * 2^96 = 2^96
 */
function getSqrtPriceX96For1to1() {
  return 2n ** 96n;
}

/**
 * Get min and max tick for full range liquidity
 * Tick spacing for 0.3% fee tier is 60
 */
function getFullRangeTicks() {
  const TICK_SPACING = 60;
  const MIN_TICK = -887220; // Uniswap V3 min tick
  const MAX_TICK = 887220; // Uniswap V3 max tick

  // Round to nearest valid tick
  const tickLower = Math.floor(MIN_TICK / TICK_SPACING) * TICK_SPACING;
  const tickUpper = Math.floor(MAX_TICK / TICK_SPACING) * TICK_SPACING;

  return { tickLower, tickUpper };
}

/**
 * Register position with Vincent backend (optional)
 */
async function registerPositionWithVincent(positionData) {
  const vincentApiUrl = process.env.VINCENT_API_URL || "http://localhost:3000";

  try {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(`${vincentApiUrl}/api/positions/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(positionData),
    });

    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // Non-critical error - position will be discovered via events anyway
    throw error;
  }
}

/**
 * Attempt to mint tokens if balance is insufficient
 * Only works with mock/test tokens that have a public mint function
 */
async function ensureTokenBalance(
  tokenContract,
  tokenName,
  ownerAddress,
  requiredAmount,
) {
  const balance = await tokenContract.balanceOf(ownerAddress);

  if (balance >= requiredAmount) {
    console.log(`✓ Sufficient ${tokenName} balance: ${balance / 10n ** 6n}`);
    return true;
  }

  const deficit = requiredAmount - balance;
  console.log(`⚠️  Insufficient ${tokenName} balance:`);
  console.log(`   Current: ${balance / 10n ** 6n}`);
  console.log(`   Required: ${requiredAmount / 10n ** 6n}`);
  console.log(`   Deficit: ${deficit / 10n ** 6n}`);
  console.log("");

  // Try to mint the deficit
  try {
    console.log(`Attempting to mint ${deficit / 10n ** 6n} ${tokenName}...`);
    const mintTx = await tokenContract.mint(ownerAddress, deficit);
    await mintTx.wait();
    console.log(`✓ Successfully minted ${deficit / 10n ** 6n} ${tokenName}`);

    const newBalance = await tokenContract.balanceOf(ownerAddress);
    console.log(`  New balance: ${newBalance / 10n ** 6n} ${tokenName}`);
    console.log("");
    return true;
  } catch (error) {
    console.error(`❌ Failed to mint ${tokenName}:`, error.message);
    console.error(
      `   This token may not support public minting (not a test/mock token)`,
    );
    console.error(
      `   Please acquire ${deficit / 10n ** 6n} ${tokenName} manually and try again.`,
    );
    return false;
  }
}

async function main() {
  // Parse arguments from environment variables or command line
  const projectAddress = process.env.PROJECT_ADDRESS;
  const customTokenAddress = process.env.TOKEN_ADDRESS; // Optional: use custom token instead of PYUSD
  const amountArg = process.env.AMOUNT;

  if (!projectAddress) {
    console.error("\n❌ Error: PROJECT_ADDRESS is required");
    console.error("\nUsage:");
    console.error("  PROJECT_ADDRESS=0x... npm run add-liquidity:sepolia");
    console.error(
      "  PROJECT_ADDRESS=0x... AMOUNT=50000 npm run add-liquidity:sepolia",
    );
    console.error(
      "  PROJECT_ADDRESS=0x... TOKEN_ADDRESS=0x... npm run add-liquidity:sepolia",
    );
    console.error("\nOr use the direct command:");
    console.error(
      "  npx hardhat run script/add_liquidity.js --network sepolia",
    );
    console.error("\nSet environment variables before running:");
    console.error("  export PROJECT_ADDRESS=0x1234...");
    console.error("  export AMOUNT=50000  # Optional, defaults to 100000");
    console.error(
      "  export TOKEN_ADDRESS=0x5678...  # Optional, defaults to PYUSD from project",
    );
    console.error("  npm run add-liquidity:sepolia");
    console.error("");
    process.exit(1);
  }

  const amount = amountArg ? BigInt(amountArg) * 10n ** 6n : DEFAULT_AMOUNT;

  console.log("=".repeat(60));
  console.log("Uniswap V3 Liquidity Addition Script");
  console.log("=".repeat(60));
  console.log(`Project Address: ${projectAddress}`);
  console.log(`Amount: ${amount / 10n ** 6n} tokens (${amount} in 6 decimals)`);
  if (customTokenAddress) {
    console.log(`Custom Token: ${customTokenAddress}`);
  }
  console.log("");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

  // Connect to project contract
  const project = new ethers.Contract(projectAddress, PROJECT_ABI, deployer);

  // Get token addresses
  const projectTokenAddress = await project.token();
  const pyusdAddress = await project.stablecoin();

  // Use custom token if provided, otherwise use PYUSD
  const pairedTokenAddress = customTokenAddress || pyusdAddress;
  const pairedTokenName = customTokenAddress ? "Custom Token" : "PYUSD";

  console.log(`${pairedTokenName} Address: ${pairedTokenAddress}`);
  console.log(`Project Token Address: ${projectTokenAddress}`);
  console.log("");

  // Connect to tokens
  const pyusd = new ethers.Contract(pyusdAddress, ERC20_ABI, deployer);
  const pairedToken = new ethers.Contract(
    pairedTokenAddress,
    ERC20_ABI,
    deployer,
  );
  const projectToken = new ethers.Contract(
    projectTokenAddress,
    ERC20_ABI,
    deployer,
  );

  // Print initial balances
  console.log("--- Initial Token Balances ---");
  const pairedTokenBalance = await pairedToken.balanceOf(deployer.address);
  const projectTokenBalance = await projectToken.balanceOf(deployer.address);
  console.log(
    `${pairedTokenName} Balance: ${pairedTokenBalance / 10n ** 6n} tokens (${pairedTokenBalance} raw)`,
  );
  console.log(
    `Project Token Balance: ${projectTokenBalance / 10n ** 6n} tokens (${projectTokenBalance} raw)`,
  );
  console.log("");

  // Determine if we need to deposit to get project tokens
  const needsDeposit = !customTokenAddress; // Only deposit if using PYUSD (default)

  if (needsDeposit) {
    // Check if deployer has enough PYUSD for deposit + liquidity
    const totalPyusdNeeded = amount * 2n; // Need amount for deposit + amount for liquidity
    console.log("--- Checking Token Balances ---");
    const hasEnough = await ensureTokenBalance(
      pairedToken,
      pairedTokenName,
      deployer.address,
      totalPyusdNeeded,
    );
    if (!hasEnough) {
      console.error(
        `❌ Error: Cannot proceed without sufficient ${pairedTokenName}.`,
      );
      process.exit(1);
    }
  } else {
    // Check if deployer has enough of both tokens
    console.log("--- Checking Token Balances ---");

    const hasPairedToken = await ensureTokenBalance(
      pairedToken,
      pairedTokenName,
      deployer.address,
      amount,
    );

    const hasProjectToken = await ensureTokenBalance(
      projectToken,
      "Project Token",
      deployer.address,
      amount,
    );

    if (!hasPairedToken || !hasProjectToken) {
      console.error(`❌ Error: Cannot proceed without sufficient tokens.`);
      process.exit(1);
    }
  }

  // Step 1: Deposit PYUSD to get project tokens (if using PYUSD)
  if (needsDeposit) {
    console.log("--- Step 1: Depositing PYUSD to receive Project Tokens ---");
    console.log(`Depositing ${amount / 10n ** 6n} PYUSD...`);

    // Approve project contract to spend PYUSD
    const allowance = await pyusd.allowance(deployer.address, projectAddress);
    if (allowance < amount) {
      console.log("Approving project contract to spend PYUSD...");
      const approveTx = await pyusd.approve(projectAddress, amount);
      await approveTx.wait();
      console.log("✓ Approved");
    }

    // Deposit
    console.log("Depositing...");
    const depositTx = await project.deposit(amount);
    await depositTx.wait();
    console.log("✓ Deposit successful");
    console.log("");

    // Print updated balances
    const pairedTokenBalanceAfter = await pairedToken.balanceOf(
      deployer.address,
    );
    const projectTokenBalanceAfter = await projectToken.balanceOf(
      deployer.address,
    );
    console.log("--- Updated Token Balances After Deposit ---");
    console.log(
      `${pairedTokenName} Balance: ${pairedTokenBalanceAfter / 10n ** 6n} tokens (${pairedTokenBalanceAfter} raw)`,
    );
    console.log(
      `Project Token Balance: ${projectTokenBalanceAfter / 10n ** 6n} tokens (${projectTokenBalanceAfter} raw)`,
    );
    console.log("");

    // Verify we have enough tokens for liquidity (try minting if needed)
    console.log("--- Verifying Liquidity Token Amounts ---");
    const hasPairedToken = await ensureTokenBalance(
      pairedToken,
      pairedTokenName,
      deployer.address,
      amount,
    );

    const hasProjectToken = await ensureTokenBalance(
      projectToken,
      "Project Token",
      deployer.address,
      amount,
    );

    if (!hasPairedToken || !hasProjectToken) {
      console.error(
        "❌ Error: Insufficient token balance for liquidity provision",
      );
      process.exit(1);
    }
  } else {
    console.log("--- Step 1: Using existing token balances ---");
    console.log(
      `Using ${amount / 10n ** 6n} ${pairedTokenName} and ${amount / 10n ** 6n} Project Tokens`,
    );
    console.log("✓ Balances verified");
    console.log("");
  }

  // Step 2: Setup Uniswap V3 pool
  console.log("--- Step 2: Setting up Uniswap V3 Pool ---");

  const factory = new ethers.Contract(
    UNISWAP_V3_FACTORY,
    FACTORY_ABI,
    deployer,
  );

  // Determine token order (token0 < token1)
  const token0Address =
    pairedTokenAddress.toLowerCase() < projectTokenAddress.toLowerCase()
      ? pairedTokenAddress
      : projectTokenAddress;
  const token1Address =
    pairedTokenAddress.toLowerCase() < projectTokenAddress.toLowerCase()
      ? projectTokenAddress
      : pairedTokenAddress;

  const isPairedToken0 = token0Address === pairedTokenAddress;

  console.log(
    `Token0: ${token0Address} ${isPairedToken0 ? `(${pairedTokenName})` : "(Project Token)"}`,
  );
  console.log(
    `Token1: ${token1Address} ${isPairedToken0 ? "(Project Token)" : `(${pairedTokenName})`}`,
  );
  console.log(`Fee Tier: ${FEE_TIER / 10000}%`);
  console.log("");

  // Check if pool exists
  let poolAddress = await factory.getPool(
    token0Address,
    token1Address,
    FEE_TIER,
  );

  if (poolAddress === ethers.ZeroAddress) {
    console.log("Pool does not exist. Creating new pool...");
    const createTx = await factory.createPool(
      token0Address,
      token1Address,
      FEE_TIER,
    );
    await createTx.wait();
    poolAddress = await factory.getPool(token0Address, token1Address, FEE_TIER);
    console.log(`✓ Pool created at: ${poolAddress}`);

    // Initialize pool with 1:1 price
    console.log("Initializing pool with 1:1 price...");
    const pool = new ethers.Contract(poolAddress, POOL_ABI, deployer);
    const sqrtPriceX96 = getSqrtPriceX96For1to1();
    const initTx = await pool.initialize(sqrtPriceX96);
    await initTx.wait();
    console.log("✓ Pool initialized");
  } else {
    console.log(`✓ Pool already exists at: ${poolAddress}`);
  }
  console.log("");

  // Step 3: Add liquidity
  console.log("--- Step 3: Adding Liquidity ---");
  console.log(`Adding ${amount / 10n ** 6n} of each token to the pool...`);

  const positionManager = new ethers.Contract(
    NONFUNGIBLE_POSITION_MANAGER,
    NPM_ABI,
    deployer,
  );

  // Approve position manager to spend both tokens
  console.log("Approving position manager to spend tokens...");

  const token0 = new ethers.Contract(token0Address, ERC20_ABI, deployer);
  const token1 = new ethers.Contract(token1Address, ERC20_ABI, deployer);

  const allowance0 = await token0.allowance(
    deployer.address,
    NONFUNGIBLE_POSITION_MANAGER,
  );
  if (allowance0 < amount) {
    const approve0Tx = await token0.approve(
      NONFUNGIBLE_POSITION_MANAGER,
      amount,
    );
    await approve0Tx.wait();
    console.log(`✓ Approved Token0`);
  }

  const allowance1 = await token1.allowance(
    deployer.address,
    NONFUNGIBLE_POSITION_MANAGER,
  );
  if (allowance1 < amount) {
    const approve1Tx = await token1.approve(
      NONFUNGIBLE_POSITION_MANAGER,
      amount,
    );
    await approve1Tx.wait();
    console.log(`✓ Approved Token1`);
  }

  // Get full range ticks
  const { tickLower, tickUpper } = getFullRangeTicks();
  console.log(`Price Range: Full range (ticks ${tickLower} to ${tickUpper})`);

  // Prepare mint params
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  const mintParams = {
    token0: token0Address,
    token1: token1Address,
    fee: FEE_TIER,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount0Desired: amount,
    amount1Desired: amount,
    amount0Min: 0, // Accept any amount for simplicity
    amount1Min: 0, // Accept any amount for simplicity
    recipient: deployer.address,
    deadline: deadline,
  };

  console.log("Minting liquidity position...");
  const mintTx = await positionManager.mint(mintParams);
  const receipt = await mintTx.wait();

  // Parse the event to get position NFT ID
  // Look for Transfer event from address(0) to deployer (NFT mint)
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const transferLog = receipt.logs.find(
    (log) =>
      log.topics[0] === transferTopic &&
      log.address === NONFUNGIBLE_POSITION_MANAGER,
  );

  let positionTokenId;
  if (transferLog) {
    // tokenId is the third topic (indexed parameter)
    positionTokenId = BigInt(transferLog.topics[3]);
    console.log(`✓ Position NFT ID: ${positionTokenId}`);
  } else {
    console.warn("⚠️  Could not find position NFT ID from events");
  }

  console.log("✓ Liquidity added successfully!");
  console.log(`  Transaction Hash: ${receipt.hash}`);
  console.log("");

  // Print final balances
  const finalPairedTokenBalance = await pairedToken.balanceOf(deployer.address);
  const finalProjectTokenBalance = await projectToken.balanceOf(
    deployer.address,
  );
  console.log("--- Final Token Balances ---");
  console.log(
    `${pairedTokenName} Balance: ${finalPairedTokenBalance / 10n ** 6n} tokens (${finalPairedTokenBalance} raw)`,
  );
  console.log(
    `Project Token Balance: ${finalProjectTokenBalance / 10n ** 6n} tokens (${finalProjectTokenBalance} raw)`,
  );
  console.log("");

  // Step 4: Transfer NFT to Vincent PKP (instead of deploying Rebalancer)
  let vincentPKPAddress;
  if (positionTokenId) {
    console.log("--- Step 4: Transferring NFT to Vincent PKP ---");

    // Get Vincent PKP address from environment
    vincentPKPAddress = process.env.VINCENT_PKP_ADDRESS;

    if (!vincentPKPAddress) {
      console.warn(
        "⚠️  VINCENT_PKP_ADDRESS not set - skipping Vincent transfer",
      );
      console.log("   To enable Vincent automation:");
      console.log("   1. Set VINCENT_PKP_ADDRESS in your .env file");
      console.log("   2. Run this script again with the same PROJECT_ADDRESS");
      console.log("   Or manually transfer the NFT later:");
      console.log(`   Position NFT ID: ${positionTokenId}`);
      console.log(`   Current owner: ${deployer.address}`);
      console.log("");
    } else {
      try {
        console.log(`Vincent PKP Wallet: ${vincentPKPAddress}`);
        console.log(`Transferring position NFT #${positionTokenId}...`);

        // Transfer NFT to Vincent PKP
        const transferTx = await positionManager.transferFrom(
          deployer.address,
          vincentPKPAddress,
          positionTokenId,
        );
        const transferReceipt = await transferTx.wait();
        console.log("✓ Position NFT transferred to Vincent PKP");
        console.log(
          `  Transaction: https://sepolia.etherscan.io/tx/${transferReceipt.hash}`,
        );

        // Register position with Vincent backend (optional)
        // console.log("Registering position with Vincent App...");
        // try {
        //   await registerPositionWithVincent({
        //     nftTokenId: positionTokenId.toString(),
        //     projectAddress: projectAddress,
        //     poolAddress: poolAddress,
        //     userAddress: deployer.address,
        //     vincentPKP: vincentPKPAddress,
        //     token0: token0Address,
        //     token1: token1Address,
        //   });
        //   console.log("✓ Position registered with Vincent");
        // } catch (apiError) {
        //   console.warn(
        //     "⚠️  Could not register with Vincent API (non-critical)",
        //   );
        //   console.log(
        //     "   Position will be auto-discovered via blockchain events",
        //   );
        // }
        // console.log("");
      } catch (error) {
        console.error("⚠️  Failed to transfer to Vincent:", error.message);
        console.log(
          `   NFT #${positionTokenId} remains in your wallet: ${deployer.address}`,
        );
        console.log("   You can transfer it manually to Vincent later");
        console.log("");
      }
    }
  }

  console.log("=".repeat(60));
  console.log("✅ Liquidity addition complete!");
  console.log("=".repeat(60));
  console.log("");
  console.log("Pool Details:");
  console.log(`  Pool Address: ${poolAddress}`);
  console.log(`  Token0: ${token0Address}`);
  console.log(`  Token1: ${token1Address}`);
  console.log(`  Fee: ${FEE_TIER / 10000}%`);
  if (positionTokenId) {
    console.log(`  Position NFT ID: ${positionTokenId}`);
  }
  if (vincentPKPAddress) {
    console.log(`  Vincent PKP: ${vincentPKPAddress}`);
  }
  console.log("");
  console.log(`View on Sepolia Etherscan:`);
  console.log(`  📊 Pool: https://sepolia.etherscan.io/address/${poolAddress}`);
  console.log(`  📝 TX: https://sepolia.etherscan.io/tx/${receipt.hash}`);
  console.log(
    `  🪙 Token0: https://sepolia.etherscan.io/address/${token0Address}`,
  );
  console.log(
    `  🪙 Token1: https://sepolia.etherscan.io/address/${token1Address}`,
  );
  if (vincentPKPAddress) {
    console.log(
      `  🤖 Vincent: https://sepolia.etherscan.io/address/${vincentPKPAddress}`,
    );
    console.log("");
    console.log("🤖 Vincent AI is now managing your liquidity!");
    console.log("   ✓ Automatic NAV monitoring");
    console.log("   ✓ Automated rebalancing when deviation > 0.5%");
    console.log("   ✓ No manual intervention needed");
    console.log("   ✓ Withdraw your NFT anytime via Vincent dashboard");
    console.log("");
  }
  console.log(`Note: Uniswap's web interface has limited testnet support.`);
  console.log(
    `Use the Etherscan links above to view pool details and transactions.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
