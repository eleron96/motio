import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import { Project } from '@/features/planner/types/planner';
import { DEFAULT_PROJECT_COLOR } from '@/shared/lib/colors';

interface UseProjectMutationsParams {
  canEdit: boolean;
  updateProject: (id: string, updates: Partial<Project>) => Promise<{ error?: string } | undefined>;
  deleteProject: (id: string) => Promise<{ error?: string } | undefined>;
  setMutationError: Dispatch<SetStateAction<string>>;
}

export interface UseProjectMutationsResult {
  projectSettingsOpen: boolean;
  setProjectSettingsOpen: Dispatch<SetStateAction<boolean>>;
  projectSettingsTarget: Project | null;
  setProjectSettingsTarget: Dispatch<SetStateAction<Project | null>>;
  projectSettingsName: string;
  setProjectSettingsName: Dispatch<SetStateAction<string>>;
  projectSettingsCode: string;
  setProjectSettingsCode: Dispatch<SetStateAction<string>>;
  projectSettingsColor: string;
  setProjectSettingsColor: Dispatch<SetStateAction<string>>;
  projectSettingsCustomerId: string | null;
  setProjectSettingsCustomerId: Dispatch<SetStateAction<string | null>>;
  projectSettingsOwnerGroupId: string | null;
  setProjectSettingsOwnerGroupId: Dispatch<SetStateAction<string | null>>;
  projectSettingsStatus: string;
  setProjectSettingsStatus: Dispatch<SetStateAction<string>>;
  projectSettingsConfirmOpen: boolean;
  setProjectSettingsConfirmOpen: Dispatch<SetStateAction<boolean>>;
  deleteProjectTarget: Project | null;
  setDeleteProjectTarget: Dispatch<SetStateAction<Project | null>>;
  deleteProjectOpen: boolean;
  setDeleteProjectOpen: Dispatch<SetStateAction<boolean>>;
  projectSettingsHasUnsavedChanges: boolean;
  openProjectSettings: (project: Project) => void;
  handleSaveProjectSettings: () => Promise<void>;
  requestCloseProjectSettings: () => void;
  requestDeleteProject: (project: Project) => void;
  handleConfirmDeleteProject: () => Promise<void>;
  handleToggleProjectArchived: (project: Project) => Promise<void>;
}

