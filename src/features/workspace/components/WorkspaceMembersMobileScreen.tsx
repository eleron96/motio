import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { ArrowDownUp } from 'lucide-react';
import type { Assignee } from '@/features/planner/types/planner';
import type { AccessMember } from '@/features/workspace/hooks/useWorkspaceAccess';
import { matchesWorkspaceMemberSearch } from '@/shared/domain/workspaceMemberSearch';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { SearchInput } from '@/shared/ui/SearchInput';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { Badge } from '@/shared/ui/badge';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

type MemberSortKey = 'member' | 'role' | 'group' | 'status';

interface WorkspaceMembersMobileScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeMembers: AccessMember[];
  disabledMembers: AccessMember[];
  membersLoading: boolean;
  assigneeByUserId: Map<string, Assignee>;
  groupNameById: Map<string, string>;
  roleLabels: Record<string, string>;
  ownerId: string | null;
  currentUserId: string | null;
  onOpenMember: (member: AccessMember) => void;
}

/**
 * The people of a workspace, as a list a thumb can get through.
 *
 * Every control that used to live inside a row — two selects, a switch, a menu —
 * moved to the member's own screen, so a row is back to being a name you tap.
 * Sorting appears here for the first time on a phone: on the desktop it hangs
 * off the table headers, which are hidden below `md`.
 */
export const WorkspaceMembersMobileScreen: React.FC<WorkspaceMembersMobileScreenProps> = ({
  open,
  onOpenChange,
  activeMembers,
  disabledMembers,
  membersLoading,
  assigneeByUserId,
  groupNameById,
  roleLabels,
  ownerId,
  currentUserId,
  onOpenMember,
}) => {
  const [tab, setTab] = useState<'active' | 'disabled'>('active');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<MemberSortKey>('member');
  const [sortPickerOpen, setSortPickerOpen] = useState(false);

  const sortOptions: MobilePickerOption[] = [
    { value: 'member', label: t`Member` },
    { value: 'role', label: t`Role` },
    { value: 'group', label: t`Group` },
    { value: 'status', label: t`Status` },
  ];

  const groupNameOf = (member: AccessMember) => (
    member.groupId ? (groupNameById.get(member.groupId) ?? t`No group`) : t`No group`
  );

  const visible = useMemo(() => {
    const source = tab === 'active' ? activeMembers : disabledMembers;
    const filtered = source.filter((member) => matchesWorkspaceMemberSearch({
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      groupName: member.groupId ? (groupNameById.get(member.groupId) ?? null) : null,
    }, search));

    const valueOf = (member: AccessMember) => {
      switch (sortKey) {
        case 'role':
          return member.role ?? '';
        case 'group':
          return groupNameOf(member);
        case 'status':
          return (assigneeByUserId.get(member.userId)?.isActive ?? true) ? t`Active` : t`Disabled`;
        case 'member':
        default:
          return member.displayName || member.email || '';
      }
    };

    return [...filtered].sort((left, right) => {
      const compared = valueOf(left).localeCompare(valueOf(right), undefined, { sensitivity: 'base' });
      if (compared !== 0) return compared;
      return (left.email ?? '').localeCompare(right.email ?? '', undefined, { sensitivity: 'base' });
    });
    // groupNameOf reads the same maps the deps already cover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers, assigneeByUserId, disabledMembers, groupNameById, search, sortKey, tab]);

  return (
    <>
      <MobileScreenShell
        open={open}
        onOpenChange={onOpenChange}
        title={t`Members`}
        toolbar={(
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder={t`Search people...`}
                className="min-w-0 flex-1"
                inputClassName="h-11 rounded-xl text-sm"
                clearLabel={t`Clear search`}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              <button
                type="button"
                onClick={() => setSortPickerOpen(true)}
                aria-label={t`Sort`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-input text-muted-foreground active:bg-muted/60"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>
            <SegmentedControl surface="filled" className="w-full">
              <SegmentedControlItem
                size="touch"
                fullWidth
                active={tab === 'active'}
                onClick={() => setTab('active')}
                className="gap-2"
              >
                {t`Active`}
                <Badge variant="secondary" size="xs" className="tabular-nums">
                  {activeMembers.length}
                </Badge>
              </SegmentedControlItem>
              <SegmentedControlItem
                size="touch"
                fullWidth
                active={tab === 'disabled'}
                onClick={() => setTab('disabled')}
                className="gap-2"
              >
                {t`Disabled`}
                <Badge variant="secondary" size="xs" className="tabular-nums">
                  {disabledMembers.length}
                </Badge>
              </SegmentedControlItem>
            </SegmentedControl>
          </div>
        )}
      >
        {membersLoading && visible.length === 0 ? (
          <p className="px-1.5 py-6 text-sm text-muted-foreground">{t`Loading members...`}</p>
        ) : visible.length === 0 ? (
          <p className="px-1.5 py-6 text-sm text-muted-foreground">
            {search.trim()
              ? t`No matches.`
              : tab === 'active'
                ? t`No active members.`
                : t`No disabled members.`}
          </p>
        ) : (
          <MobileListGroup>
            {visible.map((member) => {
              const isOwner = Boolean(ownerId && member.userId === ownerId);
              const isSelf = Boolean(currentUserId && member.userId === currentUserId);
              const name = member.displayName || member.email;
              const roleLabel = roleLabels[member.role] ?? member.role;

              return (
                <MobileListRow
                  key={member.userId}
                  leading={(
                    <PersonAvatar
                      userId={member.userId}
                      name={name}
                      avatarUrl={member.avatarUrl}
                      colorSeed={member.userId}
                      size="md"
                      className="shrink-0"
                    />
                  )}
                  title={isSelf ? `${name} ${t`(you)`}` : name}
                  subtitle={`${roleLabel} · ${groupNameOf(member)}`}
                  value={isOwner ? t`Owner` : undefined}
                  chevron
                  onClick={() => onOpenMember(member)}
                />
              );
            })}
          </MobileListGroup>
        )}
      </MobileScreenShell>

      <MobilePickerScreen
        open={sortPickerOpen}
        onOpenChange={setSortPickerOpen}
        title={t`Sort`}
        options={sortOptions}
        value={sortKey}
        onValueChange={(value) => setSortKey(value as MemberSortKey)}
      />
    </>
  );
};
