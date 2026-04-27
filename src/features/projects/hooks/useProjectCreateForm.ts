import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import { Project } from '@/features/planner/types/planner';
import { DEFAULT_PROJECT_COLOR } from '@/shared/lib/colors';

interface UseProjectCreateFormParams {
  canEdit: boolean;
  addProject: (data: Omit<Project, 'id'>) => Promise<void>;
  setEditingCustomerId: Dispatch<SetStateAction<string | null>>;
  setEditingCustomerName: Dispatch<SetStateAction<string>>;
}

export interface UseProjectCreateFormResult {
  createProjectOpen: boolean;
  setCreateProjectOpen: Dispatch<SetStateAction<boolean>>;
  createProjectConfirmOpen: boolean;
  setCreateProjectConfirmOpen: Dispatch<SetStateAction<boolean>>;
  newProjectName: string;
  setNewProjectName: Dispatch<SetStateAction<string>>;
  newProjectCode: string;
  setNewProjectCode: Dispatch<SetStateAction<string>>;
  newProjectColor: string;
  setNewProjectColor: Dispatch<SetStateAction<string>>;
  newProjectCustomerId: string | null;
  setNewProjectCustomerId: Dispatch<SetStateAction<string | null>>;
  resetCreateProjectForm: () => void;
  handleCreateProject: () => Promise<void>;
  requestCloseCreateProject: () => void;
}

export const useProjectCreateForm = ({
  canEdit,
  addProject,
  setEditingCustomerId,
  setEditingCustomerName,
}: UseProjectCreateFormParams): UseProjectCreateFormResult => {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectConfirmOpen, setCreateProjectConfirmOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(DEFAULT_PROJECT_COLOR);
  const [newProjectCustomerId, setNewProjectCustomerId] = useState<string | null>(null);

  const resetCreateProjectForm = useCallback(() => {
    setNewProjectName('');
    setNewProjectCode('');
    setNewProjectColor(DEFAULT_PROJECT_COLOR);
    setNewProjectCustomerId(null);
    setEditingCustomerId(null);
    setEditingCustomerName('');
  }, [setEditingCustomerId, setEditingCustomerName]);

  const handleCreateProject = useCallback(async () => {
    if (!canEdit || !newProjectName.trim()) return;
    await addProject({
      name: newProjectName.trim(),
      code: newProjectCode.trim() ? newProjectCode.trim() : null,
      color: newProjectColor,
      archived: false,
      customerId: newProjectCustomerId,
    });
    setCreateProjectOpen(false);
    resetCreateProjectForm();
  }, [addProject, canEdit, newProjectCode, newProjectColor, newProjectCustomerId, newProjectName, resetCreateProjectForm]);

  const createProjectHasUnsavedChanges = useMemo(() => (
    newProjectName.trim().length > 0
    || newProjectCode.trim().length > 0
    || newProjectColor !== DEFAULT_PROJECT_COLOR
    || newProjectCustomerId !== null
  ), [newProjectCode, newProjectColor, newProjectCustomerId, newProjectName]);

  const requestCloseCreateProject = useCallback(() => {
    if (createProjectHasUnsavedChanges) {
      setCreateProjectConfirmOpen(true);
      return;
    }
    setCreateProjectOpen(false);
  }, [createProjectHasUnsavedChanges]);

  return {
    createProjectOpen,
    setCreateProjectOpen,
    createProjectConfirmOpen,
    setCreateProjectConfirmOpen,
    newProjectName,
    setNewProjectName,
    newProjectCode,
    setNewProjectCode,
    newProjectColor,
    setNewProjectColor,
    newProjectCustomerId,
    setNewProjectCustomerId,
    resetCreateProjectForm,
    handleCreateProject,
    requestCloseCreateProject,
  };
};
