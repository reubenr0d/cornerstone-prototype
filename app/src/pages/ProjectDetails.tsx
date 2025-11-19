import { useEffect, useMemo, useState, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { RoleGate, Role } from '@/components/RoleGate';
import { TimelineCard } from '@/components/TimelineCard';
import ProjectInsightsPanel from '@/components/project/ProjectInsightsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Removed Progress usage in favor of custom stacked bar
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Banknote, DoorClosed, Wallet, FileText, Target, Users, ShieldCheck, HardHat } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Address, erc20At, fromStablecoin, getAccount, getProvider, getRpcProvider, getSigner, projectAt, toStablecoin, fetchProjectRealtimeState, fetchProjectStaticConfig, getWindowEthereum, ProjectRealtimeState, ProjectStaticConfig } from '@/lib/eth';
import { getCompleteProjectData, Project } from '@/lib/envio';
import { TOKEN_CONFIG, getTokenConfigByAddress } from '@/config/contracts';
import { ipfsUpload, resolveImageUri } from '@/lib/ipfs';
import { ethers } from 'ethers';
import { buildProjectInsightsData, type ProjectInsightsData } from '@/lib/project-insights';

const ProjectDetails = () => {
  const { id } = useParams();
  const [currentRole, setCurrentRole] = useState<Role>('holder');
  const [activeTab, setActiveTab] = useState('milestones');

  // Developer actions state (UI prototype only)
  const [reserveAmount, setReserveAmount] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<File[]>([]);
  const [proceedsAmount, setProceedsAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [supportAmount, setSupportAmount] = useState('');
  
  // Loading states for transactions
  const [isDepositing, setIsDepositing] = useState(false);
  const [isClaimingInterest, setIsClaimingInterest] = useState(false);
  const [isRedeemingPrincipal, setIsRedeemingPrincipal] = useState(false);
  const [isFundingReserve, setIsFundingReserve] = useState(false);
  const [isClosingPhase, setIsClosingPhase] = useState(false);
  const [isWithdrawingFunds, setIsWithdrawingFunds] = useState(false);
  const [isSubmittingProceeds, setIsSubmittingProceeds] = useState(false);

  const projectAddress = useMemo<Address | null>(() => {
    const p = id as string | undefined;
    return (p && p.startsWith('0x') ? (p as Address) : null);
  }, [id]);
  const [account, setAccount] = useState<Address | null>(null);
  const [connected, setConnected] = useState(false);

  // Separate data sources: Envio (historical) + Contract (real-time)
  const [envioData, setEnvioData] = useState<Project | null>(null);
  const [realtimeData, setRealtimeData] = useState<ProjectRealtimeState | null>(null);
  const [staticConfig, setStaticConfig] = useState<ProjectStaticConfig | null>(null);
  const [supporters, setSupporters] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingRealtime, setLoadingRealtime] = useState(true);

  // Initial appraisal state
  const [appraisalFile, setAppraisalFile] = useState<File | null>(null);
  const [isSubmittingAppraisal, setIsSubmittingAppraisal] = useState(false);

  // Dynamically determine which token this project uses
  const projectTokenConfig = useMemo(() => {
    if (staticConfig?.stablecoin) {
      return getTokenConfigByAddress(staticConfig.stablecoin) ?? TOKEN_CONFIG;
    }
    return TOKEN_CONFIG;
  }, [staticConfig]);

  const insightsData = useMemo(
    () =>
      buildProjectInsightsData({
        project: envioData,
        staticConfig,
        tokenSymbol: projectTokenConfig.symbol,
        now: Date.now(),
      }),
    [envioData, staticConfig, projectTokenConfig.symbol],
  );

  async function connectWallet() {
    try {
      const signer = await getSigner();
      const addr = (await signer.getAddress()) as Address;
      setAccount(addr);
      setConnected(true);
      toast.success('Wallet connected');
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || 'Connect failed');
    }
  }

  function phaseName(idx: number) {
    const names = [
      'Fundraising and Acquisition',
      'Design and Architectural',
      'Permitting',
      'Abatement/Demolition',
      'Construction',
      'Revenue and Sales',
    ] as const;
    // Contract uses phase 0 for open fundraising; map it to first label
    if (idx < 0) idx = 0;
    return names[idx] ?? 'Unknown';
  }

  async function refresh() {
    try {
      if (!projectAddress) return;
      
      setLoading(true);
      setLoadingRealtime(true); // Set both initially
      
      // Try injected provider first; fall back to RPC on failure
      let provider = getWindowEthereum() ? await getProvider() : getRpcProvider();
      
      try {
        // Ensure contract exists on current network before reading
        const code = await provider.getCode(projectAddress);
        if (!code || code === '0x') {
          toast.error('No contract at this address on current network. Check RPC/network.');
          setLoading(false);
          setLoadingRealtime(false);
          return;
        }
      } catch {
        provider = getRpcProvider();
        const code2 = await provider.getCode(projectAddress);
        if (!code2 || code2 === '0x') {
          toast.error('No contract at this address on configured RPC. Set VITE_RPC_URL or switch network.');
          setLoading(false);
          setLoadingRealtime(false);
          return;
        }
      }
  
      // Fetch Envio data first (fast)
      const envioResult = await getCompleteProjectData(projectAddress, account || undefined);
      setEnvioData(envioResult.project);
      setSupporters(envioResult.supportersCount);
      setLoading(false); // Envio data loaded - show main UI
      
      // Then fetch real-time data (slower)
      const [realtimeResult, staticResult] = await Promise.all([
        fetchProjectRealtimeState(projectAddress, provider, account || undefined),
        fetchProjectStaticConfig(projectAddress, provider),
      ]);
      
      setRealtimeData(realtimeResult);
      setStaticConfig(staticResult);
      setLoadingRealtime(false); // Real-time data loaded - show user balances
    } catch (e) {
      console.error('Error refreshing project data:', e);
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
      setLoadingRealtime(false);
    }
  }

  useEffect(() => {
    getAccount().then((a) => {
      if (a) {
        setAccount(a);
        setConnected(true);
      }
    });
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectAddress, account]);

  // Listen for on-chain events to auto-refresh phase changes
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        if (!projectAddress) return;
        // Prefer injected provider for subscriptions; else RPC. If it errors, silently no-op.
        const provider = getWindowEthereum() ? await getProvider() : getRpcProvider();
        const proj = projectAt(projectAddress, provider);
        const handler = () => refresh();
        proj.on('FundraiseClosed', handler);
        proj.on('PhaseClosed', handler);
        proj.on('InitialAppraisalSubmitted', handler);
        unsub = () => {
          try { proj.removeListener('FundraiseClosed', handler); } catch {}
          try { proj.removeListener('PhaseClosed', handler); } catch {}
          try { proj.removeListener('InitialAppraisalSubmitted', handler); } catch {}
        };
      } catch {
        // ignore listener errors
      }
    })();
    return () => { try { unsub?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectAddress]);

  // Change this line in ProjectDetails.tsx
