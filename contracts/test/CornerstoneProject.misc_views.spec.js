const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Misc Views", function () {
  it("token() returns deployed token; getPhaseWithdrawn reflects withdrawals; claimables update", async function () {
    const { dev, user1, project, token, pyusd, mintAndApprove, params } = await deployProjectFixture();
    expect(await project.token()).to.equal(await token.getAddress());

    // Set up: deposit and close success
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);

    // Close phase 1 and withdraw half of its cap
    await project.connect(dev).closePhase(1, ["doc"], [ethers.ZeroHash], ["ipfs://x"]);
    const cap1 = await project.getPhaseCap(1);
    await project.connect(dev).withdrawPhaseFunds(cap1 / 2n);
    expect(await project.getPhaseWithdrawn(1)).to.equal(cap1 / 2n);

    // Revenue distribution yields claimable revenue
    const outstanding = (await project.totalRaised()) - (await project.principalRedeemed());
    await pyusd.mint(dev.address, outstanding + 10_000n);
    await pyusd.connect(dev).approve(await project.getAddress(), outstanding + 10_000n);
    await project.connect(dev).submitSalesProceeds(outstanding + 10_000n);
    const claimableR = await project.claimableRevenue(user1.address);
    expect(claimableR).to.equal(10_000n);
  });
});
