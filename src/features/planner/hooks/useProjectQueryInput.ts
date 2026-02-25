import { useCallback, useState } from 'react';
import type React from 'react';
import { resolveProjectQueryFromKeyDown } from '@/features/planner/lib/taskFormRules';

export const useProjectQueryInput = () => {
  const [projectQuery, setProjectQuery] = useState('');

  const clearProjectQuery = useCallback(() => {
    setProjectQuery('');
  }, []);

  const handleProjectSelectOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      clearProjectQuery();
    }
  }, [clearProjectQuery]);

  const handleProjectSelectKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const nextQuery = resolveProjectQueryFromKeyDown({
      currentQuery: projectQuery,
      key: event.key,
      isComposing: event.isComposing,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    if (nextQuery === null) return;
    event.preventDefault();
    event.stopPropagation();
    setProjectQuery(nextQuery);
  }, [projectQuery]);

  return {
    projectQuery,
    setProjectQuery,
    clearProjectQuery,
    handleProjectSelectOpenChange,
    handleProjectSelectKeyDown,
  };
};
