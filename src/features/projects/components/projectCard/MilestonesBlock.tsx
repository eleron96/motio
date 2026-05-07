import React, { useEffect, useMemo, useRef } from 'react';
import { t } from '@lingui/macro';
import { Calendar, Check, Plus } from 'lucide-react';
import type { Milestone } from '@/features/planner/types/planner';
import {
  deriveMilestonesWithStatus,
  type MilestoneWithStatus,
} from '@/features/projects/lib/projectCard/deriveMilestoneStatus';
import styles from './projectCard.module.css';

interface MilestonesBlockProps {
  milestones: Milestone[];
  formatDate: (date: string) => string;
  today: Date;
  canEdit: boolean;
  onAddMilestone: () => void;
  onEditMilestone?: (milestone: Milestone) => void;
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
}) => {
  const items = useMemo(
    () => deriveMilestonesWithStatus(milestones, today),
    [milestones, today],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // Land on the current/next milestone so the user starts there. Past
    // milestones are above (struck-through, checked) and reachable by
    // scrolling up, future ones below.
    if (currentRef.current && scrollRef.current) {
      const offset = currentRef.current.offsetTop - 8;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  }, [items]);

  return (
    <section className="flex h-full max-h-[440px] flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Milestones`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
        {canEdit && (
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
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-2">
          <ol className={styles.timeline}>
            {items.map((milestone, index) => {
              const isCurrent = milestone.status === 'current';
              return (
                <li
                  key={milestone.id}
                  ref={isCurrent ? currentRef : null}
                  className={`${styles.tlItem} ${statusClass(milestone.status)}`}
                >
                  <div className={styles.tlRail}>
                    <div className={styles.tlDot}>
                      {milestone.status === 'done' && (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      )}
                    </div>
                    {index < items.length - 1 && <div className={styles.tlLine} />}
                  </div>
                  <button
                    type="button"
                    className={`${styles.tlBody} w-full text-left`}
                    onClick={() => onEditMilestone?.(milestone)}
                    disabled={!onEditMilestone}
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
            })}
          </ol>
        </div>
      )}
    </section>
  );
};
