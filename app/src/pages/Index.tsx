import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, TrendingUp, Users, Shield } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="border-b bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              Build, Fund, and Deliver
              <span className="block text-primary mt-2">Milestone by Milestone</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Transparent project funding with escrow protection, on-chain document verification, and milestone-based payouts.
            </p>
            <div className="flex flex-wrap gap-4 justify-center pt-4">
              <Button asChild size="lg" className="h-12 px-8">
                <Link to="/projects/new">
                  <Plus className="w-5 h-5 mr-2" />
                  Create Project
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-8">
                <Link to="/projects/1">View Demo Project</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A new way to fund projects with built-in accountability and transparency
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Escrow Protection</CardTitle>
                <CardDescription>
                  Funds are held securely in smart contracts and released only when milestones are approved
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-success" />
                </div>
                <CardTitle>On-chain Document Verification</CardTitle>
                <CardDescription>
                  Secure document verification and validation with cryptographic proof and immutable records
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-accent" />
                </div>
                <CardTitle>Transparent Progress</CardTitle>
                <CardDescription>
                  Real-time timeline tracking with updates, deliverables, and on-chain verification
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-4xl font-bold">Ready to Get Started?</h2>
            <p className="text-xl text-muted-foreground">
              Launch your project with milestone-based funding today
            </p>
            <Button asChild size="lg" className="h-12 px-8">
              <Link to="/projects/new">
                <Plus className="w-5 h-5 mr-2" />
                Create Your Project
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
