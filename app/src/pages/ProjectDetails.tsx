import { useState } from 'react';
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

const ProjectDetails = () => {
  const { id } = useParams();
  const [currentRole, setCurrentRole] = useState<Role>('holder');
  const [activeTab, setActiveTab] = useState('milestones');

  // Developer actions state (UI prototype only)
  const [reserveAmount, setReserveAmount] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<File[]>([]);

  // Mock project data
  const project = {
    name: 'Cornerstone',
    status: 'Active',
    contractAddress: '0x1234...abcd',
    tokenAddress: '0xabcd...1234',
    owner: '0x1234...abcd',
    raised: 2_750_000,
    target: 5_000_000,
    escrow: 250_000,
    withdrawn: 1_200_000,
    withdrawable: 300_000,
    currentPhase: 'Construction',
    milestones: 4,
    supporters: 1240,
    description:
      'Ground-up residential construction delivering 12 modern units with sustainable materials and energy-efficient systems, located near downtown transit hubs.',
  };

  const raisedPercentage = (project.raised / project.target) * 100;
  const withdrawnPercentage = (project.withdrawn / project.target) * 100;
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

  const capBps = [0, 1500, 1500, 2000, 3000, 2000]; // per-phase withdraw caps as % of target (bps)
  const aprs = [0, 8, 10, 12, 10, 0]; // illustrative APR per phase
  const currentPhaseIndex = phaseNames.indexOf(project.currentPhase as (typeof phaseNames)[number]);
  const perPhaseWithdrawn = [0, 300_000, 250_000, 250_000, 400_000, 0]; // sums to 1,200,000
  const phaseCloseDates: (string | null)[] = [
    '2025-01-15', // Fundraising and Acquisition
    '2025-03-15', // Design and Architectural
    '2025-05-01', // Permitting
    '2025-07-20', // Abatement/Demolition
    null,         // Construction (current)
    null,         // Revenue and Sales (upcoming)
  ];

  const phasesDetails = phaseNames.map((name, i) => {
    const capAmount = (project.target * capBps[i]) / 10_000;
    const withdrawn = perPhaseWithdrawn[i] || 0;
    const raisedAt = i === 0 ? project.raised : 0; // fundraising phase shows raised amount
    const status = i < currentPhaseIndex ? 'Past' : i === currentPhaseIndex ? 'Current' : 'Upcoming';
    const withdrawnPctOfCap = capAmount > 0 ? Math.min(100, (withdrawn / capAmount) * 100) : 0;
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
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <p className="text-muted-foreground">Raised at Phase</p>
                          <p className="font-semibold">{format(p.raisedAt)} USDC</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">APR</p>
                          <p className="font-semibold">{p.apr}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Withdraw Limit</p>
                          <p className="font-semibold">{(p.capBps / 100).toFixed(1)}% ({format(Math.round(p.capAmount))} USDC)</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Withdrawn</p>
                          <p className="font-semibold">{format(p.withdrawn)} USDC</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Closing Date</p>
                          <p className="font-semibold">{p.closingDisplay}</p>
                        </div>
                      </div>
                      <div>
                        <div className="relative h-2 w-full rounded bg-muted overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-emerald-500"
                            style={{ width: `${p.withdrawnPctOfCap}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {p.capAmount > 0 ? `${p.withdrawnPctOfCap.toFixed(0)}% of limit withdrawn` : 'No withdrawals allowed in this phase'}
                        </div>
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
                    <Input id="support-amount" type="number" inputMode="decimal" placeholder="0.00" />
                  </div>
                  <Button className="w-full" size="lg">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Support Project
                  </Button>
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
                    <span className="text-muted-foreground">Investment Value</span>
                    <span className="font-semibold">25,000 USDC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Interest Accrued</span>
                    <span className="font-semibold">1,375 USDC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pending Interest</span>
                    <span className="font-semibold">250 USDC</span>
                  </div>
                  <Button variant="outline" className="w-full mt-1">Withdraw Interest</Button>
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
                      <Button
                        size="sm"
                        className="justify-start"
                        onClick={() => {
                          const amt = reserveAmount.trim();
                          if (!amt || Number(amt) <= 0) {
                            toast.error('Enter a valid reserve amount');
                            return;
                          }
                          toast.success(`Reserve funded with ${amt} USDC (simulated)`);
                          setReserveAmount('');
                        }}
                      >
                        <Wallet className="w-4 h-4 mr-2" /> Fund Reserve
                      </Button>
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
                      <Button
                        size="sm"
                        variant="secondary"
                        className="justify-start"
                        onClick={() => {
                          if (!uploadedDocs.length) {
                            toast.error('Please upload at least one document');
                            return;
                          }
                          toast.success(`Closed phase ${project.currentPhase} (simulated)`);
                          setUploadedDocs([]);
                        }}
                      >
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
                        <span className="font-medium">{format(project.withdrawable)} USDC</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="justify-start"
                        onClick={() => {
                          const amt = project.withdrawable;
                          if (!amt || amt <= 0) {
                            toast.error('No funds available to withdraw');
                            return;
                          }
                          toast.success(`Withdrew ${amt} USDC to developer (simulated)`);
                        }}
                      >
                        <DollarSign className="w-4 h-4 mr-2" /> Withdraw Funds
                      </Button>
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
