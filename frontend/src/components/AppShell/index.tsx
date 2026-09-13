import { Outlet, Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth';

export function AppShell() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-xl py-md">
        <span className="text-role-heading">Beholder</span>
        <nav className="flex items-center gap-md">
          <Link to="/settings" className="text-role-body text-primary hover:underline">
            Settings
          </Link>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="destructive" size="sm" onClick={() => signOut()}>
            Sair
          </Button>
        </nav>
      </header>
      <main className="px-xl py-xl">
        <Outlet />
      </main>
    </div>
  );
}
