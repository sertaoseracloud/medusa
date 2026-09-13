import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useAuth } from '@/contexts/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