const withdrawableNow = realtimeData?.withdrawableDevFunds 
? Number(fromStablecoin(realtimeData.withdrawableDevFunds))
: Number(fromStablecoin(BigInt(envioData?.withdrawableDevFunds || '0')));

  const fallbackTotalRaised =
    envioData?.deposits?.reduce<bigint>((acc, deposit) => {
      try {
        return acc + BigInt(deposit.amountPYUSD ?? '0');
      } catch {
        return acc;
      }
    }, 0n) ?? 0n;
  const fallbackTotalDevWithdrawn =
    envioData?.fundWithdrawn?.reduce<bigint>((acc, withdrawal) => {
      try {
        return acc + BigInt(withdrawal.amount ?? '0');
      } catch {
        return acc;
      }
    }, 0n) ?? 0n;
  // Derive net yield by removing deposits and principal buckets from pool balance
  const totalRaisedRaw = envioData?.projectState?.totalRaised
    ? BigInt(envioData.projectState.totalRaised)
    : fallbackTotalRaised;
  const totalDevWithdrawnRaw = envioData?.projectState?.totalDevWithdrawn
    ? BigInt(envioData.projectState.totalDevWithdrawn)
    : fallbackTotalDevWithdrawn;
  const poolBalanceRaw =
    realtimeData?.poolBalance ??
    (envioData?.projectState?.poolBalance ? BigInt(envioData.projectState.poolBalance) : 0n);
  const principalBufferRaw =
    realtimeData?.principalBuffer ??
    (envioData?.projectState?.principalBuffer ? BigInt(envioData.projectState.principalBuffer) : 0n);
  const interestAccruedRaw = poolBalanceRaw + totalDevWithdrawnRaw - totalRaisedRaw - principalBufferRaw;
  const interestAccrued = Number(fromStablecoin(interestAccruedRaw > 0n ? interestAccruedRaw : 0n));

  const project = {
    name: envioData?.name || staticConfig?.projectName?.trim() || 'Cornerstone Residences',
    status: 'Active',
    contractAddress: projectAddress ?? '0x',
    tokenAddress: envioData?.tokenAddress ?? staticConfig?.token ?? '0x',
    owner: envioData?.creator ?? staticConfig?.owner ?? '0x',
    // From Envio (historical data)
    raised: Number(envioData?.projectState?.totalRaised ? fromStablecoin(BigInt(envioData.projectState.totalRaised)) : '0'),
    withdrawn: Number(envioData?.projectState?.totalDevWithdrawn ? fromStablecoin(BigInt(envioData.projectState.totalDevWithdrawn)) : '0'),
    // From static config
    target: Number(fromStablecoin(BigInt(envioData?.maxRaise || '0'))),
    minTarget: Number(fromStablecoin(BigInt(envioData?.minRaise || '0'))),
    // From real-time contract
    escrow: Number(realtimeData?.reserveBalance ? fromStablecoin(realtimeData.reserveBalance) : '0'),
    withdrawable: withdrawableNow,
    // Current phase from Envio or fallback
    currentPhase: phaseName(envioData?.projectState?.currentPhase ?? 0),
    milestones: 0,
    supporters: supporters ?? 0,
    interestAccrued,
    description: envioData?.description || 'No description available',
    imageUri: envioData?.imageURI || '',
  };

  const raisedPercentage = project.target > 0 ? (project.raised / project.target) * 100 : 0;
  const withdrawnPercentage = project.target > 0 ? (project.withdrawn / project.target) * 100 : 0;
  const minRaisePercentage = project.target > 0 ? (project.minTarget / project.target) * 100 : 0;
  const format = (n: number) => n.toLocaleString('en-US');
  const formatDateLabel = (timestamp: number | null | undefined) => {
    if (!timestamp || !Number.isFinite(timestamp)) return '';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  const formatRelativeTime = (timestamp: number | null | undefined) => {
    if (!timestamp || !Number.isFinite(timestamp)) return '';
    const diffSeconds = (timestamp - Date.now()) / 1000;
    const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
      { amount: 60, unit: 'second' },
      { amount: 60, unit: 'minute' },
      { amount: 24, unit: 'hour' },
      { amount: 7, unit: 'day' },
      { amount: 4.34524, unit: 'week' },
      { amount: 12, unit: 'month' },
      { amount: Infinity, unit: 'year' },
    ];
    try {
      let duration = diffSeconds;
      const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
      for (const division of divisions) {
        if (Math.abs(duration) < division.amount) {
          return formatter.format(Math.round(duration), division.unit);
        }
        duration /= division.amount;
      }
    } catch {
      // ignore if Intl.RelativeTimeFormat is unavailable
    }
    return '';
  };
  const describeTimelineEvent = (event: ProjectInsightsData['events'][number]) => {
    switch (event.type) {
      case 'deposit':
        return event.subtitle ? `Investor deposits totaled ${event.subtitle}.` : 'Investor deposit recorded on-chain.';
      case 'withdrawal':
        return event.subtitle ? `Developer withdrawal processed for ${event.subtitle}.` : 'Developer withdrawal processed.';
      case 'phase':
        return `${typeof event.phaseId === 'number' ? `Phase ${event.phaseId + 1}` : 'Phase'} closed and documentation verified.`;
      case 'reserve':
        return event.subtitle ? `Interest reserve funded with ${event.subtitle}.` : 'Interest reserve funded on-chain.';
      case 'proceeds':
        return event.subtitle ? `Sales proceeds submitted totaling ${event.subtitle}.` : 'Sales proceeds submitted.';
      case 'fundraise':
        return 'Fundraise status updated and captured on-chain.';
      case 'appraisal':
        return 'Milestone appraisal submitted for verification.';
      default:
        return 'On-chain update recorded.';
    }
  };
  const timelineEvents = useMemo(() => {
    if (!insightsData?.events?.length) return [];
    const eventTypeMap: Record<ProjectInsightsData['events'][number]['type'], 'milestone' | 'deliverable' | 'payout' | 'update'> = {
      deposit: 'update',
      withdrawal: 'payout',
      phase: 'milestone',
      reserve: 'update',
      proceeds: 'payout',
      fundraise: 'milestone',
      appraisal: 'deliverable',
    };
    return insightsData.events
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((event) => {
        const dateLabel = formatDateLabel(event.timestamp);
        const relative = formatRelativeTime(event.timestamp);
        const metaParts = [relative, dateLabel, event.subtitle].filter(Boolean);
        const meta = metaParts.length ? metaParts.join(' • ') : 'On-chain update';
        return {
          id: event.id,
          type: eventTypeMap[event.type] ?? 'update',
          title: event.title,
          meta,
          description: describeTimelineEvent(event),
          actions: undefined as ReactNode | undefined,
        };
      });
  }, [insightsData.events]);
  const capitalSummaryMetrics = [
    {
      id: 'withdrawn',
      icon: Banknote,
      label: 'Withdrawn',
      value: `${format(project.withdrawn)} ${projectTokenConfig.symbol}`,
      skeletonClass: 'w-20',
    },
    {
      id: 'unlockable',
      icon: ShieldCheck,
      label: 'Unlockable',
      value: `${format(project.withdrawable)} ${projectTokenConfig.symbol}`,
      skeletonClass: 'w-24',
    },
    {
      id: 'min-raise',
      icon: Target,
      label: 'Min Raise',
      value: `${format(project.minTarget)} ${projectTokenConfig.symbol}`,
      skeletonClass: 'w-20',
      hidden: !(loading || project.minTarget > 0),
    },
  ].filter((metric) => !metric.hidden);

  // Phases data (6 phases)
  const phaseNames = [
    'Fundraising and Acquisition',
    'Design and Architectural',
    'Permitting',
    'Abatement/Demolition',
    'Construction',
    'Revenue and Sales',
  ] as const;

  // Get phase data sourced from Envio (PhaseMetrics + PhaseConfiguration snapshots)
  const envioPhases = envioData?.projectState?.phases || [];
  const latestPhaseConfig = envioData?.phaseConfigurations?.[0];
  const configPhaseCaps = Array.from({ length: 6 }, (_, i) => {
    const raw = latestPhaseConfig?.phaseCaps?.[i];
    if (!raw) return 0n;
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  });
  const configCapBps = Array.from({ length: 6 }, (_, i) => {
    if (!latestPhaseConfig?.capBps?.[i]) return 0;
    const raw = Number(latestPhaseConfig.capBps[i]);
    return Number.isFinite(raw) ? raw : 0;
  });
  const configAprBps = Array.from({ length: 6 }, (_, i) => {
    if (!latestPhaseConfig?.aprBps?.[i]) return 0;
    const raw = Number(latestPhaseConfig.aprBps[i]);
    return Number.isFinite(raw) ? raw : 0;
  });

  const perPhaseCapAmounts = Array.from({ length: 6 }, (_, i) => {
    const phaseMetric = envioPhases[i];
    if (phaseMetric?.phaseCap && phaseMetric.phaseCap !== '0') {
      try {
        return Number(fromStablecoin(BigInt(phaseMetric.phaseCap)));
      } catch {
        // fall through to config
      }
    }
    if (configPhaseCaps[i] > 0) {
      return Number(fromStablecoin(configPhaseCaps[i]));
    }
    return 0;
  });

  const cumulativeCapAmounts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const prev = i > 0 ? cumulativeCapAmounts[i - 1] : 0;
    cumulativeCapAmounts[i] = prev + (perPhaseCapAmounts[i] || 0);
  }

  const perPhaseCapBps = Array.from({ length: 6 }, (_, i) => {
    const metricBps = envioPhases[i]?.capBps;
    if (metricBps && metricBps !== '0') {
      const parsed = Number(metricBps);
      if (Number.isFinite(parsed)) return parsed;
    }
    return configCapBps[i] ?? 0;
  });

  const capBps: number[] = [];
  for (let i = 0; i < 6; i++) {
    const prev = i > 0 ? capBps[i - 1] : 0;
    capBps[i] = prev + (perPhaseCapBps[i] || 0);
  }

  const cumulativeCapAmountsFilled = Array.from({ length: 6 }, (_, i) => cumulativeCapAmounts[i] ?? 0);
  // Convert APRs from bps to percent for display
  const aprs = Array.from({ length: 6 }, (_, i) => {
    const envioApr = envioPhases[i]?.aprBps;
    if (envioApr && envioApr !== '0') {
      const aprBps = Number(envioApr);
      if (Number.isFinite(aprBps)) return aprBps / 100;
    }
    if (configAprBps[i]) return configAprBps[i] / 100;
    return 0;
  });
  const currentPhaseIndex = Math.max(0, envioData?.projectState?.currentPhase ?? 0);
  const nextPhaseName = currentPhaseIndex + 1 < phaseNames.length
    ? phaseNames[currentPhaseIndex + 1]
    : 'All phases complete';
  const perPhaseWithdrawn = envioPhases.map((p: any) => Number(fromStablecoin(BigInt(p.phaseWithdrawn || '0'))));
  const phaseCloseDates: (string | null)[] = [
    '2025-01-15', // Fundraising and Acquisition
    '2025-03-15', // Design and Architectural
    '2025-05-01', // Permitting
    '2025-07-20', // Abatement/Demolition
    null,         // Construction (current)
    null,         // Revenue and Sales (upcoming)
  ];

  const phasesDetails = phaseNames.map((name, i) => {
    const capAmount = cumulativeCapAmountsFilled[i] || 0;
    const withdrawn = perPhaseWithdrawn[i] || 0;
    const raisedAt = i === 0 ? project.raised : 0; // fundraising phase shows raised amount
    const status = i < currentPhaseIndex ? 'Past' : i === currentPhaseIndex ? 'Current' : 'Upcoming';
    const withdrawnPctOfCap = capAmount > 0 ? Math.min(100, (withdrawn / capAmount) * 100) : 0;
    const showWithdrawn = (i + 1) <= (envioData?.projectState?.lastClosedPhase ?? 0);
    let closingDisplay = 'TBD';
    if (i === currentPhaseIndex) {
      closingDisplay = 'In Progress';
    } else if (i < currentPhaseIndex && phaseCloseDates[i]) {
      closingDisplay = new Date(phaseCloseDates[i] as string).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return {
      index: i,
      name,
      apr: aprs[i],
      capBps: capBps[i],
      capAmount,
      raisedAt,
      withdrawn,
      withdrawnPctOfCap,
      status,
      closingDisplay,
      showWithdrawn,
      showCumulativeCap: i !== phaseNames.length - 1,
    };
  });

  const overviewStats = [
    {
      id: 'reserve',
      label: 'Interest Reserve',
      value: `${format(project.escrow)} ${projectTokenConfig.symbol}`,
      icon: ShieldCheck,
      tone: 'from-emerald-400/80 via-accent/60 to-primary/30',
    },
    {
      id: 'interest',
      label: 'Interest Accrued',
      value: `${format(project.interestAccrued)} ${projectTokenConfig.symbol}`,
      icon: DollarSign,
      tone: 'from-sky-400/80 via-primary/60 to-accent/40',
    },
    {
      id: 'supporters',
      label: 'Supporters',
      value: format(project.supporters),
      icon: Users,
      tone: 'from-indigo-400/80 via-primary/60 to-accent/40',
    },
  ] as const;

  const phaseStatusBadge = {
    Past: 'border-2 border-[#2D572D] bg-[#55AA55] text-white',
    Current: 'border-2 border-[#AA7700] bg-[#FFD700] text-[#2D1B00]',
    Upcoming: 'border-2 border-[#3D2817] bg-[#8B7355] text-white',
  } as const;

  const phaseStatusDot = {
    Past: 'bg-[#55AA55]',
    Current: 'bg-[#FFD700]',
    Upcoming: 'bg-[#8B7355]',
  } as const;

  type Doc = { id: string; name: string; type: 'image' | 'pdf'; url: string; hash: string };
  const [phaseDocuments, setPhaseDocuments] = useState<Doc[][]>([[], [], [], [], [], []]);

  // Process phase documents from already-loaded Envio data
  // Process phase documents from already-loaded Envio data
useEffect(() => {
  if (!envioData) return;
  
  const phaseClosedEvents = envioData.phasesClosed || [];
  const initialAppraisals = envioData.initialAppraisals || [];
  
  console.info('[docs] processing events from loaded data', { 
    phasesClosed: phaseClosedEvents.length,
    initialAppraisals: initialAppraisals.length,
    initialAppraisalsData: initialAppraisals
  });

  const docsByPhase: Doc[][] = [[], [], [], [], [], []];

  // Process initial appraisals for Phase 0 FIRST
  for (const appraisal of initialAppraisals) {
    const uri = appraisal.metadataURI || '';
    const hash = appraisal.appraisalHash || '0x';
    
    console.info('[docs] processing initial appraisal', { uri, hash });
    
    // Determine if it's an image or PDF based on URI
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].some(ext => 
      uri.toLowerCase().includes(`.${ext}`)
    );
    
    // Resolve IPFS URL
    let resolvedUrl = uri;
    if (uri.startsWith('ipfs://')) {
      resolvedUrl = `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    } else if (uri.startsWith('Qm') || uri.startsWith('bafy')) {
      // Raw IPFS hash
      resolvedUrl = `https://ipfs.io/ipfs/${uri}`;
    }
    
    docsByPhase[0].push({
      id: `phase0-initial-appraisal-${hash.slice(0, 10)}`,
      name: 'Initial Appraisal',
      type: isImage ? 'image' : 'pdf',
      url: resolvedUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      hash: hash,
    });
    
    console.info('[docs] added initial appraisal to phase 0', docsByPhase[0]);
  }

  // Process phase closed events
  for (const event of phaseClosedEvents) {
    const phaseId = Number(event.phaseId);
    if (phaseId < 0 || phaseId > 5) continue;

    const docTypes = event.docTypes || [];
    const docHashes = event.docHashes || [];
    const metadataURIs = event.metadataURIs || [];

    const phaseDocs: Doc[] = [];
    for (let i = 0; i < docTypes.length; i++) {
      const docType = docTypes[i] || 'unknown';
      const hash = docHashes[i] || '0x';
      const uri = metadataURIs[i] || '';
      
      // Determine if it's an image or PDF based on type/URI
      const isImage = docType.includes('image') || uri.includes('image') || 
                     ['jpg', 'jpeg', 'png', 'gif', 'webp'].some(ext => uri.toLowerCase().includes(ext));
      
      // Resolve IPFS URL
      let resolvedUrl = uri;
      if (uri.startsWith('ipfs://')) {
        resolvedUrl = `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
      } else if (uri.startsWith('Qm') || uri.startsWith('bafy')) {
        resolvedUrl = `https://ipfs.io/ipfs/${uri}`;
      }
      
      phaseDocs.push({
        id: `phase${phaseId}-doc${i}-${hash.slice(0, 10)}`,
        name: uri.split('/').pop() || `Document ${i + 1}`,
        type: isImage ? 'image' : 'pdf',
        url: resolvedUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        hash: hash,
      });
    }

    // Append to existing docs for this phase (in case initial appraisal already added to phase 0)
    docsByPhase[phaseId] = [...docsByPhase[phaseId], ...phaseDocs];
  }
  
  console.log("IA: ",envioData?.initialAppraisals);
  setPhaseDocuments(docsByPhase);
  console.info('[docs] updated phaseDocuments state', { phaseDocuments: docsByPhase });
  console.log(envioData.appraisalReportSubmitted);
  
}, [envioData]);

  const [activeDocPhase, setActiveDocPhase] = useState(0);
  const [docViewer, setDocViewer] = useState<Doc | null>(null);
  const isDeveloper = currentRole === 'developer';

  const minecraftPanelClass =
    'rounded border-2 border-[#654321] bg-[#F5DEB3]';
  const minecraftSubPanelClass =
    'rounded border-2 border-[#654321] bg-[#EBD8B0]';
  const minecraftHeaderClass = 'border-b-2 border-[#654321] bg-[#C4A484] px-5 py-3';
  const minecraftStatPillClass =
    'flex flex-1 flex-col gap-2 rounded border-2 border-[#654321] bg-[#F8E3B5] px-3 py-2 text-xs font-bold text-[#2D1B00] sm:min-w-0 min-w-0';
  const minecraftTabButtonBase =
    'px-6 py-3 font-bold text-sm border-4 shadow-[2px_2px_0_rgba(0,0,0,0.3)] transition-all uppercase tracking-[0.2em] rounded-none';
  const minecraftPrimaryButtonClass =
    'rounded-sm bg-[#5599FF] hover:bg-[#4488EE] border-2 border-[#2D5788] text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed';
  const minecraftSuccessButtonClass =
    'rounded-sm bg-[#55AA55] hover:bg-[#449944] border-2 border-[#2D572D] text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed';
  const minecraftNeutralButtonClass =
    'rounded-sm bg-[#D2B48C] hover:bg-[#C0A479] border-2 border-[#654321] text-[#2D1B00] font-bold disabled:opacity-60 disabled:cursor-not-allowed';
  const minecraftLinkClass =
    'font-mono text-xs text-[#2D1B00] underline decoration-4 decoration-[#FFD700] underline-offset-4 hover:text-[#2D1B00] hover:decoration-[#FFEE99]';
  const minecraftBadgeClass =
    'rounded-none border-4 border-[#2D572D] bg-[#55AA55] px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-[2px_2px_0_rgba(0,0,0,0.25)]';

  const tabs = [
    { id: 'milestones', label: 'Phases' },
    { id: 'flow-insights', label: 'Flow Insights' },
    { id: 'verification', label: 'Documents' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#87CEEB] via-[#B0D9F0] to-[#D4E8F5]">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_16px,rgba(0,0,0,0.1)_16px,rgba(0,0,0,0.1)_18px)]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_16px,rgba(0,0,0,0.1)_16px,rgba(0,0,0,0.1)_18px)]" />
      </div>
      <div className="relative z-10">
        {/* Header - Simplified */}
        <header className="container mx-auto px-4 pt-8 pb-4">
          <div className="border-2 border-[#654321] bg-gradient-to-b from-[#F1D9A7] to-[#D2B48C] p-6">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden border-2 border-[#3D2817]">
                <img
                  src={project.imageUri ? resolveImageUri(project.imageUri) : "https://images.unsplash.com/photo-1501183638710-841dd1904471?w=600&q=60&auto=format&fit=crop"}
                  alt="Project visual"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-wider text-[#2D1B00]">
                    {loading ? <Skeleton className="h-8 w-64" /> : project.name.toUpperCase()}
                  </h1>
                  <Badge className="rounded-sm border-2 border-[#2D572D] bg-[#55AA55] px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                    {project.status}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-[#5D4E37]">
                  <p>
                    <span className="font-bold">Project:</span>{' '}
                    {loading ? (
                      <Skeleton className="inline-block h-3 w-48" />
                    ) : (
                      <a
                        href={`https://sepolia.etherscan.io/address/${project.contractAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-[#2D1B00]"
                      >
                        {project.contractAddress}
                      </a>
                    )}
                  </p>
                  <p>
                    <span className="font-bold">Token:</span>{' '}
                    {loading ? (
                      <Skeleton className="inline-block h-3 w-48" />
                    ) : (
                      <a
                        href={`https://sepolia.etherscan.io/address/${project.tokenAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-[#2D1B00]"
                      >
                        {project.tokenAddress}
                      </a>
                    )}
                  </p>
                </div>
                <p className="text-sm text-[#2D1B00] line-clamp-2">
                  {project.description}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Capital Overview - Simplified */}
            <Card className={`${minecraftPanelClass} overflow-hidden`}>
              <CardHeader className={`${minecraftHeaderClass}`}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-[#2D1B00] tracking-[0.15em] uppercase">
                    Capital Overview
                  </CardTitle>
                  <Badge className="rounded-none border-2 border-[#AA7700] bg-[#FFD700] px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-[#2D1B00]">
                    {project.target ? `${raisedPercentage.toFixed(1)}%` : 'Open'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-[#2D1B00]">
                {/* Raised vs Target - Cleaner layout */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border-2 border-[#654321] bg-gradient-to-br from-[#FFD700] to-[#FFE55C] p-4">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#2D1B00]/70 mb-1">Raised</p>
                    <p className="text-xl font-bold text-[#2D1B00]">
                      {loading ? <Skeleton className="h-6 w-28" /> : `${format(project.raised)} ${projectTokenConfig.symbol}`}
                    </p>
                  </div>
                  <div className="rounded-lg border-2 border-[#654321] bg-gradient-to-br from-[#5599FF] to-[#6BB6FF] p-4">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/70 mb-1">Target</p>
                    <p className="text-xl font-bold text-white">
                      {loading ? <Skeleton className="h-6 w-28" /> : `${format(project.target)} ${projectTokenConfig.symbol}`}
                    </p>
                  </div>
                </div>
                
                {/* Simplified Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#2D1B00]">
                    <span>Progress</span>
                    <span>{raisedPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-4 w-full overflow-hidden rounded-sm border-2 border-[#654321] bg-[#B08D69]">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#5599FF] to-[#6BB6FF]"
                      style={{ width: `${Math.min(100, raisedPercentage)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#55AA55] to-[#66BB66]"
                      style={{ width: `${Math.min(100, withdrawnPercentage)}%` }}
                    />
                    {project.target > 0 && project.minTarget > 0 && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-[#FF4500]"
                        style={{ left: `${Math.max(0, Math.min(100, minRaisePercentage))}%` }}
                      />
                    )}
                  </div>
                </div>

                {/* Key Metrics - Compact Grid */}
                <div className="grid gap-3 grid-cols-3">
                  {capitalSummaryMetrics.map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <div
                        key={metric.id}
                        className="rounded-lg border-2 border-[#654321] bg-[#F8E3B5] p-3 text-center"
                      >
                        <div className="flex justify-center mb-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded border-2 border-[#654321] bg-[#FFD700]">
                            <Icon className="h-4 w-4 text-[#2D1B00]" />
                          </div>
                        </div>
                        <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#5D4E37] mb-1">
                          {metric.label}
                        </p>
                        <p className="text-sm font-bold text-[#2D1B00] break-words">
                          {loading ? <Skeleton className={`h-4 ${metric.skeletonClass} mx-auto`} /> : metric.value}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Additional Stats - Simplified */}
                <div className="grid gap-3 grid-cols-3 pt-4 border-t-2 border-[#654321]">
                  {overviewStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.id}
                        className="group relative flex h-full flex-col overflow-hidden rounded-lg border-4 border-[#654321] bg-gradient-to-br from-[#F8E3B5] via-[#FFF3C4] to-[#F8E3B5] p-5 text-[#2D1B00] shadow-[4px_4px_0_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0_rgba(0,0,0,0.3)]"
                      >
                        <div
                          className="absolute inset-0 bg-[radial-gradient(circle,_rgba(255,215,0,0.3)_0%,_transparent_70%)] opacity-70 transition-opacity group-hover:opacity-90"
                          aria-hidden="true"
                        />
                        <div className="relative z-10 flex flex-col items-center text-center gap-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-4 border-[#654321] bg-gradient-to-br from-[#FFD700] to-[#FFE55C] text-[#2D1B00] shadow-[2px_2px_0_rgba(0,0,0,0.25)]">
                              <Icon className="h-4 w-4" />
                            </div>
                            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#2D1B00] [text-shadow:_1px_1px_0_rgb(255_255_255_/_50%)]">
                              {stat.label}
                            </p>
                          </div>
                          <div className="w-full">
                            <p className="text-xl font-bold text-[#2D1B00] break-words [text-shadow:_1px_1px_0_rgb(255_255_255_/_30%)]">
                              {loading ? <Skeleton className="h-6 w-32" /> : stat.value}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Tabs - Cleaner */}
            <div className="flex flex-wrap gap-2 rounded border-2 border-[#654321] bg-[#C4A484] p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 font-bold text-xs border-2 rounded-sm transition-all uppercase tracking-wider ${
                    activeTab === tab.id
                      ? 'bg-[#FFD700] text-[#2D1B00] border-[#AA7700]'
                      : 'bg-[#8B7355] text-white border-[#3D2817] hover:bg-[#9B8365]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'flow-insights' && (
              <div className={`${minecraftPanelClass} p-6`}>
                <div className="-mx-2 overflow-x-auto px-2 pb-2">
                  <ProjectInsightsPanel
                    loading={loading}
                    data={insightsData}
                    tokenSymbol={projectTokenConfig.symbol}
                    className="min-w-[720px] w-full"
                  />
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className={`${minecraftPanelClass} p-6`}>
                <div className="relative text-[#2D1B00]">
                  {timelineEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-[#5D4E37]">
                      <span>No on-chain activity recorded yet.</span>
                      <span>Deployments, withdrawals, and updates will appear here automatically.</span>
                    </div>
                  ) : (
                    <>
                      <div className="pointer-events-none absolute left-6 top-3 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-[#3D2817] via-[#8B7355] to-transparent md:left-1/2 md:-translate-x-1/2" />
                      <div className="space-y-10">
                        {timelineEvents.map((event, idx) => (
                          <div
                            key={event.id}
                            className={`relative flex gap-6 pl-12 md:pl-0 ${idx % 2 === 1 ? 'md:justify-end' : 'md:justify-start'}`}
                          >
                            <div className="absolute left-5 top-4 flex h-4 w-4 items-center justify-center rounded-full border-4 border-[#3D2817] bg-[#FFD700] shadow-[3px_3px_0_rgba(0,0,0,0.3)] md:left-1/2 md:-translate-x-1/2" />
                            <div
                              className={`relative w-full md:max-w-[45%] ${
                                idx % 2 === 1 ? 'md:translate-x-6' : 'md:-translate-x-6'
                              }`}
                            >
                              <TimelineCard
                                className="border-4 border-[#654321] bg-[#F8E3B5] p-5 text-[#2D1B00] shadow-[4px_4px_0_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0_rgba(0,0,0,0.3)]"
                                type={event.type}
                                title={event.title}
                                meta={event.meta}
                                actions={event.actions}
                              >
                                {event.description}
                              </TimelineCard>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'milestones' && (
              <div className={`${minecraftPanelClass} p-6`}>
                <div className="relative text-[#2D1B00]">
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#3D2817] via-[#8B7355] to-transparent" />
                  <div className="space-y-6">
                    {phasesDetails.map((p, idx) => {
                      const statusKey = p.status as keyof typeof phaseStatusDot;
                      const dotTone = phaseStatusDot[statusKey] ?? 'bg-slate-300';
                      const badgeTone = phaseStatusBadge[statusKey] ?? 'bg-muted text-foreground';
                      const progressWidth = `${Math.min(100, Math.round(p.withdrawnPctOfCap))}%`;
                      const infoBlocks: Array<{ label: string; value: string }> = [
                        { label: 'APR', value: `${p.apr}%` },
                        p.showCumulativeCap
                          ? {
                              label: 'Cumulative Cap',
                              value: `${(p.capBps / 100).toFixed(1)}% (${format(Math.round(p.capAmount))} ${projectTokenConfig.symbol})`,
                            }
                          : {
                              label: 'Raised in Phase',
                              value: `${format(p.raisedAt)} ${projectTokenConfig.symbol}`,
                            },
                        p.showWithdrawn
                          ? { label: 'Withdrawn', value: `${format(Math.round(p.withdrawn))} ${projectTokenConfig.symbol}` }
                          : null,
                        { label: 'Closing', value: p.closingDisplay },
                      ].filter(Boolean) as Array<{ label: string; value: string }>;

                      return (
                        <div key={p.index} className="relative flex gap-4 pl-10">
                          <div className="absolute left-3.5 top-5 z-10 flex h-3 w-3 items-center justify-center rounded-full border-2 border-[#3D2817] bg-[#F8E3B5]">
                            <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
                          </div>
                          <div
                            className={`w-full rounded border-2 border-[#654321] p-4 transition-all ${
                              idx === currentPhaseIndex ? 'bg-[#FFDFA6]' : 'bg-[#F8E3B5]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#5D4E37]">
                                  Phase {p.index + 1}
                                </p>
                                <h3 className="text-base font-bold text-[#2D1B00]">{p.name}</h3>
                              </div>
                              <Badge className={`rounded-sm px-3 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${badgeTone}`}>
                                {p.status}
                              </Badge>
                            </div>

                            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-4">
                              {infoBlocks.map((block) => (
                                <div key={block.label}>
                                  <p className="text-[0.6rem] font-bold uppercase tracking-wide text-[#5D4E37] mb-0.5">
                                    {block.label}
                                  </p>
                                  <p className="text-xs font-bold text-[#2D1B00]">
                                    {loading ? <Skeleton className="h-3 w-16" /> : block.value}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[0.6rem] font-semibold text-[#5D4E37]">
                                <span>Cap Unlock</span>
                                <span>{progressWidth}</span>
                              </div>
                              <div className="relative h-1.5 w-full overflow-hidden rounded-sm border border-[#654321] bg-[#B08D69]">
                                <div
                                  className="absolute inset-y-0 left-0 bg-[#5599FF]"
                                  style={{ width: progressWidth }}
                                />
                              </div>
                            </div>

                            {p.showWithdrawn && (
                              <p className="mt-2 text-[0.6rem] text-[#5D4E37]">
                                Phase cap unlocked and included in cumulative developer withdrawals.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'verification' && (
              <div className={`${minecraftPanelClass} p-6`}>
                <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {phasesDetails.map((p) => {
                      const statusKey = p.status as keyof typeof phaseStatusBadge;
                      const docs = phaseDocuments[p.index] || [];
                      return (
                        <button
                          key={`docs-nav-${p.index}`}
                          type="button"
                          onClick={() => setActiveDocPhase(p.index)}
                          className={`w-full rounded-lg border-4 px-4 py-3 text-left font-semibold tracking-[0.05em] shadow-[3px_3px_0_rgba(0,0,0,0.25)] transition-all ${
                            activeDocPhase === p.index
                              ? 'border-[#AA7700] bg-[#FFDFA6] text-[#2D1B00]'
                              : 'border-[#654321] bg-[#EBD8B0] text-[#5D4E37] hover:-translate-y-1 hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">Phase {p.index + 1}</p>
                            <Badge className={`rounded-none px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] ${phaseStatusBadge[statusKey] ?? ''}`}>
                              {p.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-[#5D4E37]">{p.name}</p>
                          <div className="mt-3 flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[#5D4E37]">
                            <span>{docs.length} docs</span>
                            <span>{p.closingDisplay}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className={`${minecraftSubPanelClass} p-5 text-[#2D1B00]`}>
                    {(() => {
                      const activePhase = phasesDetails[activeDocPhase];
                      const docs = phaseDocuments[activeDocPhase] || [];
                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-[#5D4E37]">
                                Phase {activePhase.index + 1}
                              </p>
                              <h3 className="text-lg font-bold text-[#2D1B00]">
                                {activePhase.name}
                              </h3>
                            </div>
                            <Badge className="rounded-none border-4 border-[#654321] bg-[#FFD700] px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#2D1B00] shadow-[2px_2px_0_rgba(0,0,0,0.25)]">
                              {activePhase.closingDisplay}
                            </Badge>
                          </div>

                          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {docs.length > 0 ? (
                              docs.map((d) => (
                                <button
                                  key={d.id}
                                  className="group flex h-full flex-col overflow-hidden rounded-lg border-4 border-[#654321] bg-[#F8E3B5] text-left shadow-[4px_4px_0_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0_rgba(0,0,0,0.3)] focus:outline-none"
                                  onClick={() => setDocViewer(d)}
                                  title={d.name ?? 'Document'}
                                >
                                  <div className="relative aspect-video w-full overflow-hidden border-b-4 border-[#654321] bg-[#EBD8B0]">
                                    {d.type === 'image' ? (
                                      <img
                                        src={d.url}
                                        alt={d.name}
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-[#5D4E37]">
                                        <FileText className="h-8 w-8" />
                                      </div>
                                    )}
                                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#3D2817]/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-80" />
                                  </div>
                                  <div className="flex flex-1 flex-col justify-between p-3">
                                    <div>
                                      <p className="truncate text-sm font-bold text-[#2D1B00]">
                                        {d.name ?? 'Document'}
                                      </p>
                                      <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.3em] text-[#5D4E37]">
                                        {d.type.toUpperCase()}
                                      </p>
                                    </div>
                                    <p className="mt-2 text-[0.65rem] text-[#5D4E37]">
                                      Hash {d.hash.slice(0, 10)}…
                                    </p>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="col-span-full flex flex-col items-center justify-center rounded-lg border-4 border-dashed border-[#654321] bg-[#F8E3B5] p-8 text-center text-sm text-[#5D4E37] shadow-[4px_4px_0_rgba(0,0,0,0.25)]">
                                <FileText className="mb-3 h-10 w-10 text-[#3D2817]" />
                                <p>No documents uploaded for this phase yet.</p>
                                <p className="mt-1 text-xs text-[#3D2817]">
                                  Developer submissions will appear here once the phase closes.
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Role Selector */}
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentRole('holder')}
                className={`flex-1 rounded-lg border-4 px-4 py-3 text-center font-bold shadow-[3px_3px_0_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1 hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)] ${
                  currentRole === 'holder'
                    ? 'border-[#55AA55] bg-[#66BB66] text-white'
                    : 'border-[#654321] bg-[#EBD8B0] text-[#2D1B00] hover:bg-[#F8E3B5]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg border-4 ${
                    currentRole === 'holder'
                      ? 'border-[#2D572D] bg-[#55AA55]'
                      : 'border-[#654321] bg-[#FFD700]'
                  }`}>
                    <Users className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em]">Investor</p>
                </div>
              </button>
              
              <button
                onClick={() => setCurrentRole('developer')}
                className={`flex-1 rounded-lg border-4 px-4 py-3 text-center font-bold shadow-[3px_3px_0_rgba(0,0,0,0.3)] transition-all hover:-translate-y-1 hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)] ${
                  currentRole === 'developer'
                    ? 'border-[#5599FF] bg-[#66AAFF] text-white'
                    : 'border-[#654321] bg-[#EBD8B0] text-[#2D1B00] hover:bg-[#F8E3B5]'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg border-4 ${
                    currentRole === 'developer'
                      ? 'border-[#2D5788] bg-[#5599FF]'
                      : 'border-[#654321] bg-[#FFD700]'
                  }`}>
                    <HardHat className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em]">Builder</p>
                </div>
              </button>
            </div>

            {!connected ? (
              // Placeholder when wallet not connected
              <Card className={`${minecraftPanelClass} border-dashed`}>
                <CardHeader className={`${minecraftHeaderClass} text-center`}>
                  <CardTitle className="text-lg font-bold uppercase tracking-[0.2em] text-[#2D1B00]">
                    Connect Your Wallet
                  </CardTitle>
                  <CardDescription className="text-sm font-semibold text-[#5D4E37]">
                    Connect your wallet to invest in this project and view your portfolio
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-[#2D1B00]">
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Wallet className="mb-4 h-16 w-16 text-[#3D2817]" />
                    <p className="mb-4 text-sm text-[#5D4E37]">
                      You need to connect your wallet to support this project and manage your investments.
                    </p>
                    <Button onClick={connectWallet} size="lg" className={`${minecraftPrimaryButtonClass} w-full`}>
                      <Wallet className="mr-2 h-4 w-4" />
                      Connect Wallet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Support card (investor/holder only) */}
                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                  <Card className={minecraftPanelClass}>
                    <CardHeader className={minecraftHeaderClass}>
                      <CardTitle className="text-lg font-bold uppercase tracking-[0.2em] text-[#2D1B00]">Support This Project</CardTitle>
                      <CardDescription className="text-sm font-semibold text-[#5D4E37]">Invest in this project using {projectTokenConfig.symbol}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-6 text-[#2D1B00]">
                    <div className="space-y-3">
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={supportAmount}
                          onChange={(e) => setSupportAmount(e.target.value)}
                          className="h-11 rounded-none border-4 border-[#654321] bg-[#FFF3C4]"
                        />
                        <Button 
                          className={`${minecraftSuccessButtonClass} w-full h-12`}
                          disabled={isDepositing}
                          onClick={async () => {
                            try {
                              if (!projectAddress || !staticConfig?.stablecoin || !supportAmount) {
                                toast.error('Please enter amount');
                                return;
                              }
                              setIsDepositing(true);
                              const signer = await getSigner();
                              const amt = toStablecoin(supportAmount);
                              
                              // First approve
                              const t = erc20At(staticConfig.stablecoin, signer);
                              const approveTx = await t.approve(projectAddress, amt);
                              await approveTx.wait();
                              toast.success('Approved, now depositing...');
                              
                              // Then deposit
                              const proj = projectAt(projectAddress, signer);
                              const depositTx = await proj.deposit(amt);
                              await depositTx.wait();
                              toast.success('Deposited successfully');
                              
                              const isFirstDeposit = !realtimeData?.userBalance || realtimeData.userBalance === 0n;
                              if (isFirstDeposit) {
                                setSupporters(prev => prev + 1);
                              }
                              
                              setSupportAmount('');
                              refresh();
                            } catch (e: any) {
                              toast.error(e?.shortMessage || e?.message || 'Transaction failed');
                            } finally {
                              setIsDepositing(false);
                            }
                          }}
                        >
                          <DollarSign className="mr-2 h-4 w-4" />
                          {isDepositing ? 'Processing...' : 'Approve & Deposit'}
                        </Button>
                        <p className="text-xs text-[#5D4E37] text-center">
                          This will approve and deposit in one flow
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </RoleGate>
                {/* Holder investment overview */}
                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                  <Card className={minecraftPanelClass}>
                    <CardHeader className={minecraftHeaderClass}>
                      <CardTitle className="text-lg font-bold uppercase tracking-[0.2em] text-[#2D1B00]">Your Investment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-[#2D1B00] p-6">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#5D4E37]">Your Balance</span>
                        <span className="font-bold">
                          {loadingRealtime ? <Skeleton className="inline-block h-4 w-20" /> : `${realtimeData?.userBalance ? Number(fromStablecoin(realtimeData.userBalance)).toLocaleString('en-US') : 0} ${projectTokenConfig.symbol}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#5D4E37]">Claimable Interest</span>
                        <span className="font-bold">
                        {loadingRealtime ? (
                          <Skeleton className="inline-block h-4 w-20" />
                        ) : (() => {
                            const interestValue = Number(fromStablecoin(realtimeData?.claimableInterest || 0n));
                            let displayValue;

                            if (interestValue === 0) {
                              displayValue = "0";
                            } else if (interestValue < 0.001) {
                              displayValue = "<0.001";
                            } else {
                              displayValue = interestValue.toLocaleString('en-US', {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              });
                            }

                            return `${displayValue} ${projectTokenConfig.symbol}`;
                          })()
                        }
                        </span>
                      </div>
                      <Button variant="outline" className={`${minecraftNeutralButtonClass} w-full mt-1`} disabled={isClaimingInterest} onClick={async ()=>{
                        try {
                          if (!projectAddress || !realtimeData?.claimableInterest || realtimeData.claimableInterest === 0n) { toast.error('Nothing to claim'); return; }
                          setIsClaimingInterest(true);
                          const signer = await getSigner();
                          const proj = projectAt(projectAddress, signer);
                          const tx = await proj.claimInterest(realtimeData.claimableInterest);
                          await tx.wait();
                          toast.success('Interest claimed');
                          refresh();
                        } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Claim failed'); }
                        finally { setIsClaimingInterest(false); }
                      }}>{isClaimingInterest ? 'Claiming...' : 'Withdraw Interest'}</Button>

                      {/* Principal Redemption */}
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#5D4E37]">Principal Withdrawable</span>
                        <span className="font-bold">
                          {loadingRealtime ? <Skeleton className="inline-block h-4 w-20" /> : `${realtimeData?.principalBuffer ? Number(fromStablecoin(realtimeData.principalBuffer)).toLocaleString('en-US') : 0} ${projectTokenConfig.symbol}`}
                        </span>
                      </div>
                      {realtimeData?.principalBuffer && realtimeData?.userBalance && realtimeData.principalBuffer > 0n && (
                        <Button variant="outline" className={`${minecraftNeutralButtonClass} w-full mt-1`} disabled={isRedeemingPrincipal} onClick={async ()=>{
                          try {
                            if (!projectAddress) return;
                            const shares = realtimeData.userBalance! < realtimeData.principalBuffer! ? realtimeData.userBalance! : realtimeData.principalBuffer!;
                            if (shares === 0n) { toast.error('No redeemable principal yet'); return; }
                            setIsRedeemingPrincipal(true);
                            const signer = await getSigner();
                            const proj = projectAt(projectAddress, signer);
                            const tx = await proj.withdrawPrincipal(shares);
                            await tx.wait();
                            toast.success('Principal redeemed');
                            refresh();
                          } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Redeem failed'); }
                          finally { setIsRedeemingPrincipal(false); }
                        }}>{isRedeemingPrincipal ? 'Redeeming...' : 'Redeem Principal'}</Button>
                      )}
                    </CardContent>
                  </Card>
                </RoleGate>
              </>
            )}

            {/* Developer actions */}
            <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
              <Card className={`${minecraftPanelClass} overflow-visible`}>
                <CardHeader className={minecraftHeaderClass}>
                  <CardTitle className="text-lg font-bold uppercase tracking-[0.2em] text-[#2D1B00]">Developer Actions</CardTitle>
                  <CardDescription className="text-sm font-semibold text-[#5D4E37]">Fund reserve, close phase, withdraw</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 text-[#2D1B00] overflow-visible">
                  {/* Fund Reserve */}
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <div className="space-y-3">
                        <div className={`${minecraftSubPanelClass} p-3 mt-3`}>
                          <p className="text-xs font-semibold text-[#5D4E37] mb-1">Current Reserve:</p>
                          <p className="text-lg font-bold text-[#2D1B00]">
                            {loading ? <Skeleton className="h-6 w-24" /> : `${format(project.escrow)} ${projectTokenConfig.symbol}`}
                          </p>
                        </div>
                        <Input
                          type="number"
                          placeholder="Amount to add"
                          value={reserveAmount}
                          onChange={(e) => setReserveAmount(e.target.value)}
                          className="h-10 rounded-none border-4 border-[#654321] bg-[#FFF3C4] text-sm"
                        />
                        <Button 
                          size="sm" 
                          className={`${minecraftPrimaryButtonClass} w-full h-10`}
                          disabled={isFundingReserve}
                          onClick={async () => {
                            try {
                              if (!projectAddress || !staticConfig?.stablecoin || !reserveAmount) {
                                toast.error('Please enter amount');
                                return;
                              }
                              if (Number(reserveAmount) <= 0) {
                                toast.error('Amount must be greater than 0');
                                return;
                              }
                              setIsFundingReserve(true);
                              const signer = await getSigner();
                              const amt = toStablecoin(reserveAmount);
                              
                              // First approve
                              const t = erc20At(staticConfig.stablecoin, signer);
                              const approveTx = await t.approve(projectAddress, amt);
                              await approveTx.wait();
                              toast.success('Approved, now funding...');
                              
                              // Then fund reserve
                              const proj = projectAt(projectAddress, signer);
                              const fundTx = await proj.fundReserve(amt);
                              await fundTx.wait();
                              toast.success('Reserve funded successfully');
                              
                              setReserveAmount('');
                              refresh();
                            } catch (e: any) {
                              toast.error(e?.shortMessage || e?.message || 'Transaction failed');
                            } finally {
                              setIsFundingReserve(false);
                            }
                          }}
                        >
                          <Banknote className="mr-2 h-4 w-4" />
                          {isFundingReserve ? 'Processing...' : 'Approve & Fund'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Initial Appraisal (Phase 0 only) */}
{currentPhaseIndex === 0 && !envioData?.appraisalReportSubmitted && (
  <div className="space-y-2 border-b-2 border-[#654321] pb-4">
    <div className="flex items-center gap-2">
      <FileText className="h-4 w-4 text-[#3D2817]" />
      <span className="text-sm font-bold text-[#2D1B00]">Submit Initial Appraisal</span>
    </div>
    <div className="space-y-3">
      <div className={`${minecraftSubPanelClass} p-3`}>
        <p className="text-xs text-[#5D4E37] mb-2">
          ⚠️ Submitting the initial appraisal will <strong>immediately unlock all raised funds</strong> for withdrawal.
        </p>
        <p className="text-xs text-[#5D4E37]">
          This document will be permanently stored on IPFS and displayed in Phase 0 documentation.
        </p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="appraisalFile" className="text-sm font-bold text-[#2D1B00]">
          Upload Appraisal Document
        </Label>
        <Input
          id="appraisalFile"
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => setAppraisalFile(e.target.files?.[0] || null)}
          className="rounded-none border-4 border-dashed border-[#654321] bg-[#FFF3C4] text-[#2D1B00] min-h-[60px] pt-2 pb-3 px-4 file:mr-4 file:rounded-none file:border-0 file:bg-[#8B7355] file:px-4 file:py-2 file:font-bold file:uppercase file:text-white hover:file:bg-[#715b3f]"
        />
        {appraisalFile && (
          <div className="flex items-center justify-between text-xs text-[#5D4E37] bg-[#FFF3C4] border-2 border-[#654321] p-2 rounded">
            <span className="flex items-center gap-2">
              <FileText className="h-3 w-3" />
              {appraisalFile.name}
            </span>
            <span className="font-semibold">
              {(appraisalFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
        )}
      </div>

      <div className={`${minecraftSubPanelClass} p-3 text-xs`}>
        <p className="font-semibold text-[#2D1B00] mb-2">Requirements:</p>
        <ul className="space-y-1 text-[#5D4E37] list-disc list-inside">
          <li>Image (JPG, PNG, etc.) or PDF format</li>
          <li>File size under 10MB recommended</li>
          <li>Must meet minimum fundraise target first</li>
        </ul>
      </div>

      <Button
        size="sm"
        className={`${minecraftPrimaryButtonClass} w-full h-10`}
        disabled={isSubmittingAppraisal || !appraisalFile}
        onClick={async () => {
          try {
            if (!projectAddress || !appraisalFile) {
              toast.error('Please select an appraisal file');
              return;
            }
            
            // Check if min raise met
            const minRaiseRaw = BigInt(envioData?.minRaise || '0');
            const totalRaisedRaw = BigInt(envioData?.projectState?.totalRaised || '0');
            if (totalRaisedRaw < minRaiseRaw) {
              toast.error('Minimum fundraise target not met yet');
              return;
            }

            setIsSubmittingAppraisal(true);
            const signer = await getSigner();
            const proj = projectAt(projectAddress, signer);

            // Upload to IPFS
            toast.info('Uploading document to IPFS...');
            const uploaded = await ipfsUpload([appraisalFile]);
            const uri = uploaded[0]?.uri || '';
            
            if (!uri) {
              throw new Error('IPFS upload failed');
            }

            // Compute hash of file
            toast.info('Computing document hash...');
            const buf = new Uint8Array(await appraisalFile.arrayBuffer());
            const hash = ethers.keccak256(buf);

            // Submit transaction
            toast.info('Submitting to blockchain...');
            const tx = await proj.submitInitialAppraisal(hash, uri);
            toast.info('Transaction sent, waiting for confirmation...');
            await tx.wait();
            
            toast.success('Initial appraisal submitted successfully! All funds are now unlocked.');

            setAppraisalFile(null);
            refresh();
          } catch (e: any) {
            console.error('Initial appraisal submission error:', e);
            toast.error(e?.shortMessage || e?.message || 'Submission failed');
          } finally {
            setIsSubmittingAppraisal(false);
          }
        }}
      >
        <FileText className="mr-2 h-4 w-4" />
        {isSubmittingAppraisal ? 'Submitting...' : 'Submit Initial Appraisal'}
      </Button>
      
      <p className="text-[0.6rem] text-[#3D2817] text-center font-semibold">
        ⚠️ This action cannot be undone and will unlock all raised capital
      </p>
    </div>
  </div>
)}

{/* Show confirmation if already submitted */}
{currentPhaseIndex === 0 && envioData?.appraisalReportSubmitted && (
  <div className={`${minecraftSubPanelClass} p-4 border-2 border-[#55AA55]`}>
    <div className="flex items-center gap-2 text-[#55AA55] mb-2">
      <ShieldCheck className="h-5 w-5" />
      <span className="text-sm font-bold">Initial Appraisal Submitted</span>
    </div>
    <p className="text-xs text-[#5D4E37]">
      All raised funds are now unlocked for withdrawal. View the appraisal document in Phase 0 documentation.
    </p>
  </div>
)}

                  {/* Close Phase */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DoorClosed className="h-4 w-4 text-[#3D2817]" />
                      <span className="text-sm font-bold text-[#2D1B00]">Close Phase</span>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-[#5D4E37]">Current Phase</span>
                        <span className="font-bold">
                          {loading ? <Skeleton className="inline-block h-4 w-32" /> : project.currentPhase}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-[#5D4E37]">Next Phase</span>
                        <span className="font-bold">
                          {loading ? <Skeleton className="inline-block h-4 w-32" /> : nextPhaseName}
                        </span>
                      </div>
                      <div className="grid gap-1 py-1">
                        <Label htmlFor="phaseDocs" className="text-sm font-bold text-[#2D1B00]">Upload Documents</Label>
                        <Input
                          id="phaseDocs"
                          type="file"
                          multiple
                          onChange={(e) => setUploadedDocs(Array.from(e.target.files || []))}
                          className="rounded-none border-4 border-dashed border-[#654321] bg-[#FFF3C4] text-[#2D1B00] min-h-[60px] pt-2 pb-3 px-4 file:mr-4 file:rounded-none file:border-0 file:bg-[#8B7355] file:px-4 file:py-2 file:font-bold file:uppercase file:text-white hover:file:bg-[#715b3f]"
                        />
                        <p className="text-xs text-[#5D4E37]">Attach evidence to close the current phase.</p>
                      </div>
                      <Button size="sm" className={`${minecraftPrimaryButtonClass} justify-start px-4 h-10`} disabled={isClosingPhase} onClick={async ()=>{
                        try {
                          if (!projectAddress) return;
                          if (!uploadedDocs.length) { toast.error('Please upload at least one document'); return; }
                          setIsClosingPhase(true);
                          const signer = await getSigner();
                          const proj = projectAt(projectAddress, signer);
                          const phaseId: number = (envioData?.projectState?.currentPhase ?? 0);
                          // Upload to IPFS
                          const uploaded = await ipfsUpload(uploadedDocs);
                          const nameByPath = Object.fromEntries(uploaded.map(u=>[u.path,u]));
                          const docTypes: string[] = [];
                          const docHashes: string[] = [];
                          const metadataURIs: string[] = [];
                          for (const f of uploadedDocs) {
                            const buf = new Uint8Array(await f.arrayBuffer());
                            const hash = ethers.keccak256(buf);
                            docTypes.push(f.type || (f.name.split('.').pop() || 'file'));
                            docHashes.push(hash);
                            const up = nameByPath[f.name];
                            metadataURIs.push(up?.uri || '');
                          }
                          const tx = await proj.closePhase(phaseId, docTypes, docHashes, metadataURIs);
                          await tx.wait();
                          toast.success(`Closed phase ${phaseId}`);
                          setUploadedDocs([]);
                          refresh();
                        } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Close failed'); }
                        finally { setIsClosingPhase(false); }
                      }}>
                        <DoorClosed className="mr-2 h-4 w-4" /> {isClosingPhase ? 'Closing...' : 'Close Phase'}
                      </Button>
                    </div>
                  </div>
                  {/* Withdraw Phase Funds */}
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-[#3D2817]" />
                        <span className="text-sm font-bold text-[#2D1B00]">Withdraw Phase Funds</span>
                      </div>
                      <div className="space-y-3">
                        <div className={`${minecraftSubPanelClass} p-3`}>
                          <p className="text-xs font-semibold text-[#5D4E37] mb-1">Withdrawable Now:</p>
                          <p className="text-lg font-bold text-[#2D1B00]">
                            {loadingRealtime ? <Skeleton className="h-6 w-24" /> : `${withdrawableNow.toLocaleString('en-US')} ${projectTokenConfig.symbol}`}
                          </p>
                        </div>
                        <Input
                          type="number"
                          placeholder="Amount to withdraw"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="h-10 rounded-none border-4 border-[#654321] bg-[#FFF3C4] text-sm"
                        />
                        <Button 
                          size="sm" 
                          className={`${minecraftPrimaryButtonClass} w-full h-10`}
                          disabled={isWithdrawingFunds}
                          onClick={async () => {
                            try {
                              if (!projectAddress || !withdrawAmount) {
                                toast.error('Please enter amount');
                                return;
                              }
                              const amt = Number(withdrawAmount);
                              if (amt <= 0) {
                                toast.error('Amount must be greater than 0');
                                return;
                              }
                              if (amt > withdrawableNow) {
                                toast.error('Amount exceeds withdrawable balance');
                                return;
                              }
                              setIsWithdrawingFunds(true);
                              const signer = await getSigner();
                              const proj = projectAt(projectAddress, signer);
                              const tx = await proj.withdrawPhaseFunds(toStablecoin(amt.toString()));
                              await tx.wait();
                              toast.success('Funds withdrawn successfully');
                              
                              setWithdrawAmount('');
                              refresh();
                            } catch (e: any) {
                              toast.error(e?.shortMessage || e?.message || 'Withdraw failed');
                            } finally {
                              setIsWithdrawingFunds(false);
                            }
                          }}
                        >
                          <DollarSign className="mr-2 h-4 w-4" />
                          {isWithdrawingFunds ? 'Withdrawing...' : 'Withdraw Funds'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Sales Proceeds */}
                  <div className="space-y-2">
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-[#3D2817]" />
                        <span className="text-sm font-bold text-[#2D1B00]">Submit Sales Proceeds</span>
                      </div>
                      <div className="space-y-3">
                        <div className={`${minecraftSubPanelClass} p-3`}>
                          <p className="text-xs font-semibold text-[#5D4E37] mb-1">Principal Buffer:</p>
                          <p className="text-lg font-bold text-[#2D1B00]">
                            {loading ? <Skeleton className="h-6 w-24" /> : `${realtimeData?.principalBuffer ? Number(fromStablecoin(realtimeData.principalBuffer)).toLocaleString('en-US') : 0} ${projectTokenConfig.symbol}`}
                          </p>
                        </div>
                        <Input
                          type="number"
                          placeholder="Proceeds amount"
                          value={proceedsAmount}
                          onChange={(e) => setProceedsAmount(e.target.value)}
                          className="h-10 rounded-none border-4 border-[#654321] bg-[#FFF3C4] text-sm"
                        />
                        <Button 
                          size="sm" 
                          className={`${minecraftPrimaryButtonClass} w-full h-10`}
                          disabled={isSubmittingProceeds}
                          onClick={async () => {
                            try {
                              if (!projectAddress || !staticConfig?.stablecoin || !proceedsAmount) {
                                toast.error('Please enter amount');
                                return;
                              }
                              if (Number(proceedsAmount) <= 0) {
                                toast.error('Amount must be greater than 0');
                                return;
                              }
                              setIsSubmittingProceeds(true);
                              const signer = await getSigner();
                              const amt = toStablecoin(proceedsAmount);
                              
                              // First approve
                              const t = erc20At(staticConfig.stablecoin, signer);
                              const approveTx = await t.approve(projectAddress, amt);
                              await approveTx.wait();
                              toast.success('Approved, now submitting...');
                              
                              // Then submit proceeds
                              const proj = projectAt(projectAddress, signer);
                              const submitTx = await proj.submitSalesProceeds(amt);
                              await submitTx.wait();
                              toast.success('Proceeds submitted successfully');
                              
                              setProceedsAmount('');
                              refresh();
                            } catch (e: any) {
                              toast.error(e?.shortMessage || e?.message || 'Transaction failed');
                            } finally {
                              setIsSubmittingProceeds(false);
                            }
                          }}
                        >
                          <DollarSign className="mr-2 h-4 w-4" />
                          {isSubmittingProceeds ? 'Processing...' : 'Approve & Submit'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </RoleGate>

            {/* Project facts */}
            <Card className={minecraftPanelClass}>
              <CardHeader className={minecraftHeaderClass}>
                <CardTitle className="text-lg font-bold uppercase tracking-[0.2em] text-[#2D1B00]">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[#2D1B00] p-6">
                <div>
                  <p className="font-semibold text-[#5D4E37]">Owner</p>
                  <p className="font-mono text-[#2D1B00]">
                    {loading ? <Skeleton className="h-4 w-full" /> : project.owner}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#5D4E37]">Interest Reserve</p>
                  <p className="font-bold">
                    {loading ? <Skeleton className="h-4 w-24" /> : `${project.escrow} ${projectTokenConfig.symbol}`}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#5D4E37]">Current Phase</p>
                  <p className="font-bold">
                    {loading ? <Skeleton className="h-4 w-32" /> : project.currentPhase}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-[#5D4E37]">Supporters</p>
                  <p className="font-bold">
                    {loading ? <Skeleton className="h-4 w-16" /> : project.supporters}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
              <Card>
                <CardHeader>
                  <CardTitle>Your Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Report Issue
                  </Button>
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Subscribe to Updates
                  </Button>
                </CardContent>
              </Card>
            </RoleGate> */}
          </div>
        </div>
      </div>
      {/* Documents Viewer */}
        <Drawer open={!!docViewer} onOpenChange={(o) => !o && setDocViewer(null)}>
          <DrawerContent className="h-[90vh] border-4 border-[#654321] bg-[#F8E3B5] shadow-[8px_8px_0_rgba(0,0,0,0.35)]">
            <DrawerHeader className={`${minecraftHeaderClass} flex items-center justify-between`}>
              <DrawerTitle>{docViewer?.name ?? 'Document'}</DrawerTitle>
              <DrawerClose asChild>
                <Button size="sm" className={`${minecraftPrimaryButtonClass} h-10 px-4`}>Close</Button>
              </DrawerClose>
            </DrawerHeader>
            <div className="h-[80vh] overflow-y-auto bg-[#FFF3C4] px-4 pb-4 text-[#2D1B00]">
              {docViewer?.type === 'image' ? (
                <img src={docViewer.url} alt={docViewer.name} className="h-full w-full rounded border-4 border-[#654321] object-contain" />
              ) : docViewer?.type === 'pdf' ? (
                <iframe src={docViewer.url} className="h-full w-full rounded border-4 border-[#654321] bg-white" title={docViewer.name} />
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
};

export default ProjectDetails;
