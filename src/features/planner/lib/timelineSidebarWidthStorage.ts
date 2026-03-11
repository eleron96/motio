const TIMELINE_SIDEBAR_MIN_WIDTH = 200;
const TIMELINE_SIDEBAR_MAX_WIDTH = 520;

export const clampTimelineSidebarWidth = (value: number) => (
  Math.max(TIMELINE_SIDEBAR_MIN_WIDTH, Math.min(TIMELINE_SIDEBAR_MAX_WIDTH, value))
);

export const getTimelineSidebarWidthStorageKey = (userId: string, workspaceId: string) => (
  `planner-timeline-sidebar-width-${userId}-${workspaceId}`
);

export const readTimelineSidebarWidth = (
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
): number | null => {
  const raw = storage.getItem(storageKey);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampTimelineSidebarWidth(parsed);
};

export const writeTimelineSidebarWidth = (
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  storageKey: string,
  width: number | null | undefined,
) => {
  if (width === undefined) {
    return;
  }

  if (width === null) {
    storage.removeItem(storageKey);
    return;
  }

  storage.setItem(storageKey, String(clampTimelineSidebarWidth(width)));
};
