import * as React from 'react';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

// Lightweight form primitives (no react-hook-form dependency — this app uses
// plain controlled inputs + inline per-field error state, per 01-UI-SPEC.md D-25).

function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="form-item" className={cn('grid gap-sm', className)} {...props} />;
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="form-label" className={cn(className)} {...props} />;
}

function FormControl({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="form-control" className={cn(className)} {...props} />;
}

function FormMessage({ className, children, ...props }: React.ComponentProps<'p'>) {
  if (!children) return null;

  return (
    <p
      data-slot="form-message"
      className={cn('text-role-body text-destructive', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export { FormItem, FormLabel, FormControl, FormMessage };
