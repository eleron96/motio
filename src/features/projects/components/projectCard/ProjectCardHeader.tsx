import React from 'react';
import { t } from '@lingui/macro';
import { Badge } from '@/shared/ui/badge';
import type { Project, Customer } from '@/features/planner/types/planner';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import styles from './projectCard.module.css';

interface ProjectCardHeaderProps {
  project: Project;
  customer: Customer | null;
}

export const ProjectCardHeader: React.FC<ProjectCardHeaderProps> = ({ project, customer }) => {
  const customerLabel = customer?.name ?? t`No customer`;

  return (
    <div
      className="relative rounded-2xl border border-border bg-card p-6 shadow-sm"
      style={buildProjectAccentVars(project.color)}
    >
      <div className={styles.accentBar} aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-ui-xs text-muted-foreground">
            <span>{t`Projects`}</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate">{customerLabel}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {project.code && (
              <span
                className={`${styles.codePill} rounded-md px-2 py-1 text-[11px] font-semibold text-foreground`}
              >
                [{project.code}]
              </span>
            )}
            <h1 className="break-words text-ui-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
              {project.name}
            </h1>
            {project.archived && (
              <Badge variant="secondary">{t`Archived`}</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
