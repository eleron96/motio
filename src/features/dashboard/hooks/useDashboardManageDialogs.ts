import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';

interface UseDashboardManageDialogsOptions {
  currentWorkspaceId: string | null;
  currentDashboardId: string | null;
  currentDashboardName: string | undefined;
  /** Below the limit of ten dashboards per workspace. */
  canCreateDashboard: boolean;
}

/** Create, rename and delete a dashboard, each in its own dialog. */
export const useDashboardManageDialogs = ({
  currentWorkspaceId,
  currentDashboardId,
  currentDashboardName,
  canCreateDashboard,
}: UseDashboardManageDialogsOptions) => {
  const { createDashboard, deleteDashboard, renameDashboard } = useDashboardStore(useShallow((state) => ({
    createDashboard: state.createDashboard,
    deleteDashboard: state.deleteDashboard,
    renameDashboard: state.renameDashboard,
  })));
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [createDashboardError, setCreateDashboardError] = useState('');
  const [renameDashboardOpen, setRenameDashboardOpen] = useState(false);
  const [renameDashboardName, setRenameDashboardName] = useState('');
  const [renameDashboardError, setRenameDashboardError] = useState('');
  const [renameDashboardSaving, setRenameDashboardSaving] = useState(false);
  const [deleteDashboardOpen, setDeleteDashboardOpen] = useState(false);
  const [dashboardDeleting, setDashboardDeleting] = useState(false);

  useEffect(() => {
    if (createDashboardOpen) return;
    setNewDashboardName('');
    setCreateDashboardError('');
  }, [createDashboardOpen]);

  useEffect(() => {
    if (renameDashboardOpen) return;
    setRenameDashboardName('');
    setRenameDashboardError('');
    setRenameDashboardSaving(false);
  }, [renameDashboardOpen]);

  const openCreateDialog = () => {
    setCreateDashboardOpen(true);
  };

  const openRenameDialog = () => {
    setRenameDashboardName(currentDashboardName ?? '');
    setRenameDashboardError('');
    setRenameDashboardOpen(true);
  };

  const openDeleteDialog = () => {
    setDeleteDashboardOpen(true);
  };

  const handleCreateDashboard = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateDashboardError('');
    if (!currentWorkspaceId) return;
    if (!canCreateDashboard) {
      setCreateDashboardError(t`Dashboard limit reached (10).`);
      return;
    }
    if (!newDashboardName.trim()) return;
    const result = await createDashboard(currentWorkspaceId, newDashboardName);
    if (result.error) {
      setCreateDashboardError(result.error);
      return;
    }
    setNewDashboardName('');
    setCreateDashboardOpen(false);
  };

  const handleDeleteDashboard = async () => {
    if (!currentDashboardId) return;
    setDashboardDeleting(true);
    await deleteDashboard(currentDashboardId);
    setDashboardDeleting(false);
    setDeleteDashboardOpen(false);
  };

  const handleRenameDashboard = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentDashboardId) return;
    const trimmed = renameDashboardName.trim();
    if (!trimmed) return;
    if (trimmed === (currentDashboardName ?? '').trim()) {
      setRenameDashboardOpen(false);
      return;
    }
    setRenameDashboardSaving(true);
    setRenameDashboardError('');
    const result = await renameDashboard(currentDashboardId, trimmed);
    if (result.error) {
      setRenameDashboardError(result.error);
      setRenameDashboardSaving(false);
      return;
    }
    setRenameDashboardSaving(false);
    setRenameDashboardOpen(false);
  };

  return {
    createDashboardOpen,
    setCreateDashboardOpen,
    newDashboardName,
    setNewDashboardName,
    createDashboardError,
    renameDashboardOpen,
    setRenameDashboardOpen,
    renameDashboardName,
    setRenameDashboardName,
    renameDashboardError,
    renameDashboardSaving,
    deleteDashboardOpen,
    setDeleteDashboardOpen,
    dashboardDeleting,
    setDashboardDeleting,
    openCreateDialog,
    openRenameDialog,
    openDeleteDialog,
    handleCreateDashboard,
    handleDeleteDashboard,
    handleRenameDashboard,
  };
};

export type DashboardManageDialogs = ReturnType<typeof useDashboardManageDialogs>;
