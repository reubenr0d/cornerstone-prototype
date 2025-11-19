const { ethers: ethers6 } = require("hardhat");
const { time: time5 } = require("@nomicfoundation/hardhat-network-helpers");

async function deployPYUSD() {
  const [deployer] = await ethers6.getSigners();
  const MockPYUSD = await ethers6.getContractFactory("MockPYUSD", deployer);
  const pyusd = await MockPYUSD.deploy();
  await pyusd.waitForDeployment();
  return { pyusd, deployer };
}

function defaultPhaseParams() {
  const phaseAPRs = [0, 1000, 900, 800, 700, 600];
  const phaseDurations = [0, 30, 30, 30, 30, 30];
  const phaseCapsBps = [0, 1500, 1500, 1500, 2500, 2500];
  return { phaseAPRs, phaseDurations, phaseCapsBps };
}

async function deployProjectFixture(opts = {}) {
  const [dev, user1, user2, other] = await ethers6.getSigners();
  const { pyusd } = await deployPYUSD();

  const { phaseAPRs, phaseDurations, phaseCapsBps } =
    opts.phaseParams || defaultPhaseParams();

  const now = await time5.latest();
  const minRaise = opts.minRaise ?? 1_000_000n;
  const maxRaise = opts.maxRaise ?? 5_000_000n;
  const fundraiseDeadline = opts.deadline ?? now + 7 * 24 * 60 * 60;

  const CornerstoneProject = await ethers6.getContractFactory(
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
    phaseAPRs
  );
  await project.waitForDeployment();

  const tokenAddr = await project.token();
  const token = await ethers6.getContractAt("CornerstoneToken", tokenAddr);

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
    params: { minRaise, maxRaise, fundraiseDeadline, phaseAPRs, phaseDurations, phaseCapsBps },
    mintAndApprove,
  };
}

async function deployRegistryFixture() {
  const [deployer] = await ethers6.getSigners();
  const { pyusd } = await deployPYUSD();
  const ProjectRegistry = await ethers6.getContractFactory(
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
}