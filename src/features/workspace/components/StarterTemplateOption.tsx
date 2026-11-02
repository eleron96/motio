import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';

type StarterTemplateOptionProps = {
  icon: LucideIcon;
  title: string;
  summary: string;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One choice in a radio group of templates — the same card in "Create
 * workspace" and in the workspace settings, so a template looks the same
 * wherever it is offered. The group around it carries `role="radiogroup"`.
 */
export const StarterTemplateOption: React.FC<StarterTemplateOptionProps> = ({
  icon: Icon,
  title,
  summary,
  selected,
  onSelect,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={cn(
      'press flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-primary/5',
    )}
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium leading-snug">{title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{summary}</span>
    </span>
  </button>
);
