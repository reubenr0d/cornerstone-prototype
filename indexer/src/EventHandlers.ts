import { CornerstoneProject } from "generated";

export const handleDeposit = CornerstoneProject.Deposit.handler(
  async ({ event, context }) => {
    const depositorId = event.params.user.toLowerCase();
    
    let depositor = await context.Depositor.get(depositorId);
    
    if (!depositor) {
      context.Depositor.set({
        id: depositorId,
        totalDeposited: event.params.amountPYUSD,
        sharesHeld: event.params.sharesMinted,
        interestClaimed: 0n,
        revenueClaimed: 0n,
        principalRedeemed: 0n,
        lastDepositBlock: BigInt(event.block.number),
        lastDepositTimestamp: BigInt(event.block.timestamp),
      });
    } else {
      context.Depositor.set({
        ...depositor,
        sharesHeld: depositor.sharesHeld + event.params.sharesMinted,
        totalDeposited: depositor.totalDeposited + event.params.amountPYUSD,
        lastDepositBlock: BigInt(event.block.number),
        lastDepositTimestamp: BigInt(event.block.timestamp),
      });
    }

    const txHash = event.block.hash;
    
    context.DepositEvent.set({
      id: `${txHash}-${event.logIndex}`,
      depositor_id: depositorId,
      projectAddress: event.srcAddress,
      amountUSDC: event.params.amountPYUSD,
      sharesMinted: event.params.sharesMinted,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
    await updateDepositorMetrics(depositorId, event.srcAddress, event, context);
  }
);

export const handleInterestClaimed = CornerstoneProject.InterestClaimed.handler(
  async ({ event, context }) => {
    const claimerId = event.params.user.toLowerCase();

    let depositor = await context.Depositor.get(claimerId);
    if (depositor) {
      context.Depositor.set({
        ...depositor,
        interestClaimed: depositor.interestClaimed + event.params.amount,
      });
    }

    const txHash = event.block.hash;
    
    context.InterestClaimedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      claimer_id: claimerId,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
    await updateDepositorMetrics(claimerId, event.srcAddress, event, context);
  }
);

export const handleReserveFunded = CornerstoneProject.ReserveFunded.handler(
  async ({ event, context }) => {
    const txHash = event.block.hash;
    
    context.ReserveFundedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      fundedBy: event.params.by,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
  }
);

export const handleFundraiseClosed = CornerstoneProject.FundraiseClosed.handler(
  async ({ event, context }) => {
    const txHash = event.block.hash;
    
    context.FundraiseClosedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      projectAddress: event.srcAddress,
      successful: event.params.successful,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
  }
);

export const handlePhaseClosed = CornerstoneProject.PhaseClosed.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;

    context.PhaseClosedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      phaseId: Number(event.params.phaseId),
      docTypes: event.params.docTypes,
      docHashes: event.params.docHashes,
      metadataURIs: event.params.metadataURIs,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    const phaseMetricsId = `${projectAddress}-phase-${event.params.phaseId}`;
    let phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);
    
    if (!phaseMetrics) {
      context.PhaseMetrics.set({
        id: phaseMetricsId,
        project_id: projectAddress,
        phaseId: Number(event.params.phaseId),
        phaseCap: 0n,
        phaseWithdrawn: 0n,
        aprBps: 0n,
        duration: 0n,
        capBps: 0n,
        isClosed: true,
        closedAtBlock: BigInt(event.block.number),
        closedAtTimestamp: BigInt(event.block.timestamp),
      });
    } else {
      context.PhaseMetrics.set({
        ...phaseMetrics,
        isClosed: true,
        closedAtBlock: BigInt(event.block.number),
        closedAtTimestamp: BigInt(event.block.timestamp),
      });
    }

    await updateProjectState(event.srcAddress, event, context);
  }
);

export const handlePhaseFundsWithdrawn = CornerstoneProject.PhaseFundsWithdrawn.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;

    context.PhaseFundsWithdrawnEvent.set({
      id: `${txHash}-${event.logIndex}`,
      projectAddress: event.srcAddress,
      phaseId: Number(event.params.phaseId),
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    const phaseMetricsId = `${projectAddress}-phase-${event.params.phaseId}`;
    let phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);
    
    if (phaseMetrics) {
      context.PhaseMetrics.set({
        ...phaseMetrics,
        phaseWithdrawn: phaseMetrics.phaseWithdrawn + event.params.amount,
      });
    }

    await updateProjectState(event.srcAddress, event, context);
  }
);

