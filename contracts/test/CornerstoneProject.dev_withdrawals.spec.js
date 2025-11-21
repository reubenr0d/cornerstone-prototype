const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Dev Withdrawals and Caps", function () {
  it("getPhaseCap returns expected and withdrawals limited by unlocked", async function () {
    const { dev, user1, project, pyusd, mintAndApprove, params } = await deployProjectFixture();
    // fund pool via deposits and close success
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    
    // Use closePhase0 to set phase configuration
    const phaseDurations = [0, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60];
    
    await project.connect(dev).closePhase0(
      params.phaseCapsBps,
      phaseDurations,
      ["doc"],
      [ethers.ZeroHash],
      ["ipfs://fundraise-doc"]
    );

    // Before closing any phase, nothing unlocked except phase 0 cap
    await expect(project.connect(dev).withdrawPhaseFunds(1)).to.be.revertedWith("exceeds caps");

    // Close phase 1, cap unlocks
    const cap1 = await project.getPhaseCap(1);
    await project.connect(dev).closePhase(1, ["doc"], [ethers.ZeroHash], ["ipfs://a"]);
    const poolBefore = await project.poolBalance();
    await expect(project.connect(dev).withdrawPhaseFunds(cap1 + 1n)).to.be.revertedWith("exceeds caps");
    await project.connect(dev).withdrawPhaseFunds(cap1);
    expect(await project.poolBalance()).to.equal(poolBefore - cap1);
    expect(await project.getPhaseWithdrawn(1)).to.equal(cap1);
  });

  it("allows withdrawing phase 0 cap once fundraising closes", async function () {
    const phaseParams = {
      bracketMinAPR: [1200, 1000],
      bracketMaxAPR: [1200, 1000],
      phaseDurations: [0, 30, 30, 30, 30, 30],
      phaseCapsBps: [10000, 0, 0, 0, 0, 0], // Phase 0 cap = 100%
    };
    const minRaise = 1_000_000n;
    const maxRaise = 1_000_000n;
    const { dev, user1, project, mintAndApprove } = await deployProjectFixture({
      phaseParams,
      minRaise,
      maxRaise,
    });
    await mintAndApprove(user1, minRaise);
    await project.connect(user1).deposit(minRaise);
    
    // Must use closePhase0 to set configuration
    await project
      .connect(dev)
      .closePhase0(
        phaseParams.phaseCapsBps,
        phaseParams.phaseDurations,
        ["doc"],
        [ethers.ZeroHash],
        ["ipfs://fundraise-doc"]
      );

    const cap0 = await project.getPhaseCap(0);
    expect(cap0).to.equal(maxRaise);
    expect(await project.withdrawableDevFunds()).to.equal(cap0);

    const poolBefore = await project.poolBalance();
    await expect(project.connect(dev).withdrawPhaseFunds(cap0))
      .to.emit(project, "PhaseFundsWithdrawn")
      .withArgs(0, cap0);

    expect(await project.poolBalance()).to.equal(poolBefore - cap0);
    expect(await project.getPhaseWithdrawn(0)).to.equal(cap0);
    expect(await project.withdrawableDevFunds()).to.equal(0n);
  });

  it("phase 5 progressive unlock via submitAppraisal; attribution is 5", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    
    // Use closePhase0 to set configuration
    const phaseDurations = [0, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60, 365 * 24 * 60 * 60];
    await project.connect(dev).closePhase0(
      params.phaseCapsBps,
      phaseDurations,
      ["doc"],
      [ethers.ZeroHash],
      ["ipfs://fundraise-doc"]
    );
    
    // Close phases 1..4 fully
    for (let p = 1; p <= 4; p++) {
      await project.connect(dev).closePhase(p, ["doc"], [ethers.ZeroHash], ["ipfs://x"]);
    }
    // Enter phase 5 (not closed)
    expect(await project.currentPhase()).to.equal(5n);

    // submit appraisal 40%
    const cap5 = await project.getPhaseCap(5);
    await project.connect(dev).submitAppraisal(40, ethers.ZeroHash);
    const unlockedNow = (cap5 * 40n) / 100n; // 40% of phase 5 cap
    const alreadyWithdrawn5 = await project.getPhaseWithdrawn(5);
    const toWithdraw = unlockedNow - alreadyWithdrawn5;
    
    // Only attempt withdrawal if there's something to withdraw
    if (toWithdraw > 0n) {
      await expect(project.connect(dev).withdrawPhaseFunds(toWithdraw))
        .to.emit(project, "PhaseFundsWithdrawn")
        .withArgs(5, toWithdraw);
    }

    // Non-monotonic or >100 reverts
    await expect(project.connect(dev).submitAppraisal(39, ethers.ZeroHash)).to.be.revertedWith(
      "must be >= last"
    );
    await expect(project.connect(dev).submitAppraisal(101, ethers.ZeroHash)).to.be.revertedWith(
      ">100"
    );
  });
});