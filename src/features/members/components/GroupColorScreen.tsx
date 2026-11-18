import React from 'react';
import { t } from '@lingui/macro';
import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { ColorDot } from '@/shared/ui/color-dot';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { GROUP_PRESET_COLORS, toGroupMarkColor } from '@/shared/domain/groupColor';

interface GroupColorScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  /** The colour in effect — picked or automatic. */
  color: string | null;
  /** False while the group is on its automatic colour. */
  hasOwnColor: boolean;
  /** `null` hands the group back to the automatic colour. */
  onSelect: (color: string | null) => void;
  loading?: boolean;
}

/**
 * A group's colour on a phone: a screen of swatches a thumb can hit, instead of
 * the small popover the desktop uses. Picking closes the screen — it is a
 * one-tap choice, like every other picker screen.
 */
export const GroupColorScreen: React.FC<GroupColorScreenProps> = ({
  open,
  onOpenChange,
  groupName,
  color,
  hasOwnColor,
  onSelect,
  loading = false,
}) => {
  const choose = (next: string | null) => {
    if (loading) return;
    onSelect(next);
    onOpenChange(false);
  };

  const pickedColor = hasOwnColor && color ? color.toLowerCase() : null;

  return (
    <MobileScreenShell open={open} onOpenChange={onOpenChange} title={t`Group colour`}>
      <div className="space-y-5">
        <MobileListGroup
          title={(
            <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
              <ColorDot color={color ? toGroupMarkColor(color) : null} className="h-2.5 w-2.5" />
              <span className="truncate text-xs font-medium text-foreground">{groupName}</span>
            </span>
          )}
        >
          <div className="grid grid-cols-5 justify-items-center gap-y-1 px-2 py-3">
            {GROUP_PRESET_COLORS.map((preset, index) => {
              const selected = pickedColor === preset.toLowerCase();
              const number = index + 1;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={loading}
                  aria-label={t`Colour ${number}`}
                  aria-pressed={selected}
                  data-testid={`group-color-${preset}`}
                  onClick={() => choose(preset)}
                  className="press inline-flex h-12 w-12 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-full text-white',
                      selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                    )}
                    style={{ backgroundColor: toGroupMarkColor(preset) }}
                  >
                    {selected && <Check className="h-4 w-4" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
        </MobileListGroup>

        <MobileListGroup note={t`Motio picks a colour no other group uses.`}>
          <MobileListRow
            title={t`Automatic colour`}
            right={!hasOwnColor ? <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> : undefined}
            selected={!hasOwnColor}
            disabled={loading}
            onClick={() => choose(null)}
          />
        </MobileListGroup>
      </div>
    </MobileScreenShell>
  );
};
