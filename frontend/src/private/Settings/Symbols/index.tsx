import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';

import { api } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormControl, FormItem, FormLabel } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SymbolRow {
  symbol: string;
  base: string;
  quote: string;
  basePrecision: number;
  quotePrecision: number;
  minNotional: string | null;
  minLotSize: string | null;
  isFavorite: boolean;
  syncedAt: string;
}

interface ListSymbolsResponse {
  symbols: SymbolRow[];
  count: number;
  lastSyncedAt: string | null;
}

interface SyncSymbolsResponse {
  count: number;
  lastSyncedAt: string;
}

const EXCHANGE_UNAVAILABLE_MESSAGE =
  'Não foi possível conectar à Binance agora (timeout ou serviço indisponível). Tente novamente em alguns instantes.';

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function SymbolsCard() {
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [count, setCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quoteFilter, setQuoteFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const loadSymbols = useCallback(async () => {
    try {
      const response = await api.get<{ data: ListSymbolsResponse }>('/symbols');
      setSymbols(response.data.data.symbols);
      setCount(response.data.data.count);
      setLastSyncedAt(response.data.data.lastSyncedAt);
    } catch {
      // A failed initial load is treated the same as "nothing synced yet" —
      // the empty state / retry affordance covers this case.
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSymbols();
  }, [loadSymbols]);

  const handleSync = async () => {
    setStatus('syncing');
    setErrorMessage(null);

    try {
      const response = await api.post<{ data: SyncSymbolsResponse }>('/symbols/sync');
      setCount(response.data.data.count);
      setLastSyncedAt(response.data.data.lastSyncedAt);
      setStatus('success');
      await loadSymbols();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 503) {
        setErrorMessage(EXCHANGE_UNAVAILABLE_MESSAGE);
      } else {
        setErrorMessage('Não foi possível sincronizar os símbolos agora. Tente novamente em instantes.');
      }
      setStatus('error');
    }
  };

  const filteredSymbols = useMemo(() => {
    return symbols.filter((row) => {
      if (quoteFilter && row.quote !== quoteFilter) return false;
      if (searchFilter && !row.symbol.toLowerCase().includes(searchFilter.toLowerCase())) return false;
      return true;
    });
  }, [symbols, quoteFilter, searchFilter]);

  const isEmpty = hasLoaded && count === 0 && status !== 'error';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-md">
        <CardTitle className="text-role-heading">Sincronização de símbolos</CardTitle>
        {status === 'syncing' && <Badge variant="secondary">Sincronizando…</Badge>}
        {status === 'error' && (
          <Badge
            variant="destructive"
            role="button"
            tabIndex={0}
            onClick={() => void handleSync()}
            className="cursor-pointer"
          >
            Sincronização inicial falhou — clique para tentar novamente
          </Badge>
        )}
        {status !== 'syncing' && status !== 'error' && count > 0 && <Badge>Sincronizado</Badge>}
      </CardHeader>
      <CardContent className="grid gap-md">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {isEmpty ? (
          <div className="grid gap-sm">
            <p className="text-role-heading">Nenhum símbolo sincronizado ainda</p>
            <p className="text-role-body">
              {'A sincronização automática ocorre na próxima inicialização do servidor. Clique em "Sincronizar agora" para forçar a sincronização imediatamente.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-sm">
            <p className="text-role-body" data-testid="symbol-count">
              {count} símbolo(s) sincronizado(s)
            </p>
            {lastSyncedAt && (
              <p className="text-role-body" data-testid="last-synced-at">
                Última sincronização: {new Date(lastSyncedAt).toLocaleString('pt-BR')}
              </p>
            )}

            <div className="grid grid-cols-2 gap-md">
              <FormItem>
                <FormLabel htmlFor="symbol-quote-filter">Moeda de cotação</FormLabel>
                <FormControl>
                  <Input
                    id="symbol-quote-filter"
                    value={quoteFilter}
                    onChange={(event) => setQuoteFilter(event.target.value)}
                    placeholder="USDT"
                  />
                </FormControl>
              </FormItem>
              <FormItem>
                <FormLabel htmlFor="symbol-search-filter">Buscar símbolo</FormLabel>
                <FormControl>
                  <Input
                    id="symbol-search-filter"
                    value={searchFilter}
                    onChange={(event) => setSearchFilter(event.target.value)}
                    placeholder="BTC/USDT"
                  />
                </FormControl>
              </FormItem>
            </div>

            <ul className="grid gap-1" data-testid="symbol-list">
              {filteredSymbols.map((row) => (
                <li key={row.symbol} className="text-role-body">
                  {row.symbol}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="button"
          disabled={status === 'syncing'}
          onClick={() => void handleSync()}
          className="w-full"
        >
          {status === 'syncing' ? 'Sincronizando...' : 'Sincronizar agora'}
        </Button>
      </CardContent>
    </Card>
  );
}
