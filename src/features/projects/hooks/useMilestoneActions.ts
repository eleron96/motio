import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { format } from 'date-fns';
import { Milestone } from '@/features/planner/types/planner';

interface UseMilestoneActionsParams {
  canEdit: boolean;
  selectedMilestone: Milestone | null | undefined;
  selectedMilestoneId: string | null;
  setSelectedMilestoneId: Dispatch<SetStateAction<string | null>>;
  deleteMilestone: (id: string) => Promise<{ error?: string } | undefined>;
  setMutationError: Dispatch<SetStateAction<string>>;
}

export interface UseMilestoneActionsResult {
  editingMilestone: Milestone | null;
  milestoneDialogOpen: boolean;
  milestoneDialogDate: string | null;
  deleteMilestoneTarget: Milestone | null;
  deleteMilestoneOpen: boolean;
  setDeleteMilestoneOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteMilestoneTarget: Dispatch<SetStateAction<Milestone | null>>;
  handleOpenCreateMilestone: () => void;
  handleOpenMilestoneSettings: (milestone: Milestone) => void;
  handleMilestoneDialogOpenChange: (open: boolean) => void;
  requestDeleteMilestone: (milestone: Milestone) => void;
  handleConfirmDeleteMilestone: () => Promise<void>;
}

export const useMilestoneActions = ({
  canEdit,
  selectedMilestone,
  selectedMilestoneId,
  setSelectedMilestoneId,
  deleteMilestone,
  setMutationError,
}: UseMilestoneActionsParams): UseMilestoneActionsResult => {
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<Milestone | null>(null);
  const [deleteMilestoneOpen, setDeleteMilestoneOpen] = useState(false);

  const handleOpenCreateMilestone = useCallback(() => {
    setEditingMilestone(null);
    setMilestoneDialogDate(selectedMilestone?.date ?? format(new Date(), 'yyyy-MM-dd'));
    setMilestoneDialogOpen(true);
  }, [selectedMilestone?.date]);

  const handleOpenMilestoneSettings = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleMilestoneDialogOpenChange = useCallback((open: boolean) => {
    setMilestoneDialogOpen(open);
    if (!open) {
      setEditingMilestone(null);
      setMilestoneDialogDate(null);
    }
  }, []);

  const requestDeleteMilestone = useCallback((milestone: Milestone) => {
    if (!canEdit) return;
    setDeleteMilestoneTarget(milestone);
    setDeleteMilestoneOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteMilestone = useCallback(async () => {
    if (!deleteMilestoneTarget) return;
    setMutationError('');
    const result = await deleteMilestone(deleteMilestoneTarget.id);
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    if (selectedMilestoneId === deleteMilestoneTarget.id) {
      setSelectedMilestoneId(null);
    }
    setDeleteMilestoneOpen(false);
    setDeleteMilestoneTarget(null);
  }, [deleteMilestone, deleteMilestoneTarget, selectedMilestoneId, setMutationError, setSelectedMilestoneId]);

  return {
    editingMilestone,
    milestoneDialogOpen,
    milestoneDialogDate,
    deleteMilestoneTarget,
    deleteMilestoneOpen,
    setDeleteMilestoneOpen,
    setDeleteMilestoneTarget,
    handleOpenCreateMilestone,
    handleOpenMilestoneSettings,
    handleMilestoneDialogOpenChange,
    requestDeleteMilestone,
    handleConfirmDeleteMilestone,
  };
};
