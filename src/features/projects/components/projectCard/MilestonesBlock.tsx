import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Calendar, Check, Plus } from 'lucide-react';
import type { Milestone } from '@/features/planner/types/planner';
import {
  deriveMilestonesWithStatus,
  type MilestoneWithStatus,
} from '@/features/projects/lib/projectCard/deriveMilestoneStatus';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import styles from './projectCard.module.css';

interface MilestonesBlockProps {
  milestones: Milestone[];
  formatDate: (date: string) => string;
  today: Date;
  canEdit: boolean;
  onAddMilestone: () => void;
  onEditMilestone?: (milestone: Milestone) => void;
  /** Project accent color so rail dots/lines pick up the project color. */
  accentColor: string;
}

const statusClass = (status: MilestoneWithStatus['status']): string => {
  switch (status) {
    case 'done':
      return styles.tlItemDone;
    case 'current':
      return styles.tlItemCurrent;
    default:
      return styles.tlItemUpcoming;
  }
};

export const MilestonesBlock: React.FC<MilestonesBlockProps> = ({
  milestones,
  formatDate,
  today,
  canEdit,
  onAddMilestone,
  onEditMilestone,
  accentColor,
}) => {
  const isMobile = useIsMobile();
  // M4: mobile users can add and edit milestones. The existing
  // `MilestoneDialog` shadcn dialog already renders full-screen on small
  // viewports, so no separate mobile sheet is needed here.
  void isMobile;
  const canEditMilestones = canEdit;

  const items = useMemo(
    () => deriveMilestonesWithStatus(milestones, today),
    [milestones, today],
  );

  const accentVars = useMemo(() => buildProjectAccentVars(accentColor), [accentColor]);

  const pastItems = items.filter((m) => m.status === 'done');
  const upcomingItems = items.filter((m) => m.status !== 'done');

  // Past milestones are hidden by default — the user wanted the closest
  // upcoming milestone to land at the top. They can still expand «Past» to
  // reach earlier ones.
  const [pastExpanded, setPastExpanded] = useState(false);

  return (
    <section
      className="flex h-full max-h-[440px] flex-col rounded-2xl border border-border bg-card p-5"
      style={accentVars}
    >
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Milestones`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
        {canEditMilestones && (
          <button
            type="button"
            onClick={onAddMilestone}
            className="ml-auto grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t`Add milestone`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-ui-xs text-muted-foreground">
          {t`No milestones yet for this project.`}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          {pastItems.length > 0 && (
            <button
              type="button"
              onClick={() => setPastExpanded((value) => !value)}
              className="mb-2 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <span className="text-[8px]">{pastExpanded ? '▾' : '▸'}</span>
              {pastExpanded
                ? t`Hide past`
                : t`${pastItems.length} past`}
            </button>
          )}
          <ol className={styles.timeline}>
            {pastExpanded && pastItems.map((milestone, idx) => (
              renderItem(milestone, idx, pastItems.length + upcomingItems.length, pastItems.length, true)
            ))}
            {upcomingItems.map((milestone, idx) => (
              renderItem(
                milestone,
                pastItems.length + idx,
                pastItems.length + upcomingItems.length,
                pastItems.length,
                false,
              )
            ))}
          </ol>
        </div>
      )}
    </section>
  );

  function renderItem(
    milestone: MilestoneWithStatus,
    flatIndex: number,
    totalCount: number,
    pastCount: number,
    isPastSection: boolean,
  ) {
    // Past items render only inside the `pastExpanded` block, so we don't need
    // to re-check that flag here. A past item is the last in the timeline only
    // when there are no upcoming items below it.
    const isLast = isPastSection
      ? flatIndex === pastCount - 1 && upcomingItems.length === 0
      : flatIndex === totalCount - 1;
    return (
      <li
        key={milestone.id}
        className={`${styles.tlItem} ${statusClass(milestone.status)}`}
      >
        <div className={styles.tlRail}>
          <div className={styles.tlDot}>
            {milestone.status === 'done' && (
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            )}
          </div>
          {!isLast && <div className={styles.tlLine} />}
        </div>
        <button
          type="button"
          className={`${styles.tlBody} w-full appearance-none border-0 bg-transparent p-0 text-left`}
          onClick={() => { if (canEditMilestones) onEditMilestone?.(milestone); }}
          disabled={!canEditMilestones || !onEditMilestone}
        >
          <div className={styles.tlDate}>
            <Calendar className="h-3 w-3" />
            {formatDate(milestone.date)}
          </div>
          <div className={styles.tlTitle}>{milestone.title}</div>
          {milestone.note && (
            <div className="mt-0.5 text-[11px] text-muted-foreground/80">{milestone.note}</div>
          )}
        </button>
      </li>
    );
  }
};
