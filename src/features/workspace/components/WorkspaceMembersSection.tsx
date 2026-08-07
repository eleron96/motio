import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { Badge } from '@/shared/ui/badge';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { splitMembersByAccess } from '@/shared/domain/workspaceMemberAccess';
import { WorkspaceMembersPanel } from '@/features/workspace/components/WorkspaceMembersPanel';
import { WorkspacePeopleColors } from '@/features/workspace/components/WorkspacePeopleColors';

type MembersSectionTab = 'active' | 'disabled' | 'history' | 'colors';

/**
 * Workspace people in one place: who has access (and with which role), who is
 * switched off, what changed lately, and what colour everyone is drawn in.
 * The access tabs are admin-only — everyone else lands straight on colours,
 * which is all this section used to hold.
 */
export const WorkspaceMembersSection: React.FC = () => {
  const { members, currentWorkspaceRole } = useAuthStore(useShallow((state) => ({
    members: state.members,
    currentWorkspaceRole: state.currentWorkspaceRole,
  })));
  const { assignees } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
  })));

  const isAdmin = currentWorkspaceRole === 'admin';
  const isMobile = useIsMobile();

  const [tab, setTab] = useState<MembersSectionTab>('active');

  // The role arrives with the workspace, so a tab chosen before it landed must
  // not strand a non-admin on a list they are not allowed to see.
  const activeTab: MembersSectionTab = isAdmin ? tab : 'colors';

  const assigneeByUserId = useMemo(() => {
    const map = new Map<string, typeof assignees[number]>();
    assignees.forEach((assignee) => {
      if (assignee.userId) {
        map.set(assignee.userId, assignee);
      }
    });
    return map;
  }, [assignees]);

  const accessCounts = useMemo(() => {
    const { active, disabled } = splitMembersByAccess(members, assigneeByUserId);
    return { active: active.length, disabled: disabled.length };
  }, [assigneeByUserId, members]);

  const tabs: Array<{ id: MembersSectionTab; label: string; count?: number }> = isAdmin
    ? [
      { id: 'active', label: t`Active`, count: accessCounts.active },
      { id: 'disabled', label: t`Disabled`, count: accessCounts.disabled },
      { id: 'history', label: t`History` },
      { id: 'colors', label: t`Colours` },
    ]
    : [];

  return (
    <div className="space-y-4">
      {tabs.length > 0 && (
        // The strip scrolls sideways on a phone, so it has to swallow the
        // gesture instead of letting the settings deck page under the finger.
        <div data-swipe-ignore className="-mx-1 overflow-x-auto px-1 pb-1">
          <SegmentedControl surface="filled" className="w-max">
            {tabs.map((item) => (
              <SegmentedControlItem
                key={item.id}
                size={isMobile ? 'touch' : 'sm'}
                active={activeTab === item.id}
                onClick={() => setTab(item.id)}
                className="gap-2"
              >
                {item.label}
                {typeof item.count === 'number' && (
                  <Badge variant="secondary" size="xs" className="tabular-nums">
                    {item.count}
                  </Badge>
                )}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      )}

      {activeTab === 'colors' ? (
        <WorkspacePeopleColors />
      ) : (
        <WorkspaceMembersPanel showTitle={false} accessTab={activeTab} />
      )}
    </div>
  );
};
