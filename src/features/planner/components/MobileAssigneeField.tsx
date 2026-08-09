import React from 'react';
import { ChevronDown } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { getPersonMonogram } from '@/shared/domain/personName';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

/** Sentinel row that clears the selection instead of adding to it. */
const UNASSIGNED = '__unassigned__';

interface AssigneeOption {
  id: string;
  name: string;
  userId?: string | null;
  avatar?: string | null;
}

interface MobileAssigneeFieldProps {
  /** Summary shown on the closed field ("Unassigned", a name, "3 assignees"). */
  label: string;
  assignees: AssigneeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
}

/**
 * Assignees on a phone: the same full-screen list as the project field, but with
 * checkboxes — a popover of checkboxes inside a scrolling form is a fiddly
 * target, and its inner scroller cannot be reached by finger at all.
 */
export const MobileAssigneeField: React.FC<MobileAssigneeFieldProps> = ({
  label,
  assignees,
  selectedIds,
  onChange,
  disabled = false,
  emptyLabel,
}) => {
  const [open, setOpen] = React.useState(false);

  const options: MobilePickerOption[] = [
    { value: UNASSIGNED, label: t`Unassigned`, searchText: '' },
    ...assignees.map((assignee) => ({
      value: assignee.id,
      label: assignee.name,
      searchText: assignee.name,
      leading: (
        <PersonAvatar
          assigneeId={assignee.id}
          userId={assignee.userId}
          avatarUrl={assignee.avatar}
          initials={getPersonMonogram(assignee.name, 'U')}
          colorSeed={assignee.userId ?? assignee.id}
          size="sm"
        />
      ),
    })),
  ];

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <MobilePickerScreen
        open={open}
        onOpenChange={setOpen}
        title={t`Assignees`}
        options={options}
        // "Unassigned" is the absence of a selection, so it shows as ticked
        // exactly when nothing else is.
        values={selectedIds.length === 0 ? [UNASSIGNED] : selectedIds}
        onValuesChange={(next) => {
          if (next.includes(UNASSIGNED) && selectedIds.length > 0) {
            onChange([]);
            return;
          }
          onChange(next.filter((id) => id !== UNASSIGNED));
        }}
        searchable={assignees.length > 8}
        searchPlaceholder={t`Search people`}
        emptyLabel={emptyLabel ?? t`No assignees yet.`}
      />
    </>
  );
};
