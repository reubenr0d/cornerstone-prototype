import { ProjectRegistry, CornerstoneProject } from "generated";

// Register new CornerstoneProject contracts dynamically
ProjectRegistry.ProjectCreated.contractRegister(({ event, context }) => {
  context.addCornerstoneProject(event.params.project);
});

export const handleProjectCreated = ProjectRegistry.ProjectCreated.handler(
  async ({ event, context }) => {
    const projectAddress = event.params.project.toLowerCase();
    const txHash = event.block.hash;

    // Get metadataURI from event params
    const metadataURI = event.params.metadataURI || "";

    context.Project.set({
      id: projectAddress,
      address: event.params.project,
      tokenAddress: event.params.token,
      creator: event.params.creator,
      createdAtBlock: BigInt(event.block.number),
      createdAtTimestamp: BigInt(event.block.timestamp),
      metadataURI: metadataURI,
      projectState_id: projectAddress,
    });

    context.ProjectCreatedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      token: event.params.token,
      creator: event.params.creator,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    context.ProjectState.set({
      id: projectAddress,
      project_id: projectAddress,
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

    // Get phase caps from contract storage
    // We need to calculate the phase caps from the contract's phaseCapsBps and maxRaise
    // For now, we'll set them to 0 and they can be updated later when we have a way to call contract functions
    for (let i = 0; i <= 5; i++) {
      const phaseMetricsId = `${projectAddress}-phase-${i}`;
      context.PhaseMetrics.set({
        id: phaseMetricsId,
        project_id: projectAddress,
        projectState_id: projectAddress,
        phaseId: i,
        phaseCap: 0n, // TODO: Calculate from contract storage
        phaseWithdrawn: 0n,
        aprBps: 0n, // TODO: Get from contract storage
        duration: 0n, // TODO: Get from contract storage
        capBps: 0n, // TODO: Get from contract storage
        isClosed: false,
        closedAtBlock: undefined,
        closedAtTimestamp: undefined,
      });
    }

    let registry = await context.ProjectRegistry.get("registry");
    if (!registry) {
      context.ProjectRegistry.set({
        id: "registry",
        address: event.srcAddress,
        totalProjectsCreated: 1,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    } else {
      context.ProjectRegistry.set({
        ...registry,
        totalProjectsCreated: registry.totalProjectsCreated + 1,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handleDeposit = CornerstoneProject.Deposit.handler(
  async ({ event, context }) => {
    const depositorId = event.params.user.toLowerCase();
    const projectAddress = event.srcAddress.toLowerCase();

    let depositor = await context.Depositor.get(depositorId);

    if (!depositor) {
      context.Depositor.set({
        id: depositorId,
        totalDeposited: event.params.amount,
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
        totalDeposited: depositor.totalDeposited + event.params.amount,
        lastDepositBlock: BigInt(event.block.number),
        lastDepositTimestamp: BigInt(event.block.timestamp),
      });
    }

    const txHash = event.block.hash;

    context.DepositEvent.set({
      id: `${txHash}-${event.logIndex}`,
      depositor_id: depositorId,
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      amountPYUSD: event.params.amount,
      sharesMinted: event.params.sharesMinted,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        totalRaised: projectState.totalRaised + event.params.amount,
        poolBalance: projectState.poolBalance + event.params.amount,
        accrualBase: projectState.accrualBase + event.params.amount,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }

    await updateDepositorMetrics(depositorId, projectAddress, event, context);
  }
);

export const handleInterestClaimed = CornerstoneProject.InterestClaimed.handler(
  async ({ event, context }) => {
    const claimerId = event.params.user.toLowerCase();
    const projectAddress = event.srcAddress.toLowerCase();

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
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        poolBalance: projectState.poolBalance >= event.params.amount 
          ? projectState.poolBalance - event.params.amount 
          : 0n,
        accrualBase: projectState.accrualBase >= event.params.amount
          ? projectState.accrualBase - event.params.amount
          : 0n,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }

    await updateDepositorMetrics(claimerId, projectAddress, event, context);
  }
);

export const handleReserveFunded = CornerstoneProject.ReserveFunded.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;

    context.ReserveFundedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      fundedBy: event.params.by,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        reserveBalance: projectState.reserveBalance + event.params.amount,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handleFundraiseClosed = CornerstoneProject.FundraiseClosed.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;

    context.FundraiseClosedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      successful: event.params.successful,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        fundraiseClosed: true,
        fundraiseSuccessful: event.params.successful,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handlePhaseClosed = CornerstoneProject.PhaseClosed.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;
    const phaseId = Number(event.params.phaseId);

    context.PhaseClosedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      phaseId: phaseId,
      docTypes: event.params.docTypes,
      docHashes: event.params.docHashes,
      metadataURIs: event.params.metadataURIs,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    const phaseMetricsId = `${projectAddress}-phase-${phaseId}`;
    let phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);

    if (phaseMetrics) {
      context.PhaseMetrics.set({
        ...phaseMetrics,
        isClosed: true,
        closedAtBlock: BigInt(event.block.number),
        closedAtTimestamp: BigInt(event.block.timestamp),
      });
    }

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      const newCurrentPhase = phaseId === 5 ? 5 : phaseId + 1;
      
      context.ProjectState.set({
        ...projectState,
        currentPhase: newCurrentPhase,
        lastClosedPhase: phaseId,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handlePhaseFundsWithdrawn = CornerstoneProject.PhaseFundsWithdrawn.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;
    const phaseId = Number(event.params.phaseId);

    context.PhaseFundsWithdrawnEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      phaseId: phaseId,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    const phaseMetricsId = `${projectAddress}-phase-${phaseId}`;
    let phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);

    if (phaseMetrics) {
      context.PhaseMetrics.set({
        ...phaseMetrics,
        phaseWithdrawn: phaseMetrics.phaseWithdrawn + event.params.amount,
      });
    }

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        totalDevWithdrawn: projectState.totalDevWithdrawn + event.params.amount,
        poolBalance: projectState.poolBalance >= event.params.amount
          ? projectState.poolBalance - event.params.amount
          : 0n,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handleAppraisalSubmitted = CornerstoneProject.AppraisalSubmitted.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;

    context.AppraisalSubmittedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      percentComplete: event.params.percentComplete,
      appraisalHash: event.params.appraisalHash,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        phase5PercentComplete: event.params.percentComplete,
        lastAppraisalHash: event.params.appraisalHash,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handleSalesProceedsSubmitted = CornerstoneProject.SalesProceedsSubmitted.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;

    context.SalesProceedsSubmittedEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        poolBalance: projectState.poolBalance + event.params.amount,
        accrualBase: projectState.accrualBase + event.params.amount,
        principalBuffer: projectState.principalBuffer + event.params.amount,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }
  }
);

export const handlePrincipalClaimed = CornerstoneProject.PrincipalClaimed.handler(
  async ({ event, context }) => {
    const claimerId = event.params.user.toLowerCase();
    const projectAddress = event.srcAddress.toLowerCase();

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
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        principalBuffer: projectState.principalBuffer >= event.params.amount
          ? projectState.principalBuffer - event.params.amount
          : 0n,
        principalRedeemed: projectState.principalRedeemed + event.params.amount,
        poolBalance: projectState.poolBalance >= event.params.amount
          ? projectState.poolBalance - event.params.amount
          : 0n,
        accrualBase: projectState.accrualBase >= event.params.amount
          ? projectState.accrualBase - event.params.amount
          : 0n,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }

    await updateDepositorMetrics(claimerId, projectAddress, event, context);
  }
);

export const handleRevenueClaimed = CornerstoneProject.RevenueClaimed.handler(
  async ({ event, context }) => {
    const claimerId = event.params.user.toLowerCase();
    const projectAddress = event.srcAddress.toLowerCase();

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
      project_id: projectAddress,
      projectAddress: event.srcAddress,
      amount: event.params.amount,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    let projectState = await context.ProjectState.get(projectAddress);
    if (projectState) {
      context.ProjectState.set({
        ...projectState,
        poolBalance: projectState.poolBalance >= event.params.amount
          ? projectState.poolBalance - event.params.amount
          : 0n,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedTimestamp: BigInt(event.block.timestamp),
      });
    }

    await updateDepositorMetrics(claimerId, projectAddress, event, context);
  }
);

export const handlePhaseConfiguration = CornerstoneProject.PhaseConfiguration.handler(
  async ({ event, context }) => {
    const projectAddress = event.srcAddress.toLowerCase();
    const txHash = event.block.hash;
    const aprBps = Array.from(event.params.aprBps);
    const durations = Array.from(event.params.durations);
    const capBps = Array.from(event.params.capBps);
    const phaseCaps = Array.from(event.params.phaseCaps);

    // Store the phase configuration event
    context.PhaseConfigurationEvent.set({
      id: `${txHash}-${event.logIndex}`,
      project_id: projectAddress,
      aprBps,
      durations,
      capBps,
      phaseCaps,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      transactionHash: txHash,
    });

    const maxPhases = Math.min(aprBps.length, 6);
    for (let i = 0; i < maxPhases; i++) {
      const phaseMetricsId = `${projectAddress}-phase-${i}`;
      const phaseMetrics = await context.PhaseMetrics.get(phaseMetricsId);

      context.PhaseMetrics.set({
        id: phaseMetricsId,
        project_id: projectAddress,
        projectState_id: projectAddress,
        phaseId: i,
        phaseCap: phaseCaps[i] ?? 0n,
        phaseWithdrawn: phaseMetrics?.phaseWithdrawn ?? 0n,
        aprBps: aprBps[i] ?? 0n,
        duration: durations[i] ?? 0n,
        capBps: capBps[i] ?? 0n,
        isClosed: phaseMetrics?.isClosed ?? false,
        closedAtBlock: phaseMetrics?.closedAtBlock,
        closedAtTimestamp: phaseMetrics?.closedAtTimestamp,
      });
    }
  }
);

async function updateDepositorMetrics(
  userId: string,
  projectAddress: string,
  event: any,
  context: any
): Promise<void> {
  const metricsId = `${projectAddress}-${userId}`.toLowerCase();

  let metrics = await context.DepositorMetrics.get(metricsId);
  const depositor = await context.Depositor.get(userId);

  if (!depositor) return;

  if (!metrics) {
    // Creating new metrics - this is the first activity for this user on this project
    const isFirstDeposit = event.name === "Deposit";

    context.DepositorMetrics.set({
      id: metricsId,
      user: userId,
      project_id: projectAddress,
      projectAddress: projectAddress,
      depositCount: isFirstDeposit ? 1n : 0n,
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
  } else {
    const isNewDeposit = event.name === "Deposit";
    
    context.DepositorMetrics.set({
      ...metrics,
      depositCount: isNewDeposit ? metrics.depositCount + 1n : metrics.depositCount,
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
