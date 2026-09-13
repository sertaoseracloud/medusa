import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3333',
  withCredentials: false,
});

export function setAccessToken(token: string | null): void {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

let onSilentSignOut: (() => void) | null = null;

export function setOnSilentSignOut(handler: (() => void) | null): void {
  onSilentSignOut = handler;
}

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// A burst of concurrent 401s must trigger exactly one /auth/refresh call — every
// caller in flight awaits this single shared promise instead of racing its own.
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const storedRefreshToken = localStorage.getItem('@Beholder:refreshToken');
  if (!storedRefreshToken) {
    return null;
  }

  try {
    const response = await api.post('/auth/refresh', { refreshToken: storedRefreshToken });
    const { accessToken, refreshToken } = response.data.data as {
      accessToken: string;
      refreshToken: string;
    };

    localStorage.setItem('@Beholder:accessToken', accessToken);
    localStorage.setItem('@Beholder:refreshToken', refreshToken);
    setAccessToken(accessToken);

    return accessToken;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? '';

    // Never retry the refresh or login endpoints themselves — that is the
    // infinite-loop guard for this interceptor.
    const isExcludedFromRetry = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (status !== 401 || !config || config._retry || isExcludedFromRetry) {
      return Promise.reject(error);
    }

    config._retry = true;

    if (!inFlightRefresh) {
      inFlightRefresh = refreshAccessToken().finally(() => {
        inFlightRefresh = null;
      });
    }

    const newAccessToken = await inFlightRefresh;

    if (!newAccessToken) {
      localStorage.removeItem('@Beholder:accessToken');
      localStorage.removeItem('@Beholder:refreshToken');
      setAccessToken(null);
      onSilentSignOut?.();
      return Promise.reject(error);
    }

    config.headers.set('Authorization', `Bearer ${newAccessToken}`);
    return api(config);
  },
);
