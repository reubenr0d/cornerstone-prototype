import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ArrowLeft, ArrowRight, Check } from 'lucide-react';

interface Milestone {
  id: string;
  title: string;
  payout: string;
  dueDate: string;
  deliverables: string;
}

const CreateProject = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [milestones, setMilestones] = useState<Milestone[]>([
    { id: '1', title: '', payout: '', dueDate: '', deliverables: '' }
  ]);

  const steps = [
    { id: 0, title: 'Basics', description: 'Project information' },
    { id: 1, title: 'Funding', description: 'Financial details' },
    { id: 2, title: 'Milestones', description: 'Project roadmap' },
    { id: 3, title: 'Governance', description: 'Approval settings' },
    { id: 4, title: 'Links', description: 'Social & resources' },
    { id: 5, title: 'Preview', description: 'Review & publish' },
  ];

  const addMilestone = () => {
    setMilestones([
      ...milestones,
      { id: Date.now().toString(), title: '', payout: '', dueDate: '', deliverables: '' }
    ]);
  };

  const removeMilestone = (id: string) => {
    if (milestones.length > 1) {
      setMilestones(milestones.filter(m => m.id !== id));
    }
  };

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
                  <Input id="name" placeholder="Enter your project name" />
                </div>
                <div>
                  <Label htmlFor="description">Short Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Describe your project in a few sentences"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="defi">DeFi</SelectItem>
                      <SelectItem value="nft">NFT</SelectItem>
                      <SelectItem value="dao">DAO</SelectItem>
                      <SelectItem value="infrastructure">Infrastructure</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="gaming">Gaming</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <Label htmlFor="token">Payment Token</Label>
                    <Select>
                      <SelectTrigger id="token">
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eth">ETH</SelectItem>
                        <SelectItem value="usdc">USDC</SelectItem>
                        <SelectItem value="usdt">USDT</SelectItem>
                        <SelectItem value="dai">DAI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="target">Funding Target</Label>
                    <Input id="target" type="number" placeholder="25" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="chain">Chain</Label>
                    <Select>
                      <SelectTrigger id="chain">
                        <SelectValue placeholder="Select chain" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="base">Base</SelectItem>
                        <SelectItem value="ethereum">Ethereum</SelectItem>
                        <SelectItem value="optimism">Optimism</SelectItem>
                        <SelectItem value="arbitrum">Arbitrum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="escrow">Escrow Mode</Label>
                    <Select>
                      <SelectTrigger id="escrow">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Deploy New Escrow</SelectItem>
                        <SelectItem value="existing">Use Existing Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="tokenSymbol">Token Symbol (Optional)</Label>
                  <Input id="tokenSymbol" placeholder="e.g., PROJ" />
                  <p className="text-sm text-muted-foreground mt-1">
                    Create a token for governance and rewards
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Milestones */}
            {currentStep === 2 && (
              <div className="space-y-6">
                {milestones.map((milestone, index) => (
                  <Card key={milestone.id} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Milestone {index + 1}</CardTitle>
                        {milestones.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeMilestone(milestone.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor={`milestone-title-${index}`}>Title</Label>
                        <Input 
                          id={`milestone-title-${index}`}
                          placeholder="Milestone name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`milestone-payout-${index}`}>Payout Amount</Label>
                          <Input 
                            id={`milestone-payout-${index}`}
                            type="number"
                            placeholder="5"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`milestone-date-${index}`}>Due Date</Label>
                          <Input 
                            id={`milestone-date-${index}`}
                            type="date"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`milestone-deliverables-${index}`}>Deliverables</Label>
                        <Textarea 
                          id={`milestone-deliverables-${index}`}
                          placeholder="Describe what will be delivered..."
                          rows={3}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={addMilestone}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Another Milestone
                </Button>
              </div>
            )}

            {/* Step 3: Governance */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="approvals">Approvals Required</Label>
                  <Select>
                    <SelectTrigger id="approvals">
                      <SelectValue placeholder="Select approval threshold" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple Majority (&gt;50%)</SelectItem>
                      <SelectItem value="supermajority">Supermajority (&gt;66%)</SelectItem>
                      <SelectItem value="unanimous">Unanimous (100%)</SelectItem>
                      <SelectItem value="custom">Custom Threshold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reviewWindow">Review Window (Days)</Label>
                  <Input id="reviewWindow" type="number" placeholder="7" />
                  <p className="text-sm text-muted-foreground mt-1">
                    Time holders have to review deliverables
                  </p>
                </div>
                <div>
                  <Label htmlFor="quorum">Quorum Percentage</Label>
                  <Input id="quorum" type="number" placeholder="20" />
                  <p className="text-sm text-muted-foreground mt-1">
                    Minimum participation required for votes
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Links */}
            {currentStep === 4 && (
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

            {/* Step 5: Preview */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="p-6 bg-muted rounded-lg">
                  <h3 className="font-semibold text-lg mb-4">Project Summary</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Milestones:</span>
                      <span className="font-semibold">{milestones.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Funding Model:</span>
                      <span className="font-semibold">Milestone-based Escrow</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Governance:</span>
                      <span className="font-semibold">Token-weighted Voting</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                  <h4 className="font-semibold text-warning mb-2">Before Publishing</h4>
                  <ul className="text-sm space-y-1 text-warning-foreground/80">
                    <li>• Ensure all milestone details are accurate</li>
                    <li>• Double-check payment token and chain selection</li>
                    <li>• Review governance parameters carefully</li>
                    <li>• Make sure social links are correct</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1">
                    Save as Draft
                  </Button>
                  <Button className="flex-1">
                    Deploy & Publish
                  </Button>
                </div>
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
            <Button variant="outline">
              Save Draft
            </Button>
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
