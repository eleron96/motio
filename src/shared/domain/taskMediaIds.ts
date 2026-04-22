const TASK_MEDIA_ID_PATTERN = /\/functions\/v1\/task-media\/([^/?"'\s<>]+)/g;

export const extractTaskMediaIds = (html: string | null | undefined): string[] => {
  if (!html) return [];
  const ids = new Set<string>();
  for (const match of html.matchAll(TASK_MEDIA_ID_PATTERN)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      ids.add(decodeURIComponent(raw));
    } catch {
      ids.add(raw);
    }
  }
  return Array.from(ids);
};

export const diffRemovedTaskMediaIds = (
  previous: string | null | undefined,
  next: string | null | undefined,
): string[] => {
  const previousIds = extractTaskMediaIds(previous);
  if (previousIds.length === 0) return [];
  const nextIds = new Set(extractTaskMediaIds(next));
  return previousIds.filter((id) => !nextIds.has(id));
};
