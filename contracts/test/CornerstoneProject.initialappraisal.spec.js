const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Initial Appraisal in Phase 0", function () {
  it("allows developer to submit initial appraisal and unlock all funds in phase 0", async function () {
    const {
      dev,
      user1,
      user2,
      project,
      token,
      pyusd,
      mintAndApprove,
      params,
    } = await deployProjectFixture();

    const projectAddr = await project.getAddress();
    const deposit1 = 700_000n;
    const deposit2 = 800_000n;
    const totalRaised = deposit1 + deposit2;

    // Deposits in phase 0
    await mintAndApprove(user1, deposit1);
    await project.connect(user1).deposit(deposit1);
    await mintAndApprove(user2, deposit2);
    await project.connect(user2).deposit(deposit2);

    expect(await project.currentPhase()).to.equal(0);
    expect(await project.totalRaised()).to.equal(totalRaised);
    expect(await project.fundraiseSuccessful()).to.equal(true);

    // Check that appraisal hasn't been submitted yet
    expect(await project.appraisalReportSubmitted()).to.equal(false);

    // Check withdrawable funds before appraisal (should be 0)
    expect(await project.withdrawableDevFunds()).to.equal(0n);

    // Developer submits initial appraisal
    const appraisalHash = ethers.keccak256(ethers.toUtf8Bytes("initial-appraisal-report"));
    const metadataURI = "ipfs://QmInitialAppraisalReport";

    await expect(
      project.connect(dev).submitInitialAppraisal(appraisalHash, metadataURI)
    )
      .to.emit(project, "PlotAppraisalSubmitted")
      .withArgs(appraisalHash, metadataURI);

    // Verify appraisal was submitted
    expect(await project.appraisalReportSubmitted()).to.equal(true);

    // Verify all funds are now unlocked (should equal totalRaised)
    const withdrawable = await project.withdrawableDevFunds();
    expect(withdrawable).to.equal(totalRaised);

    // Developer can withdraw all funds
    const devBalanceBefore = await pyusd.balanceOf(dev.address);
    await project.connect(dev).withdrawPhaseFunds(totalRaised);
    const devBalanceAfter = await pyusd.balanceOf(dev.address);

    expect(devBalanceAfter - devBalanceBefore).to.equal(totalRaised);
    expect(await project.totalDevWithdrawn()).to.equal(totalRaised);
    expect(await project.poolBalance()).to.equal(0n);
  });

  it("prevents submitting initial appraisal if minRaise not met", async function () {
    const { dev, user1, project, mintAndApprove, params } =
      await deployProjectFixture();

    // Deposit less than minRaise
    const smallDeposit = params.minRaise - 100_000n;
    await mintAndApprove(user1, smallDeposit);
    await project.connect(user1).deposit(smallDeposit);

    expect(await project.fundraiseSuccessful()).to.equal(false);
    expect(await project.totalRaised()).to.equal(smallDeposit);

    const appraisalHash = ethers.keccak256(ethers.toUtf8Bytes("initial-appraisal"));
    const metadataURI = "ipfs://appraisal";

    await expect(
      project.connect(dev).submitInitialAppraisal(appraisalHash, metadataURI)
    ).to.be.revertedWith("min raise not met");
  });

  it("prevents submitting initial appraisal twice", async function () {
    const { dev, user1, project, mintAndApprove, params } =
      await deployProjectFixture();

    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);

    const appraisalHash = ethers.keccak256(ethers.toUtf8Bytes("initial-appraisal"));
    const metadataURI = "ipfs://appraisal";

    await project.connect(dev).submitInitialAppraisal(appraisalHash, metadataURI);
    expect(await project.appraisalReportSubmitted()).to.equal(true);

    // Try to submit again
    const appraisalHash2 = ethers.keccak256(ethers.toUtf8Bytes("another-appraisal"));
    const metadataURI2 = "ipfs://appraisal2";

    await expect(
      project.connect(dev).submitInitialAppraisal(appraisalHash2, metadataURI2)
    ).to.be.revertedWith("already submitted");
  });

  it("prevents submitting initial appraisal outside phase 0", async function () {
    const { dev, user1, project, mintAndApprove, params } =
      await deployProjectFixture();

    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);

    // Close phase 0 and move to phase 1
    const types = ["phase-0-doc"];
    const hashes = [ethers.keccak256(ethers.toUtf8Bytes("phase-0-doc"))];
    const uris = ["ipfs://phase-0"];
    await project.connect(dev).closePhase(0, types, hashes, uris);

    expect(await project.currentPhase()).to.equal(1);

    const appraisalHash = ethers.keccak256(ethers.toUtf8Bytes("initial-appraisal"));
    const metadataURI = "ipfs://appraisal";

    await expect(
      project.connect(dev).submitInitialAppraisal(appraisalHash, metadataURI)
    ).to.be.revertedWith("only in phase 0");
  });
});