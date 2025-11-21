const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployPYUSD() {
  const [deployer] = await ethers.getSigners();
  const MockPYUSD = await ethers.getContractFactory("MockPYUSD", deployer);
  const pyusd = await MockPYUSD.deploy();
  await pyusd.waitForDeployment();
  return { pyusd, deployer };
}

function defaultPhaseParams() {
  // Bracket APRs: [bracket0_min, bracket1_min] and [bracket0_max, bracket1_max]
  const bracketMinAPR = [800, 600]; // min APRs in bps
  const bracketMaxAPR = [1200, 1000]; // max APRs in bps
  
  // durations informational only (phase 0 included)
  const phaseDurations = [0, 30, 30, 30, 30, 30];
  
  // withdraw caps per phase in bps; development phases 1..5 sum <= 10000; phase 0 typically 0
  const phaseCapsBps = [0, 1500, 1500, 1500, 2500, 2500]; // sums to 9500 over 1..5
  
  return { bracketMinAPR, bracketMaxAPR, phaseDurations, phaseCapsBps };
}

async function deployProjectFixture(opts = {}) {
  const [dev, user1, user2, other] = await ethers.getSigners();
  const { pyusd } = await deployPYUSD();

  const { bracketMinAPR, bracketMaxAPR, phaseDurations, phaseCapsBps } =
    opts.phaseParams || defaultPhaseParams();

  const now = await time.latest();
  const minRaise = opts.minRaise ?? 1_000_000n;
  const maxRaise = opts.maxRaise ?? 5_000_000n;
  const fundraiseDeadline = opts.deadline ?? now + 7 * 24 * 60 * 60;

  const CornerstoneProject = await ethers.getContractFactory(
    "CornerstoneProject",
    dev
  );
  const project = await CornerstoneProject.deploy(
    dev.address,
    await pyusd.getAddress(),
    "Cornerstone Token",
    "cAGG-TEST",
    minRaise,
    maxRaise,
    fundraiseDeadline,
    bracketMinAPR,
    bracketMaxAPR
  );
  await project.waitForDeployment();

  const tokenAddr = await project.token();
  const token = await ethers.getContractAt("CornerstoneToken", tokenAddr);

  async function mintAndApprove(user, amount) {
    await pyusd.mint(user.address, amount);
    await pyusd.connect(user).approve(await project.getAddress(), amount);
  }

  return {
    dev,
    user1,
    user2,
    other,
    pyusd,
    project,
    token,
    params: { minRaise, maxRaise, fundraiseDeadline, bracketMinAPR, bracketMaxAPR, phaseDurations, phaseCapsBps },
    mintAndApprove,
  };
}

async function deployRegistryFixture() {
  const [deployer] = await ethers.getSigners();
  const { pyusd } = await deployPYUSD();
  const ProjectRegistry = await ethers.getContractFactory(
    "ProjectRegistry",
    deployer
  );
  const registry = await ProjectRegistry.deploy();
  await registry.waitForDeployment();
  return { deployer, pyusd, registry };
}

module.exports = {
  deployProjectFixture,
  deployRegistryFixture,
  defaultPhaseParams,
};