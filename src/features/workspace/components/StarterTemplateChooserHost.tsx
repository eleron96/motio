import React, { Suspense } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { lazyNamed } from '@/shared/lib/lazyComponent';

// A workspace asks for its template once in its life: the chooser and its
// cards load only for the admin of a workspace that is still waiting.
const StarterTemplateChooser = lazyNamed(
  () => import('@/features/workspace/components/StarterTemplateChooser'),
  'StarterTemplateChooser',
);

/**
 * Offers the starter templates over any page of a new workspace (0169), to its
 * admins only: invited members meet a workspace already set up, and the
 * sandbox never waits for one.
 */
export const StarterTemplateChooserHost: React.FC = () => {
  const workspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const isAdmin = useAuthStore((state) => state.currentWorkspaceRole === 'admin');
  const pending = useAuthStore((state) => (
    state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId)?.templatePending ?? false
  ));

  if (!workspaceId || !isAdmin || !pending) return null;

  return (
    <Suspense fallback={null}>
      <StarterTemplateChooser workspaceId={workspaceId} />
    </Suspense>
  );
};
