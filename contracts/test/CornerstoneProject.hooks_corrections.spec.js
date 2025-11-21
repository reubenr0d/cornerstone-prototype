const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Transfer Hook Corrections", function () {
  it("post-distribution transfer preserves sender's accrued revenue; recipient gets none of past", async function () {
    const { dev, user1, user2, project, token, pyusd, mintAndApprove, params } = await deployProjectFixture();
    
    // Deposit and close phase 0
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(
      0, 
      ["phase-0-doc"], 
      [ethers.keccak256(ethers.toUtf8Bytes("phase-0-doc"))], 
      ["ipfs://phase-0"]
    );

    // Distribute revenue 100,000 (excess over outstanding principal)
    const outstanding = (await project.totalRaised()) - (await project.principalRedeemed());
    await pyusd.mint(dev.address, outstanding + 100_000n);
    await pyusd.connect(dev).approve(await project.getAddress(), outstanding + 100_000n);
    await project.connect(dev).submitSalesProceeds(outstanding + 100_000n);

    const claimableBefore = await project.claimableRevenue(user1.address);
    expect(claimableBefore).to.equal(100_000n);

    // Transfer half the tokens to user2
    const half = (await token.balanceOf(user1.address)) / 2n;
    await token.connect(user1).transfer(user2.address, half);

    // User1 should still have the same claimable revenue
    const claimableAfter = await project.claimableRevenue(user1.address);
    expect(claimableAfter).to.equal(claimableBefore);
    
    // User2 should have 0 claimable from past distributions
    expect(await project.claimableRevenue(user2.address)).to.equal(0n);
  });
});