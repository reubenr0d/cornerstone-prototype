const hre = require('hardhat');

// Deploy only the ProjectRegistry contract, using existing stablecoin
// 
// Usage:
//   PYUSD_ADDRESS=0x... npx hardhat run script/deploy_registry.js --network sepolia

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  // Must provide existing stablecoin address
  const stablecoin = process.env.PYUSD_ADDRESS || process.env.STABLECOIN_ADDRESS;
  
  if (!stablecoin) {
    throw new Error('PYUSD_ADDRESS environment variable is required. Set it to your existing MockPYUSD address.');
  }

  console.log('Using existing stablecoin at:', stablecoin);

  // Verify stablecoin contract exists
  const code = await hre.ethers.provider.getCode(stablecoin);
  if (code === '0x' || code === '0x0') {
    throw new Error(`No contract found at stablecoin address: ${stablecoin}`);
  }
  console.log('✓ Stablecoin contract verified');

  // Deploy ProjectRegistry
  console.log('\nDeploying ProjectRegistry...');
  const Reg = await hre.ethers.getContractFactory('ProjectRegistry');
  const reg = await Reg.deploy();
  await reg.waitForDeployment();
  const registry = await reg.getAddress();
  console.log('✓ ProjectRegistry deployed:', registry);

  // Get deployment block number
  const deployBlock = await hre.ethers.provider.getBlockNumber();
  console.log('Deployment block:', deployBlock);

  // Output for updating configuration files
  console.log('\n========================================');
  console.log('DEPLOYMENT COMPLETE');
  console.log('========================================');
  console.log('\n--- Update app/.env.local ---');
  console.log(`VITE_REGISTRY_ADDRESS=${registry}`);
  console.log(`VITE_PYUSD_ADDRESS=${stablecoin}`);
  
  console.log('\n--- Update indexer/config.yaml ---');
  console.log('networks:');
  console.log('  - id: 11155111  # Sepolia');
  console.log(`    start_block: ${deployBlock}`);
  console.log('    contracts:');
  console.log('      - name: ProjectRegistry');
  console.log(`        address: "${registry}"`);
  console.log('      - name: CornerstoneProject');
  console.log('        address: "0x0000000000000000000000000000000000000000"');
  
  console.log('\n--- Next Steps ---');
  console.log('1. Update app/.env.local with new VITE_REGISTRY_ADDRESS');
  console.log('2. Copy updated ABI:');
  console.log('   cp artifacts/src/core/ProjectRegistry.sol/ProjectRegistry.json ../app/src/abi/');
  console.log('   cp artifacts/src/core/ProjectRegistry.sol/ProjectRegistry.json ../indexer/abis/');
  console.log('3. Update indexer/config.yaml with new registry address and start_block');
  console.log('4. Redeploy Envio indexer: cd ../indexer && pnpm envio codegen && pnpm envio deploy');
  console.log('5. Test frontend: cd ../app && pnpm dev');
  
  return {
    registry,
    stablecoin,
    deployBlock,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
