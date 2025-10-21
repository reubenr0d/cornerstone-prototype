const hre = require('hardhat');

// Env:
// - SEPOLIA_RPC_URL: RPC endpoint
// - PRIVATE_KEY: deployer private key (no 0x prefix or with, either works via Hardhat)
// - PYUSD_ADDRESS: pre-existing PYUSD token address
// - USDC_ADDRESS: pre-existing USDC token address

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const pyusd = process.env.PYUSD_ADDRESS;
  const usdc = process.env.USDC_ADDRESS;

  if (!pyusd) {
    console.warn('Warning: PYUSD_ADDRESS not set');
  } else {
    console.log('PYUSD Address:', pyusd);
  }

  if (!usdc) {
    console.warn('Warning: USDC_ADDRESS not set');
  } else {
    console.log('USDC Address:', usdc);
  }

  // Deploy ProjectRegistry (no constructor arguments)
  console.log('\nDeploying ProjectRegistry...');
  const Reg = await hre.ethers.getContractFactory('ProjectRegistry');
  const reg = await Reg.deploy();
  await reg.waitForDeployment();
  const registry = await reg.getAddress();
  console.log('ProjectRegistry deployed at:', registry);

  console.log('\n--- paste into app/.env.local ---');
  console.log(`VITE_RPC_URL=${process.env.SEPOLIA_RPC_URL || ''}`);
  console.log(`VITE_PYUSD_ADDRESS=${pyusd || ''}`);
  console.log(`VITE_USDC_ADDRESS=${usdc || ''}`);
  console.log(`VITE_REGISTRY_ADDRESS=${registry}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

