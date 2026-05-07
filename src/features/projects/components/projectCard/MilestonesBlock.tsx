import React, { useMemo } from 'react';
import { t } from '@lingui/macro';
import { Calendar, Check } from 'lucide-react';
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
}) => {
  const items = useMemo(
    () => deriveMilestonesWithStatus(milestones, today),
    [milestones, today],
  );

  return (
    <section className="flex h-full max-h-[440px] flex-col rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-ui-sm font-semibold">{t`Milestones`}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-ui-xs text-muted-foreground">
          {t`No milestones yet for this project.`}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <ol className={styles.timeline}>
            {items.map((milestone, index) => (
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
                  {index < items.length - 1 && <div className={styles.tlLine} />}
                </div>
                <div className={styles.tlBody}>
                  <div className={styles.tlDate}>
                    <Calendar className="h-3 w-3" />
                    {formatDate(milestone.date)}
                  </div>
                  <div className={styles.tlTitle}>{milestone.title}</div>
                  {milestone.note && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground/80">{milestone.note}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};
