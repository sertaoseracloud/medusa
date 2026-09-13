import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { api } from '@/api';
import { AuthProvider } from '@/contexts/auth';
import { AppRoutes } from '@/routes';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
    },
  };
});

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const SETTINGS_RESPONSE = {
  data: {
    data: {
      exchangeId: 'binance',
      configured: false,
      accessKeyMasked: null,
      secretKeyMasked: null,
      updatedAt: null,
    },
  },
};

function mockGetHandler(symbolsResponse: unknown) {
  return (url: string) => {
    if (url === '/auth/me') {
      return Promise.resolve({ data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } } });
    }
    if (url === '/settings/credentials') {
      return Promise.resolve(SETTINGS_RESPONSE);
    }
    if (url === '/symbols') {
      return Promise.resolve(symbolsResponse);
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  };
}

function mockAuthenticatedBootstrap(symbolsResponse: unknown) {
  localStorage.setItem('@Beholder:accessToken', 'access-token');
  localStorage.setItem('@Beholder:refreshToken', 'refresh-token');
  vi.mocked(api.get).mockImplementation(mockGetHandler(symbolsResponse));
}

const EMPTY_SYMBOLS_RESPONSE = {
  data: { data: { symbols: [], count: 0, lastSyncedAt: null } },
};

describe('Symbols panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the exact empty-state heading and body when GET /symbols returns nothing', async () => {
    mockAuthenticatedBootstrap(EMPTY_SYMBOLS_RESPONSE);
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Nenhum símbolo sincronizado ainda')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'A sincronização automática ocorre na próxima inicialização do servidor. Clique em "Sincronizar agora" para forçar a sincronização imediatamente.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking "Sincronizar agora" issues exactly one POST, disables the button while pending, then shows the count and Sincronizado badge', async () => {
    mockAuthenticatedBootstrap(EMPTY_SYMBOLS_RESPONSE);

    let resolvePost: (value: unknown) => void = () => {};
    vi.mocked(api.post).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Sincronização de símbolos')).toBeInTheDocument();
    });

    const syncButton = screen.getByRole('button', { name: /Sincronizar agora/ });
    await user.click(syncButton);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/symbols/sync');
    expect(syncButton).toBeDisabled();
    expect(screen.getByText('Sincronizando…')).toBeInTheDocument();

    // After the sync resolves, the reload calls GET /symbols again — update
    // the mock to reflect the populated table before resolving.
    vi.mocked(api.get).mockImplementation(
      mockGetHandler({
        data: {
          data: {
            symbols: [{ symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT' }],
            count: 1,
            lastSyncedAt: new Date().toISOString(),
          },
        },
      }),
    );

    resolvePost({
      data: { data: { count: 1, lastSyncedAt: new Date().toISOString() } },
    });

    await waitFor(() => {
      expect(screen.getByText('Sincronizado')).toBeInTheDocument();
    });
  });

  it('renders the exchange-unavailable message and the retry badge on a 503 sync failure', async () => {
    mockAuthenticatedBootstrap(EMPTY_SYMBOLS_RESPONSE);
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { data: null, message: 'unavailable' } },
    });

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Sincronização de símbolos')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Sincronizar agora/ }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Não foi possível conectar à Binance agora (timeout ou serviço indisponível). Tente novamente em alguns instantes.',
        ),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText('Sincronização inicial falhou — clique para tentar novamente'),
    ).toBeInTheDocument();
  });

  it('the quote filter narrows the rendered rows', async () => {
    mockAuthenticatedBootstrap({
      data: {
        data: {
          symbols: [
            { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT' },
            { symbol: 'ETH/BUSD', base: 'ETH', quote: 'BUSD' },
          ],
          count: 2,
          lastSyncedAt: new Date().toISOString(),
        },
      },
    });

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
    });
    expect(screen.getByText('ETH/BUSD')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Moeda de cotação'), 'BUSD');

    await waitFor(() => {
      expect(screen.queryByText('BTC/USDT')).not.toBeInTheDocument();
    });
    expect(screen.getByText('ETH/BUSD')).toBeInTheDocument();
  });
});
