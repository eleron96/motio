import { splitStatusLabel } from '@/shared/lib/statusLabels';
import { DEFAULT_STATUS_COLOR, DEFAULT_TAG_COLOR } from '@/shared/lib/colors';

export type WorkspaceTemplateStatus = {
  name: string;
  emoji: string | null;
  color: string;
  is_final: boolean;
  is_cancelled: boolean;
};

export type WorkspaceTemplateTaskType = {
  name: string;
  icon: string | null;
};

export type WorkspaceTemplateTag = {
  name: string;
  color: string;
};

export type WorkspaceTemplate = {
  statuses: WorkspaceTemplateStatus[];
  taskTypes: WorkspaceTemplateTaskType[];
  tags: WorkspaceTemplateTag[];
};

type StatusLike = {
  name: string;
  emoji: string | null;
  color: string;
  isFinal: boolean;
  isCancelled: boolean;
};

type TaskTypeLike = {
  name: string;
  icon: string | null;
};

type TagLike = {
  name: string;
  color: string;
};

const normalizeTemplateStatuses = (value: unknown): WorkspaceTemplateStatus[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is {
      name?: string | null;
      emoji?: string | null;
      color?: string | null;
      is_final?: boolean | null;
      is_cancelled?: boolean | null;
    } => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const { name: cleanedName, emoji: inlineEmoji } = splitStatusLabel(item.name ?? '');
      const explicitEmoji = typeof item.emoji === 'string' ? item.emoji.trim() : item.emoji;
      return {
        name: cleanedName,
        emoji: explicitEmoji || inlineEmoji || null,
        color: item.color ?? DEFAULT_STATUS_COLOR,
        is_final: Boolean(item.is_final),
        is_cancelled: Boolean(item.is_cancelled),
      };
    })
    .filter((item) => item.name.trim().length > 0);
};

const normalizeTemplateTaskTypes = (value: unknown): WorkspaceTemplateTaskType[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is { name?: string | null; icon?: string | null } => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name.trim() : '',
      icon: typeof item.icon === 'string' ? item.icon : null,
    }))
    .filter((item) => item.name.length > 0);
};

const normalizeTemplateTags = (value: unknown): WorkspaceTemplateTag[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is { name?: string | null; color?: string | null } => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name.trim() : '',
      color: item.color ?? DEFAULT_TAG_COLOR,
    }))
    .filter((item) => item.name.length > 0);
};

const uniqueByNormalizedName = <T extends { name: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.name.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

export const normalizeWorkspaceTemplate = (
  value: {
    statuses?: unknown;
    task_types?: unknown;
    tags?: unknown;
  } | null | undefined,
): WorkspaceTemplate => ({
  statuses: uniqueByNormalizedName(normalizeTemplateStatuses(value?.statuses)),
  taskTypes: uniqueByNormalizedName(normalizeTemplateTaskTypes(value?.task_types)),
  tags: uniqueByNormalizedName(normalizeTemplateTags(value?.tags)),
});

export const buildWorkspaceTemplateFromCatalog = (catalog: {
  statuses: StatusLike[];
  taskTypes: TaskTypeLike[];
  tags: TagLike[];
}): WorkspaceTemplate => ({
  statuses: catalog.statuses.map((status) => ({
    name: status.name,
    emoji: status.emoji ?? null,
    color: status.color ?? DEFAULT_STATUS_COLOR,
    is_final: status.isFinal,
    is_cancelled: status.isCancelled,
  })),
  taskTypes: catalog.taskTypes.map((taskType) => ({
    name: taskType.name,
    icon: taskType.icon ?? null,
  })),
  tags: catalog.tags.map((tag) => ({
    name: tag.name,
    color: tag.color ?? DEFAULT_TAG_COLOR,
  })),
});

export const diffWorkspaceTemplate = (
  template: WorkspaceTemplate,
  catalog: {
    statuses: Array<Pick<StatusLike, 'name'>>;
    taskTypes: Array<Pick<TaskTypeLike, 'name'>>;
    tags: Array<Pick<TagLike, 'name'>>;
  },
) => {
  const statusNames = new Set(catalog.statuses.map((status) => status.name.trim().toLowerCase()));
  const taskTypeNames = new Set(catalog.taskTypes.map((taskType) => taskType.name.trim().toLowerCase()));
  const tagNames = new Set(catalog.tags.map((tag) => tag.name.trim().toLowerCase()));

  return {
    statuses: uniqueByNormalizedName(template.statuses).filter((status) => !statusNames.has(status.name.trim().toLowerCase())),
    taskTypes: uniqueByNormalizedName(template.taskTypes).filter((taskType) => !taskTypeNames.has(taskType.name.trim().toLowerCase())),
    tags: uniqueByNormalizedName(template.tags).filter((tag) => !tagNames.has(tag.name.trim().toLowerCase())),
  };
};
