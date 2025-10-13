const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Dev Withdrawals and Caps", function () {
  it("getPhaseCap returns expected and withdrawals limited by unlocked", async function () {
    const { dev, user1, project, usdc, mintAndApprove, params } = await deployProjectFixture();
    // fund pool via deposits and close success
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, [], [], []);

    // Before closing any phase, nothing unlocked
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

  it("phase 5 progressive unlock via submitAppraisal; attribution is 5", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, [], [], []); // -> phase 1
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
    await expect(project.connect(dev).withdrawPhaseFunds(toWithdraw))
      .to.emit(project, "PhaseFundsWithdrawn")
      .withArgs(5, toWithdraw);

    // Non-monotonic or >100 reverts
    await expect(project.connect(dev).submitAppraisal(39, ethers.ZeroHash)).to.be.revertedWith(
      "must be >= last"
    );
    await expect(project.connect(dev).submitAppraisal(101, ethers.ZeroHash)).to.be.revertedWith(
      ">100"
    );
  });
});

