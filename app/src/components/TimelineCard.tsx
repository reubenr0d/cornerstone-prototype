import { ReactNode } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface TimelineCardProps {
  type: 'milestone' | 'deliverable' | 'payout' | 'update' | 'proposal' | 'dispute';
  title: string;
  meta?: string;
  children?: ReactNode;
  actions?: ReactNode;
  status?: string;
}

const typeConfig = {
  milestone: { icon: '🎯', color: 'bg-primary/10 text-primary border-primary/20' },
  deliverable: { icon: '📦', color: 'bg-accent/10 text-accent border-accent/20' },
  payout: { icon: '💰', color: 'bg-success/10 text-success border-success/20' },
  update: { icon: '📢', color: 'bg-secondary text-secondary-foreground border-border' },
  proposal: { icon: '🗳️', color: 'bg-warning/10 text-warning border-warning/20' },
  dispute: { icon: '⚠️', color: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export const TimelineCard = ({ type, title, meta, children, actions, status }: TimelineCardProps) => {
  const config = typeConfig[type];
  
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${config.color} flex items-center justify-center text-xl border`}>
          {config.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">{title}</h3>
              {meta && <p className="text-sm text-muted-foreground mt-1">{meta}</p>}
            </div>
            {status && (
              <Badge variant="outline" className="flex-shrink-0">
                {status}
              </Badge>
            )}
          </div>
          
          {children && <div className="text-sm text-foreground/80 mb-3">{children}</div>}
          
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </Card>
  );
};
