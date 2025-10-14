import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RoleSelector } from '@/components/RoleSelector';
import { RoleGate, Role } from '@/components/RoleGate';
import { TimelineCard } from '@/components/TimelineCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Plus, Edit, Upload, DollarSign, AlertTriangle, Vote, MessageSquare } from 'lucide-react';

const ProjectDetails = () => {
  const { id } = useParams();
  const [currentRole, setCurrentRole] = useState<Role>('guest');
  const [activeTab, setActiveTab] = useState('timeline');

  // Mock project data
  const project = {
    name: 'Cornerstone Protocol',
    status: 'Active',
    chain: 'Base',
    contractAddress: '0x1234...abcd',
    owner: '0x1234...abcd',
    raised: 12.4,
    target: 25,
    escrow: 12.4,
    milestones: 4,
    supporters: 23,
  };

  const raisedPercentage = (project.raised / project.target) * 100;

  const tabs = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'milestones', label: 'Milestones' },
    { id: 'updates', label: 'Updates' },
    { id: 'verification', label: 'On-chain Document Verification' },
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
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">{project.name}</h1>
                  <Badge className="bg-success text-success-foreground">{project.status}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {project.chain} • {project.contractAddress}
                </p>
              </div>

              {/* Role-aware action bar */}
              <div className="flex flex-wrap gap-2">
                <RoleGate currentRole={currentRole} allowedRoles={['guest']}>
                  <Button size="lg">Connect Wallet</Button>
                </RoleGate>

                <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    New Milestone
                  </Button>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Post Update
                  </Button>
                  <Button variant="outline" size="sm">
                    <Edit className="w-4 h-4 mr-1" />
                    Edit Project
                  </Button>
                </RoleGate>

                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                  <Button size="sm">
                    <DollarSign className="w-4 h-4 mr-1" />
                    Fund Project
                  </Button>
                  <Button variant="outline" size="sm">
                    <Vote className="w-4 h-4 mr-1" />
                    Vote
                  </Button>
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
                    <span className="font-semibold">{project.raised} ETH raised</span>
                    <span className="text-muted-foreground">{project.target} ETH target</span>
                  </div>
                  <Progress value={raisedPercentage} className="h-3" />
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Escrow Balance</p>
                    <p className="text-lg font-semibold">{project.escrow} ETH</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Milestones</p>
                    <p className="text-lg font-semibold">{project.milestones}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Supporters</p>
                    <p className="text-lg font-semibold">{project.supporters}</p>
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

            {/* Timeline */}
            <div className="space-y-4">
              <TimelineCard
                type="milestone"
                title="Smart Contract Audit Complete"
                meta="Due: Dec 20, 2025 • Payout: 5 ETH"
                status="In Progress"
              >
                <p>Complete comprehensive security audit of all smart contracts including escrow, milestone management, and token distribution mechanisms.</p>
                <div className="mt-2 text-sm">
                  <strong>Scope:</strong> Full codebase review, vulnerability assessment, gas optimization
                </div>
              </TimelineCard>

              <TimelineCard
                type="deliverable"
                title="Frontend MVP Submitted"
                meta="Submitted 2 hours ago by developer"
              >
                <p className="mb-2">Deliverable includes responsive UI, wallet integration, and project dashboard.</p>
                <div className="flex gap-2 text-sm text-muted-foreground">
                  <span>📎 3 attachments</span>
                  <span>•</span>
                  <span>Demo: cornerstone-demo.vercel.app</span>
                </div>
                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="default">Approve</Button>
                    <Button size="sm" variant="outline">Request Changes</Button>
                  </div>
                </RoleGate>
              </TimelineCard>

              <TimelineCard
                type="payout"
                title="Payout Released: Milestone 1"
                meta="Released 1 day ago"
              >
                <p className="mb-2">3.5 ETH released to developer for completing initial setup milestone.</p>
                <a href="#" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              </TimelineCard>

              <TimelineCard
                type="update"
                title="Weekly Progress Update #3"
                meta="Posted 3 days ago"
              >
                <p className="mb-2">This week we focused on:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Implementing milestone approval workflow</li>
                  <li>Adding multi-sig wallet support</li>
                  <li>Optimizing gas costs for deployments</li>
                </ul>
              </TimelineCard>

              <TimelineCard
                type="proposal"
                title="Proposal: Extend Timeline by 2 Weeks"
                meta="Voting ends in 3 days"
                status="Active"
              >
                <p className="mb-3">Due to additional security requirements, requesting timeline extension.</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Yes (67%)</span>
                      <span>15 votes</span>
                    </div>
                    <Progress value={67} className="h-2 bg-muted" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>No (33%)</span>
                      <span>8 votes</span>
                    </div>
                    <Progress value={33} className="h-2 bg-muted" />
                  </div>
                </div>
                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="default">Vote Yes</Button>
                    <Button size="sm" variant="outline">Vote No</Button>
                  </div>
                </RoleGate>
              </TimelineCard>

              <TimelineCard
                type="dispute"
                title="Risk Alert: Delayed Milestone"
                meta="Raised 5 days ago by community"
              >
                <p>Milestone 2 is past due date. Community requesting status update from developer.</p>
                <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
                  <Button size="sm" variant="outline" className="mt-2">
                    <Upload className="w-4 h-4 mr-1" />
                    Submit Deliverable
                  </Button>
                </RoleGate>
              </TimelineCard>
            </div>
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Funding card */}
            <Card>
              <CardHeader>
                <CardTitle>Support This Project</CardTitle>
                <CardDescription>Help bring this vision to life</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Progress value={raisedPercentage} className="h-2 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {raisedPercentage.toFixed(0)}% funded
                  </p>
                </div>

                <RoleGate currentRole={currentRole} allowedRoles={['guest']}>
                  <Button className="w-full" size="lg">
                    Connect Wallet to Fund
                  </Button>
                </RoleGate>

                <RoleGate currentRole={currentRole} allowedRoles={['developer']}>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    You're the project owner
                  </div>
                </RoleGate>

                <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
                  <Button className="w-full" size="lg">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Contribute More
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Your contribution: 0.5 ETH
                  </p>
                </RoleGate>
              </CardContent>
            </Card>

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
                  <p className="text-muted-foreground">Escrow Balance</p>
                  <p className="font-semibold">{project.escrow} ETH</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active Milestones</p>
                  <p className="font-semibold">{project.milestones}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Supporters</p>
                  <p className="font-semibold">{project.supporters}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chain</p>
                  <p className="font-semibold">{project.chain}</p>
                </div>
              </CardContent>
            </Card>

            <RoleGate currentRole={currentRole} allowedRoles={['holder']}>
              <Card>
                <CardHeader>
                  <CardTitle>Your Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Vote className="w-4 h-4 mr-2" />
                    View Pending Votes
                  </Button>
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
            </RoleGate>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetails;
