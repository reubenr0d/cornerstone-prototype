import { GraphQLClient, gql } from 'graphql-request';
import { Address } from './eth';

const ENVIO_URL = (import.meta as any).env?.VITE_ENVIO_GRAPHQL_URL;

if (!ENVIO_URL) {
  console.error('VITE_ENVIO_GRAPHQL_URL environment variable is required but not set');
  throw new Error('VITE_ENVIO_GRAPHQL_URL environment variable is required but not set');
}

export const envioClient = new GraphQLClient(ENVIO_URL);

// ============================================================================
// Type Definitions (matching Envio schema)
// ============================================================================

export type ProjectState = {
  id: string;
  currentPhase: number;
  lastClosedPhase: number;
  fundraiseClosed: boolean;
  fundraiseSuccessful: boolean;
  totalRaised: string;
  totalDevWithdrawn: string;
  reserveBalance: string;
  poolBalance: string;
  principalBuffer: string;
  principalRedeemed: string;
  accrualBase: string;
  phase5PercentComplete: string;
  lastAppraisalHash: string;
  interestPerShareX18: string;
  revenuePerShareX18: string;
  lastUpdatedBlock: string;
  lastUpdatedTimestamp: string;
  phases: PhaseMetrics[];
};

export type PhaseMetrics = {
  id: string;
  phaseId: number;
  phaseCap: string;
  phaseWithdrawn: string;
  aprBps: string;
  duration: string;
  capBps: string;
  isClosed: boolean;
  closedAtBlock?: string;
  closedAtTimestamp?: string;
};

export type DepositorMetrics = {
  id: string;
  user: string;
  depositCount: string;
  totalDeposited: string;
  currentShares: string;
  claimableInterest: string;
  claimableRevenue: string;
  totalInterestClaimed: string;
  totalRevenueClaimed: string;
  totalPrincipalRedeemed: string;
  firstDepositBlock: string;
  firstDepositTimestamp: string;
  lastActivityBlock: string;
  lastActivityTimestamp: string;
};

export type DepositEvent = {
  id: string;
  projectAddress: string;
  amountPYUSD: string; // Amount in stablecoin (field name from Envio schema)
  sharesMinted: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  depositor: {
    id: string;
  };
};

export type InterestClaimedEvent = {
  id: string;
  projectAddress: string;
  amount: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  claimer: {
    id: string;
  };
};

