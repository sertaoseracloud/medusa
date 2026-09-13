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
// ACCESS_TOKEN_TTL); used ONLY as a last-resort scheduling fallback if no
// stored expiry timestamp is available (e.g. a token persisted before this
// field existed). Normally bootstrap uses the actual remaining
// time-to-expiry — see WR-02.
const DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS = 900;

const ACCESS_TOKEN_EXPIRES_AT_KEY = '@Beholder:accessTokenExpiresAt';

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
    localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
    setAccessToken(null);
    setUser(null);
  }, [clearRefreshTimer]);

  // Persists the token's actual expiry instant so a page reload can compute
  // the real remaining time-to-expiry instead of always assuming a fresh
  // 15-minute window (WR-02).
  const persistExpiresAt = useCallback((expiresIn: number) => {
    const expiresAtMs = Date.now() + expiresIn * 1000;
    localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, String(expiresAtMs));
  }, []);

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
      persistExpiresAt(expiresIn);
      setAccessToken(accessToken);
      scheduleRefresh(expiresIn);
    } catch {
      // The refresh token is gone (expired or revoked): sign out silently,
      // with no toast, alert, or explicit end-of-session copy anywhere (D-10).
      clearSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSession, persistExpiresAt, scheduleRefresh]);

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

        // WR-02: use the token's actual remaining time-to-expiry (persisted
        // at login/refresh time) instead of always assuming a fresh
        // 15-minute window, so a reload shortly before expiry doesn't
        // schedule a stale-length proactive refresh.
        const storedExpiresAtRaw = localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
        const storedExpiresAt = storedExpiresAtRaw ? Number(storedExpiresAtRaw) : NaN;
        const remainingSeconds = Number.isFinite(storedExpiresAt)
          ? Math.max((storedExpiresAt - Date.now()) / 1000, 0)
          : DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS;

        scheduleRefresh(remainingSeconds);
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
      persistExpiresAt(expiresIn);
      setAccessToken(accessToken);
      setUser(signedInUser);
      scheduleRefresh(expiresIn);
    },
    [persistExpiresAt, scheduleRefresh],
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