export const handleAppraisalSubmitted = CornerstoneProject.AppraisalSubmitted.handler(
  async ({ event, context }) => {
    const txHash = event.block.hash;
    
    context.AppraisalSubmittedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      projectAddress: event.srcAddress,
      percentComplete: event.params.percentComplete,
      appraisalHash: event.params.appraisalHash,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
  }
);

export const handleSalesProceedsSubmitted = CornerstoneProject.SalesProceedsSubmitted.handler(
  async ({ event, context }) => {
    const txHash = event.block.hash;
    
    context.SalesProceedsSubmittedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
  }
);

export const handlePrincipalClaimed = CornerstoneProject.PrincipalClaimed.handler(
  async ({ event, context }) => {
    const claimerId = event.params.user.toLowerCase();

    let depositor = await context.Depositor.get(claimerId);
    if (depositor) {
      const newSharesHeld = depositor.sharesHeld >= event.params.amount 
        ? depositor.sharesHeld - event.params.amount 
        : 0n;
      
      context.Depositor.set({
        ...depositor,
        principalRedeemed: depositor.principalRedeemed + event.params.amount,
        sharesHeld: newSharesHeld,
      });
    }

    const txHash = event.block.hash;
    
    context.PrincipalClaimedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      claimer_id: claimerId,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
    await updateDepositorMetrics(claimerId, event.srcAddress, event, context);
  }
);

export const handleRevenueClaimed = CornerstoneProject.RevenueClaimed.handler(
  async ({ event, context }) => {
    const claimerId = event.params.user.toLowerCase();

    let depositor = await context.Depositor.get(claimerId);
    if (depositor) {
      context.Depositor.set({
        ...depositor,
        revenueClaimed: depositor.revenueClaimed + event.params.amount,
      });
    }

    const txHash = event.block.hash;
    
    context.RevenueClaimedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      claimer_id: claimerId,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    await updateProjectState(event.srcAddress, event, context);
    await updateDepositorMetrics(claimerId, event.srcAddress, event, context);
  }
);

async function updateProjectState(
  projectAddress: string,
  event: any,
  context: any
): Promise<void> {
  const projectId = projectAddress.toLowerCase();
  
  let projectState = await context.ProjectState.get(projectId);
  
  if (!projectState) {
    context.ProjectState.set({
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
      lastUpdatedBlock: BigInt(event.block.number),
      lastUpdatedTimestamp: BigInt(event.block.timestamp),
    });
  } else {
    context.ProjectState.set({
      ...projectState,
      lastUpdatedBlock: BigInt(event.block.number),
      lastUpdatedTimestamp: BigInt(event.block.timestamp),
    });
  }
}

async function updateDepositorMetrics(
  userId: string,
  projectAddress: string,
  event: any,
  context: any
): Promise<void> {
  const metricsId = `${projectAddress}-${userId}`.toLowerCase();
  
  let metrics = await context.DepositorMetrics.get(metricsId);
  const depositor = await context.Depositor.get(userId);
  
  if (!metrics && depositor) {
    context.DepositorMetrics.set({
      id: metricsId,
      user: userId,
      projectAddress: projectAddress,
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
      lastActivityBlock: BigInt(event.block.number),
      lastActivityTimestamp: BigInt(event.block.timestamp),
    });
  } else if (metrics && depositor) {
    context.DepositorMetrics.set({
      ...metrics,
      totalDeposited: depositor.totalDeposited,
      currentShares: depositor.sharesHeld,
      totalInterestClaimed: depositor.interestClaimed,
      totalRevenueClaimed: depositor.revenueClaimed,
      totalPrincipalRedeemed: depositor.principalRedeemed,
      lastActivityBlock: BigInt(event.block.number),
      lastActivityTimestamp: BigInt(event.block.timestamp),
    });
  }
}