export type PhaseClosedEvent = {
  id: string;
  phaseId: number;
  docTypes: string[];
  docHashes: string[];
  metadataURIs: string[];
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type PhaseFundsWithdrawnEvent = {
  id: string;
  projectAddress: string;
  phaseId: number;
  amount: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type ReserveFundedEvent = {
  id: string;
  projectAddress: string;
  amount: string;
  fundedBy: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type SalesProceedsSubmittedEvent = {
  id: string;
  projectAddress: string;
  amount: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type AppraisalSubmittedEvent = {
  id: string;
  projectAddress: string;
  percentComplete: string;
  appraisalHash: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type InitialAppraisalSubmittedEvent = {
  id: string;
  projectAddress: string;
  appraisalHash: string;
  metadataURI: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type PrincipalClaimedEvent = {
  id: string;
  projectAddress: string;
  amount: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  claimer: {
    id: string;
  };
};

export type RevenueClaimedEvent = {
  id: string;
  projectAddress: string;
  amount: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  claimer: {
    id: string;
  };
};

export type PhaseConfigurationSnapshot = {
  id: string;
  aprBps: string[];
  durations: string[];
  capBps: string[];
  phaseCaps: string[];
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type FundraiseClosedEvent = {
  id: string;
  projectAddress: string;
  successful: boolean;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type Project = {
  id: string;
  address: string;
  tokenAddress: string;
  creator: string;
  createdAtBlock: string;
  createdAtTimestamp: string;
  metadataURI: string;
  name?: string;                    // NEW
  description?: string;             // NEW
  imageURI?: string;                // NEW
  metadataFetched?: boolean;        // NEW
  metadataFetchError?: string;      // NEW
  minRaise: string;
  maxRaise: string;
  withdrawableDevFunds: string;
  appraisalReportSubmitted: boolean;
  projectState?: ProjectState;
  deposits: DepositEvent[];
  interestClaims: InterestClaimedEvent[];
  phasesClosed: PhaseClosedEvent[];
  fundWithdrawn: PhaseFundsWithdrawnEvent[];
  reserveFunded: ReserveFundedEvent[];
  salesProceeds: SalesProceedsSubmittedEvent[];
  appraisals: AppraisalSubmittedEvent[];
  initialAppraisals: InitialAppraisalSubmittedEvent[];
  principalClaims: PrincipalClaimedEvent[];
  revenueClaims: RevenueClaimedEvent[];
  fundraiseClosed: FundraiseClosedEvent[];
  phaseConfigurations?: PhaseConfigurationSnapshot[];
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Complete project data in a SINGLE GraphQL query
 * Fetches everything needed for the project details page
 */
export async function getCompleteProjectData(
  projectAddress: string,
  userAddress?: string
): Promise<{
  project: Project | null;
  supportersCount: number;
  userMetrics: DepositorMetrics | null;
}> {
  const query = gql`
    query GetCompleteProject($id: String!, $projectAddress: String!, $userAddress: String!) {
      # Main project data (using where clause instead of direct id lookup)
      Project(where: { id: { _eq: $id } }, limit: 1) {
        id
        address
        tokenAddress
        creator
        createdAtBlock
        createdAtTimestamp
        metadataURI
        name
        description
        imageURI
        metadataFetched
        metadataFetchError
        minRaise
        maxRaise
        withdrawableDevFunds
        appraisalReportSubmitted
        projectState {
          id
          currentPhase
          lastClosedPhase
          fundraiseClosed
          fundraiseSuccessful
          totalRaised
          totalDevWithdrawn
          reserveBalance
          poolBalance
          principalBuffer
          principalRedeemed
          accrualBase
          phase5PercentComplete
          lastAppraisalHash
          interestPerShareX18
          revenuePerShareX18
          lastUpdatedBlock
          lastUpdatedTimestamp
          phases(order_by: { phaseId: asc }) {
            id
            phaseId
            phaseCap
            phaseWithdrawn
            aprBps
            duration
            capBps
            isClosed
            closedAtBlock
            closedAtTimestamp
          }
        }
        # Phase closed events for documents
        phasesClosed(order_by: { blockTimestamp: desc }) {
          id
          phaseId
          docTypes
          docHashes
          metadataURIs
          blockNumber
          blockTimestamp
          transactionHash
        }
        deposits(order_by: { blockTimestamp: asc }, limit: 500) {
          id
          amountPYUSD
          sharesMinted
          blockNumber
          blockTimestamp
          transactionHash
          depositor {
            id
          }
        }
        fundWithdrawn(order_by: { blockTimestamp: asc }, limit: 500) {
          id
          phaseId
          amount
          blockNumber
          blockTimestamp
          transactionHash
        }
        reserveFunded(order_by: { blockTimestamp: asc }, limit: 200) {
          id
          amount
          fundedBy
          blockNumber
          blockTimestamp
          transactionHash
        }
        salesProceeds(order_by: { blockTimestamp: asc }, limit: 200) {
          id
          amount
          blockNumber
          blockTimestamp
          transactionHash
        }
        fundraiseClosed(order_by: { blockTimestamp: asc }, limit: 50) {
          id
          successful
          blockNumber
          blockTimestamp
          transactionHash
        }
        appraisals(order_by: { blockTimestamp: asc }, limit: 200) {
          id
          percentComplete
          appraisalHash
          blockNumber
          blockTimestamp
          transactionHash
        }
        initialAppraisals(order_by: { blockTimestamp: asc }, limit: 10) {
          id
          appraisalHash
          metadataURI
          blockNumber
          blockTimestamp
          transactionHash
        }
        phaseConfigurations(order_by: { blockTimestamp: desc }, limit: 1) {
          id
          aprBps
          durations
          capBps
          phaseCaps
          blockNumber
          blockTimestamp
          transactionHash
        }
      }
      
      # Supporters count (all unique depositors)
      DepositorMetrics(where: { projectAddress: { _eq: $projectAddress } }) {
        user
      }
      
      # User-specific metrics (if user provided)
      userDepositorMetrics: DepositorMetrics(
        where: {
          _and: [
            { projectAddress: { _eq: $projectAddress } }
            { user: { _eq: $userAddress } }
          ]
        }
      ) {
        id
        user
        depositCount
        totalDeposited
        currentShares
        claimableInterest
        claimableRevenue
        totalInterestClaimed
        totalRevenueClaimed
        totalPrincipalRedeemed
        firstDepositBlock
        firstDepositTimestamp
        lastActivityBlock
        lastActivityTimestamp
      }
    }
  `;
  
  try {
    const result = await envioClient.request<{
      Project: Project[];
      DepositorMetrics: { user: string }[];
      userDepositorMetrics: DepositorMetrics[];
    }>(query, {
      id: projectAddress.toLowerCase(),
      projectAddress: projectAddress.toLowerCase(),
      userAddress: userAddress?.toLowerCase() || '0x0000000000000000000000000000000000000000',
    });
    
    // Count unique supporters
    const uniqueUsers = new Set(result.DepositorMetrics?.map(d => d.user.toLowerCase()) || []);
    
    return {
      project: result.Project?.[0] || null,
      supportersCount: uniqueUsers.size,
      userMetrics: result.userDepositorMetrics?.[0] || null,
    };
  } catch (error) {
    console.error('Error fetching complete project data from Envio:', error);
    return {
      project: null,
      supportersCount: 0,
      userMetrics: null,
    };
  }
}


export async function getAllProjects(): Promise<{ 
  projects: Project[];
  supportersCounts: Map<string, number>;
}> {
  const query = gql`
    query GetAllProjects {
      Project(order_by: { createdAtTimestamp: desc }, limit: 100) {
        id
        address
        tokenAddress
        creator
        createdAtBlock
        createdAtTimestamp
        metadataURI
        name              # ADD
        description       # ADD
        imageURI          # ADD
        metadataFetched   # ADD
        metadataFetchError # ADD
        minRaise
        maxRaise
        withdrawableDevFunds
        projectState {
          id
          currentPhase
          lastClosedPhase
          totalRaised
          fundraiseClosed
          fundraiseSuccessful
          phases(order_by: { phaseId: asc }) {
            id
            phaseId
            phaseCap
            phaseWithdrawn
            aprBps
            duration
            capBps
            isClosed
            closedAtBlock
            closedAtTimestamp
          }
        }
        phaseConfigurations(order_by: { blockTimestamp: desc }, limit: 1) {
          id
          aprBps
          durations
          capBps
          phaseCaps
          blockNumber
          blockTimestamp
          transactionHash
        }
      }
      # Get all depositor metrics to count unique supporters per project
      DepositorMetrics {
        projectAddress
        user
      }
    }
  `;
  
  try {
    const result = await envioClient.request<{ 
      Project: Project[];
      DepositorMetrics: { projectAddress: string; user: string }[];
    }>(query);
    
    // Count unique supporters per project
    const supportersCounts = new Map<string, number>();
    const projectSupporters = new Map<string, Set<string>>();
    
    for (const metrics of result.DepositorMetrics || []) {
      const projectAddr = metrics.projectAddress.toLowerCase();
      if (!projectSupporters.has(projectAddr)) {
        projectSupporters.set(projectAddr, new Set());
      }
      projectSupporters.get(projectAddr)!.add(metrics.user.toLowerCase());
    }
    
    // Convert Sets to counts
    for (const [projectAddr, supporters] of projectSupporters.entries()) {
      supportersCounts.set(projectAddr, supporters.size);
    }
    
    return { 
      projects: result.Project,
      supportersCounts 
    };
  } catch (error) {
    console.error('Error fetching all projects from Envio:', error);
    return { 
      projects: [],
      supportersCounts: new Map()
    };
  }
}
