import React from 'react';
import { cn } from '@/shared/lib/classNames';

const ROUND = 36;
const GAP = 6;
const PILL_PADDING_LEFT = 12;
const PILL_PADDING_RIGHT = 14;
const PILL_ICON_GAP = 6;
const TRANSITION = 'width 320ms cubic-bezier(.4,.8,.3,1.05), padding 320ms cubic-bezier(.4,.8,.3,1.05), background-color 200ms ease, color 200ms ease';

export interface MobilePillSubnavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface MobilePillSubnavProps {
  items: MobilePillSubnavItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}

interface PillProps {
  item: MobilePillSubnavItem;
  active: boolean;
  width: number;
  onClick: () => void;
}

const Pill: React.FC<PillProps> = ({ item, active, width, onClick }) => {
  const hasIcon = Boolean(item.icon);
  // Without icons we always show the label so users can see all sections.
  // With icons, inactive items collapse to a circle and only the active one
  // shows its label — same expanding-pill mechanic as WorkspacePillNav.
  const showLabel = active || !hasIcon;
  const targetWidth = active && hasIcon
    ? ROUND + PILL_ICON_GAP + PILL_PADDING_RIGHT + width
    : (hasIcon ? ROUND : ROUND + PILL_PADDING_LEFT + PILL_PADDING_RIGHT + width);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={item.label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-full text-ui-sm font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-foreground hover:bg-muted/80',
        showLabel && hasIcon ? 'justify-start' : 'justify-center',
      )}
      style={{
        height: ROUND,
        width: targetWidth,
        paddingLeft: showLabel && hasIcon ? PILL_PADDING_LEFT : (hasIcon ? 0 : PILL_PADDING_LEFT),
        paddingRight: showLabel ? PILL_PADDING_RIGHT : 0,
        gap: PILL_ICON_GAP,
        transition: TRANSITION,
      }}
    >
      {hasIcon ? (
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
          {item.icon}
        </span>
      ) : null}
      {showLabel ? <span className="leading-none">{item.label}</span> : null}
    </button>
  );
};

export const MobilePillSubnav: React.FC<MobilePillSubnavProps> = ({
  items,
  activeId,
  onChange,
  className,
  ariaLabel,
}) => {
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const [labelWidths, setLabelWidths] = React.useState<Record<string, number>>({});

  React.useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const next: Record<string, number> = {};
    Array.from(node.children).forEach((el) => {
      const span = el as HTMLElement;
      const id = span.dataset.id;
      if (id) next[id] = span.offsetWidth;
    });
    setLabelWidths((prev) => {
      const same = Object.keys(next).every((k) => prev[k] === next[k])
        && Object.keys(prev).length === Object.keys(next).length;
      return same ? prev : next;
    });
  }, [items]);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'flex w-full items-center overflow-x-auto px-3 py-2 [&::-webkit-scrollbar]:hidden',
        className,
      )}
      style={{ gap: GAP, scrollbarWidth: 'none' }}
    >
      {items.map((item) => (
        <Pill
          key={item.id}
          item={item}
          active={item.id === activeId}
          width={labelWidths[item.id] ?? 60}
          onClick={() => onChange(item.id)}
        />
      ))}

      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap text-ui-sm font-semibold"
        style={{ left: -9999, top: -9999 }}
      >
        {items.map((item) => (
          <span key={item.id} data-id={item.id}>{item.label}</span>
        ))}
      </div>
    </nav>
  );
};
