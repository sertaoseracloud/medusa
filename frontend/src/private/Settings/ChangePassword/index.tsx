import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { isAxiosError } from 'axios';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth';

const MIN_NEW_PASSWORD_LENGTH = 12;

interface FieldErrors {
  newPassword?: string;
}

export function ChangePasswordCard() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    if (newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
      setFieldErrors({ newPassword: 'A nova senha deve ter ao menos 12 caracteres.' });
      return false;
    }
    setFieldErrors({});
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await changePassword({ currentPassword, newPassword });
      navigate('/login', { replace: true });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setFormError('Email ou senha incorretos.');
      } else {
        setFormError('Não foi possível atualizar a senha agora. Tente novamente em instantes.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-role-heading">Trocar senha</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-md">
        <Alert variant="destructive">
          <AlertDescription>
            Atenção: esta senha será revertida para o valor da variável de ambiente no próximo restart
            do servidor, caso a variável não seja atualizada junto.
          </AlertDescription>
        </Alert>

        <form className="grid gap-md" onSubmit={handleSubmit} noValidate>
          <FormItem>
            <FormLabel htmlFor="currentPassword">Senha atual</FormLabel>
            <FormControl>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </FormControl>
          </FormItem>

          <FormItem>
            <FormLabel htmlFor="newPassword">Nova senha</FormLabel>
            <FormControl>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.newPassword)}
              />
            </FormControl>
            <FormMessage>{fieldErrors.newPassword}</FormMessage>
          </FormItem>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Atualizando...' : 'Atualizar senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
