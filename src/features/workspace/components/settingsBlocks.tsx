import React from 'react';
import { Label } from '@/shared/ui/label';

/** A settings sub-block: a heading (and optional description) above its controls. */
export const Block: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
);

/** Reference-style row: label + description on the left, control on the right. */
export const SettingRow: React.FC<{
  title: React.ReactNode;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}> = ({
  title,
  description,
  htmlFor,
  children,
}) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0 space-y-0.5">
      <Label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {title}
      </Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);
