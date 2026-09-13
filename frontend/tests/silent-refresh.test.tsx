import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { InternalAxiosRequestConfig } from 'axios';

import { api } from '@/api';
import { AuthProvider } from '@/contexts/auth';
import { AppRoutes } from '@/routes';

interface MockResult {
  status: number;
  data?: unknown;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const routes = new Map<string, (config: RetriableConfig) => MockResult | Promise<MockResult>>();
const callCounts = new Map<string, number>();

function mockRoute(url: string, handler: (config: RetriableConfig) => MockResult | Promise<MockResult>): void {
  routes.set(url, handler);
}

function callCount(url: string): number {
  return callCounts.get(url) ?? 0;
}

beforeEach(() => {
  localStorage.clear();
  routes.clear();
  callCounts.clear();

  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    callCounts.set(url, (callCounts.get(url) ?? 0) + 1);

    const handler = routes.get(url);
    if (!handler) {
      throw new Error(`No mock route registered for ${url}`);
    }

    const result = await handler(config as RetriableConfig);

    if (result.status >= 200 && result.status < 300) {
      return {
        data: result.data,
        status: result.status,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    const error = new Error(`Request failed with status ${result.status}`) as Error & {
      isAxiosError: boolean;
      config: InternalAxiosRequestConfig;
      response: { status: number; data: unknown; headers: Record<string, string>; config: InternalAxiosRequestConfig };
    };
    error.isAxiosError = true;
    error.config = config;
    error.response = { status: result.status, data: result.data, headers: {}, config };
    throw error;
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const REFRESH_SUCCESS_BODY = {
  data: {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 900,
  },
  message: 'Success',
  timestamp: new Date().toISOString(),
};

describe('silent background refresh', () => {
  it('advancing the clock to expiresIn - 60 seconds triggers exactly one POST /auth/refresh, and the stored access token afterwards is the new one', async () => {
    vi.useFakeTimers();
    localStorage.setItem('@Beholder:accessToken', 'initial-access-token');
    localStorage.setItem('@Beholder:refreshToken', 'initial-refresh-token');

    mockRoute('/auth/me', () => ({
      status: 200,
      data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } },
    }));
    mockRoute('/auth/refresh', () => ({ status: 200, data: REFRESH_SUCCESS_BODY }));

    renderApp('/');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Dashboard also fetches /auth/me on mount (independent of bootstrap
    // hydration), so both are expected to have fired by this point.
    expect(callCount('/auth/me')).toBeGreaterThanOrEqual(1);
    expect(callCount('/auth/refresh')).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(840 * 1000);
    });

    expect(callCount('/auth/refresh')).toBe(1);
    expect(localStorage.getItem('@Beholder:accessToken')).toBe('new-access-token');
    expect(localStorage.getItem('@Beholder:refreshToken')).toBe('new-refresh-token');
  });

  it('a 401 from /auth/refresh clears both storage keys, renders the login route, and shows no sessão/expired text anywhere (D-10)', async () => {
    vi.useFakeTimers();
    localStorage.setItem('@Beholder:accessToken', 'initial-access-token');
    localStorage.setItem('@Beholder:refreshToken', 'initial-refresh-token');

    mockRoute('/auth/me', () => ({
      status: 200,
      data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } },
    }));
    mockRoute('/auth/refresh', () => ({
      status: 401,
      data: { data: null, message: 'Token revogado.' },
    }));

    renderApp('/');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(callCount('/auth/me')).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(840 * 1000);
    });

    expect(localStorage.getItem('@Beholder:accessToken')).toBeNull();
    expect(localStorage.getItem('@Beholder:refreshToken')).toBeNull();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByText(/sess(ã|a)o|expir/i)).not.toBeInTheDocument();
  });
});

describe('concurrent 401 handling', () => {
  it('three simultaneous 401 responses on data requests produce exactly one /auth/refresh call', async () => {
    localStorage.setItem('@Beholder:accessToken', 'initial-access-token');
    localStorage.setItem('@Beholder:refreshToken', 'initial-refresh-token');

    mockRoute('/data', (config) => {
      if (!config._retry) {
        return { status: 401, data: { data: null, message: 'Token expirado.' } };
      }
      return { status: 200, data: { data: { ok: true } } };
    });
    mockRoute('/auth/refresh', () => ({ status: 200, data: REFRESH_SUCCESS_BODY }));

    const results = await Promise.all([api.get('/data'), api.get('/data'), api.get('/data')]);

    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(callCount('/auth/refresh')).toBe(1);
  });
});

describe('signOut', () => {
  it('issues POST /auth/logout with the stored refresh token, then clears both storage keys even if that call rejects', async () => {
    localStorage.setItem('@Beholder:accessToken', 'initial-access-token');
    localStorage.setItem('@Beholder:refreshToken', 'initial-refresh-token');

    mockRoute('/auth/me', () => ({
      status: 200,
      data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } },
    }));

    let logoutPayload: unknown = null;
    mockRoute('/auth/logout', (config) => {
      logoutPayload = JSON.parse(config.data as string);
      return { status: 500, data: { data: null, message: 'Internal server error' } };
    });

    renderApp('/');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => {
      expect(localStorage.getItem('@Beholder:accessToken')).toBeNull();
    });
    expect(localStorage.getItem('@Beholder:refreshToken')).toBeNull();
    expect(logoutPayload).toEqual({ refreshToken: 'initial-refresh-token' });
  });
});
