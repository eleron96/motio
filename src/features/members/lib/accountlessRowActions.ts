import type { Assignee } from '@/features/planner/types/planner';

/** What the Team lists can do with a person who has no account. */
export type AccountlessRowActions = {
  /** Admins only; everyone else just sees the "No account" caption. */
  canManage: boolean;
  onEdit: (assignee: Assignee) => void;
  onInvite: (assignee: Assignee) => void;
  onSetActive: (assignee: Assignee, isActive: boolean) => void;
};
