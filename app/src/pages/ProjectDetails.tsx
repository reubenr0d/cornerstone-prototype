import { useEffect, useMemo, useState, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { RoleSelector } from '@/components/RoleSelector';
import { RoleGate, Role } from '@/components/RoleGate';
import { TimelineCard } from '@/components/TimelineCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Removed Progress usage in favor of custom stacked bar
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { ExternalLink, Plus, Edit, Upload, DollarSign, AlertTriangle, MessageSquare, Banknote, DoorClosed, Wallet, FileText, Target, Users, ShieldCheck } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Address, erc20At, fromUSDC, getAccount, getProvider, getRpcProvider, getSigner, projectAt, toUSDC, fetchProjectCoreState, fetchProjectUserState, fetchSupportersCount, getWindowEthereum } from '@/lib/eth';
import { fetchPhaseDocsViaHyperSync } from '@/lib/hypersync';
import { contractsConfig } from '@/config/contracts';
import { ipfsUpload } from '@/lib/ipfs';
import { ethers } from 'ethers';

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
  const [approvedSupport, setApprovedSupport] = useState(false);
  const [approvedReserve, setApprovedReserve] = useState(false);
  const [approvedProceeds, setApprovedProceeds] = useState(false);

  const projectAddress = useMemo<Address | null>(() => {
    const p = id as string | undefined;
    return (p && p.startsWith('0x') ? (p as Address) : null);
  }, [id]);
  const [account, setAccount] = useState<Address | null>(null);
  const [connected, setConnected] = useState(false);

  // On-chain state
  const [chain, setChain] = useState<{
    token?: Address;
    usdc?: Address;
    owner?: Address;
    projectName?: string;
    totalRaised?: bigint;
    minRaise?: bigint;
    maxRaise?: bigint;
    reserveBalance?: bigint;
    totalDevWithdrawn?: bigint;
    poolBalance?: bigint;
    currentPhase?: number;
    lastClosedPhase?: number;
    phase5PercentComplete?: number;
    claimableInterest?: bigint;
    claimableRevenue?: bigint;
    principalBuffer?: bigint;
    userBalance?: bigint;
    withdrawableDevFunds?: bigint;
    perPhaseCaps?: bigint[];
    perPhaseWithdrawn?: bigint[];
    perPhaseAprBps?: number[];
    supporters?: number;
  }>({});

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
      // Try injected provider first; fall back to RPC on failure
      let provider = getWindowEthereum() ? await getProvider() : getRpcProvider();
      let core;
      try {
        // Ensure contract exists on current network before reading
        const code = await provider.getCode(projectAddress);
        if (!code || code === '0x') {
          toast.error('No contract at this address on current network. Check RPC/network.');
          return;
        }
        core = await fetchProjectCoreState(projectAddress, provider);
      } catch {
        provider = getRpcProvider();
        const code2 = await provider.getCode(projectAddress);
        if (!code2 || code2 === '0x') {
          toast.error('No contract at this address on configured RPC. Set VITE_RPC_URL or switch network.');
          return;
        }
        core = await fetchProjectCoreState(projectAddress, provider);
      }
      const supporters = await fetchSupportersCount(projectAddress, provider);
      let user = { claimableInterest: 0n, claimableRevenue: 0n, userBalance: 0n };
      if (account) {
        user = await fetchProjectUserState(projectAddress, provider, account);
      }
      setChain({
        token: core.token,
        usdc: core.usdc,
        owner: core.owner,
        projectName: core.projectName,
        totalRaised: core.totalRaised,
        minRaise: core.minRaise,
        maxRaise: core.maxRaise,
        reserveBalance: core.reserveBalance,
        totalDevWithdrawn: core.totalDevWithdrawn,
        poolBalance: core.poolBalance,
        currentPhase: core.currentPhase,
        lastClosedPhase: core.lastClosedPhase,
        phase5PercentComplete: core.phase5PercentComplete,
        claimableInterest: user.claimableInterest,
        claimableRevenue: user.claimableRevenue,
        principalBuffer: core.principalBuffer,
        userBalance: user.userBalance,
        withdrawableDevFunds: core.withdrawableDevFunds,
        perPhaseCaps: core.perPhaseCaps,
        perPhaseWithdrawn: core.perPhaseWithdrawn,
        perPhaseAprBps: core.perPhaseAprBps,
        supporters,
      });
    } catch (e) {
      console.error(e);
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
        unsub = () => {
          try { proj.removeListener('FundraiseClosed', handler); } catch {}
          try { proj.removeListener('PhaseClosed', handler); } catch {}
        };
      } catch {
        // ignore listener errors
      }
    })();
    return () => { try { unsub?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectAddress]);

  const withdrawableNow = Number(fromUSDC(chain.withdrawableDevFunds ?? 0n));

  const project = {
    name: chain.projectName?.trim() || 'Cornerstone Residences',
    status: 'Active',
    contractAddress: projectAddress ?? '0x',
    tokenAddress: chain.token ?? '0x',
    owner: chain.owner ?? '0x',
    raised: Number(chain.totalRaised ? fromUSDC(chain.totalRaised) : '0'),
    target: Number(chain.maxRaise ? fromUSDC(chain.maxRaise) : '0'),
    minTarget: Number(chain.minRaise ? fromUSDC(chain.minRaise) : '0'),
    escrow: Number(chain.reserveBalance ? fromUSDC(chain.reserveBalance) : '0'),
    withdrawn: Number(chain.totalDevWithdrawn ? fromUSDC(chain.totalDevWithdrawn) : '0'),
    withdrawable: withdrawableNow,
    currentPhase: phaseName(chain.currentPhase ?? 0),
    milestones: 0,
    supporters: chain.supporters ?? 0,
    description:
      'Redevelopment of a 120k sq. ft. mixed-use tower with ground floor retail, 140 market-rate apartments, and a rooftop amenity deck overlooking the South Lakefront Greenway.',
  };

  const raisedPercentage = project.target > 0 ? (project.raised / project.target) * 100 : 0;
  const withdrawnPercentage = project.target > 0 ? (project.withdrawn / project.target) * 100 : 0;
  const minRaisePercentage = project.target > 0 ? (project.minTarget / project.target) * 100 : 0;
  const format = (n: number) => n.toLocaleString('en-US');

  // Phases data (6 phases)
  const phaseNames = [
    'Fundraising and Acquisition',
    'Design and Architectural',
    'Permitting',
    'Abatement/Demolition',
    'Construction',
    'Revenue and Sales',
  ] as const;

  // Compute cumulative withdraw limits (caps) per phase
  const perPhaseCapAmounts = (chain.perPhaseCaps || []).map((c)=> Number(fromUSDC(c)));
  const cumulativeCapAmounts: number[] = [];
  for (let i = 0; i < (perPhaseCapAmounts.length || 0); i++) {
    const prev = i > 0 ? cumulativeCapAmounts[i-1] : 0;
    cumulativeCapAmounts[i] = prev + (perPhaseCapAmounts[i] || 0);
  }
  const capBpsRaw = (project.target > 0
    ? cumulativeCapAmounts.map((amt)=> Math.round((amt / project.target) * 10000))
    : []
  );
  const capBps = Array.from({ length: 6 }, (_, i) => capBpsRaw[i] ?? 0);
  const cumulativeCapAmountsFilled = Array.from({ length: 6 }, (_, i) => cumulativeCapAmounts[i] ?? 0);
  // Convert APRs from bps to percent for display
  const aprs = (chain.perPhaseAprBps || [0,0,0,0,0,0]).map((bps)=> bps / 100);
  const currentPhaseIndex = Math.max(0, chain.currentPhase ?? 0);
  const nextPhaseName = currentPhaseIndex + 1 < phaseNames.length
    ? phaseNames[currentPhaseIndex + 1]
    : 'All phases complete';
  const perPhaseWithdrawn = (chain.perPhaseWithdrawn || []).map((w)=> Number(fromUSDC(w)));
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
    const showWithdrawn = (i + 1) <= (chain.lastClosedPhase ?? 0);
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
      value: `${format(project.escrow)} USDC`,
      helper: `${format(project.withdrawn)} USDC withdrawn`,
      icon: ShieldCheck,
      tone: 'from-emerald-400/80 via-accent/60 to-primary/30',
    },
    {
      id: 'phase',
      label: 'Current Phase',
      value: project.currentPhase,
      helper: nextPhaseName ? `Next: ${nextPhaseName}` : 'Awaiting next milestone',
      icon: Target,
      tone: 'from-sky-400/80 via-primary/60 to-accent/40',
    },
    {
      id: 'supporters',
      label: 'Supporters',
      value: format(project.supporters),
      helper: `${format(Number(fromUSDC(chain.claimableInterest ?? 0n)))} USDC interest paid out`,
      icon: Users,
      tone: 'from-indigo-400/80 via-primary/60 to-accent/40',
    },
  ] as const;

  const phaseStatusBadge = {
    Past: 'bg-success/15 text-success',
    Current: 'bg-primary text-primary-foreground',
    Upcoming: 'bg-slate-200 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
  } as const;

  const phaseStatusDot = {
    Past: 'bg-success',
    Current: 'bg-primary',
    Upcoming: 'bg-slate-300 dark:bg-slate-600',
  } as const;

  const timelineEvents: Array<{
    id: string;
    type: 'milestone' | 'deliverable' | 'payout' | 'update' | 'proposal' | 'dispute';
    title: string;
    meta: string;
    description: ReactNode;
    actions?: ReactNode;
  }> = [
    {
      id: 'fundraise-opened',
      type: 'update',
      title: 'Fundraise Opened',
      meta: 'Opened 3 months ago • Deposits enabled until deadline',
      description: 'Deposits accepted in Phase 0 until the fundraise deadline or manual closure by the developer.',
    },
    {
      id: 'minimum-reached',
      type: 'update',
      title: 'Minimum Reached',
      meta: '2 months ago • Min raise threshold met',
      description: 'The project is now eligible for a successful close when fundraising ends.',
    },
    {
      id: 'target-reached',
      type: 'update',
      title: 'Target Reached',
      meta: '6 weeks ago • Max raise goal achieved',
      description: 'Funding goal hit; further deposits may be paused at developer discretion.',
    },
    {
      id: 'fundraise-closed',
      type: 'milestone',
      title: 'Fundraise Closed (Successful)',
      meta: '41 days ago • Phase 1 started',
      description: 'Phase 0 closed by developer. Fundraise succeeded and Phase 1 is now active.',
    },
    {
      id: 'reserve-funded',
      type: 'payout',
      title: 'Reserve Funded',
      meta: '40 days ago • Developer added 100,000 USDC',
      description: 'Interest reserve topped up to enable on-chain APR accrual.',
    },
    {
      id: 'phase-1-closed',
      type: 'milestone',
      title: 'Phase 1 Closed',
      meta: '30 days ago • Docs verified; cap unlocked',
      description: 'Phase 1 requirements met. Associated withdrawal cap is now part of unlocked cumulative limits.',
    },
    {
      id: 'developer-withdrawal',
      type: 'payout',
      title: 'Developer Withdrawal',
      meta: '29 days ago • 50,000 USDC withdrawn under caps',
      description: 'Funds transferred to developer wallet within cumulative unlocked limits.',
      actions: (
        <a
          href="#"
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/90 hover:underline"
        >
          View transaction <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
    {
      id: 'phase-2-closed',
      type: 'milestone',
      title: 'Phase 2 Closed',
      meta: '20 days ago • Docs verified; cap unlocked',
      description: 'Phase 2 complete with approved documentation.',
    },
    {
      id: 'sales-proceeds',
      type: 'payout',
      title: 'Sales Proceeds Submitted',
      meta: '10 days ago • 25,000 USDC added to pool',
      description: 'Proceeds deposited; principal buffer updated and excess will distribute pro-rata when applicable.',
      actions: (
        <a
          href="#"
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/90 hover:underline"
        >
          View transaction <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
    {
      id: 'site-acquired',
      type: 'update',
      title: 'Site/Asset Acquired',
      meta: '9 days ago • Deed recorded',
      description: 'Title transferred to SPV. Deed/IPFS hash: 0x8b…f1c2.',
    },
    {
      id: 'permit-approved',
      type: 'update',
      title: 'Permit Approved',
      meta: '7 days ago • City of Riverview • Permit #A-20431',
      description: 'Building and zoning permits approved; inspections scheduled.',
    },
    {
      id: 'groundbreaking',
      type: 'update',
      title: 'Groundbreaking Started',
      meta: 'Today • Contractor on-site',
      description: 'Site work mobilized; grading and utilities trenching underway.',
    },
  ];

  type Doc = { id: string; name: string; type: 'image' | 'pdf'; url: string; hash: string };
  const [phaseDocuments, setPhaseDocuments] = useState<Doc[][]>([[], [], [], [], [], []]);

  // Fetch phase documents from contract events
  useEffect(() => {
    async function fetchPhaseDocs() {
      try {
        if (!projectAddress) return;
        console.info('[docs] fetching phase docs via HyperSync', { projectAddress });

        const docsByPhase = await fetchPhaseDocsViaHyperSync(projectAddress);
        
        setPhaseDocuments(docsByPhase);
        console.info('[docs] updated phaseDocuments state', { phaseDocuments: docsByPhase });
      } catch (e) {
        console.error('Failed to fetch phase documents:', e);
        // Fallback to empty arrays if HyperSync fails
        setPhaseDocuments([[], [], [], [], [], []]);
      }
    }
    
    fetchPhaseDocs();
  }, [projectAddress]);

  const [activeDocPhase, setActiveDocPhase] = useState(0);
  const [docViewer, setDocViewer] = useState<Doc | null>(null);
  const isDeveloper = currentRole === 'developer';

  const tabs = [
    { id: 'milestones', label: 'Phases' },
    { id: 'verification', label: 'Documents' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-primary/10 bg-gradient-to-br from-primary/15 via-accent/10 to-secondary/30">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsla(226,87%,75%,0.35),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_hsla(188,62%,72%,0.3),_transparent_55%)]" />
        </div>
        <div className="container mx-auto px-4 py-10">
          <div className="space-y-8">
            <div className="rounded-3xl border border-white/30 bg-white/60 p-6 shadow-soft backdrop-blur dark:border-white/10 dark:bg-slate-950/35">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex flex-col gap-6 xl:flex-1 xl:min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <RoleSelector currentRole={currentRole} onRoleChange={setCurrentRole} />
                    <Button
                      variant={connected ? 'secondary' : 'default'}
                      size="sm"
                      className="gap-2 bg-primary/90 text-primary-foreground hover:bg-primary"
                      onClick={connectWallet}
                    >
                      {connected ? 'Wallet Connected' : 'Connect Wallet'}
                    </Button>
                  </div>

                  <div className="flex items-start gap-5">
                    <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-3xl border border-white/40 shadow-soft dark:border-white/10">
                      <img
                        src="https://images.unsplash.com/photo-1501183638710-841dd1904471?w=600&q=60&auto=format&fit=crop"
                        alt="Project visual"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/45 via-transparent to-transparent mix-blend-multiply" />
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                          {project.name}
                        </h1>
                        <Badge className="rounded-full bg-success/90 px-3 py-1 text-xs font-semibold text-success-foreground shadow-sm">
                          {project.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Project:{' '}
                        <a
                          href={`https://sepolia.etherscan.io/address/${project.contractAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs underline decoration-dotted underline-offset-4 hover:text-primary"
                        >
                          {project.contractAddress}
                        </a>
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Token:{' '}
                        <a
                          href={`https://sepolia.etherscan.io/address/${project.tokenAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs underline decoration-dotted underline-offset-4 hover:text-primary"
                        >
                          {project.tokenAddress}
                        </a>
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-200/80">
                        {project.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Role-aware action bar */}
                {isDeveloper && (
                  <div className="rounded-2xl border border-white/30 bg-white/40 p-4 shadow-soft backdrop-blur dark:border-white/10 dark:bg-slate-900/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-2 bg-white/60 text-slate-800 hover:bg-white/80 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Post Update
                        </Button>
                      </RoleGate>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Summary */}
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-white/85 via-white/70 to-white/60 shadow-soft dark:from-slate-900/75 dark:via-slate-900/60 dark:to-slate-900/50">
              <CardHeader className="border-b border-white/40 pb-4 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                      Capital Overview
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-600 dark:text-slate-300">
                      Funding progress across targets, reserves, and developer unlocks.
                    </CardDescription>
                  </div>
                  <Badge className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary dark:bg-primary/30">
                    {project.target ? `${raisedPercentage.toFixed(1)}% Funded` : 'Open'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-slate-600 dark:text-slate-300">
                    <span>{format(project.raised)} USDC Raised</span>
                    <span>{format(project.target)} USDC Target</span>
                  </div>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-all"
                      style={{ width: `${Math.min(100, raisedPercentage)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400/90 via-amber-400/70 to-amber-300/60 transition-all"
                      style={{ width: `${Math.min(100, withdrawnPercentage)}%` }}
                    />
                    {project.target > 0 && project.minTarget > 0 && (
                      <div
                        className="absolute inset-y-0 flex w-0.5 -translate-x-0.5 items-center justify-center"
                        style={{ left: `${Math.max(0, Math.min(100, minRaisePercentage))}%` }}
                      >
                        <span className="h-full w-px bg-rose-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                      <Banknote className="h-3 w-3" />
                      {format(project.withdrawn)} Withdrawn
                    </span>
                    {project.minTarget > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                        <Target className="h-3 w-3" />
                        Min Raise {format(project.minTarget)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                      <ShieldCheck className="h-3 w-3" />
                      {format(project.withdrawable)} USDC Unlockable
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 border-t border-white/30 pt-4 text-sm dark:border-white/10 md:grid-cols-3">
                  {overviewStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.id}
                        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/60 p-5 shadow-soft transition-all hover:-translate-y-1 hover:border-primary/50 dark:border-white/10 dark:bg-slate-900/45"
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${stat.tone} opacity-60 blur-3xl transition-opacity group-hover:opacity-80`}
                          aria-hidden="true"
                        />
                        <div className="relative z-10 flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/40 bg-white/60 text-primary shadow-inner dark:border-white/10 dark:bg-slate-900/50">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-slate-600 dark:text-slate-300">
                              {stat.label}
                            </p>
                            <p className="text-lg font-semibold text-slate-900 dark:text-white">{stat.value}</p>
                          </div>
                        </div>
                        <p className="relative z-10 mt-auto pt-4 text-xs text-slate-600 dark:text-slate-300">
                          {stat.helper}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 p-1 shadow-soft backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative overflow-hidden rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white shadow-soft dark:bg-white/90 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                  }`}
                >
                  <span className="relative z-10">{tab.label}</span>
                  {activeTab === tab.id && (
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/30 via-primary/20 to-accent/30 opacity-90" />
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'timeline' && (
              <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900/60">
                <div className="relative">
                  <div className="pointer-events-none absolute left-6 top-3 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-primary/40 via-slate-300/40 to-transparent dark:from-primary/50 dark:via-slate-700/60 md:left-1/2 md:-translate-x-1/2" />
                  <div className="space-y-10">
                    {timelineEvents.map((event, idx) => (
                      <div
                        key={event.id}
                        className={`relative flex gap-6 pl-12 md:pl-0 ${idx % 2 === 1 ? 'md:justify-end' : 'md:justify-start'}`}
                      >
                        <div className="absolute left-5 top-4 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-primary shadow-soft ring-4 ring-primary/25 dark:border-slate-900 md:left-1/2 md:-translate-x-1/2" />
                        <div
                          className={`relative w-full md:max-w-[45%] ${
                            idx % 2 === 1 ? 'md:translate-x-6' : 'md:-translate-x-6'
                          }`}
                        >
                          <TimelineCard
                            className="border border-slate-200/70 bg-white/85 p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/70"
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
                </div>
              </div>
            )}

            {activeTab === 'milestones' && (
              <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900/60">
                <div className="relative">
                  <div className="absolute left-6 top-0 h-full w-px bg-gradient-to-b from-primary/40 via-slate-300/50 to-transparent dark:from-primary/50 dark:via-slate-700/60" />
                  <div className="space-y-8">
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
                              value: `${(p.capBps / 100).toFixed(1)}% (${format(Math.round(p.capAmount))} USDC)`,
                            }
                          : {
                              label: 'Raised in Phase',
                              value: `${format(p.raisedAt)} USDC`,
                            },
                        p.showWithdrawn
                          ? { label: 'Withdrawn', value: `${format(Math.round(p.withdrawn))} USDC` }
                          : null,
                        { label: 'Closing', value: p.closingDisplay },
                      ].filter(Boolean) as Array<{ label: string; value: string }>;

                      return (
                        <div key={p.index} className="relative flex gap-6 pl-12 md:pl-16">
                          <div className="absolute left-4 top-6 z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white shadow-soft ring-4 ring-primary/20 dark:border-slate-900">
                            <span className={`h-2.5 w-2.5 rounded-full ${dotTone}`} />
                          </div>
                          <div
                            className={`w-full rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/70 ${
                              idx === currentPhaseIndex ? 'ring-2 ring-primary/30' : ''
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500 dark:text-slate-300">
                                  Phase {p.index + 1}
                                </p>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                              </div>
                              <Badge className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone}`}>
                                {p.status}
                              </Badge>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-4">
                              {infoBlocks.map((block) => (
                                <div key={block.label}>
                                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
                                    {block.label}
                                  </p>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{block.value}</p>
                                </div>
                              ))}
                            </div>

                            <div className="mt-5 space-y-2">
                              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                                <span>Cap Unlock Progress</span>
                                <span>{progressWidth}</span>
                              </div>
                              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary/80 to-accent/70"
                                  style={{ width: progressWidth }}
                                />
                              </div>
                            </div>

                            {p.showWithdrawn && (
                              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
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
              <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900/60">
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
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all hover:-translate-y-1 hover:shadow-lg ${
                            activeDocPhase === p.index
                              ? 'border-primary/40 bg-primary/10 text-slate-900 dark:bg-primary/20 dark:text-white'
                              : 'border-slate-200/70 bg-white/70 text-slate-700 hover:border-primary/30 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">Phase {p.index + 1}</p>
                            <Badge className={`rounded-full px-2 py-0.5 text-xs font-semibold ${phaseStatusBadge[statusKey] ?? ''}`}>
                              {p.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{p.name}</p>
                          <div className="mt-3 flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-300">
                            <span>{docs.length} docs</span>
                            <span>{p.closingDisplay}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900/70">
                    {(() => {
                      const activePhase = phasesDetails[activeDocPhase];
                      const docs = phaseDocuments[activeDocPhase] || [];
                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
                                Phase {activePhase.index + 1}
                              </p>
                              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {activePhase.name}
                              </h3>
                            </div>
                            <Badge className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground dark:bg-slate-800/80 dark:text-slate-100">
                              {activePhase.closingDisplay}
                            </Badge>
                          </div>

                          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {docs.length > 0 ? (
                              docs.map((d) => (
                                <button
                                  key={d.id}
                                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white/80 via-white/70 to-white/60 text-left shadow-soft transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus:outline-none dark:border-slate-800 dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-900/50"
                                  onClick={() => setDocViewer(d)}
                                  title={d.name ?? 'Document'}
                                >
                                  <div className="relative aspect-video w-full overflow-hidden bg-slate-200/60 dark:bg-slate-800/60">
                                    {d.type === 'image' ? (
                                      <img
                                        src={d.url}
                                        alt={d.name}
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-slate-500 dark:text-slate-300">
                                        <FileText className="h-8 w-8" />
                                      </div>
                                    )}
                                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-80" />
                                  </div>
                                  <div className="flex flex-1 flex-col justify-between p-3">
                                    <div>
                                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                        {d.name ?? 'Document'}
                                      </p>
                                      <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
                                        {d.type.toUpperCase()}
                                      </p>
                                    </div>
                                    <p className="mt-2 text-[0.65rem] text-slate-500 dark:text-slate-300">
                                      Hash {d.hash.slice(0, 10)}…
                                    </p>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/60 bg-white/50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                                <FileText className="mb-3 h-10 w-10 text-slate-400 dark:text-slate-500" />
                                <p>No documents uploaded for this phase yet.</p>
                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
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
            {/* Support card (investor/holder only) */}
            <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
              <Card>
                <CardHeader>
                  <CardTitle>Support This Project</CardTitle>
                  <CardDescription>Invest in this project using USDC</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="support-amount">Amount (USDC)</label>
                    <Input id="support-amount" type="number" inputMode="decimal" placeholder="0.00" value={supportAmount} onChange={(e)=>{ setSupportAmount(e.target.value); setApprovedSupport(false); }} />
                  </div>
                  {!approvedSupport ? (
                    <Button className="w-full" size="lg" onClick={async ()=>{
                      try {
                        if (!projectAddress || !chain.usdc) { toast.error('Addresses not loaded'); return; }
                        if (!supportAmount || Number(supportAmount) <= 0) { toast.error('Enter amount'); return; }
                        const signer = await getSigner();
                        const owner = await signer.getAddress();
                        const amt = toUSDC(supportAmount);
                        const t = erc20At(chain.usdc, signer);
                        const tx = await t.approve(projectAddress, amt);
                        await tx.wait();
                        setApprovedSupport(true);
                        toast.success('Approved');
                      } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Approve failed'); }
                    }}>
                      <Wallet className="w-4 h-4 mr-2" /> Approve
                    </Button>
                  ) : (
                    <Button className="w-full" size="lg" onClick={async ()=>{
                      try {
                        if (!projectAddress) return;
                        const signer = await getSigner();
                        const proj = projectAt(projectAddress, signer);
                        const amt = toUSDC(supportAmount);
                        const tx = await proj.deposit(amt);
                        await tx.wait();
                        toast.success('Deposited');
                        setApprovedSupport(false);
                        setSupportAmount('');
                        refresh();
                      } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Deposit failed'); }
                    }}>
                      <DollarSign className="w-4 h-4 mr-2" /> Deposit
                    </Button>
                  )}
                </CardContent>
              </Card>
            </RoleGate>

            {/* Holder investment overview */}
            <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
              <Card>
                <CardHeader>
                  <CardTitle>Your Investment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Your Balance</span>
                    <span className="font-semibold">{chain.userBalance ? Number(fromUSDC(chain.userBalance)).toLocaleString('en-US') : 0} USDC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Claimable Interest</span>
                    <span className="font-semibold">{chain.claimableInterest ? Number(fromUSDC(chain.claimableInterest)).toLocaleString('en-US') : 0} USDC</span>
                  </div>
                  <Button variant="outline" className="w-full mt-1" onClick={async ()=>{
                    try {
                      if (!projectAddress || !chain.claimableInterest || chain.claimableInterest === 0n) { toast.error('Nothing to claim'); return; }
                      const signer = await getSigner();
                      const proj = projectAt(projectAddress, signer);
                      const tx = await proj.claimInterest(chain.claimableInterest);
                      await tx.wait();
                      toast.success('Interest claimed');
                      refresh();
                    } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Claim failed'); }
                  }}>Withdraw Interest</Button>

                  {/* Principal Redemption */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Principal Buffer</span>
                    <span className="font-semibold">{chain.principalBuffer ? Number(fromUSDC(chain.principalBuffer)).toLocaleString('en-US') : 0} USDC</span>
                  </div>
                  {chain.principalBuffer && chain.userBalance && chain.principalBuffer > 0n && (
                    <Button variant="outline" className="w-full mt-1" onClick={async ()=>{
                      try {
                        if (!projectAddress) return;
                        const shares = chain.userBalance! < chain.principalBuffer! ? chain.userBalance! : chain.principalBuffer!;
                        if (shares === 0n) { toast.error('No redeemable principal yet'); return; }
                        const signer = await getSigner();
                        const proj = projectAt(projectAddress, signer);
                        const tx = await proj.withdrawPrincipal(shares);
                        await tx.wait();
                        toast.success('Principal redeemed');
                        refresh();
                      } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Redeem failed'); }
                    }}>Redeem Principal</Button>
                  )}
                  {/* Revenue Claim */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Claimable Revenue</span>
                    <span className="font-semibold">{chain.claimableRevenue ? Number(fromUSDC(chain.claimableRevenue)).toLocaleString('en-US') : 0} USDC</span>
                  </div>
                  <Button variant="outline" className="w-full mt-1" onClick={async ()=>{
                    try {
                      if (!projectAddress || !account) return;
                      if (!chain.claimableRevenue || chain.claimableRevenue === 0n) { toast.error('No revenue to claim'); return; }
                      const signer = await getSigner();
                      const proj = projectAt(projectAddress, signer);
                      const tx = await proj.claimRevenue(account);
                      await tx.wait();
                      toast.success('Revenue claimed');
                      refresh();
                    } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Claim failed'); }
                  }}>Claim Revenue</Button>
                </CardContent>
              </Card>
            </RoleGate>

            {/* Developer actions */}
            <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
              <Card>
                <CardHeader>
                  <CardTitle>Developer Actions</CardTitle>
                  <CardDescription>Fund reserve, close phase, withdraw</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Fund Reserve */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Fund Reserve</span>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid gap-1">
                        <Label htmlFor="reserveAmount">Amount (USDC)</Label>
                        <Input
                          id="reserveAmount"
                          inputMode="decimal"
                          placeholder="e.g. 50000"
                          value={reserveAmount}
                          onChange={(e) => setReserveAmount(e.target.value)}
                        />
                      </div>
                      {!approvedReserve ? (
                        <Button size="sm" className="justify-start" onClick={async ()=>{
                          try {
                            if (!projectAddress || !chain.usdc) { toast.error('Addresses not loaded'); return; }
                            const amt = reserveAmount.trim();
                            if (!amt || Number(amt) <= 0) { toast.error('Enter amount'); return; }
                            const signer = await getSigner();
                            const t = erc20At(chain.usdc, signer);
                            const tx = await t.approve(projectAddress, toUSDC(amt));
                            await tx.wait();
                            setApprovedReserve(true);
                            toast.success('Approved');
                          } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Approve failed'); }
                        }}>
                          <Wallet className="w-4 h-4 mr-2" /> Approve
                        </Button>
                      ) : (
                        <Button size="sm" className="justify-start" onClick={async ()=>{
                          try {
                            if (!projectAddress) return;
                            const signer = await getSigner();
                            const proj = projectAt(projectAddress, signer);
                            const tx = await proj.fundReserve(toUSDC(reserveAmount));
                            await tx.wait();
                            toast.success('Reserve funded');
                            setApprovedReserve(false);
                            setReserveAmount('');
                            refresh();
                          } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Fund failed'); }
                        }}>
                          <Banknote className="w-4 h-4 mr-2" /> Fund Reserve
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Close Phase */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DoorClosed className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Close Phase</span>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Current Phase</span>
                        <span className="font-medium">{project.currentPhase}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Next Phase</span>
                        <span className="font-medium">{nextPhaseName}</span>
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="phaseDocs">Upload Documents</Label>
                        <Input
                          id="phaseDocs"
                          type="file"
                          multiple
                          onChange={(e) => setUploadedDocs(Array.from(e.target.files || []))}
                        />
                        <p className="text-xs text-muted-foreground">Attach evidence to close the current phase.</p>
                      </div>
                      <Button size="sm" variant="secondary" className="justify-start" onClick={async ()=>{
                        try {
                          if (!projectAddress) return;
                          if (!uploadedDocs.length) { toast.error('Please upload at least one document'); return; }
                          const signer = await getSigner();
                          const proj = projectAt(projectAddress, signer);
                          const phaseId: number = (chain.currentPhase ?? 0);
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
                      }}>
                        <DoorClosed className="w-4 h-4 mr-2" /> Close Phase
                      </Button>
                    </div>
                  </div>

                  {/* Withdraw Funds */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Withdraw Phase Funds</span>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Withdrawable Now</span>
                        <span className="font-medium">{withdrawableNow.toLocaleString('en-US')} USDC</span>
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="withdrawAmount">Amount (USDC)</Label>
                        <Input id="withdrawAmount" inputMode="decimal" placeholder="e.g. 10000" value={withdrawAmount} onChange={(e)=>setWithdrawAmount(e.target.value)} />
                      </div>
                      <Button size="sm" variant="outline" className="justify-start" onClick={async ()=>{
                        try {
                          if (!projectAddress) return;
                          const amt = Number(withdrawAmount || '0');
                          if (!amt || amt <= 0) { toast.error('Enter amount'); return; }
                          if (amt > withdrawableNow) { toast.error('Exceeds withdrawable'); return; }
                          const signer = await getSigner();
                          const proj = projectAt(projectAddress, signer);
                          const tx = await proj.withdrawPhaseFunds(toUSDC(amt.toString()));
                          await tx.wait();
                          toast.success('Withdrawn');
                          setWithdrawAmount('');
                          refresh();
                        } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Withdraw failed'); }
                      }}>
                        <DollarSign className="w-4 h-4 mr-2" /> Withdraw Funds
                      </Button>
                    </div>
                  </div>

                  {/* Sales Proceeds */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Submit Sales Proceeds</span>
                    </div>
                    <div className="grid gap-2">
                      <div className="grid gap-1">
                        <Label htmlFor="proceedsAmount">Amount (USDC)</Label>
                        <Input id="proceedsAmount" inputMode="decimal" placeholder="e.g. 25000" value={proceedsAmount} onChange={(e)=>{ setProceedsAmount(e.target.value); setApprovedProceeds(false); }} />
                      </div>
                      {!approvedProceeds ? (
                        <Button size="sm" className="justify-start" onClick={async ()=>{
                          try {
                            if (!projectAddress || !chain.usdc) { toast.error('Addresses not loaded'); return; }
                            const amt = proceedsAmount.trim();
                            if (!amt || Number(amt) <= 0) { toast.error('Enter amount'); return; }
                            const signer = await getSigner();
                            const t = erc20At(chain.usdc, signer);
                            const tx = await t.approve(projectAddress, toUSDC(amt));
                            await tx.wait();
                            setApprovedProceeds(true);
                            toast.success('Approved');
                          } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Approve failed'); }
                        }}>
                          <Wallet className="w-4 h-4 mr-2" /> Approve
                        </Button>
                      ) : (
                        <Button size="sm" className="justify-start" onClick={async ()=>{
                          try {
                            if (!projectAddress) return;
                            const signer = await getSigner();
                            const proj = projectAt(projectAddress, signer);
                            const tx = await proj.submitSalesProceeds(toUSDC(proceedsAmount));
                            await tx.wait();
                            toast.success('Proceeds submitted');
                            setApprovedProceeds(false);
                            setProceedsAmount('');
                            refresh();
                          } catch(e:any) { toast.error(e?.shortMessage || e?.message || 'Submit failed'); }
                        }}>
                          <DollarSign className="w-4 h-4 mr-2" /> Submit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </RoleGate>

            {/* Project facts */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Owner</p>
                  <p className="font-mono">{project.owner}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Interest Reserve</p>
                  <p className="font-semibold">{project.escrow} USDC</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Phase</p>
                  <p className="font-semibold">{project.currentPhase}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Supporters</p>
                  <p className="font-semibold">{project.supporters}</p>
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
        {/* Documents Viewer */}
        <Drawer open={!!docViewer} onOpenChange={(o) => !o && setDocViewer(null)}>
          <DrawerContent className="h-[90vh]">
            <DrawerHeader className="flex items-center justify-between">
              <DrawerTitle>{docViewer?.name ?? 'Document'}</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm">Close</Button>
              </DrawerClose>
            </DrawerHeader>
            <div className="px-4 pb-4 h-[80vh]">
              {docViewer?.type === 'image' ? (
                <img src={docViewer.url} alt={docViewer.name} className="h-full w-full object-contain rounded" />
              ) : docViewer?.type === 'pdf' ? (
                <iframe src={docViewer.url} className="h-full w-full rounded" title={docViewer.name} />
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
};

export default ProjectDetails;
