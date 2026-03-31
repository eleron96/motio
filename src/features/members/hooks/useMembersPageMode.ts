import { Dispatch, SetStateAction, useEffect, useRef } from 'react';

type Mode = 'tasks' | 'access' | 'groups';

interface UseMembersPageModeParams {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  currentWorkspaceId: string | null;
  userId: string | undefined;
  isAdmin: boolean;
}

export const useMembersPageMode = ({
  mode,
  setMode,
  currentWorkspaceId,
  userId,
  isAdmin,
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
    if (saved === 'tasks' || saved === 'groups' || (saved === 'access' && isAdmin)) {
      setMode(saved);
    } else if (saved === 'access' && !isAdmin) {
      setMode('tasks');
    }
    modeHydratedRef.current = true;
  }, [isAdmin, modeStorageKey, setMode]);

  useEffect(() => {
    if (mode !== 'access') return;
    if (!isAdmin) {
      setMode('tasks');
    }
  }, [isAdmin, mode, setMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!modeHydratedRef.current) return;
    window.localStorage.setItem(modeStorageKey, mode);
  }, [mode, modeStorageKey]);
};
