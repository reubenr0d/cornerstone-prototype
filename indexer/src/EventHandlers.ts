import { CornerstoneProject } from "generated/src/Handlers.gen";

export const handleDeposit = CornerstoneProject.Deposit.handler(
  async (event, context) => {
    const depositorId = event.params.user.toLowerCase();
    
    let depositor = await context.Depositor.get(depositorId);
    
    if (!depositor) {
      depositor = {
        id: depositorId,
        totalDeposited: 0n,
        sharesHeld: event.params.sharesMinted,
        interestClaimed: 0n,
        revenueClaimed: 0n,
        principalRedeemed: 0n,
        lastDepositBlock: BigInt(event.blockNumber),
        lastDepositTimestamp: BigInt(event.block.timestamp),
      };
    } else {
      depositor.sharesHeld += event.params.sharesMinted;
      depositor.lastDepositBlock = BigInt(event.blockNumber);
      depositor.lastDepositTimestamp = BigInt(event.block.timestamp);
    }
    
    depositor.totalDeposited += event.params.amountPYUSD;
    context.Depositor.set(depositor);

    context.DepositEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      depositor: depositorId,
      projectAddress: event.address,
      amountUSDC: event.params.amountPYUSD,
      sharesMinted: event.params.sharesMinted,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);

    await updateDepositorMetrics(depositorId, event.address, context);
  }
);

export const handleInterestClaimed = CornerstoneProject.InterestClaimed.handler(
  async (event, context) => {
    const claimerId = event.params.user.toLowerCase();

    let depositor = await context.Depositor.get(claimerId);
    if (depositor) {
      depositor.interestClaimed += event.params.amount;
      context.Depositor.set(depositor);
    }

    context.InterestClaimedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      claimer: claimerId,
      projectAddress: event.address,
      amount: event.params.amount,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
    await updateDepositorMetrics(claimerId, event.address, context);
  }
);

export const handleReserveFunded = CornerstoneProject.ReserveFunded.handler(
  async (event, context) => {
    context.ReserveFundedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      projectAddress: event.address,
      amount: event.params.amount,
      fundedBy: event.params.by,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
  }
);

export const handleFundraiseClosed = CornerstoneProject.FundraiseClosed.handler(
  async (event, context) => {
    context.FundraiseClosedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      projectAddress: event.address,
      successful: event.params.successful,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
  }
);

export const handlePhaseClosed = CornerstoneProject.PhaseClosed.handler(
  async (event, context) => {
    const projectAddress = event.address.toLowerCase();

    context.PhaseClosedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      project: projectAddress,
      phaseId: event.params.phaseId,
      docTypes: event.params.docTypes,
      docHashes: event.params.docHashes,
      metadataURIs: event.params.metadataURIs,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    const phaseMetricsId = `${projectAddress}-phase-${event.params.phaseId}`;
    let phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);
    
    if (!phaseMetrics) {
      phaseMetrics = {
        id: phaseMetricsId,
        project: projectAddress,
        phaseId: event.params.phaseId,
        phaseCap: 0n,
        phaseWithdrawn: 0n,
        aprBps: 0n,
        duration: 0n,
        capBps: 0n,
        isClosed: true,
        closedAtBlock: BigInt(event.blockNumber),
        closedAtTimestamp: BigInt(event.block.timestamp),
      };
    } else {
      phaseMetrics.isClosed = true;
      phaseMetrics.closedAtBlock = BigInt(event.blockNumber);
      phaseMetrics.closedAtTimestamp = BigInt(event.block.timestamp);
    }
    
    context.PhaseMetrics.set(phaseMetrics);

    await updateProjectState(event.address, context);
  }
);

export const handlePhaseFundsWithdrawn = CornerstoneProject.PhaseFundsWithdrawn.handler(
  async (event, context) => {
    const projectAddress = event.address.toLowerCase();

    context.PhaseFundsWithdrawnEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      projectAddress: event.address,
      phaseId: event.params.phaseId,
      amount: event.params.amount,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    const phaseMetricsId = `${projectAddress}-phase-${event.params.phaseId}`;
    let phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);
    
    if (phaseMetrics) {
      phaseMetrics.phaseWithdrawn += event.params.amount;
      context.PhaseMetrics.set(phaseMetrics);
    }

    await updateProjectState(event.address, context);
  }
);

export const handleAppraisalSubmitted = CornerstoneProject.AppraisalSubmitted.handler(
  async (event, context) => {
    context.AppraisalSubmittedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      projectAddress: event.address,
      percentComplete: event.params.percentComplete,
      appraisalHash: event.params.appraisalHash,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
  }
);

