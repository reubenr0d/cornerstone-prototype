const hre = require('hardhat');

// Env:
// - SEPOLIA_RPC_URL: RPC endpoint
// - PRIVATE_KEY: deployer private key (no 0x prefix or with, either works via Hardhat)
// - USDC_ADDRESS: optional pre-existing USDC token address; if omitted, deploy MockUSDC
// - CREATE_SAMPLE_PROJECT=true: optionally create an example project

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  let usdc = process.env.USDC_ADDRESS;
  let deployedMock = false;
  if (!usdc) {
    console.log('USDC_ADDRESS not set; deploying MockUSDC on Sepolia...');
    const Mock = await hre.ethers.getContractFactory('MockUSDC');
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    usdc = await mock.getAddress();
    deployedMock = true;
    console.log('MockUSDC:', usdc);
    // Mint deployer some balance for testing
    await (await mock.mint(deployer.address, 1_000_000n * 10n ** 6n)).wait();
  } else {
    console.log('Using existing USDC at:', usdc);
  }

  // Deploy ProjectRegistry
  const Reg = await hre.ethers.getContractFactory('ProjectRegistry');
  const reg = await Reg.deploy(usdc);
  await reg.waitForDeployment();
  const registry = await reg.getAddress();
  console.log('ProjectRegistry:', registry);

  if (String(process.env.CREATE_SAMPLE_PROJECT || '').toLowerCase() === 'true') {
    console.log('CREATE_SAMPLE_PROJECT=true → creating example Cornerstone project...');
    const name = 'Cornerstone-Demo';
    const sym = 'CST-DEMO';
    const minRaise = 100_000n * 10n ** 6n;
    const maxRaise = 500_000n * 10n ** 6n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 14 * 86400);
    const aprs = [0, 800, 1000, 1200, 1000, 0];
    const durations = [0, 0, 0, 0, 0, 0];
    const caps = [0, 1500, 1500, 2000, 3000, 2000];
    const tx = await reg.createProjectWithTokenMeta(name, sym, minRaise, maxRaise, deadline, aprs, durations, caps);
    const rc = await tx.wait();
    const evt = rc.logs.find(l => l.fragment && l.fragment.name === 'ProjectCreated');
    const project = evt?.args?.project || '0x';
    const token = evt?.args?.token || '0x';
    console.log('Sample Project:', project);
    console.log('Sample Token:', token);
  }

  console.log('\n--- paste into app/.env.local ---');
  console.log(`VITE_RPC_URL=${process.env.SEPOLIA_RPC_URL || ''}`);
  console.log(`VITE_USDC_ADDRESS=${usdc}`);
  console.log(`VITE_REGISTRY_ADDRESS=${registry}`);
  if (deployedMock) {
    console.log('\nNote: Deployed MockUSDC on Sepolia for testing.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

