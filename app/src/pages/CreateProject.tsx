import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

interface Milestone {
  id: string;
  title: string;
  summary: string;
  payout: string;
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
      payout: '',
      dueDate: '',
    },
    {
      id: '2',
      title: 'Design and Architectural',
      summary:
        'Closes when design PDFs are submitted.',
      payout: '',
      dueDate: '',
    },
    {
      id: '3',
      title: 'Permitting',
      summary:
        'Closes when permits are submitted (HPO registration, warranty, demo/abatement).',
      payout: '',
      dueDate: '',
    },
    {
      id: '4',
      title: 'Abatement/Demolition',
      summary:
        'Closes when abatement, demolition permits and the building permit is submitted.',
      payout: '',
      dueDate: '',
    },
    {
      id: '5',
      title: 'Construction',
      summary:
        'Appraisal reports unlock mid-phase payouts; final closure with occupancy permit.',
      payout: '',
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

  // Phases are fixed at 5 for this project; add/remove disabled.

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
                    <Input id="minRaise" type="number" placeholder="0" />
                  </div>
                  <div>
                    <Label htmlFor="maxRaise">Maximum Raise</Label>
                    <Input id="maxRaise" type="number" placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fundingDuration">Funding Duration (days)</Label>
                    <Input id="fundingDuration" type="number" placeholder="30" />
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
                  There are 5 fixed phases. Due dates are soft deadlines and not enforced on-chain.
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
