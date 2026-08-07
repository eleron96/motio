import { Dispatch, SetStateAction, useEffect, useRef } from 'react';

type Mode = 'tasks' | 'groups';

interface UseMembersPageModeParams {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  currentWorkspaceId: string | null;
  userId: string | undefined;
}

export const useMembersPageMode = ({
  mode,
  setMode,
  currentWorkspaceId,
  userId,
}: UseMembersPageModeParams) => {
  const modeHydratedRef = useRef(false);

  const modeStorageKey = currentWorkspaceId
    ? `members-mode-${currentWorkspaceId}`
    : userId
    ? `members-mode-user-${userId}`
    : 'members-mode';

  useEffect(() => {
    modeHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(modeStorageKey);
    if (saved === 'tasks' || saved === 'groups') {
      setMode(saved);
    } else if (saved === 'access') {
      // Access moved into workspace settings. Anyone whose last visit ended on
      // that tab would otherwise land on a mode this page no longer renders.
      setMode('tasks');
      window.localStorage.setItem(modeStorageKey, 'tasks');
    }
    modeHydratedRef.current = true;
  }, [modeStorageKey, setMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!modeHydratedRef.current) return;
    window.localStorage.setItem(modeStorageKey, mode);
  }, [mode, modeStorageKey]);
};
