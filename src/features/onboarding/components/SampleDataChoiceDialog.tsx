import React, { useState } from 'react';
import { t } from '@lingui/macro';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useSampleChoiceStore } from '@/features/onboarding/store/sampleChoiceStore';

/**
 * Closes the loop opened when a new workspace was seeded with examples: the
 * tour has just walked the person through a timeline made of sample work, so
 * now they decide whether that work stays or goes. Keeping is the default —
 * clearing is the destructive one, and it is spelled out.
 */
export const SampleDataChoiceDialog: React.FC = () => {
  const open = useSampleChoiceStore((state) => state.open);
  const closeSampleChoice = useSampleChoiceStore((state) => state.closeSampleChoice);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const clearSampleData = usePlannerStore((state) => state.clearSampleData);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!currentWorkspaceId) return;
    setClearing(true);
    const result = await clearSampleData(currentWorkspaceId);
    setClearing(false);
    closeSampleChoice();
    if (result.error) return;

    // Тур заканчивается на «Команде», а чистый лист начинают с таймлайна.
    // Полная перезагрузка заодно гарантирует, что от примеров не осталось
    // ничего в памяти открытых экранов.
    if (typeof window !== 'undefined') {
      window.location.assign('/app');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) closeSampleChoice(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Keep the example data?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`Your workspace was filled with a few example projects, people and tasks so the timeline wasn't empty. Keep them to experiment, or clear them and start with your own work.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearing}>{t`Keep examples`}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Диалог закроем сами — после того, как примеры действительно
              // удалены и таймлайн перечитан.
              event.preventDefault();
              void handleClear();
            }}
            disabled={clearing}
          >
            {clearing ? t`Clearing…` : t`Start clean`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
