import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { api, setAccessToken } from '@/api';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthContextData {
  user: AuthUser | null;
  isBootstrapping: boolean;
  signIn(credentials: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextData | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const storedAccessToken = localStorage.getItem('@Beholder:accessToken');

      if (!storedAccessToken) {
        setIsBootstrapping(false);
        return;
      }

      setAccessToken(storedAccessToken);

      try {
        const response = await api.get<{ data: AuthUser }>('/auth/me');
        setUser(response.data.data);
      } catch {
        // A failed hydration (e.g. expired/invalid token) clears state silently (D-10) —
        // no "session expired" message, the operator simply sees the login screen.
        localStorage.removeItem('@Beholder:accessToken');
        localStorage.removeItem('@Beholder:refreshToken');
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken, user: signedInUser } = response.data.data;

      localStorage.setItem('@Beholder:accessToken', accessToken);
      localStorage.setItem('@Beholder:refreshToken', refreshToken);
      setAccessToken(accessToken);
      setUser(signedInUser);
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Server-side refresh-token revocation (D-11) is added in a later plan once the
    // corresponding logout endpoint exists — this seam intentionally only clears client state for now.
    localStorage.removeItem('@Beholder:accessToken');
    localStorage.removeItem('@Beholder:refreshToken');
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isBootstrapping, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
