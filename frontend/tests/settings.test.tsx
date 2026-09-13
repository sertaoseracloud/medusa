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

const FIXTURE_SECRET = 'super-secret-value-ab12';

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function mockAuthenticatedBootstrap() {
  localStorage.setItem('@Beholder:accessToken', 'access-token');
  localStorage.setItem('@Beholder:refreshToken', 'refresh-token');
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/auth/me') {
      return Promise.resolve({ data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } } });
    }
    if (url === '/settings/credentials') {
      return Promise.resolve({
        data: {
          data: {
            exchangeId: 'binance',
            configured: false,
            accessKeyMasked: null,
            secretKeyMasked: null,
            updatedAt: null,
          },
        },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the credenciais card title', async () => {
    mockAuthenticatedBootstrap();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Credenciais da Binance')).toBeInTheDocument();
    });
  });

  it('renders the masked secretKeyMasked for configured credenciais without the full fixture secret', async () => {
    localStorage.setItem('@Beholder:accessToken', 'access-token');
    localStorage.setItem('@Beholder:refreshToken', 'refresh-token');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } } });
      }
      if (url === '/settings/credentials') {
        return Promise.resolve({
          data: {
            data: {
              exchangeId: 'binance',
              configured: true,
              accessKeyMasked: '••••••••••••ab12',
              secretKeyMasked: '••••••••••••ab12',
              updatedAt: new Date().toISOString(),
            },
          },
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('secret-key-masked')).toHaveTextContent('••••••••••••ab12');
    });

    expect(document.body.textContent).not.toContain(FIXTURE_SECRET);
  });

  it('submits credenciais with exactly one PUT and disables the button while pending', async () => {
    mockAuthenticatedBootstrap();
    let resolvePut: (value: unknown) => void = () => {};
    vi.mocked(api.put).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Credenciais da Binance')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Chave de acesso (accessKey)'), 'access-key-value-16chars');
    await user.type(screen.getByLabelText('Chave secreta (secretKey)'), 'secret-key-value-16chars');

    const submitButton = screen.getByRole('button', { name: /Salvar credenciais/ });
    await user.click(submitButton);

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(submitButton).toBeDisabled();

    resolvePut({
      data: {
        data: {
          exchangeId: 'binance',
          configured: true,
          accessKeyMasked: '••••••••••••1234',
          secretKeyMasked: '••••••••••••1234',
          updatedAt: new Date().toISOString(),
        },
      },
    });

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the invalid-key message for a credenciais EXCHANGE_AUTH failure', async () => {
    mockAuthenticatedBootstrap();
    vi.mocked(api.put).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          data: { code: 'EXCHANGE_AUTH' },
          message:
            'Chave ou segredo inválidos. Verifique as credenciais geradas no painel da Binance e tente novamente.',
        },
      },
    });

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Credenciais da Binance')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Chave de acesso (accessKey)'), 'access-key-value-16chars');
    await user.type(screen.getByLabelText('Chave secreta (secretKey)'), 'secret-key-value-16chars');
    await user.click(screen.getByRole('button', { name: /Salvar credenciais/ }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Chave ou segredo inválidos. Verifique as credenciais geradas no painel da Binance e tente novamente.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renders the unavailable message for a credenciais EXCHANGE_UNAVAILABLE failure', async () => {
    mockAuthenticatedBootstrap();
    vi.mocked(api.put).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 503,
        data: {
          data: { code: 'EXCHANGE_UNAVAILABLE' },
          message:
            'Não foi possível conectar à Binance agora (timeout ou serviço indisponível). Tente novamente em alguns instantes.',
        },
      },
    });

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Credenciais da Binance')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Chave de acesso (accessKey)'), 'access-key-value-16chars');
    await user.type(screen.getByLabelText('Chave secreta (secretKey)'), 'secret-key-value-16chars');
    await user.click(screen.getByRole('button', { name: /Salvar credenciais/ }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Não foi possível conectar à Binance agora (timeout ou serviço indisponível). Tente novamente em alguns instantes.',
        ),
      ).toBeInTheDocument();
    });
  });
});
