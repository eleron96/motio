import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';

/**
 * Пока пространство засеяно примерами, о них сказано на каждом экране.
 * Строки-примеры ничем не отличаются от настоящих задач, а вопрос «оставить
 * или убрать» доходит не до всех: тур закрывают крестиком, на телефоне он не
 * запускается, а приглашённый участник его вообще не проходит. Без этой полосы
 * человек не понимает, откуда взялись чужие люди и задачи и что их можно убрать.
 */
export const SampleDataBanner: React.FC = () => {
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const hasSampleData = usePlannerStore((state) => state.hasSampleData);
  const refreshSampleDataFlag = usePlannerStore((state) => state.refreshSampleDataFlag);
  const clearSampleData = usePlannerStore((state) => state.clearSampleData);
  const [clearing, setClearing] = useState(false);

  // Флаг нужен на любой странице пространства, а не только на таймлайне:
  // приглашённый участник может открыть сразу «Проекты» или «Команду».
  useEffect(() => {
    if (!currentWorkspaceId) return;
    void refreshSampleDataFlag(currentWorkspaceId);
  }, [currentWorkspaceId, refreshSampleDataFlag]);

  if (!hasSampleData) return null;

  const isAdmin = currentWorkspaceRole === 'admin';

  const handleClear = async () => {
    if (!currentWorkspaceId || clearing) return;
    setClearing(true);
    // clearSampleData сам перечитывает окно после удаления, так что
    // перезагружать страницу, как это делает диалог в конце тура, незачем.
    await clearSampleData(currentWorkspaceId);
    setClearing(false);
  };

  return (
    <div role="status" className="shrink-0 border-b border-border bg-primary/10">
      <div className="flex items-start gap-3 px-4 py-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          {t`Part of what you see here is example data — the workspace started with it so the timeline wasn't empty.`}
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="shrink-0 text-sm font-medium underline underline-offset-2 hover:opacity-80 disabled:opacity-60"
          >
            {clearing ? t`Removing…` : t`Remove examples`}
          </button>
        )}
      </div>
    </div>
  );
};
