import { stripStatusEmoji } from '@/shared/lib/statusLabels';
import {
  DEFAULT_NEUTRAL_COLOR,
  TASK_PRIORITY_COLORS,
  hexToRgba,
  isDarkHexColor,
} from '@/shared/lib/colors';
import type { TaskPriority } from '@/features/planner/types/planner';

type TaskBarStatusLike = {
  isCancelled?: boolean | null;
  isFinal?: boolean | null;
  name: string;
} | null | undefined;

type TaskBarAppearanceInput = {
  fallbackProjectColor?: string;
  priority: TaskPriority | null;
  projectColor?: string | null;
  status: TaskBarStatusLike;
};

type TaskBarPriorityVisual = {
  badgeStyle: {
    backgroundColor: string;
    borderColor: string;
    boxShadow: string;
  };
  className: string;
  color: string;
  symbol: string;
} | null;

export type TaskBarAppearance = {
  backgroundColor: string;
  border: string;
  isCancelled: boolean;
  isCompleted: boolean;
  isFinalStyle: boolean;
  priorityVisual: TaskBarPriorityVisual;
  secondaryTextColor: string;
  textColor: string;
};

const priorityStyles: Record<TaskPriority, { className: string; color: string; symbol: string }> = {
  low: { className: 'text-emerald-600', color: TASK_PRIORITY_COLORS.low, symbol: '!' },
  medium: { className: 'text-amber-500', color: TASK_PRIORITY_COLORS.medium, symbol: '!' },
  high: { className: 'text-red-600', color: TASK_PRIORITY_COLORS.high, symbol: '‼' },
};

const isCancelledStatus = (status: TaskBarStatusLike) => {
  if (!status) return false;
  if (status.isCancelled) return true;
  return ['отменена', 'cancelled', 'canceled'].includes(stripStatusEmoji(status.name).trim().toLowerCase());
};

export const getTaskBarAppearance = ({
  fallbackProjectColor,
  priority,
  projectColor,
  status,
}: TaskBarAppearanceInput): TaskBarAppearance => {
  const isCancelled = isCancelledStatus(status);
  const isFinalStatus = Boolean(status?.isFinal);
  const isFinalStyle = isFinalStatus && !isCancelled;
  const baseBackgroundColor = projectColor || fallbackProjectColor || DEFAULT_NEUTRAL_COLOR;
  const backgroundColor = isFinalStyle ? '#ffffff' : baseBackgroundColor;
  const isDarkBackground = isDarkHexColor(backgroundColor);
  const baseTextColor = isDarkBackground ? '#f8fafc' : '#14181F';
  const textColor = isFinalStyle ? '#64748b' : baseTextColor;
  const secondaryTextColor = isFinalStyle
    ? 'rgba(100,116,139,0.85)'
    : (isDarkBackground ? 'rgba(248,250,252,0.8)' : 'rgba(15,23,42,0.7)');

  const priorityVisual = priority
    ? {
        ...priorityStyles[priority],
        badgeStyle: {
          backgroundColor: '#ffffff',
          borderColor: priorityStyles[priority].color,
          boxShadow: priority === 'high'
            ? `0 0 0 1px ${priorityStyles[priority].color}, 0 0 8px ${hexToRgba(priorityStyles[priority].color, 0.45) ?? priorityStyles[priority].color}`
            : `0 0 0 1px ${priorityStyles[priority].color}`,
        },
      }
    : null;

  return {
    backgroundColor,
    border: isFinalStyle ? '1px solid #24342B' : 'none',
    isCancelled,
    isCompleted: isFinalStatus || isCancelled,
    isFinalStyle,
    priorityVisual,
    secondaryTextColor,
    textColor,
  };
};