export const useProjectMutations = ({
  canEdit,
  updateProject,
  deleteProject,
  setMutationError,
}: UseProjectMutationsParams): UseProjectMutationsResult => {
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState<Project | null>(null);
  const [projectSettingsName, setProjectSettingsName] = useState('');
  const [projectSettingsCode, setProjectSettingsCode] = useState('');
  const [projectSettingsColor, setProjectSettingsColor] = useState(DEFAULT_PROJECT_COLOR);
  const [projectSettingsCustomerId, setProjectSettingsCustomerId] = useState<string | null>(null);
  const [projectSettingsOwnerGroupId, setProjectSettingsOwnerGroupId] = useState<string | null>(null);
  const [projectSettingsStatus, setProjectSettingsStatus] = useState('');
  const [projectSettingsConfirmOpen, setProjectSettingsConfirmOpen] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);

  const openProjectSettings = useCallback((project: Project) => {
    if (!canEdit) return;
    setProjectSettingsTarget(project);
    setProjectSettingsName(project.name);
    setProjectSettingsCode(project.code ?? '');
    setProjectSettingsColor(project.color);
    setProjectSettingsCustomerId(project.customerId ?? null);
    setProjectSettingsOwnerGroupId(project.ownerGroupId ?? null);
    setProjectSettingsStatus(project.status ?? '');
    setProjectSettingsOpen(true);
  }, [canEdit]);

  const handleSaveProjectSettings = useCallback(async () => {
    if (!canEdit || !projectSettingsTarget) return;
    const nextName = projectSettingsName.trim();
    if (!nextName) return;
    const nextCode = projectSettingsCode.trim();
    const normalizedCode = nextCode ? nextCode : null;
    const updates: Partial<Project> = {};
    if (nextName !== projectSettingsTarget.name) updates.name = nextName;
    if ((projectSettingsTarget.code ?? null) !== normalizedCode) updates.code = normalizedCode;
    if (projectSettingsColor !== projectSettingsTarget.color) updates.color = projectSettingsColor;
    if (projectSettingsCustomerId !== projectSettingsTarget.customerId) {
      updates.customerId = projectSettingsCustomerId;
    }
    if (projectSettingsOwnerGroupId !== (projectSettingsTarget.ownerGroupId ?? null)) {
      updates.ownerGroupId = projectSettingsOwnerGroupId;
    }
    const nextStatus = projectSettingsStatus.trim() ? projectSettingsStatus.trim() : null;
    if (nextStatus !== (projectSettingsTarget.status ?? null)) {
      updates.status = nextStatus;
    }
    if (Object.keys(updates).length > 0) {
      setMutationError('');
      const result = await updateProject(projectSettingsTarget.id, updates);
      if (result?.error) {
        setMutationError(result.error);
        return;
      }
    }
    setProjectSettingsOpen(false);
  }, [
    canEdit,
    projectSettingsCode,
    projectSettingsColor,
    projectSettingsCustomerId,
    projectSettingsName,
    projectSettingsOwnerGroupId,
    projectSettingsStatus,
    projectSettingsTarget,
    setMutationError,
    updateProject,
  ]);

  const projectSettingsHasUnsavedChanges = useMemo(() => {
    if (!projectSettingsTarget) return false;
    const nextName = projectSettingsName.trim();
    const nextCode = projectSettingsCode.trim();
    const normalizedCode = nextCode ? nextCode : null;
    if (nextName !== projectSettingsTarget.name.trim()) return true;
    if ((projectSettingsTarget.code ?? null) !== normalizedCode) return true;
    if (projectSettingsColor !== projectSettingsTarget.color) return true;
    if (projectSettingsCustomerId !== projectSettingsTarget.customerId) return true;
    if (projectSettingsOwnerGroupId !== (projectSettingsTarget.ownerGroupId ?? null)) return true;
    const nextStatus = projectSettingsStatus.trim() ? projectSettingsStatus.trim() : null;
    if (nextStatus !== (projectSettingsTarget.status ?? null)) return true;
    return false;
  }, [
    projectSettingsCode,
    projectSettingsColor,
    projectSettingsCustomerId,
    projectSettingsName,
    projectSettingsOwnerGroupId,
    projectSettingsStatus,
    projectSettingsTarget,
  ]);

  const requestCloseProjectSettings = useCallback(() => {
    if (projectSettingsHasUnsavedChanges) {
      setProjectSettingsConfirmOpen(true);
      return;
    }
    setProjectSettingsOpen(false);
  }, [projectSettingsHasUnsavedChanges]);

  const requestDeleteProject = useCallback((project: Project) => {
    if (!canEdit) return;
    setDeleteProjectTarget(project);
    setDeleteProjectOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!deleteProjectTarget) return;
    setMutationError('');
    const result = await deleteProject(deleteProjectTarget.id);
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    setDeleteProjectOpen(false);
    setDeleteProjectTarget(null);
  }, [deleteProject, deleteProjectTarget, setMutationError]);

  const handleToggleProjectArchived = useCallback(async (project: Project) => {
    setMutationError('');
    const result = await updateProject(project.id, { archived: !project.archived });
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [setMutationError, updateProject]);

  return {
    projectSettingsOpen,
    setProjectSettingsOpen,
    projectSettingsTarget,
    setProjectSettingsTarget,
    projectSettingsName,
    setProjectSettingsName,
    projectSettingsCode,
    setProjectSettingsCode,
    projectSettingsColor,
    setProjectSettingsColor,
    projectSettingsCustomerId,
    setProjectSettingsCustomerId,
    projectSettingsOwnerGroupId,
    setProjectSettingsOwnerGroupId,
    projectSettingsStatus,
    setProjectSettingsStatus,
    projectSettingsConfirmOpen,
    setProjectSettingsConfirmOpen,
    deleteProjectTarget,
    setDeleteProjectTarget,
    deleteProjectOpen,
    setDeleteProjectOpen,
    projectSettingsHasUnsavedChanges,
    openProjectSettings,
    handleSaveProjectSettings,
    requestCloseProjectSettings,
    requestDeleteProject,
    handleConfirmDeleteProject,
    handleToggleProjectArchived,
  };
};
