import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';

/** Every tappable row is at least this tall — a comfortable thumb target. */
export const MOBILE_ROW_HEIGHT = 56;

interface MobileListGroupProps {
  /** Small uppercase caption above the card. */
  title?: React.ReactNode;
  /** Explanatory line under the card. */
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * A card of rows in the iOS grouped-list idiom: caption, rounded card, hairline
 * separators inset past the icon column, optional footnote.
 */
export const MobileListGroup: React.FC<MobileListGroupProps> = ({ title, note, className, children }) => {
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <div className={className}>
      {title && (
        <div className="mx-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div className="ml-4 h-px bg-border" />}
            {row}
          </React.Fragment>
        ))}
      </div>
      {note && <p className="mx-1.5 mt-2 text-xs leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
};

interface MobileListRowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned secondary text (current value, count). */
  value?: React.ReactNode;
  /** Right-aligned control (switch, stepper) — rendered after `value`. */
  right?: React.ReactNode;
  /** Unread-style counter next to the title. */
  badge?: number;
  chevron?: boolean;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  className?: string;
}

export const MobileListRow: React.FC<MobileListRowProps> = ({
  icon,
  title,
  subtitle,
  value,
  right,
  badge,
  chevron,
  onClick,
  tone = 'default',
  disabled,
  className,
}) => {
  const danger = tone === 'danger';
  const content = (
    <>
      {icon && (
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]',
            danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold leading-tight">{title}</span>
          {badge != null && badge > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-xs leading-snug text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {value != null && (
        <span className="max-w-[140px] shrink-0 truncate text-sm text-muted-foreground">{value}</span>
      )}
      {right}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />}
    </>
  );

  const rowClassName = cn(
    'flex w-full items-center gap-3 px-4 py-2.5 text-left',
    danger ? 'text-destructive' : 'text-foreground',
    onClick && !disabled && 'active:bg-muted/60',
    disabled && 'opacity-50',
    className,
  );

  if (!onClick) {
    return (
      <div className={rowClassName} style={{ minHeight: MOBILE_ROW_HEIGHT }}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        rowClassName,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
      style={{ minHeight: MOBILE_ROW_HEIGHT }}
    >
      {content}
    </button>
  );
};
