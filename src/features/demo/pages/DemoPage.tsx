import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Trans } from '@lingui/macro';
import { WorkspaceLayout } from '@/features/workspace/components/WorkspaceLayout';
import { lazyDefault } from '@/shared/lib/lazyComponent';
import { DemoBootstrap } from '../providers/DemoBootstrap';

const PlannerPage = lazyDefault(() => import('@/features/planner/pages/PlannerPage'), 'PlannerPage');
const DashboardPage = lazyDefault(() => import('@/features/dashboard/pages/DashboardPage'), 'DashboardPage');
const ProjectsPage = lazyDefault(() => import('@/features/projects/pages/ProjectsPage'), 'ProjectsPage');
const MembersPage = lazyDefault(() => import('@/features/members/pages/MembersPage'), 'MembersPage');

const DemoFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
    <Trans>Loading…</Trans>
  </div>
);

const DemoPage = () => (
  <DemoBootstrap>
    <Suspense fallback={<DemoFallback />}>
      <Routes>
        <Route element={<WorkspaceLayout />}>
          <Route index element={<PlannerPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="members" element={<MembersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/demo" replace />} />
      </Routes>
    </Suspense>
  </DemoBootstrap>
);

export default DemoPage;
