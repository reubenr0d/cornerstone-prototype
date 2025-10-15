const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployProjectFixture } = require("./fixtures");

describe("CornerstoneProject - Sales & Revenue", function () {
  it("proceeds exceeding outstanding distribute excess as revenue", async function () {
    const { dev, user1, project, token, pyusd, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);

    const outstanding = (await project.totalRaised()) - (await project.principalRedeemed());
    // Submit outstanding + 123,456 as proceeds in one go
    const extra = 123_456n;
    await pyusd.mint(dev.address, outstanding + extra);
    await pyusd.connect(dev).approve(await project.getAddress(), outstanding + extra);
    await project.connect(dev).submitSalesProceeds(outstanding + extra);

    // Buffer capped to outstanding; excess distributed pro-rata
    expect(await project.principalBuffer()).to.equal(outstanding);
    const rps = await project.revenuePerShareX18();
    const supply = await token.totalSupply();
    expect(rps).to.equal((extra * 10n ** 18n) / supply);
  });

  it("claimRevenue reduces pool but not accrual base; withdrawPrincipal reduces both", async function () {
    const { dev, user1, project, token, pyusd, mintAndApprove, params } = await deployProjectFixture();
    await mintAndApprove(user1, params.minRaise);
    await project.connect(user1).deposit(params.minRaise);
    await project.connect(dev).closePhase(0, ["doc"], [ethers.ZeroHash], ["ipfs://fundraise-doc"]);

    // Fill buffer to outstanding and add revenue of 50,000
    const outstanding = (await project.totalRaised()) - (await project.principalRedeemed());
    await pyusd.mint(dev.address, outstanding + 50_000n);
    await pyusd.connect(dev).approve(await project.getAddress(), outstanding + 50_000n);
    await project.connect(dev).submitSalesProceeds(outstanding + 50_000n);

    const poolBefore = await project.poolBalance();
    const baseBefore = await project.accrualBase();
    const balBefore = await pyusd.balanceOf(user1.address);

    // Claim revenue
    await project.connect(user1).claimRevenue(user1.address);
    const balAfter = await pyusd.balanceOf(user1.address);
    expect(balAfter - balBefore).to.equal(50_000n);
    expect(await project.poolBalance()).to.equal(poolBefore - 50_000n);
    expect(await project.accrualBase()).to.equal(baseBefore); // unchanged

    // Withdraw principal for half the shares
    const shares = (await token.balanceOf(user1.address)) / 2n;
    const poolMid = await project.poolBalance();
    const baseMid = await project.accrualBase();
    await project.connect(user1).withdrawPrincipal(shares);
    expect(await project.poolBalance()).to.equal(poolMid - shares);
    expect(await project.accrualBase()).to.equal(baseMid - shares);
    expect(await token.balanceOf(user1.address)).to.equal(shares);
  });
});
