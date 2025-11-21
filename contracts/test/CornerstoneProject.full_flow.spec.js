const { expect: expect2 } = require("chai");
const { ethers: ethers2 } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployProjectFixture: deployProjectFixture2 } = require("./fixtures");

const BPS_DENOM = 10_000n;
const SCALE = 10n ** 18n;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

const DocID = {
  TITLE_DOCUMENT: 0,
  TITLE_INSURANCE: 1,
  NEW_HOME_REGISTRATION: 2,
  WARRANTY_ENROLMENT: 3,
  DEMOLITION_PERMIT: 4,
  ABATEMENT_PERMIT: 5,
  BUILDING_PERMIT: 6,
  OCCUPANCY_PERMIT: 7,
  APPRAISER_REPORTS: 8,
};

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
    } = await deployProjectFixture2();

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
    expect2(totalShares).to.equal(deposit1 + deposit2);

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
      expect2(await project.poolBalance(), `${context}: pool`).to.equal(
        ctx.state.pool
      );
      expect2(await project.accrualBase(), `${context}: base`).to.equal(
        ctx.state.base
      );
      expect2(
        await project.interestPerShareX18(),
        `${context}: interestPerShare`
      ).to.equal(ctx.state.interestPerShare);
      expect2(await project.reserveBalance(), `${context}: reserve`).to.equal(
        ctx.reserveBalance
      );
      expect2(await project.principalBuffer(), `${context}: buffer`).to.equal(
        ctx.principalBuffer
      );
      expect2(await project.principalRedeemed(), `${context}: redeemed`).to.equal(
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
      docIds: [DocID.BUILDING_PERMIT],
      types: [`phase-${phase}-doc`],
      hashes: [ethers2.ZeroHash],
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
      
      // Calculate APR based on contract's _currentAPR logic
      const totalRaised = await ctx.project.totalRaised();
      const minRaise = await ctx.project.minRaise();
      const maxRaise = await ctx.project.maxRaise();
      const maxAPR = BigInt(ctx.params.bracketMaxAPR[1]);
      const minAPR = BigInt(ctx.params.bracketMinAPR[1]);
      
      let aprBps;
      if (totalRaised >= maxRaise) {
        aprBps = minAPR;
      } else {
        const raiseInBracket = totalRaised > minRaise ? totalRaised - minRaise : 0n;
        const bracketRange = maxRaise - minRaise;
        if (bracketRange === 0n) {
          aprBps = maxAPR;
        } else {
          const aprRange = maxAPR - minAPR;
          const reduction = (aprRange * raiseInBracket) / bracketRange;
          aprBps = maxAPR - reduction;
        }
      }
      
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
      expect2(
        await ctx.project.claimableInterest(addr),
        `${context}: claimable`
      ).to.equal(ctx.expectedClaimable(addr));
    };

    ctx.closePhase = async (phase, expectedCurrent) => {
      const docs = ctx.docFor(phase);
      await ctx.project
        .connect(ctx.dev)
        .closePhase(phase, docs.types, docs.hashes, docs.uris);
      expect2(await ctx.project.currentPhase()).to.equal(expectedCurrent);
      if (phase > 0) {
        expect2(await ctx.project.lastClosedPhase()).to.equal(phase);
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
      expect2(await ctx.project.lastClosedPhase()).to.equal(5);
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
      expect2(balAfter - balBefore).to.equal(shares);
      await ctx.expectState(context);
    };

    ctx.assertFinalBalances = async () => {
      for (const [addr, deposit] of ctx.deposits.entries()) {
        const info = ctx.userStates.get(addr);
        const finalBal = await ctx.pyusd.balanceOf(addr);
        expect2(finalBal).to.equal(deposit + info.claimed);
      }
    };

    ctx.assertReserveMatchesAccrued = async () => {
      const expected = ctx.reserveTopUp - ctx.totalInterestAccrued;
      expect2(await ctx.project.reserveBalance()).to.equal(expected);
    };

    await ctx.pyusd.mint(ctx.dev.address, ctx.reserveTopUp);
    await ctx.pyusd.connect(ctx.dev).approve(ctx.projectAddr, ctx.reserveTopUp);
    await ctx.project.connect(ctx.dev).fundReserve(ctx.reserveTopUp);
    ctx.reserveBalance += ctx.reserveTopUp;
    await ctx.expectState("after reserve funding");

    // Use closePhase0 to set configuration and close phase 0
    const phaseDurations = [
      0,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60,
      365 * 24 * 60 * 60
    ];
    const phase0Docs = ctx.docFor(0);
    await ctx.project
      .connect(ctx.dev)
      .closePhase0(
        ctx.params.phaseCapsBps,
        phaseDurations,
        phase0Docs.types,
        phase0Docs.hashes,
        phase0Docs.uris
      );
    expect2(await ctx.project.currentPhase()).to.equal(1);
    await ctx.expectState("after closing phase 0");

    return ctx;
  }

  async function runInterestSequence(ctx) {
    await ctx.accruePhase(1);
    expect2(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(
      ctx.expectedClaimable(ctx.user1.address)
    );
    expect2(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
      ctx.expectedClaimable(ctx.user2.address)
    );
    await ctx.claimInterestFor(
      ctx.user1,
      50_000n,
      "after user1 partial claim in phase 1"
    );
    await ctx.closePhase(1, 2);

    await ctx.accruePhase(2);
    expect2(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
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
    expect2(user1Remaining).to.be.gt(0n);
    expect2(user2Remaining).to.be.gt(0n);
    expect2(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(
      user1Remaining
    );
    expect2(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
      user2Remaining
    );

    return { user1Remaining, user2Remaining };
  }

  it("accrues interest across phases with partial claims", async function () {
    const ctx = await setupScenario();
    const { user1Remaining, user2Remaining } = await runInterestSequence(ctx);

    expect2(user1Remaining).to.be.gt(0n);
    expect2(user2Remaining).to.be.gt(0n);
    const claimedTotals = [
      ctx.userStates.get(ctx.user1.address).claimed,
      ctx.userStates.get(ctx.user2.address).claimed,
    ];
    expect2(claimedTotals[0]).to.equal(150_000n);
    expect2(claimedTotals[1]).to.equal(210_000n);
    await ctx.assertReserveMatchesAccrued();
  });

  it("keeps outstanding interest after developer returns principal", async function () {
    const ctx = await setupScenario();
    const { user1Remaining, user2Remaining } = await runInterestSequence(ctx);

    await ctx.returnOutstandingProceeds("after sales proceeds returned");

    expect2(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(
      user1Remaining
    );
    expect2(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(
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
    expect2(await ctx.project.claimableInterest(ctx.user1.address)).to.equal(0n);
    expect2(await ctx.project.claimableInterest(ctx.user2.address)).to.equal(0n);

    await ctx.finalizePhaseFive();
    await ctx.withdrawPrincipalFor(
      ctx.user1,
      "after user1 principal withdrawal"
    );
    await ctx.withdrawPrincipalFor(
      ctx.user2,
      "after user2 principal withdrawal"
    );

    expect2(await ctx.token.totalSupply()).to.equal(0n);
    expect2(await ctx.project.principalBuffer()).to.equal(0n);
    await ctx.assertFinalBalances();
    await ctx.assertReserveMatchesAccrued();
  });
});