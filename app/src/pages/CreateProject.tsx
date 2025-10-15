import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { getRpcProvider, getSigner, registryAt } from '@/lib/eth';
import { contractsConfig } from '@/config/contracts';
import { toast } from '@/components/ui/sonner';

interface Milestone {
  id: string;
  title: string;
  summary: string;
  payout: string; // percent of max raise
  apr: string; // percent APR for this phase
  dueDate: string;
}

const CreateProject = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [milestones, setMilestones] = useState<Milestone[]>([
    {
      id: '1',
      title: 'Fundraising and Acquisition (No Interest)',
      summary:
        'Closes when plot reflects new owner and title docs provided. No interest during this stage; early entrants get a future interest bonus.',
      payout: '50',
      apr: '0',
      dueDate: '',
    },
    {
      id: '2',
      title: 'Design and Architectural',
      summary:
        'Closes when design PDFs are submitted.',
      payout: '5',
      apr: '15',
      dueDate: '',
    },
    {
      id: '3',
      title: 'Permitting',
      summary:
        'Closes when permits are submitted (HPO registration, warranty, demo/abatement).',
      payout: '5',
      apr: '12',
      dueDate: '',
    },
    {
      id: '4',
      title: 'Abatement/Demolition',
      summary:
        'Closes when abatement, demolition permits and the building permit is submitted.',
      payout: '10',
      apr: '9',
      dueDate: '',
    },
    {
      id: '5',
      title: 'Construction',
      summary:
        'Appraisal reports unlock mid-phase payouts; final closure with occupancy permit.',
      payout: '30',
      apr: '5',
      dueDate: '',
    },
    {
      id: '6',
      title: 'Revenue and Sales',
      summary: 'Final phase; sales proceeds distribute principal first, then revenue pro‑rata.',
      payout: '0',
      apr: '3',
      dueDate: '',
    },
    
  ]);

  const steps = [
    { id: 0, title: 'Basics', description: 'Project information' },
    { id: 1, title: 'Funding', description: 'Financial details' },
    { id: 2, title: 'Phases', description: 'Project roadmap' },
    { id: 3, title: 'Links', description: 'Social & resources' },
    { id: 4, title: 'Preview', description: 'Review & publish' },
  ];

  // Phases are fixed at 6 to match contracts; add/remove disabled.

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minRaise, setMinRaise] = useState('');
  const [maxRaise, setMaxRaise] = useState('');
  const [fundingDurationDays, setFundingDurationDays] = useState('30');

  const tokenName = useMemo(() => `Cornerstone-${name || 'Project'}`, [name]);
  const tokenSymbol = useMemo(() => {
    const base = (name || 'CST').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return `CST-${base || 'PRJ'}`;
  }, [name]);

  const [deployInfo, setDeployInfo] = useState<{ project: string; token: string } | null>(null);

  async function handlePublish() {
    try {
      if (!contractsConfig.registry) {
        toast.error('Registry address not configured (VITE_REGISTRY_ADDRESS)');
        return;
      }
      if (!name || !minRaise || !maxRaise) {
        toast.error('Fill in name, min and max raise');
        return;
      }
      const signer = await getSigner();
      const acct = await signer.getAddress();
      const reg = registryAt(contractsConfig.registry, signer);
      const rpc = getRpcProvider();
      const ro = registryAt(contractsConfig.registry, rpc);
      // Debug chain/addresses
      let signerChainId = 'unknown';
      let mmChainId = 'unknown';
      try {
        signerChainId = await (signer.provider as any)?.send?.('eth_chainId', []);
        mmChainId = (window as any)?.ethereum?.chainId;
        const net = await rpc.getNetwork();
        const regCode = await rpc.getCode(contractsConfig.registry);
        // eslint-disable-next-line no-console
        console.log('[CreateProject] setup', {
          registry: contractsConfig.registry,
          usdc: contractsConfig.usdc,
          acct,
          signerChainId,
          metamaskChainId: mmChainId,
          rpcChainId: net.chainId?.toString(),
          registryHasCode: regCode && regCode !== '0x',
        });
        // Guard: mismatch between signer chain and RPC chain
        const rpcChainHex = '0x' + Number(net.chainId?.toString() || '0').toString(16);
        if (signerChainId && rpcChainHex && signerChainId !== rpcChainHex) {
          toast.error(`Network mismatch. Wallet: ${signerChainId}, RPC: ${rpcChainHex}. Switch MetaMask to chainId 0x7A69 (31337) or update VITE_RPC_URL.`);
          return;
        }
      } catch {}
      const now = Math.floor(Date.now() / 1000);
      const deadline = now + (parseInt(fundingDurationDays || '0', 10) * 86400);
      // Pass all 6 phases including fundraising phase 0; registry maps 0..5 → 1..5 internally
      const allMilestones = milestones;
      const phaseAPRs = allMilestones.map(m => Math.round(parseFloat(m.apr || '0') * 100)); // % → bps
      const phaseCaps = allMilestones.map(m => Math.round(parseFloat(m.payout || '0') * 100)); // % → bps
      if (phaseAPRs.length !== 6 || phaseCaps.length !== 6) {
        toast.error('Exactly 6 phases required (including fundraising phase 0)');
        return;
      }
      const sumCaps = phaseCaps.slice(1).reduce((a, b) => a + b, 0); // only development phases count toward caps
      if (sumCaps > 10000) {
        toast.error('Phase caps exceed 100% total');
        return;
      }
      // durations: include phase 0 for completeness; informational only
      const phaseDurations = new Array(6).fill(0);
      // Debug params
      // eslint-disable-next-line no-console
      console.log('[CreateProject] params', {
        tokenName,
        tokenSymbol,
        minRaise,
        maxRaise,
        minRaiseUSDC: Math.round(parseFloat(minRaise) * 1e6),
        maxRaiseUSDC: Math.round(parseFloat(maxRaise) * 1e6),
        deadline,
        deadlineISO: new Date(deadline * 1000).toISOString(),
        phaseAPRs,
        phaseCaps,
        sumCaps,
      });
      // Preflight to surface contract reverts
      try {
        await (ro as any).createProjectWithTokenMeta.staticCall(
          tokenName,
          tokenSymbol,
          BigInt(Math.round(parseFloat(minRaise) * 1e6)),
          BigInt(Math.round(parseFloat(maxRaise) * 1e6)),
          BigInt(deadline),
          phaseAPRs,
          phaseDurations,
          phaseCaps,
        );
        // eslint-disable-next-line no-console
        console.log('[CreateProject] staticCall ok');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[CreateProject] staticCall error', err);
        throw err;
      }
      // Estimate gas with buffer (deploys a new project + token)
      let est: bigint = 0n;
      try {
        est = await (ro as any).createProjectWithTokenMeta.estimateGas(
          tokenName,
          tokenSymbol,
          BigInt(Math.round(parseFloat(minRaise) * 1e6)),
          BigInt(Math.round(parseFloat(maxRaise) * 1e6)),
          BigInt(deadline),
          phaseAPRs,
          phaseDurations,
          phaseCaps,
        );
        // eslint-disable-next-line no-console
        console.log('[CreateProject] estimateGas', est.toString());
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CreateProject] estimateGas failed, using fallback');
      }
      const gasLimit = est + (est / 5n) + 500_000n; // +20% + 500k buffer
      const tx = await reg.createProjectWithTokenMeta(
        tokenName,
        tokenSymbol,
        BigInt(Math.round(parseFloat(minRaise) * 1e6)),
        BigInt(Math.round(parseFloat(maxRaise) * 1e6)),
        BigInt(deadline),
        phaseAPRs,
        phaseDurations,
        phaseCaps,
        { gasLimit }
      );
      // eslint-disable-next-line no-console
      console.log('[CreateProject] sent tx', (tx as any)?.hash);
      const receipt = await tx.wait();
      // eslint-disable-next-line no-console
      console.log('[CreateProject] mined', receipt?.transactionHash, 'status', receipt?.status);
      let projectAddr: string | undefined;
      let tokenAddr: string | undefined;
      // Parse logs for ProjectCreated
      for (const log of receipt.logs) {
        try {
          const parsed = (reg as any).interface.parseLog(log);
          if (parsed?.name === 'ProjectCreated') {
            projectAddr = parsed.args?.project as string;
            tokenAddr = parsed.args?.token as string;
            break;
          }
        } catch {}
      }
      if (projectAddr && tokenAddr) {
        setDeployInfo({ project: projectAddr, token: tokenAddr });
        toast.success(`Project deployed: ${projectAddr}`);
      } else {
        toast.success('Project deployed');
      }
    } catch (e: any) {
      console.error(e);
      const reason = e?.info?.error?.data?.message || e?.error?.message || e?.reason || e?.message;
      toast.error(reason || 'Deploy failed');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-1">Create New Project</h1>
              <p className="text-muted-foreground">Build and fund your next big idea</p>
            </div>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Stepper */}
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            {/* Progress line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-10">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
              />
            </div>

            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center">
                <button
                  onClick={() => setCurrentStep(index)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors mb-2 ${
                    index === currentStep
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : index < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index < currentStep ? <Check className="w-5 h-5" /> : index + 1}
                </button>
                <div className="text-center hidden md:block">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <Card>
          <CardHeader>
            <CardTitle>{steps[currentStep].title}</CardTitle>
            <CardDescription>{steps[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 0: Basics */}
            {currentStep === 0 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Project Name</Label>
                  <Input id="name" placeholder="Enter your project name" value={name} onChange={(e)=>setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="description">Short Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Describe your project in a few sentences"
                    rows={3}
                    value={description}
                    onChange={(e)=>setDescription(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="logo">Logo URL</Label>
                    <Input id="logo" placeholder="https://..." />
                  </div>
                  <div>
                    <Label htmlFor="banner">Banner URL</Label>
                    <Input id="banner" placeholder="https://..." />
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Funding */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minRaise">Minimum Raise</Label>
                    <Input id="minRaise" type="number" placeholder="1000000" value={minRaise} onChange={(e)=>setMinRaise(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="maxRaise">Maximum Raise</Label>
                    <Input id="maxRaise" type="number" placeholder="5000000" value={maxRaise} onChange={(e)=>setMaxRaise(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fundingDuration">Funding Duration (days)</Label>
                    <Input id="fundingDuration" type="number" placeholder="30" value={fundingDurationDays} onChange={(e)=>setFundingDurationDays(e.target.value)} />
                    <p className="text-sm text-muted-foreground mt-1">
                      Only the duration for the initial funding stage is required.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Phases */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="p-3 rounded-md bg-muted text-sm text-muted-foreground">
                  There are 6 fixed phases (1–6). Final phase payout is fixed; others are editable.
                </div>
                {milestones.map((milestone, index) => (
                  <Card key={milestone.id} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Phase {index + 1}: {milestone.title}</CardTitle>
                        {/* Fixed phases: remove add/remove controls */}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{milestone.summary}</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`milestone-payout-${index}`}>Payout (% of Max Raise)</Label>
                          <Input 
                            id={`milestone-payout-${index}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="e.g., 15"
                            value={milestone.payout}
                            disabled={index === milestones.length - 1}
                            onChange={(e)=>{
                              const v = e.target.value;
                              setMilestones(prev=> prev.map((m,i)=> (i === index ? { ...m, payout: v } : m)));
                            }}
                          />
                          {index === milestones.length - 1 && (
                            <p className="text-xs text-muted-foreground mt-1">Final phase payout is fixed.</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`milestone-apr-${index}`}>APR (%)</Label>
                          <Input
                            id={`milestone-apr-${index}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="e.g., 8"
                            value={milestone.apr}
                            disabled={false}
                            onChange={(e)=>{
                              const v = e.target.value;
                              setMilestones(prev=> prev.map((m,i)=> (i === index ? { ...m, apr: v } : m)));
                            }}
                          />
                          {/* APRs are editable for all phases */}
                        </div>
                        <div>
                          <Label htmlFor={`milestone-date-${index}`}>Due Date</Label>
                          <Input 
                            id={`milestone-date-${index}`}
                            type="date"
                            value={milestone.dueDate}
                            onChange={(e)=>{
                              const v = e.target.value;
                              setMilestones(prev=> prev.map((m,i)=> i===index? { ...m, dueDate: v }: m));
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Step 3: Links */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" placeholder="https://your-project.com" />
                </div>
                <div>
                  <Label htmlFor="github">GitHub</Label>
                  <Input id="github" placeholder="https://github.com/username/repo" />
                </div>
                <div>
                  <Label htmlFor="twitter">X (Twitter)</Label>
                  <Input id="twitter" placeholder="https://x.com/username" />
                </div>
                <div>
                  <Label htmlFor="discord">Discord</Label>
                  <Input id="discord" placeholder="https://discord.gg/invite" />
                </div>
              </div>
            )}

            {/* Step 4: Preview */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="p-6 bg-muted rounded-lg">
                  <h3 className="font-semibold text-lg mb-4">Project Summary</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Phases:</span>
                      <span className="font-semibold">{milestones.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Funding Model:</span>
                      <span className="font-semibold">Phase-based Funding</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                  <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Before Publishing</h4>
                  <ul className="text-sm space-y-1 text-yellow-800 dark:text-yellow-200">
                    <li>• Ensure all phase details are accurate</li>
                    <li>• Make sure funding min/max and duration are correct</li>
                    <li>• Make sure social links are correct</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <Button className="flex-1" onClick={handlePublish}>
                    Deploy & Publish
                  </Button>
                </div>
                {deployInfo && (
                  <div className="p-4 mt-4 rounded border bg-muted/50">
                    <div className="text-sm font-medium mb-2">Deployed Addresses</div>
                    <div className="text-xs space-y-1">
                      <div>Project: <span className="font-mono">{deployInfo.project}</span></div>
                      <div>Token: <span className="font-mono">{deployInfo.token}</span></div>
                    </div>
                    <div className="mt-3">
                      <Button asChild size="sm">
                        <a href={`/project/${deployInfo.project}`}>Open Project Page</a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex gap-2">
            <Button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              disabled={currentStep === steps.length - 1}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProject;
