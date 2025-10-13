const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Fundraise", function () {
  it("constructor enforces caps sum <= 100% and nonzero USDC", async function () {
    const [dev] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC", dev);
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const CornerstoneProject = await ethers.getContractFactory("CornerstoneProject", dev);
    const now = await time.latest();
    const badCaps = [3000, 3000, 3000, 2000, 100, 100]; // sum > 10000
    await expect(
      CornerstoneProject.deploy(
        dev.address,
        await usdc.getAddress(),
        "T",
        "SYM",
        1000,
        2000,
        now + 1000,
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        badCaps
      )
    ).to.be.revertedWith("caps sum > 100%");

    await expect(
      CornerstoneProject.deploy(
        dev.address,
        ethers.ZeroAddress,
        "T",
        "SYM",
        1000,
        2000,
        now + 1000,
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0]
      )
    ).to.be.revertedWith("usdc required");
  });

  it("deposit in phase 0 mints 1:1 shares and moves USDC", async function () {
    const { user1, usdc, project, token, mintAndApprove } = await deployProjectFixture();
    await mintAndApprove(user1, 500_000n);

    await project.connect(user1).deposit(250_000);
    expect(await token.balanceOf(user1.address)).to.equal(250_000n);
    expect(await usdc.balanceOf(await project.getAddress())).to.equal(250_000n);
  });

  it("closePhase(0) sets fundraise success and advances to phase 1", async function () {
    const { dev, user1, project, token, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await expect(project.connect(dev).closePhase(0, [], [], []))
      .to.emit(project, "FundraiseClosed")
      .withArgs(true);
    expect(await project.currentPhase()).to.equal(1n);
    expect(await token.totalSupply()).to.equal(params.minRaise);
  });

  it("deposits blocked in phase 6", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, [], [], []); // success -> phase 1
    // Close phases 1..5
    for (let p = 1; p <= 5; p++) {
      await project.connect(dev).closePhase(p, ["doc"], [ethers.ZeroHash], ["ipfs://x"]);
    }
    // now currentPhase should be 6
    expect(await project.currentPhase()).to.equal(6n);
    await expect(project.connect(user1).deposit(1)).to.be.revertedWith(
      "deposits closed in phase 6"
    );
  });

  it("failed fundraise refunds user via refundIfMinNotMet", async function () {
    const { dev, user1, usdc, project, token, mintAndApprove, params } = await deployProjectFixture({
      minRaise: 1_000_000n,
      maxRaise: 2_000_000n,
    });
    await mintAndApprove(user1, 100_000n);
    await project.connect(user1).deposit(100_000);
    expect(await token.balanceOf(user1.address)).to.equal(100_000n);

    // Close fundraising unsuccessfully
    await expect(project.connect(dev).closePhase(0, [], [], []))
      .to.emit(project, "FundraiseClosed")
      .withArgs(false);

    const balBefore = await usdc.balanceOf(user1.address);
    await project.refundIfMinNotMet(user1.address);
    const balAfter = await usdc.balanceOf(user1.address);
    expect(balAfter - balBefore).to.equal(100_000n);
    expect(await token.balanceOf(user1.address)).to.equal(0n);
  });
});
