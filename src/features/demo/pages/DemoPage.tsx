import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Trans } from '@lingui/macro';
import { WorkspaceLayout } from '@/features/workspace/components/WorkspaceLayout';
import { DemoBootstrap } from '../providers/DemoBootstrap';

const PlannerPage = lazy(() => import('@/features/planner/pages/PlannerPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const ProjectsPage = lazy(() => import('@/features/projects/pages/ProjectsPage'));
const MembersPage = lazy(() => import('@/features/members/pages/MembersPage'));

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
