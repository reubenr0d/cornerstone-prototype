const { expect } = require("chai");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Transfer Hook Corrections", function () {
  it("post-distribution transfer preserves sender's accrued revenue; recipient gets none of past", async function () {
    const { dev, user1, user2, project, token, pyusd, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);

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

    const claimableAfter = await project.claimableRevenue(user1.address);
    expect(claimableAfter).to.equal(claimableBefore);
    expect(await project.claimableRevenue(user2.address)).to.equal(0n);
  });
});