export const handleSalesProceedsSubmitted = CornerstoneProject.SalesProceedsSubmitted.handler(
  async (event, context) => {
    context.SalesProceedsSubmittedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      projectAddress: event.address,
      amount: event.params.amountPYUSD,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
  }
);

export const handlePrincipalClaimed = CornerstoneProject.PrincipalClaimed.handler(
  async (event, context) => {
    const claimerId = event.params.user.toLowerCase();

    let depositor = await context.Depositor.get(claimerId);
    if (depositor) {
      depositor.principalRedeemed += event.params.amount;
      depositor.sharesHeld = depositor.sharesHeld >= event.params.amount 
        ? depositor.sharesHeld - event.params.amount 
        : 0n;
      context.Depositor.set(depositor);
    }

    context.PrincipalClaimedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      claimer: claimerId,
      projectAddress: event.address,
      amount: event.params.amount,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
    await updateDepositorMetrics(claimerId, event.address, context);
  }
);

export const handleRevenueClaimed = CornerstoneProject.RevenueClaimed.handler(
  async (event, context) => {
    const claimerId = event.params.user.toLowerCase();

    let depositor = await context.Depositor.get(claimerId);
    if (depositor) {
      depositor.revenueClaimed += event.params.amount;
      context.Depositor.set(depositor);
    }

    context.RevenueClaimedEvent.set({
      id: `${event.transaction.hash}-${event.logIndex}`,
      claimer: claimerId,
      projectAddress: event.address,
      amount: event.params.amount,
      blockNumber: BigInt(event.blockNumber),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    await updateProjectState(event.address, context);
    await updateDepositorMetrics(claimerId, event.address, context);
  }
);

async function updateProjectState(
  projectAddress: string,
  context: any
): Promise<void> {
  const projectId = projectAddress.toLowerCase();
  
  let projectState = await context.ProjectState.get(projectId);
  
  if (!projectState) {
    projectState = {
      id: projectId,
      currentPhase: 0,
      lastClosedPhase: 0,
      fundraiseClosed: false,
      fundraiseSuccessful: false,
      totalRaised: 0n,
      totalDevWithdrawn: 0n,
      reserveBalance: 0n,
      poolBalance: 0n,
      principalBuffer: 0n,
      principalRedeemed: 0n,
      accrualBase: 0n,
      phase5PercentComplete: 0n,
      lastAppraisalHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      interestPerShareX18: 0n,
      revenuePerShareX18: 0n,
      lastUpdatedBlock: 0n,
      lastUpdatedTimestamp: 0n,
    };
  }
  
  projectState.lastUpdatedBlock = BigInt(context.blockNumber || 0);
  projectState.lastUpdatedTimestamp = BigInt(context.block?.timestamp || 0);
  
  context.ProjectState.set(projectState);
}

async function updateDepositorMetrics(
  userId: string,
  projectAddress: string,
  context: any
): Promise<void> {
  const metricsId = `${projectAddress}-${userId}`.toLowerCase();
  
  let metrics = await context.DepositorMetrics.get(metricsId);
  const depositor = await context.Depositor.get(userId);
  
  if (!metrics && depositor) {
    metrics = {
      id: metricsId,
      user: userId,
      contractAddress: projectAddress,
      depositCount: 1n,
      totalDeposited: depositor.totalDeposited,
      currentShares: depositor.sharesHeld,
      claimableInterest: 0n,
      claimableRevenue: 0n,
      totalInterestClaimed: depositor.interestClaimed,
      totalRevenueClaimed: depositor.revenueClaimed,
      totalPrincipalRedeemed: depositor.principalRedeemed,
      firstDepositBlock: depositor.lastDepositBlock,
      firstDepositTimestamp: depositor.lastDepositTimestamp,
      lastActivityBlock: BigInt(context.blockNumber || 0),
      lastActivityTimestamp: BigInt(context.block?.timestamp || 0),
    };
  } else if (metrics && depositor) {
    metrics.totalDeposited = depositor.totalDeposited;
    metrics.currentShares = depositor.sharesHeld;
    metrics.totalInterestClaimed = depositor.interestClaimed;
    metrics.totalRevenueClaimed = depositor.revenueClaimed;
    metrics.totalPrincipalRedeemed = depositor.principalRedeemed;
    metrics.lastActivityBlock = BigInt(context.blockNumber || 0);
    metrics.lastActivityTimestamp = BigInt(context.block?.timestamp || 0);
  }
  
  if (metrics) {
    context.DepositorMetrics.set(metrics);
  }
}