const { expect: expect4 } = require("chai");
const { ethers: ethers4 } = require("hardhat");
const { time: time3 } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture: deployProjectFixture4 } = require("./fixtures");

describe("CornerstoneProject - Misc Views", function () {
  it("token() returns deployed token; getPhaseWithdrawn reflects withdrawals; claimables update", async function () {
    const { dev, user1, project, token, pyusd, mintAndApprove, params } = await deployProjectFixture4();
    expect4(await project.token()).to.equal(await token.getAddress());

    // Set up: deposit and close success
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    
    const now = await time3.latest();
    const phaseDurations = [
      0,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60
    ];
    await project.connect(dev).closePhase0(
      params.phaseCapsBps,
      phaseDurations,
      ["doc"],
      [ethers4.ZeroHash],
      ["ipfs://fundraise-doc"]
    );

    // Close phase 1 and withdraw half of its cap
    await project.connect(dev).closePhase(1, ["doc"], [ethers4.ZeroHash], ["ipfs://x"]);
    const cap1 = await project.getPhaseCap(1);
    await project.connect(dev).withdrawPhaseFunds(cap1 / 2n);
    expect4(await project.getPhaseWithdrawn(1)).to.equal(cap1 / 2n);

    // Revenue distribution yields claimable revenue
    const outstanding = (await project.totalRaised()) - (await project.principalRedeemed());
    await pyusd.mint(dev.address, outstanding + 10_000n);
    await pyusd.connect(dev).approve(await project.getAddress(), outstanding + 10_000n);
    await project.connect(dev).submitSalesProceeds(outstanding + 10_000n);
    const claimableR = await project.claimableRevenue(user1.address);
    expect4(claimableR).to.equal(10_000n);
  });
});