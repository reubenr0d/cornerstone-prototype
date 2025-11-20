const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture } = require("./fixtures");

const BPS_DENOM = 10_000n;
const SCALE = 10n ** 18n;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

describe("CornerstoneProject - Full Lifecycle Flow", function () {
  async function setupScenario() {
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

    await mintAndApprove(user1, deposit1);
    await project.connect(user1).deposit(deposit1);
    await mintAndApprove(user2, deposit2);
    await project.connect(user2).deposit(deposit2);

    const share1 = await token.balanceOf(user1.address);
    const share2 = await token.balanceOf(user2.address);
    const totalShares = share1 + share2;
    expect(totalShares).to.equal(deposit1 + deposit2);

    const state = {
      pool: await project.poolBalance(),
      base: await project.accrualBase(),
      interestPerShare: await project.interestPerShareX18(),
    };

    const ctx = {
      dev,
      user1,
      user2,
      project,
      token,
      pyusd,
      params,
      projectAddr,
      deposits: new Map([
        [user1.address, deposit1],
        [user2.address, deposit2],
      ]),
      totalShares,
      state,
      reserveBalance: await project.reserveBalance(),
      principalBuffer: await project.principalBuffer(),
      principalRedeemed: await project.principalRedeemed(),
      reserveTopUp: 800_000n,
      totalInterestAccrued: 0n,
      userStates: new Map([
        [user1.address, { share: share1, claimed: 0n }],
        [user2.address, { share: share2, claimed: 0n }],
      ]),
    };

    ctx.expectState = async (context) => {
      expect(await project.poolBalance(), `${context}: pool`).to.equal(
        ctx.state.pool
      );
      expect(await project.accrualBase(), `${context}: base`).to.equal(
        ctx.state.base
      );
      expect(
        await project.interestPerShareX18(),
        `${context}: interestPerShare`
      ).to.equal(ctx.state.interestPerShare);
      expect(await project.reserveBalance(), `${context}: reserve`).to.equal(
        ctx.reserveBalance
      );
      expect(await project.principalBuffer(), `${context}: buffer`).to.equal(
        ctx.principalBuffer
      );
      expect(await project.principalRedeemed(), `${context}: redeemed`).to.equal(
        ctx.principalRedeemed
      );
    };

    ctx.expectedClaimable = (address) => {
      const info = ctx.userStates.get(address);
      const totalAccrued = (ctx.state.interestPerShare * info.share) / SCALE;
      if (totalAccrued <= info.claimed) return 0n;
      return totalAccrued - info.claimed;
    };

    ctx.docFor = (phase) => ({
      types: [`phase-${phase}-doc`],
      hashes: [ethers.ZeroHash],
      uris: [`ipfs://phase-${phase}`],
    });

    ctx.accruePhase = async (phase) => {
      await time.increase(YEAR_SECONDS);
      
      // Phase 5 has no interest accrual per contract design
      if (phase === 5) {
        await ctx.project.accrueInterest();
        await ctx.expectState(`after phase ${phase} accrual`);
        return 0n;
      }
      
      // Use bracket 1 APR for phases 1-4 (development phases)
      const aprBps = BigInt(ctx.params.bracketMaxAPR[1]); // bracket 1 max APR
      const baseBefore = ctx.state.base;
      const interest = (baseBefore * aprBps) / BPS_DENOM;
      
      await ctx.project.accrueInterest();
      
      // After accrual: base and pool both increase by interest
      ctx.state.base = baseBefore + interest;
      ctx.state.pool += interest;
      ctx.state.interestPerShare += (interest * SCALE) / ctx.totalShares;
      ctx.reserveBalance -= interest;
      ctx.totalInterestAccrued += interest;
      
      await ctx.expectState(`after phase ${phase} accrual`);
      return interest;
    };

    ctx.claimInterestFor = async (signer, amount, context) => {
      const addr = signer.address;
      const bnAmount = BigInt(amount);
      await ctx.project.connect(signer).claimInterest(bnAmount);
      
      // Claiming reduces both base and pool
      ctx.state.base -= bnAmount;
      ctx.state.pool -= bnAmount;
      ctx.userStates.get(addr).claimed += bnAmount;
      
      await ctx.expectState(context);
      expect(
        await ctx.project.claimableInterest(addr),
        `${context}: claimable`
      ).to.equal(ctx.expectedClaimable(addr));
    };

    ctx.closePhase = async (phase, expectedCurrent) => {
      const docs = ctx.docFor(phase);
      await ctx.project
        .connect(ctx.dev)
        .closePhase(phase, docs.types, docs.hashes, docs.uris);
      expect(await ctx.project.currentPhase()).to.equal(expectedCurrent);
      if (phase > 0) {
        expect(await ctx.project.lastClosedPhase()).to.equal(phase);
      }
      await ctx.expectState(`after closing phase ${phase}`);
    };

    ctx.returnOutstandingProceeds = async (context) => {
      const outstanding =
        (await ctx.project.totalRaised()) -
        (await ctx.project.principalRedeemed());
      await ctx.pyusd.mint(ctx.dev.address, outstanding);
      await ctx.pyusd.connect(ctx.dev).approve(ctx.projectAddr, outstanding);
      await ctx.project.connect(ctx.dev).submitSalesProceeds(outstanding);
      ctx.state.base += outstanding;
      ctx.state.pool += outstanding;
      ctx.principalBuffer += outstanding;
      await ctx.expectState(context);
      return outstanding;
    };

    ctx.finalizePhaseFive = async () => {
      const docs = ctx.docFor(5);
      await ctx.project
        .connect(ctx.dev)
        .closePhase(5, docs.types, docs.hashes, docs.uris);
      expect(await ctx.project.lastClosedPhase()).to.equal(5);
      await ctx.expectState("after closing phase 5");
    };

    ctx.withdrawPrincipalFor = async (signer, context) => {
      const addr = signer.address;
      const shares = await ctx.token.balanceOf(addr);
      const balBefore = await ctx.pyusd.balanceOf(addr);
      await ctx.project.connect(signer).withdrawPrincipal(shares);
      ctx.state.base -= shares;
      ctx.state.pool -= shares;
      ctx.principalBuffer -= shares;
      ctx.principalRedeemed += shares;
      ctx.userStates.get(addr).share = 0n;
      const balAfter = await ctx.pyusd.balanceOf(addr);
      expect(balAfter - balBefore).to.equal(shares);
      await ctx.expectState(context);
    };

    ctx.assertFinalBalances = async () => {
      for (const [addr, deposit] of ctx.deposits.entries()) {
        const info = ctx.userStates.get(addr);
        const finalBal = await ctx.pyusd.balanceOf(addr);
        expect(finalBal).to.equal(deposit + info.claimed);
      }
    };

    ctx.assertReserveMatchesAccrued = async () => {
      const expected = ctx.reserveTopUp - ctx.totalInterestAccrued;
      expect(await ctx.project.reserveBalance()).to.equal(expected);
    };

    await ctx.pyusd.mint(ctx.dev.address, ctx.reserveTopUp);
    await ctx.pyusd.connect(ctx.dev).approve(ctx.projectAddr, ctx.reserveTopUp);
    await ctx.project.connect(ctx.dev).fundReserve(ctx.reserveTopUp);
    ctx.reserveBalance += ctx.reserveTopUp;
    await ctx.expectState("after reserve funding");

    const phase0Docs = ctx.docFor(0);
    await ctx.project
      .connect(ctx.dev)
      .closePhase(0, phase0Docs.types, phase0Docs.hashes, phase0Docs.uris);
    expect(await ctx.project.currentPhase()).to.equal(1);
    await ctx.expectState("after closing phase 0");

    return ctx;
  }

  async function runInterestSequence(ctx) {
    await ctx.accruePhase(1);
    expect(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(
      ctx.expectedClaimable(ctx.user1.address)
    );
    expect(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
      ctx.expectedClaimable(ctx.user2.address)
    );
    await ctx.claimInterestFor(
      ctx.user1,
      50_000n,
      "after user1 partial claim in phase 1"
    );
    await ctx.closePhase(1, 2);

    await ctx.accruePhase(2);
    expect(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
      ctx.expectedClaimable(ctx.user2.address)
    );
    await ctx.claimInterestFor(
      ctx.user2,
      120_000n,
      "after user2 partial claim in phase 2"
    );
    await ctx.closePhase(2, 3);

    await ctx.accruePhase(3);
    await ctx.claimInterestFor(
      ctx.user1,
      100_000n,
      "after user1 partial claim in phase 3"
    );
    await ctx.closePhase(3, 4);

    await ctx.accruePhase(4);
    await ctx.claimInterestFor(
      ctx.user2,
      90_000n,
      "after user2 partial claim in phase 4"
    );
    await ctx.closePhase(4, 5);

    await ctx.accruePhase(5);
    const user1Remaining = ctx.expectedClaimable(ctx.user1.address);
    const user2Remaining = ctx.expectedClaimable(ctx.user2.address);
    expect(user1Remaining).to.be.gt(0n);
    expect(user2Remaining).to.be.gt(0n);
    expect(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(
      user1Remaining
    );
    expect(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
      user2Remaining
    );

    return { user1Remaining, user2Remaining };
  }

  it("accrues interest across phases with partial claims", async function () {
    const ctx = await setupScenario();
    const { user1Remaining, user2Remaining } = await runInterestSequence(ctx);

    expect(user1Remaining).to.be.gt(0n);
    expect(user2Remaining).to.be.gt(0n);
    const claimedTotals = [
      ctx.userStates.get(ctx.user1.address).claimed,
      ctx.userStates.get(ctx.user2.address).claimed,
    ];
    expect(claimedTotals[0]).to.equal(150_000n); // 50k + 100k
    expect(claimedTotals[1]).to.equal(210_000n); // 120k + 90k
    await ctx.assertReserveMatchesAccrued();
  });

  it("keeps outstanding interest after developer returns principal", async function () {
    const ctx = await setupScenario();
    const { user1Remaining, user2Remaining } = await runInterestSequence(ctx);

    await ctx.returnOutstandingProceeds("after sales proceeds returned");

    expect(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(
      user1Remaining
    );
    expect(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
      user2Remaining
    );
    await ctx.assertReserveMatchesAccrued();
  });

  it("redeems principal after final phase with balances including interest", async function () {
    const ctx = await setupScenario();
    const { user1Remaining, user2Remaining } = await runInterestSequence(ctx);

    await ctx.returnOutstandingProceeds("after sales proceeds returned");
    await ctx.claimInterestFor(
      ctx.user1,
      user1Remaining,
      "after user1 final claim post proceeds"
    );
    await ctx.claimInterestFor(
      ctx.user2,
      user2Remaining,
      "after user2 final claim post proceeds"
    );
    expect(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(0n);
    expect(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(0n);

    await ctx.finalizePhaseFive();
    await ctx.withdrawPrincipalFor(
      ctx.user1,
      "after user1 principal withdrawal"
    );
    await ctx.withdrawPrincipalFor(
      ctx.user2,
      "after user2 principal withdrawal"
    );

    expect(await ctx.token.totalSupply()).to.equal(0n);
    expect(await ctx.project.principalBuffer()).to.equal(0n);
    await ctx.assertFinalBalances();
    await ctx.assertReserveMatchesAccrued();
  });
});
