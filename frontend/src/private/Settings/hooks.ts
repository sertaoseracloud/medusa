import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';

import { api } from '@/api';

export interface SettingsDto {
  exchangeId: 'binance';
  configured: boolean;
  accessKeyMasked: string | null;
  secretKeyMasked: string | null;
  updatedAt: string | null;
}

export type SettingsErrorCode =
  | 'EXCHANGE_AUTH'
  | 'EXCHANGE_PERMISSION'
  | 'EXCHANGE_UNAVAILABLE'
  | 'EXCHANGE_UNKNOWN';

export interface SettingsSaveFieldError {
  field: string;
  message: string;
}

export interface SettingsSaveError {
  code?: SettingsErrorCode;
  fields?: SettingsSaveFieldError[];
  message: string;
}

export interface UseSettingsResult {
  settings: SettingsDto | null;
  isLoading: boolean;
  error: string | null;
  save(input: { accessKey: string; secretKey: string }): Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await api.get<{ data: SettingsDto }>('/settings/credentials');
        if (!cancelled) {
          setSettings(response.data.data);
        }
      } catch {
        if (!cancelled) {
          setError('Não foi possível carregar as configurações.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async ({ accessKey, secretKey }: { accessKey: string; secretKey: string }) => {
    try {
      const response = await api.put<{ data: SettingsDto }>('/settings/credentials', {
        accessKey,
        secretKey,
      });
      setSettings(response.data.data);
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data as
          | { data?: { code?: SettingsErrorCode; fields?: SettingsSaveFieldError[] }; message?: string }
          | undefined;

        const saveError: SettingsSaveError = {
          code: data?.data?.code,
          fields: data?.data?.fields,
          message: data?.message ?? 'Não foi possível salvar as credenciais.',
        };

        throw saveError;
      }

      throw { message: 'Não foi possível salvar as credenciais.' } satisfies SettingsSaveError;
    }
  }, []);

  return { settings, isLoading, error, save };
}
