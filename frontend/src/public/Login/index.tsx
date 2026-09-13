import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { isAxiosError } from 'axios';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};

    if (!email) {
      errors.email = 'Email é obrigatório.';
    } else if (!EMAIL_FORMAT.test(email)) {
      errors.email = 'Formato de email inválido';
    }

    if (!password) {
      errors.password = 'Senha é obrigatória.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn({ email, password });
      navigate('/', { replace: true });
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;

        if (status === 400 && Array.isArray(data?.data?.fields)) {
          const nextErrors: FieldErrors = {};
          for (const field of data.data.fields as { field: string; message: string }[]) {
            if (field.field === 'email' || field.field === 'password') {
              nextErrors[field.field] = field.message;
            }
          }
          setFieldErrors(nextErrors);
        } else if (status === 401) {
          setFormError('Email ou senha incorretos.');
        } else if (status === 429) {
          setFormError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
        } else {
          setFormError('Não foi possível entrar agora. Tente novamente em instantes.');
        }
      } else {
        setFormError('Não foi possível entrar agora. Tente novamente em instantes.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-md">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-role-display text-center">Beholder</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-md" onSubmit={handleSubmit} noValidate>
            <FormItem>
              <FormLabel htmlFor="email">Email</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
              </FormControl>
              <FormMessage>{fieldErrors.email}</FormMessage>
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="password">Senha</FormLabel>
              <FormControl>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
              </FormControl>
              <FormMessage>{fieldErrors.password}</FormMessage>
            </FormItem>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
