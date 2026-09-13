import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api, setAccessToken, setOnSilentSignOut } from '@/api';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthContextData {
  user: AuthUser | null;
  isBootstrapping: boolean;
  signIn(credentials: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;
}

const AuthContext = createContext<AuthContextData | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

// The access token contract fixes a 15-minute lifetime (backend
// ACCESS_TOKEN_TTL); used as the scheduling fallback on bootstrap hydration,
// where no fresh expiresIn value is available (only login/refresh return one).
const DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS = 900;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearSession = useCallback(() => {
    clearRefreshTimer();
    localStorage.removeItem('@Beholder:accessToken');
    localStorage.removeItem('@Beholder:refreshToken');
    setAccessToken(null);
    setUser(null);
  }, [clearRefreshTimer]);

  const scheduleRefresh = useCallback(
    (expiresIn: number) => {
      clearRefreshTimer();

      // Fires ahead of expiry (D-09) rather than waiting for a 401.
      const delayMs = Math.max((expiresIn - 60) * 1000, 0);

      refreshTimerRef.current = setTimeout(() => {
        void refreshSession();
      }, delayMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearRefreshTimer],
  );

  const refreshSession = useCallback(async (): Promise<void> => {
    const storedRefreshToken = localStorage.getItem('@Beholder:refreshToken');

    if (!storedRefreshToken) {
      clearSession();
      return;
    }

    try {
      const response = await api.post('/auth/refresh', { refreshToken: storedRefreshToken });
      const { accessToken, refreshToken, expiresIn } = response.data.data as {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      };

      localStorage.setItem('@Beholder:accessToken', accessToken);
      localStorage.setItem('@Beholder:refreshToken', refreshToken);
      setAccessToken(accessToken);
      scheduleRefresh(expiresIn);
    } catch {
      // The refresh token is gone (expired or revoked): sign out silently,
      // with no toast, alert, or explicit end-of-session copy anywhere (D-10).
      clearSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSession, scheduleRefresh]);

  useEffect(() => {
    setOnSilentSignOut(() => clearSession());
    return () => setOnSilentSignOut(null);
  }, [clearSession]);

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
        scheduleRefresh(DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS);
      } catch {
        // A failed hydration (e.g. expired/invalid token) clears state silently (D-10) —
        // no explicit end-of-session message, the operator simply sees the login screen.
        clearSession();
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();

    return () => clearRefreshTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken, expiresIn, user: signedInUser } = response.data.data;

      localStorage.setItem('@Beholder:accessToken', accessToken);
      localStorage.setItem('@Beholder:refreshToken', refreshToken);
      setAccessToken(accessToken);
      setUser(signedInUser);
      scheduleRefresh(expiresIn);
    },
    [scheduleRefresh],
  );

  const signOut = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem('@Beholder:refreshToken');

    if (storedRefreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken: storedRefreshToken });
      } catch {
        // Revocation on the server is best-effort from the client's point of
        // view (D-11) — local state is always cleared below regardless.
      }
    }

    clearSession();
  }, [clearSession]);

  const changePassword = useCallback(
    async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      await api.patch('/auth/password', { currentPassword, newPassword });
      // PATCH /auth/password revokes every refresh token for the user, so the
      // current session cannot be kept alive — clear it and let ProtectedRoute
      // route back to /login for a fresh sign-in with the new password.
      clearSession();
    },
    [clearSession],
  );

  return (
    <AuthContext.Provider
      value={{ user, isBootstrapping, signIn, signOut, changePassword }}
    >
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
