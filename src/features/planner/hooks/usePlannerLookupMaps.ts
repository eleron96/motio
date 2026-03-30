import { useMemo } from 'react';
import type { Assignee, Status, Tag, Task, TaskType } from '@/features/planner/types/planner';

interface UsePlannerLookupMapsInput {
  statuses: Status[];
  assignees: Assignee[];
  taskTypes: TaskType[];
  tags: Tag[];
}

export function usePlannerLookupMaps({ statuses, assignees, taskTypes, tags }: UsePlannerLookupMapsInput) {
  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
  );
  const taskTypeById = useMemo(
    () => new Map(taskTypes.map((type) => [type.id, type])),
    [taskTypes],
  );
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  return { statusById, assigneeById, taskTypeById, tagById };
}
