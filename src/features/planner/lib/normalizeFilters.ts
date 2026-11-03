import type { Filters } from '@/features/planner/types/planner';

const normalizeFilterIds = (value: unknown) => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
);

/** Filters read back from storage: anything malformed falls back to empty. */
export const normalizeFilters = (value: unknown): Filters => {
  const candidate = value && typeof value === 'object' ? (value as Partial<Filters>) : {};
  return {
    projectIds: normalizeFilterIds(candidate.projectIds),
    assigneeIds: normalizeFilterIds(candidate.assigneeIds),
    groupIds: normalizeFilterIds(candidate.groupIds),
    statusIds: normalizeFilterIds(candidate.statusIds),
    typeIds: normalizeFilterIds(candidate.typeIds),
    tagIds: normalizeFilterIds(candidate.tagIds),
    hideUnassigned: typeof candidate.hideUnassigned === 'boolean' ? candidate.hideUnassigned : false,
  };
};
