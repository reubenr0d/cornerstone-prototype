import { ReactNode } from 'react';

export type Role = 'guest' | 'developer' | 'holder';

interface RoleGateProps {
  children: ReactNode;
  allowedRoles: Role[];
  currentRole: Role;
  fallback?: ReactNode;
}

export const RoleGate = ({ children, allowedRoles, currentRole, fallback = null }: RoleGateProps) => {
  if (allowedRoles.includes(currentRole)) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
};
