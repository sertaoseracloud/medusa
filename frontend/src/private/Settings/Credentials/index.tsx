import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSettings, type SettingsErrorCode, type SettingsSaveError } from '../hooks';

const ERROR_MESSAGES: Record<SettingsErrorCode, string> = {
  EXCHANGE_AUTH:
    'Chave ou segredo inválidos. Verifique as credenciais geradas no painel da Binance e tente novamente.',
  EXCHANGE_PERMISSION:
    'As credenciais são válidas, mas não têm permissão de leitura de saldo. Habilite essa permissão no painel da Binance.',
  EXCHANGE_UNAVAILABLE:
    'Não foi possível conectar à Binance agora (timeout ou serviço indisponível). Tente novamente em alguns instantes.',
  EXCHANGE_UNKNOWN: 'Ocorreu um erro inesperado ao se comunicar com a exchange. Tente novamente mais tarde.',
};

interface FieldErrors {
  accessKey?: string;
  secretKey?: string;
}

export function CredentialsCard() {
  const { settings, save } = useSettings();

  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setFieldErrors({});

    setIsSubmitting(true);

    try {
      await save({ accessKey, secretKey });
      setSuccessMessage('Credenciais salvas com sucesso.');
      setAccessKey('');
      setSecretKey('');
    } catch (err) {
      const saveError = err as SettingsSaveError;

      if (saveError.fields && saveError.fields.length > 0) {
        const nextErrors: FieldErrors = {};
        for (const field of saveError.fields) {
          if (field.field === 'accessKey' || field.field === 'secretKey') {
            nextErrors[field.field] = field.message;
          }
        }
        setFieldErrors(nextErrors);
      } else if (saveError.code && saveError.code in ERROR_MESSAGES) {
        setFormError(ERROR_MESSAGES[saveError.code]);
      } else {
        setFormError('Não foi possível salvar as credenciais. Tente novamente em instantes.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-role-heading">Credenciais da Binance</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-md">
        {settings?.configured && (
          <div className="grid gap-sm">
            <p className="text-role-label">Chave de acesso atual</p>
            <p className="text-role-body" data-testid="access-key-masked">
              {settings.accessKeyMasked}
            </p>
            <p className="text-role-label">Chave secreta atual</p>
            <p className="text-role-body" data-testid="secret-key-masked">
              {settings.secretKeyMasked}
            </p>
          </div>
        )}

        <form className="grid gap-md" onSubmit={handleSubmit} noValidate>
          <FormItem>
            <FormLabel htmlFor="accessKey">Chave de acesso (accessKey)</FormLabel>
            <FormControl>
              <Input
                id="accessKey"
                type="text"
                autoComplete="off"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
                aria-invalid={Boolean(fieldErrors.accessKey)}
              />
            </FormControl>
            <FormMessage>{fieldErrors.accessKey}</FormMessage>
          </FormItem>

          <FormItem>
            <FormLabel htmlFor="secretKey">Chave secreta (secretKey)</FormLabel>
            <FormControl>
              <Input
                id="secretKey"
                type="password"
                autoComplete="off"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                aria-invalid={Boolean(fieldErrors.secretKey)}
              />
            </FormControl>
            <FormMessage>{fieldErrors.secretKey}</FormMessage>
          </FormItem>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Salvando...' : 'Salvar credenciais'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
