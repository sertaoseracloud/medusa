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
    },
  };
});

function renderApp(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
  });

  it('submits valid credentials and renders the dashboard', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: { id: 'user-1', email: 'engcfraposo@gmail.com' },
        },
        message: 'Success',
        timestamp: new Date().toISOString(),
      },
    });
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: { id: 'user-1', email: 'engcfraposo@gmail.com' } },
    });

    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Email'), 'engcfraposo@gmail.com');
    await user.type(screen.getByLabelText('Senha'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'engcfraposo@gmail.com',
      password: 'correct-password',
    });

    await waitFor(() => {
      expect(screen.getByText('Sessão ativa')).toBeInTheDocument();
    });
  });

  it('keeps the login form mounted and shows the 401 message on wrong credentials', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { data: null, message: 'Email ou senha incorretos.' } },
    });

    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Email'), 'engcfraposo@gmail.com');
    await user.type(screen.getByLabelText('Senha'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('Email ou senha incorretos.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows the rate-limit message on a 429 response', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          data: null,
          message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        },
      },
    });

    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Email'), 'engcfraposo@gmail.com');
    await user.type(screen.getByLabelText('Senha'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'),
      ).toBeInTheDocument();
    });
  });

  it('renders an inline message under the email field and issues no request for an empty email', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText('Senha'), 'some-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Email é obrigatório.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
