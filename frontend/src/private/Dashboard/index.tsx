import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Placeholder scaffolded in Task 1 to prove the routed app shell + design system build.
// Task 2 replaces this with the real GET /auth/me round trip.
export default function Dashboard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessão ativa</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-role-body text-muted-foreground">Carregando…</p>
      </CardContent>
    </Card>
  );
}
