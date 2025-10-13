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
  // APRs in bps per phase (1..6)
  const phaseAPRs = [1000, 900, 800, 700, 600, 500];
  // durations informational only
  const phaseDurations = [30, 30, 30, 30, 30, 30];
  // withdraw caps per phase in bps; sum <= 10000
  const phaseCapsBps = [1500, 1500, 1500, 1500, 2500, 1500]; // sums to 10000
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

  const CornerstoneProject = await ethers.getContractFactory(
    "CornerstoneProject",
    dev
  );
  const project = await CornerstoneProject.deploy(
    dev.address,
    await usdc.getAddress(),
    "Cornerstone Token",
    "cAGG-TEST",
    minRaise,
    maxRaise,
    fundraiseDeadline,
    phaseAPRs,
    phaseDurations,
    phaseCapsBps
  );
  await project.waitForDeployment();

  const tokenAddr = await project.token();
  const token = await ethers.getContractAt("CornerstoneToken", tokenAddr);

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
    params: { minRaise, maxRaise, fundraiseDeadline, phaseAPRs, phaseDurations, phaseCapsBps },
    mintAndApprove,
  };
}

async function deployRegistryFixture() {
  const [deployer] = await ethers.getSigners();
  const { usdc } = await deployUSDC();
  const ProjectRegistry = await ethers.getContractFactory(
    "ProjectRegistry",
    deployer
  );
  const registry = await ProjectRegistry.deploy(await usdc.getAddress());
  await registry.waitForDeployment();
  return { deployer, usdc, registry };
}

module.exports = {
  deployProjectFixture,
  deployRegistryFixture,
  defaultPhaseParams,
};

