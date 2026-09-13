import { useEffect, useState } from 'react';

import { api } from '@/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface MeResponse {
  id: string;
  email: string;
}

export default function Dashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ data: MeResponse }>('/auth/me')
      .then((response) => {
        if (!cancelled) {
          setEmail(response.data.data.email);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Não foi possível carregar os dados da sessão.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-lg">
      <Card>
        <CardHeader>
          <CardTitle>Sessão ativa</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-role-body text-destructive">{error}</p>}
          {!error && <p className="text-role-body">{email ?? 'Carregando…'}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados de mercado em tempo real</CardTitle>
          <CardDescription>
            Mini ticker, book de ofertas e saldo chegam na Fase 2 deste projeto — esta versão
            prova apenas o fluxo de login autenticado ponta a ponta.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
