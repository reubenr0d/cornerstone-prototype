const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Fundraise", function () {
  it("constructor enforces caps sum <= 100% and nonzero PYUSD", async function () {
    const [dev] = await ethers.getSigners();
    const MockPYUSD = await ethers.getContractFactory("MockPYUSD", dev);
    const pyusd = await MockPYUSD.deploy();
    await pyusd.waitForDeployment();

    const CornerstoneProject = await ethers.getContractFactory("CornerstoneProject", dev);
    const now = await time.latest();
    const badCaps = [0, 3000, 3000, 3000, 2000, 1000]; // phases 1..5 sum > 10000
    await expect(
      CornerstoneProject.deploy(
        dev.address,
        await pyusd.getAddress(),
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
    ).to.be.revertedWith("stablecoin required");
  });

  it("deposit in phase 0 mints 1:1 shares and moves PYUSD", async function () {
    const { user1, pyusd, project, token, mintAndApprove } = await deployProjectFixture();
    await mintAndApprove(user1, 500_000n);

    await project.connect(user1).deposit(250_000);
    expect(await token.balanceOf(user1.address)).to.equal(250_000n);
    expect(await pyusd.balanceOf(await project.getAddress())).to.equal(250_000n);
  });

  it("closePhase(0) advances to phase 1 without closing fundraise; success once min met", async function () {
    const { dev, user1, project, token, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);
    expect(await project.currentPhase()).to.equal(1n);
    expect(await token.totalSupply()).to.equal(params.minRaise);
    // Fundraise should still be open
    expect(await project.fundraiseClosed()).to.equal(false);
  });

  it("closePhase(0) reverts if min raise not met", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    const partialRaise = params.minRaise / 2n;
    await mintAndApprove(user1, partialRaise);
    await project.connect(user1).deposit(partialRaise);
    await expect(
      project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"])
    ).to.be.revertedWith("min raise not met");
  });

  it("deposits blocked in phase 5", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]); // -> phase 1
    // Close phases 1..4
    for (let p = 1; p <= 4; p++) {
      await project.connect(dev).closePhase(p, ["doc"], [ethers.ZeroHash], ["ipfs://x"]);
    }
    // now currentPhase should be 5
    expect(await project.currentPhase()).to.equal(5n);
    await expect(project.connect(user1).deposit(1)).to.be.revertedWith(
      "deposits closed in phase 5"
    );
  });

  it("failed fundraise refunds user via refundIfMinNotMet after deadline passes", async function () {
    const { dev, user1, pyusd, project, token, mintAndApprove, params } = await deployProjectFixture({
      minRaise: 1_000_000n,
      maxRaise: 2_000_000n,
    });
    await mintAndApprove(user1, 100_000n);
    await project.connect(user1).deposit(100_000);
    expect(await token.balanceOf(user1.address)).to.equal(100_000n);

    await expect(
      project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"])
    ).to.be.revertedWith("min raise not met");

    const deadline = BigInt(params.fundraiseDeadline);
    await time.increaseTo(deadline + 1n);

    const balBefore = await pyusd.balanceOf(user1.address);
    await expect(project.refundIfMinNotMet(user1.address))
      .to.emit(project, "FundraiseClosed")
      .withArgs(false);
    const balAfter = await pyusd.balanceOf(user1.address);
    expect(balAfter - balBefore).to.equal(100_000n);
    expect(await token.balanceOf(user1.address)).to.equal(0n);
    expect(await project.fundraiseClosed()).to.equal(true);
    expect(await project.fundraiseSuccessful()).to.equal(false);
  });
});
