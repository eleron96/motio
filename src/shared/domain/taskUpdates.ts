import { Task } from '@/features/planner/types/planner';

const areArraysEqual = (left: unknown[], right: unknown[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

/**
 * Whether writing `updates` would change anything on `task`. Arrays compare by
 * items; everything else strictly, so clearing a field to null still counts.
 */
export const hasTaskUpdates = (task: Task, updates: Partial<Task>) => (
  Object.entries(updates).some(([key, value]) => {
    const currentValue = task[key as keyof Task];
    if (Array.isArray(currentValue) && Array.isArray(value)) {
      return !areArraysEqual(currentValue, value);
    }
    return currentValue !== value;
  })
);
