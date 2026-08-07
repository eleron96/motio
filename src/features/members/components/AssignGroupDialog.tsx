import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';
import { cn } from '@/shared/lib/classNames';

type GroupOption = {
  id: string;
  name: string;
};

interface AssignGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whose group is being set — named in the dialog so the row is unambiguous. */
  memberName: string;
  groups: GroupOption[];
  currentGroupId: string | null;
  onSelect: (groupId: string) => void;
  loading?: boolean;
  isMobile?: boolean;
}

/** Long lists get a search box; short ones would only gain a dead field. */
const SEARCHABLE_FROM = 8;

/**
 * Picks the group a person belongs to. Only groups are offered — taking someone
 * out is a separate, confirmed action, so it cannot happen by mis-tapping a row
 * in a list of groups.
 */
export const AssignGroupDialog: React.FC<AssignGroupDialogProps> = ({
  open,
  onOpenChange,
  memberName,
  groups,
  currentGroupId,
  onSelect,
  loading = false,
  isMobile = false,
}) => {
  const [search, setSearch] = useState('');
  const searchable = groups.length >= SEARCHABLE_FROM;

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groups, search]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSearch('');
    onOpenChange(next);
  };

  const handleSelect = (groupId: string) => {
    if (loading || groupId === currentGroupId) {
      handleOpenChange(false);
      return;
    }
    onSelect(groupId);
    handleOpenChange(false);
  };

  const title = t`Assign a group`;
  const description = t`Choose the group for ${memberName}.`;

  if (isMobile) {
    const options: MobilePickerOption[] = groups.map((group) => ({
      value: group.id,
      label: group.name,
      note: group.id === currentGroupId ? t`Current` : undefined,
    }));

    return (
      <MobilePickerScreen
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        options={options}
        value={currentGroupId ?? ''}
        onValueChange={handleSelect}
        searchable={searchable}
        searchPlaceholder={t`Search groups...`}
        emptyLabel={t`No groups yet.`}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t`No groups yet. Create one on the Groups tab first.`}
          </p>
        ) : (
          <div className="space-y-3">
            {searchable && (
              <SearchInput
                placeholder={t`Search groups...`}
                value={search}
                onValueChange={setSearch}
                clearLabel={t`Clear search`}
              />
            )}
            {/* A plain scroller, not a Radix one: this list is short, and a
                native overflow always takes a finger on a phone. */}
            <div className="max-h-[320px] overflow-y-auto">
              <div className="space-y-1 pr-1">
                {visibleGroups.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">{t`No groups found.`}</p>
                ) : (
                  visibleGroups.map((group) => {
                    const isCurrent = group.id === currentGroupId;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        disabled={loading}
                        onClick={() => handleSelect(group.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isCurrent ? 'bg-muted font-medium' : 'hover:bg-muted/60',
                          loading && 'opacity-60',
                        )}
                      >
                        <Check className={cn('h-4 w-4 shrink-0', isCurrent ? 'opacity-100' : 'opacity-0')} />
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                        {isCurrent && (
                          <span className="shrink-0 text-xs text-muted-foreground">{t`Current`}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
