import { Role } from './RoleGate';
import { Button } from './ui/button';

interface RoleSelectorProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
}

const roles: { value: Role; label: string; icon: string }[] = [
  { value: 'developer', label: 'Developer', icon: '👨‍💻' },
  { value: 'holder', label: 'Holder', icon: '💎' },
];

export const RoleSelector = ({ currentRole, onRoleChange }: RoleSelectorProps) => {
  return (
    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border border-border">
      <span className="text-sm text-muted-foreground font-medium">Demo Mode:</span>
      <div className="flex gap-1">
        {roles.map((role) => (
          <Button
            key={role.value}
            variant={currentRole === role.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onRoleChange(role.value)}
            className="h-8"
          >
            <span className="mr-1">{role.icon}</span>
            {role.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
