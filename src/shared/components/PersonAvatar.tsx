import React from 'react';
import { UserAvatar, type UserAvatarProps } from '@/shared/ui/UserAvatar';
import { usePersonColors } from '@/features/planner/hooks/usePersonColors';

export interface PersonAvatarProps extends Omit<UserAvatarProps, 'color'> {
  /** Assignee this avatar stands for, when the screen holds one. */
  assigneeId?: string | null;
  /** Account id, for screens that only know the user (comments, members). */
  userId?: string | null;
}

/**
 * UserAvatar for somebody who belongs to the workspace: it looks their colour up
 * instead of taking it as a prop, so every screen shows the same person in the
 * same colour without each one having to thread it through.
 *
 * Somebody the workspace does not know — a former teammate quoted in a comment,
 * a person outside the loaded window — simply has no entry and keeps the
 * id-hashed monogram colour.
 */
export const PersonAvatar: React.FC<PersonAvatarProps> = ({ assigneeId, userId, ...props }) => {
  const { byAssigneeId, byUserId } = usePersonColors();
  const color = (assigneeId ? byAssigneeId.get(assigneeId) : undefined)
    ?? (userId ? byUserId.get(userId) : undefined)
    ?? null;

  return <UserAvatar {...props} color={color} />;
};
