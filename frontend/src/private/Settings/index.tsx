import { Separator } from '@/components/ui/separator';
import { CredentialsCard } from './Credentials';
import { ChangePasswordCard } from './ChangePassword';

export default function Settings() {
  return (
    <div className="grid gap-lg">
      <h1 className="text-role-display">Configurações</h1>
      <CredentialsCard />
      <Separator />
      <ChangePasswordCard />
    </div>
  );
}
