const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployUSDC() {
  const [deployer] = await ethers.getSigners();
  const MockUSDC = await ethers.getContractFactory("MockUSDC", deployer);
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  return { usdc, deployer };
}

function defaultPhaseParams() {
  // APRs in bps per phase 0..5 (phase 0 fundraising typically 0)
  const phaseAPRs = [0, 1000, 900, 800, 700, 600];
  // durations informational only (phase 0 included)
  const phaseDurations = [0, 30, 30, 30, 30, 30];
  // withdraw caps per phase in bps; development phases 1..5 sum <= 10000; phase 0 typically 0
  const phaseCapsBps = [0, 1500, 1500, 1500, 2500, 2500]; // sums to 9500 over 1..5
  return { phaseAPRs, phaseDurations, phaseCapsBps };
}

async function deployProjectFixture(opts = {}) {
  const [dev, user1, user2, other] = await ethers.getSigners();
  const { usdc } = await deployUSDC();

  const { phaseAPRs, phaseDurations, phaseCapsBps } =
    opts.phaseParams || defaultPhaseParams();

  const now = await time.latest();
  const minRaise = opts.minRaise ?? 1_000_000n; // 1m
  const maxRaise = opts.maxRaise ?? 5_000_000n; // 5m
  const fundraiseDeadline = opts.deadline ?? now + 7 * 24 * 60 * 60; // +7d

  // Deploy implementations
  const TokenImpl = await ethers.getContractFactory("CornerstoneToken", dev);
  const tokenImpl = await TokenImpl.deploy();
  await tokenImpl.waitForDeployment();

  const ProjectImpl = await ethers.getContractFactory(
    "CornerstoneProject",
    dev,
  );
  const projectImpl = await ProjectImpl.deploy();
  await projectImpl.waitForDeployment();

  // Deploy registry with implementations
  const Registry = await ethers.getContractFactory("ProjectRegistry", dev);
  const registry = await Registry.deploy(
    await usdc.getAddress(),
    await projectImpl.getAddress(),
    await tokenImpl.getAddress(),
  );
  await registry.waitForDeployment();

  // Create project via registry
  const tx = await registry.createProjectWithTokenMeta(
    "Cornerstone Token",
    "cAGG-TEST",
    minRaise,
    maxRaise,
    fundraiseDeadline,
    phaseAPRs,
    phaseDurations,
    phaseCapsBps,
  );
  const rc = await tx.wait();
  const evt = rc.logs.find(
    (l) => l.fragment && l.fragment.name === "ProjectCreated",
  );
  const projectAddr = evt?.args?.project;
  const tokenAddr = evt?.args?.token;

  const project = await ethers.getContractAt(
    "CornerstoneProject",
    projectAddr,
    dev,
  );
  const token = await ethers.getContractAt("CornerstoneToken", tokenAddr, dev);

  // helpers: mint balances and approvals
  async function mintAndApprove(user, amount) {
    await usdc.mint(user.address, amount);
    await usdc.connect(user).approve(await project.getAddress(), amount);
  }

  return {
    dev,
    user1,
    user2,
    other,
    usdc,
    project,
    token,
    params: {
      minRaise,
      maxRaise,
      fundraiseDeadline,
      phaseAPRs,
      phaseDurations,
      phaseCapsBps,
    },
    mintAndApprove,
  };
}

async function deployRegistryFixture() {
  const [deployer] = await ethers.getSigners();
  const { usdc } = await deployUSDC();

  // Deploy implementations
  const TokenImpl = await ethers.getContractFactory(
    "CornerstoneToken",
    deployer,
  );
  const tokenImpl = await TokenImpl.deploy();
  await tokenImpl.waitForDeployment();

  const ProjectImpl = await ethers.getContractFactory(
    "CornerstoneProject",
    deployer,
  );
  const projectImpl = await ProjectImpl.deploy();
  await projectImpl.waitForDeployment();

  // Deploy registry with implementations
  const ProjectRegistry = await ethers.getContractFactory(
    "ProjectRegistry",
    deployer,
  );
  const registry = await ProjectRegistry.deploy(
    await usdc.getAddress(),
    await projectImpl.getAddress(),
    await tokenImpl.getAddress(),
  );
  await registry.waitForDeployment();
  return { deployer, usdc, registry };
}

module.exports = {
  deployProjectFixture,
  deployRegistryFixture,
  defaultPhaseParams,
};
