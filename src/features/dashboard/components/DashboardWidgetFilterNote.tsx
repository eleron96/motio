import React from 'react';
import { t } from '@lingui/macro';
import type { DashboardStatusFilter } from '@/features/dashboard/types/dashboard';

const filterLabels: Record<DashboardStatusFilter, string> = {
  all: t`All statuses`,
  active: t`Active`,
  final: t`Closed`,
  cancelled: t`Cancelled`,
  custom: t`Custom`,
};

/** The "Filter: …" line a large widget prints under its value or chart. */
export const DashboardWidgetFilterNote: React.FC<{ statusFilter: DashboardStatusFilter }> = ({ statusFilter }) => (
  <div className="text-xs text-muted-foreground">
    {t`Filter: ${filterLabels[statusFilter]}`}
  </div>
);
