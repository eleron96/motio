import { stripStatusEmoji } from '@/shared/lib/statusLabels';
import type { Status } from '@/features/planner/types/planner';

/**
 * The status a new task starts in: one named like "To do" in any of the
 * languages and spellings people use, else the first open one, else the first.
 */
export const resolveDefaultStatusId = (statuses: Status[]) => {
  if (statuses.length === 0) return '';
  const aliases = new Set([
    'todo',
    'todonew',
    'to do',
    'to-do',
    'to_do',
    'квыполнению',
    'сделать',
    'новая',
  ]);

  const normalize = (value: string) => stripStatusEmoji(value).trim().toLowerCase();
  const compact = (value: string) => normalize(value).replace(/[\s\-_]+/g, '');

  const preferred = statuses.find((status) => {
    const normalized = normalize(status.name);
    const packed = compact(status.name);
    return aliases.has(normalized) || aliases.has(packed);
  });
  if (preferred) return preferred.id;

  const firstOpen = statuses.find((status) => !status.isFinal && !status.isCancelled);
  return firstOpen?.id ?? statuses[0]?.id ?? '';
};
