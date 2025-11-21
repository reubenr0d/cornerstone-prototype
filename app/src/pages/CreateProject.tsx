import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Check, Wallet } from 'lucide-react';
import { getRpcProvider, getSigner, registryAt, getAccount, Address } from '@/lib/eth';
import { contractsConfig } from '@/config/contracts';
import { toast } from '@/components/ui/sonner';
import { uploadProjectMetadata, ProjectMetadata, ipfsUpload } from '@/lib/ipfs';

interface Milestone {
  id: string;
  title: string;
  summary: string;
  payout: string; // percent of max raise
}

const CreateProject = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [account, setAccount] = useState<Address | null>(null);
  const [connected, setConnected] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([
    {
      id: '1',
      title: 'Fundraising and Acquisition (No Interest)',
      summary:
        'Closes when plot reflects new owner and title docs provided. No interest during this stage; early entrants get a future interest bonus.',
      payout: '50',
    },
    {
      id: '2',
      title: 'Design and Architectural',
      summary:
        'Closes when design PDFs are submitted.',
      payout: '5',
    },
    {
      id: '3',
      title: 'Permitting',
      summary:
        'Closes when permits are submitted (HPO registration, warranty, demo/abatement).',
      payout: '5',
    },
    {
      id: '4',
      title: 'Abatement/Demolition',
      summary:
        'Closes when abatement, demolition permits and the building permit is submitted.',
      payout: '10',
    },
    {
      id: '5',
      title: 'Construction',
      summary:
        'Appraisal reports unlock mid-phase payouts; final closure with occupancy permit.',
      payout: '30',
    },
    {
      id: '6',
      title: 'Revenue and Sales',
      summary: 'Final phase; sales proceeds distribute principal first, then revenue pro‑rata.',
      payout: '0',
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
  const [selectedToken, setSelectedToken] = useState<'USDC' | 'PYUSD'>('USDC');

  // Add new state for bracket APRs
  const [bracket0MaxAPR, setBracket0MaxAPR] = useState('15'); // Phase 0 max
  const [bracket0MinAPR, setBracket0MinAPR] = useState('10'); // Phase 0 min
  const [bracket1MaxAPR, setBracket1MaxAPR] = useState('12'); // Phases 1-4 max
  const [bracket1MinAPR, setBracket1MinAPR] = useState('5');  // Phases 1-4 min
  
  // Metadata fields
  const [projectImage, setProjectImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const tokenName = useMemo(() => `Cornerstone-${name || 'Project'}`, [name]);
  const tokenSymbol = useMemo(() => {
    const base = (name || 'CST').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return `CST-${base || 'PRJ'}`;
  }, [name]);

  const [deployInfo, setDeployInfo] = useState<{ project: string; token: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    getAccount().then((a) => {
      if (a) {
        setAccount(a);
        setConnected(true);
      }
    });
  }, []);

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

  async function handlePublish() {
    setIsPublishing(true);
    try {
      if (!contractsConfig.registry) {
        toast.error('Registry address not configured (VITE_REGISTRY_ADDRESS)');
        setIsPublishing(false);
        return;
      }
      
      // Upload metadata to IPFS first
      let metadataURI = '';
      try {
        toast.info('Uploading project metadata to IPFS...');
        
        // Upload project image if provided
        let imageIPFSUri = '';
        if (projectImage) {
          const uploaded = await ipfsUpload([projectImage]);
          imageIPFSUri = uploaded[0]?.uri || '';
          console.log('Project image uploaded:', imageIPFSUri);
        }
        
        // Build metadata object
        const metadata: ProjectMetadata = {
          name: name || 'Untitled Project',
          description: description || '',
          image: imageIPFSUri
        };
        
        // Upload metadata JSON
        metadataURI = await uploadProjectMetadata(metadata);
        toast.success(`Metadata uploaded: ${metadataURI}`);
      } catch (err) {
        console.error('Metadata upload failed:', err);
        toast.error('Failed to upload metadata to IPFS. Please try again.');
        setIsPublishing(false);
        return;
      }
      
      const tokenAddress = selectedToken === 'USDC' 
        ? (import.meta.env.VITE_USDC_ADDRESS as Address)
        : (import.meta.env.VITE_PYUSD_ADDRESS as Address);

      if (!tokenAddress) {
        toast.error(`${selectedToken} address not configured`);
        setIsPublishing(false);
        return;
      }
      if (!name || !minRaise || !maxRaise) {
        toast.error('Fill in name, min and max raise');
        setIsPublishing(false);
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
          stablecoin: tokenAddress,
          acct,
          signerChainId,
          metamaskChainId: mmChainId,
          rpcChainId: net.chainId?.toString(),
          registryHasCode: regCode && regCode !== '0x',
        });
        // Guard: mismatch between signer chain and RPC chain
        const rpcChainHex = '0x' + Number(net.chainId?.toString() || '0').toString(16);
        if (signerChainId && rpcChainHex && signerChainId !== rpcChainHex) {
          toast.error(`Network mismatch. Wallet: ${signerChainId}, RPC: ${rpcChainHex}. Switch your wallet to match VITE_RPC_URL or update VITE_RPC_URL.`);
          setIsPublishing(false);
          return;
        }
      } catch {}
      const now = Math.floor(Date.now() / 1000);
      const deadline = now + (parseInt(fundingDurationDays || '0', 10) * 86400);
      // Pass all 6 phases including fundraising phase 0; registry maps 0..5 → 1..5 internally
      const allMilestones = milestones;
      // Convert APRs from percentage to basis points (1% = 100 bps)
      const bracketMinAPR = [
        Math.round(parseFloat(bracket0MinAPR || '0') * 100), // bracket 0 min
        Math.round(parseFloat(bracket1MinAPR || '0') * 100)  // bracket 1 min
      ];
      const bracketMaxAPR = [
        Math.round(parseFloat(bracket0MaxAPR || '0') * 100), // bracket 0 max
        Math.round(parseFloat(bracket1MaxAPR || '0') * 100)  // bracket 1 max
      ];

      // Phase caps: % → bps (include phase 0 which is typically 0)
      const phaseCaps = milestones.map(m => Math.round(parseFloat(m.payout || '0') * 100));

      // Durations (informational only)
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
        bracketMinAPR,      // [bracket0_min, bracket1_min]
        bracketMaxAPR,      // [bracket0_max, bracket1_max]
        phaseDurations,     // [0,0,0,0,0,0] - informational
        phaseCaps, 
      });
      // Preflight simulation using staticCall
      try {
        const sim = await reg.createProjectWithTokenMeta.staticCall(
          tokenAddress,
          tokenName,
          tokenSymbol,
          BigInt(Math.round(parseFloat(minRaise) * 1e6)),
          BigInt(Math.round(parseFloat(maxRaise) * 1e6)),
          BigInt(deadline),
          bracketMinAPR,      // [bracket0_min, bracket1_min]
          bracketMaxAPR,      // [bracket0_max, bracket1_max]
          metadataURI
        );
        // eslint-disable-next-line no-console
        console.log('[CreateProject] simulate ok (project, token)', sim);
      } catch (err) {
        // If simulation fails, surface reason but do not block sending in case of node quirks
        // eslint-disable-next-line no-console
        console.error('[CreateProject] simulate error', err);
        const msg = (err as any)?.shortMessage || (err as any)?.reason || (err as any)?.message;
        if (msg) toast.error(msg);
        // continue; gas estimation below should still catch real reverts
      }
      // Estimate gas with buffer (deploys a new project + token)
      // Important: estimate with signer-bound contract so msg.sender context is correct
      let est: bigint = 0n;
      try {
        est = await reg.createProjectWithTokenMeta.estimateGas(
          tokenAddress,
          tokenName,
          tokenSymbol,
          BigInt(Math.round(parseFloat(minRaise) * 1e6)),
          BigInt(Math.round(parseFloat(maxRaise) * 1e6)),
          BigInt(deadline),
          bracketMinAPR,      // [bracket0_min, bracket1_min]
          bracketMaxAPR,      // [bracket0_max, bracket1_max]
          metadataURI
        );
        // eslint-disable-next-line no-console
        console.log('[CreateProject] estimateGas', est.toString());
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CreateProject] estimateGas failed, using fallback', err);
      }
      // If estimation failed or very low, use a safer fallback for CREATE + CREATE2 of token
      const fallbackGas = 6_500_000n;
      const gasLimit = est && est > 0n ? (est + (est / 5n) + 500_000n) : fallbackGas; // +20% + 500k buffer
      const tx = await reg.createProjectWithTokenMeta(
        tokenAddress,
        tokenName,
        tokenSymbol,
        BigInt(Math.round(parseFloat(minRaise) * 1e6)),
        BigInt(Math.round(parseFloat(maxRaise) * 1e6)),
        BigInt(deadline),
        bracketMinAPR,      // [bracket0_min, bracket1_min]
        bracketMaxAPR,      // [bracket0_max, bracket1_max]
        metadataURI,
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
          const parsed = reg.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          });
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
    } finally {
      setIsPublishing(false);
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
            <div className="flex items-center gap-3">
              <Button
                variant={connected ? 'secondary' : 'default'}
                size="sm"
                className="gap-2"
                onClick={connectWallet}
              >
                <Wallet className="w-4 h-4" />
                {connected && account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
              </Button>
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
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
                
                {/* Project Image Upload */}
                <div>
                  <Label htmlFor="projectImage">Project Image</Label>
                  <Input 
                    id="projectImage" 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setProjectImage(file);
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  {imagePreview && (
                    <div className="mt-2">
                      <img src={imagePreview} alt="Project preview" className="h-32 w-auto rounded border-2 border-[#654321]" />
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload a main image for your project
                  </p>
                </div>
              </div>
            )}

            {/* Step 1: Funding */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="tokenSelect">Investment Token</Label>
                  <Select value={selectedToken} onValueChange={(v) => setSelectedToken(v as 'USDC' | 'PYUSD')}>
                    <SelectTrigger id="tokenSelect">
                      <SelectValue placeholder="Select token" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USDC">USDC</SelectItem>
                      <SelectItem value="PYUSD">PYUSD</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose the stablecoin investors will use to fund this project
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minRaise">Minimum Raise ({selectedToken})</Label>
                    <Input id="minRaise" type="number" placeholder="1000000" value={minRaise} onChange={(e)=>setMinRaise(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="maxRaise">Maximum Raise ({selectedToken})</Label>
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
    <div className="p-4 rounded-md bg-muted">
      <h3 className="font-semibold mb-2">Interest Rate Configuration</h3>
      <p className="text-sm text-muted-foreground">
        The contract uses a bracket-based APR system that decreases as more funds are raised:
      </p>
      <ul className="text-sm text-muted-foreground mt-2 space-y-1">
        <li>• <strong>Bracket 0 (Fundraising Phase):</strong> APR decreases from max to min as funds approach minRaise</li>
        <li>• <strong>Bracket 1 (Development Phases 1-4):</strong> APR decreases from max to min as funds approach maxRaise</li>
        <li>• <strong>Phase 5 (Sales):</strong> No interest earned</li>
      </ul>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Bracket 0: Fundraising Phase (Phase 0)</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="bracket0Max">Maximum APR (%)</Label>
          <Input
            id="bracket0Max"
            type="number"
            step="0.1"
            value={bracket0MaxAPR}
            onChange={(e) => setBracket0MaxAPR(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            APR when fundraising starts (0 raised)
          </p>
        </div>
        <div>
          <Label htmlFor="bracket0Min">Minimum APR (%)</Label>
          <Input
            id="bracket0Min"
            type="number"
            step="0.1"
            value={bracket0MinAPR}
            onChange={(e) => setBracket0MinAPR(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            APR when minRaise is reached
          </p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Bracket 1: Development Phases (Phases 1-4)</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="bracket1Max">Maximum APR (%)</Label>
          <Input
            id="bracket1Max"
            type="number"
            step="0.1"
            value={bracket1MaxAPR}
            onChange={(e) => setBracket1MaxAPR(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            APR at minRaise
          </p>
        </div>
        <div>
          <Label htmlFor="bracket1Min">Minimum APR (%)</Label>
          <Input
            id="bracket1Min"
            type="number"
            step="0.1"
            value={bracket1MinAPR}
            onChange={(e) => setBracket1MinAPR(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            APR when maxRaise is reached
          </p>
        </div>
      </CardContent>
    </Card>
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
                  <Button className="flex-1" onClick={handlePublish} disabled={isPublishing}>
                    {isPublishing ? 'Deploying...' : 'Deploy & Publish'}
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
