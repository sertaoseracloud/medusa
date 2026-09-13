import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Placeholder scaffolded in Task 1 to prove the routed app shell + design system build.
// Task 2 replaces this with the real form wired to POST /auth/login.
export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-md">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-role-display text-center">Beholder</CardTitle>
        </CardHeader>
        <CardContent>
          <Button className="w-full" disabled>
            Entrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
