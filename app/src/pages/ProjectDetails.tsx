import { useEffect, useMemo, useState } from 'react';
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
import { ExternalLink, Plus, Edit, Upload, DollarSign, AlertTriangle, MessageSquare, Banknote, DoorClosed, Wallet, FileText } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Address, erc20At, fromUSDC, getAccount, getProvider, getSigner, projectAt, toUSDC, fetchProjectCoreState, fetchProjectUserState, fetchSupportersCount } from '@/lib/eth';
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
    totalRaised?: bigint;
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
      const provider = await getProvider();
      const core = await fetchProjectCoreState(projectAddress, provider);
      const supporters = await fetchSupportersCount(projectAddress, provider);
      let user = { claimableInterest: 0n, claimableRevenue: 0n, userBalance: 0n };
      if (account) {
        user = await fetchProjectUserState(projectAddress, provider, account);
      }
      setChain({
        token: core.token,
        usdc: core.usdc,
        owner: core.owner,
        totalRaised: core.totalRaised,
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
        const provider = await getProvider();
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

  const project = {
    name: 'Cornerstone Project',
    status: 'Active',
    contractAddress: projectAddress ?? '0x',
    tokenAddress: chain.token ?? '0x',
    owner: chain.owner ?? '0x',
    raised: Number(chain.totalRaised ? fromUSDC(chain.totalRaised) : '0'),
    target: Number(chain.maxRaise ? fromUSDC(chain.maxRaise) : '0'),
    escrow: Number(chain.reserveBalance ? fromUSDC(chain.reserveBalance) : '0'),
    withdrawn: Number(chain.totalDevWithdrawn ? fromUSDC(chain.totalDevWithdrawn) : '0'),
    withdrawable: 0,
    currentPhase: phaseName((chain.currentPhase ?? 0) - 1),
    milestones: 0,
    supporters: chain.supporters ?? 0,
    description:
      'On-chain construction funding with per-phase unlocks, reserve-funded interest, and pro‑rata revenue distribution.',
  };

  const raisedPercentage = project.target > 0 ? (project.raised / project.target) * 100 : 0;
  const withdrawnPercentage = project.target > 0 ? (project.withdrawn / project.target) * 100 : 0;
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
  const currentPhaseIndex = Math.max(0, (chain.currentPhase ?? 1) - 1);
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
    };
  });

  type Doc = { id: string; name: string; type: 'image' | 'pdf'; url: string };
  const phaseDocuments: Doc[][] = [
    // 1. Fundraising and Acquisition (No Interest)
    [
      { id: 'f1-doc1', name: 'Title Search', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f1-doc2', name: 'Title Insurance Policy', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f1-doc3', name: 'Freehold Transfer', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    ],
    // 2. Design and Architectural
    [
      { id: 'f2-doc1', name: 'Architectural Plans (PDF)', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f2-doc2', name: "Architect's Attestation", type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    ],
    // 3. Permitting
    [
      { id: 'f3-doc1', name: 'New Home Registration (HPO)', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f3-doc2', name: 'Warranty Enrolment Confirmation', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f3-doc3', name: 'Demolition Permit', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f3-doc4', name: 'Abatement Permit', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    ],
    // 4. Abatement/Demolition
    [
      { id: 'f4-doc1', name: 'Demolition Permit Closeout', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f4-doc2', name: 'Abatement Permit Closeout', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f4-doc3', name: 'Building Permit', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    ],
    // 5. Construction
    [
      { id: 'f5-doc1', name: 'Appraisal Report – Mid-Phase', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
      { id: 'f5-doc2', name: 'Occupancy Permit', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    ],
    // 6. Revenue and Sales
    [
      { id: 'f6-doc1', name: 'Unit 101 Sale Receipt', type: 'image', url: 'https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1200&q=80' },
      { id: 'f6-doc2', name: 'Unit 102 Sale Receipt', type: 'image', url: 'https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1200&q=80' },
      { id: 'f6-doc3', name: 'Proceeds Transfer Proof', type: 'pdf', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    ],
  ];

  const [docViewer, setDocViewer] = useState<Doc | null>(null);

  // Compute withdrawable under caps
  const withdrawableNow: number = useMemo(() => {
    try {
      if (!chain.maxRaise || chain.perPhaseCaps?.length !== 6) return 0;
      const getCap = (p: number) => chain.perPhaseCaps![p - 1];
      let unlocked = 0n;
      const lc = chain.lastClosedPhase ?? 0;
      for (let p = 1; p <= 4; p++) {
        if (p <= lc) unlocked += getCap(p);
      }
      const cap5 = getCap(5);
      if ((chain.lastClosedPhase ?? 0) >= 5) {
        unlocked += cap5;
      } else if ((chain.currentPhase ?? 0) === 5) {
        unlocked += (cap5 * BigInt(chain.phase5PercentComplete ?? 0)) / 100n;
      }
      if ((chain.lastClosedPhase ?? 0) >= 6) unlocked += getCap(6);
      const already = chain.totalDevWithdrawn ?? 0n;
      const pool = chain.poolBalance ?? 0n;
      const avail = unlocked > already ? unlocked - already : 0n;
      const can = avail < pool ? avail : pool;
      return Number(fromUSDC(can));
    } catch {
      return 0;
    }
  }, [chain]);

  const tabs = [
    { id: 'milestones', label: 'Phases' },
    { id: 'verification', label: 'Documents' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4">
            <RoleSelector currentRole={currentRole} onRoleChange={setCurrentRole} />
            
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-start gap-4">
                  <div className="w-24 h-24 rounded-md bg-muted overflow-hidden flex-shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1501183638710-841dd1904471?w=400&q=60&auto=format&fit=crop"
                      alt="Project placeholder"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-3xl font-bold truncate">{project.name}</h1>
                      <Badge className="bg-success text-success-foreground">{project.status}</Badge>
                    </div>
                    <p className="text-muted-foreground truncate">
                      Project: {project.contractAddress} • Token: {project.tokenAddress}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{project.description}</p>
                  </div>
                </div>
              </div>

              {/* Role-aware action bar */}
              <div className="flex flex-wrap gap-2">
                <Button variant={connected? 'secondary':'default'} size="sm" onClick={connectWallet}>
                  {connected ? 'Wallet Connected' : 'Connect Wallet'}
                </Button>
                <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Post Update
                  </Button>
                </RoleGate>

                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                </RoleGate>
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
            <Card>
              <CardHeader>
                <CardTitle>Funding Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold">{format(project.raised)} USDC raised</span>
                    <span className="text-muted-foreground">{format(project.target)} USDC target</span>
                  </div>
                  {/* Stacked bar: Raised (primary) and Withdrawn (amber) */}
                  <div className="relative h-3 w-full rounded bg-muted overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary"
                      style={{ width: `${raisedPercentage}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-500/80"
                      style={{ width: `${withdrawnPercentage}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {format(project.withdrawn)} USDC Withdrawn by Developer
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Interest Reserve</p>
                    <p className="text-lg font-semibold">{format(project.escrow)} USDC</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Phase</p>
                    <p className="text-lg font-semibold">{project.currentPhase}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Supporters</p>
                    <p className="text-lg font-semibold">{format(project.supporters)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-t-md font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-foreground text-background'
                      : 'hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* Fundraise lifecycle */}
              <TimelineCard
                type="update"
                title="Fundraise Opened"
                meta="Opened 3 months ago • Deposits enabled until deadline"
              >
                Deposits accepted in Phase 0 until the fundraise deadline or manual closure by the developer.
              </TimelineCard>

              <TimelineCard
                type="update"
                title="Minimum Reached"
                meta="2 months ago • Min raise threshold met"
              >
                The project is now eligible for a successful close when fundraising ends.
              </TimelineCard>

              <TimelineCard
                type="update"
                title="Target Reached"
                meta="6 weeks ago • Max raise goal achieved"
              >
                Funding goal hit; further deposits may be paused at developer discretion.
              </TimelineCard>

              <TimelineCard
                type="update"
                title="Fundraise Closed (Successful)"
                meta="41 days ago • Phase 1 started"
              >
                Phase 0 closed by developer. Fundraise succeeded and Phase 1 is now active.
              </TimelineCard>

              {/* Treasury and caps */}
              <TimelineCard
                type="payout"
                title="Reserve Funded"
                meta="40 days ago • Developer added 100,000 USDC"
              >
                Interest reserve topped up to enable on‑chain APR accrual.
              </TimelineCard>

              <TimelineCard
                type="milestone"
                title="Phase 1 Closed"
                meta="30 days ago • Docs verified; cap unlocked"
              >
                Phase 1 requirements met. Associated withdrawal cap is now part of unlocked cumulative limits.
              </TimelineCard>

              <TimelineCard
                type="payout"
                title="Developer Withdrawal"
                meta="29 days ago • 50,000 USDC withdrawn under caps"
              >
                Funds transferred to developer wallet within cumulative unlocked limits.
                <div className="mt-2">
                  <a href="#" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                    View transaction <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </TimelineCard>

              <TimelineCard
                type="milestone"
                title="Phase 2 Closed"
                meta="20 days ago • Docs verified; cap unlocked"
              >
                Phase 2 complete with approved documentation.
              </TimelineCard>

              <TimelineCard
                type="payout"
                title="Sales Proceeds Submitted"
                meta="10 days ago • 25,000 USDC added to pool"
              >
                Proceeds deposited; principal buffer updated and excess will distribute pro‑rata when applicable.
                <div className="mt-2">
                  <a href="#" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                    View transaction <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </TimelineCard>

              {/* Ad hoc developer updates */}
              <TimelineCard
                type="update"
                title="Site/Asset Acquired"
                meta="9 days ago • Deed recorded"
              >
                Title transferred to SPV. Deed/IPFS hash: 0x8b…f1c2.
              </TimelineCard>

              <TimelineCard
                type="update"
                title="Permit Approved"
                meta="7 days ago • City of Riverview • Permit #A-20431"
              >
                Building and zoning permits approved; inspections scheduled.
              </TimelineCard>

              <TimelineCard
                type="update"
                title="Groundbreaking Started"
                meta="Today • Contractor on‑site"
              >
                Site work mobilized; grading and utilities trenching underway.
              </TimelineCard>
            </div>
            )}

            {activeTab === 'milestones' && (
              <div className="space-y-4">
                {phasesDetails.map((p) => (
                  <Card key={p.index}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Phase {p.index + 1}: {p.name}</CardTitle>
                        <Badge className={p.status === 'Current' ? 'bg-primary text-primary-foreground' : p.status === 'Past' ? 'bg-muted' : ''}>
                          {p.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-muted-foreground">Raised at Phase</p>
                          <p className="font-semibold">{format(p.raisedAt)} USDC</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">APR</p>
                          <p className="font-semibold">{p.apr}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Cumulative Withdraw Limit</p>
                          <p className="font-semibold">{(p.capBps / 100).toFixed(1)}% ({format(Math.round(p.capAmount))} USDC)</p>
                        </div>
                        {p.showWithdrawn && (
                          <div>
                            <p className="text-muted-foreground">Withdrawn</p>
                            <p className="font-semibold">{format(Math.round(p.withdrawn))} USDC</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === 'verification' && (
              <div className="space-y-4">
                {phasesDetails.map((p) => {
                  const docs = phaseDocuments[p.index] || [];
                  return (
                    <Card key={`docs-${p.index}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Phase {p.index + 1}: {p.name}</CardTitle>
                          <Badge className={p.status === 'Current' ? 'bg-primary text-primary-foreground' : p.status === 'Past' ? 'bg-muted' : ''}>
                            {p.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {docs.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {docs.map((d) => (
                              <button
                                key={d.id}
                                className="group overflow-hidden rounded border hover:shadow focus:outline-none"
                                onClick={() => setDocViewer(d)}
                                title={d.name}
                              >
                                {d.type === 'image' ? (
                                  <div className="aspect-video bg-muted">
                                    <img src={d.url} alt={d.name} className="h-full w-full object-cover" />
                                  </div>
                                ) : (
                                  <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground">
                                    <FileText className="w-8 h-8" />
                                  </div>
                                )}
                                <div className="p-2 text-xs text-left truncate">
                                  {d.name}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
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
                        <span className="font-medium">Revenue and Sales</span>
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
                          if (phaseId === 0) {
                            // Close fundraise (no docs required)
                            const tx = await proj.closePhase(0, [], [], []);
                            await tx.wait();
                            toast.success('Fundraise closed');
                            setUploadedDocs([]);
                            refresh();
                            return;
                          }
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
