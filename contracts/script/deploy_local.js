const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  // Deploy MockUSDC
  const Mock = await hre.ethers.getContractFactory('MockUSDC');
  const mock = await Mock.deploy();
  await mock.waitForDeployment();
  const usdc = await mock.getAddress();
  console.log('MockUSDC:', usdc);

  // Mint some to deployer
  await (await mock.mint(deployer.address, 1_000_000n * 10n ** 6n)).wait();

  // Deploy registry
  const Reg = await hre.ethers.getContractFactory('ProjectRegistry');
  const reg = await Reg.deploy(usdc);
  await reg.waitForDeployment();
  const registry = await reg.getAddress();
  console.log('ProjectRegistry:', registry);

  // Create a sample project
  const name = 'Cornerstone-Demo';
  const sym = 'CST-DEMO';
  const minRaise = 100_000n * 10n ** 6n;
  const maxRaise = 500_000n * 10n ** 6n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);
  const aprs = [0, 800, 1000, 1200, 1000, 0];
  const durations = [0, 0, 0, 0, 0, 0];
  const caps = [0, 1500, 1500, 2000, 3000, 2000];
  const tx = await reg.createProjectWithTokenMeta(name, sym, minRaise, maxRaise, deadline, aprs, durations, caps);
  const rc = await tx.wait();
  const evt = rc.logs.find(l => l.fragment && l.fragment.name === 'ProjectCreated');
  const project = evt?.args?.project || '0x';
  const token = evt?.args?.token || '0x';
  console.log('Project:', project);
  console.log('Token:', token);

  // Output for frontend env
  console.log('\n--- paste into app/.env.local ---');
  console.log(`VITE_USDC_ADDRESS=${usdc}`);
  console.log(`VITE_REGISTRY_ADDRESS=${registry}`);
  // Project and Token addresses are shown above; do not write as env.
}

main().catch((e) => { console.error(e); process.exit(1); });
