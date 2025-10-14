const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Reserve & Interest", function () {
  it("no interest accrues before success/phase1; accrues after with reserve", async function () {
    const { dev, user1, project, token, usdc, mintAndApprove, params } = await deployProjectFixture();
    // Deposit >= minRaise
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);

    // Pre-success accrue is no-op
    const perShareBefore = await project.interestPerShareX18();
    await time.increase(365 * 24 * 60 * 60);
    await project.accrueInterest();
    expect(await project.interestPerShareX18()).to.equal(perShareBefore);

    // Close success -> phase 1
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);

    // Fund reserve to cover interest (10% of 1,000,000 over 1 year = 100,000)
    await usdc.mint(dev.address, 200_000);
    await usdc.connect(dev).approve(await project.getAddress(), 200_000);
    await project.connect(dev).fundReserve(200_000);

    const poolBefore = await project.poolBalance();
    const baseBefore = await project.accrualBase();
    const supply = await token.totalSupply();

    await time.increase(365 * 24 * 60 * 60);
    await project.accrueInterest();

    const poolAfter = await project.poolBalance();
    const baseAfter = await project.accrualBase();
    // expected interest approx 100,000
    expect(poolAfter - poolBefore).to.equal(100_000n);
    expect(baseAfter - baseBefore).to.equal(100_000n);

    const perShare = await project.interestPerShareX18();
    expect(perShare).to.equal((100_000n * 10n ** 18n) / supply);
  });

  it("claimInterest pays out and reduces pool and accrual base", async function () {
    const { dev, user1, project, token, usdc, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);

    await usdc.mint(dev.address, 200_000);
    await usdc.connect(dev).approve(await project.getAddress(), 200_000);
    await project.connect(dev).fundReserve(200_000);

    await time.increase(365 * 24 * 60 * 60);
    await project.accrueInterest();

    const claimable = await project.claimableInterest(user1.address);
    expect(claimable).to.equal(100_000n);

    const poolBefore = await project.poolBalance();
    const baseBefore = await project.accrualBase();
    const balBefore = await usdc.balanceOf(user1.address);

    await project.connect(user1).claimInterest(60_000);

    const balAfter = await usdc.balanceOf(user1.address);
    expect(balAfter - balBefore).to.equal(60_000n);
    const poolMid = await project.poolBalance();
    const baseMid = await project.accrualBase();
    expect(poolMid).to.equal(poolBefore - 60_000n);
    expect(baseMid).to.equal(baseBefore - 60_000n);

    // remaining claimable decreases
    expect(await project.claimableInterest(user1.address)).to.equal(40_000n);
  });

  it("reverts accrual when reserve depleted", async function () {
    const { dev, user1, project, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);
    await time.increase(365 * 24 * 60 * 60);
    await expect(project.accrueInterest()).to.be.revertedWith("reserve depleted");
  });
});
