import { t } from '@lingui/macro';
import type { WorkspaceRole } from '@/features/auth/store/authStore';

export const roleLabel = (role: WorkspaceRole) => {
  if (role === 'admin') return t`Admin`;
  if (role === 'editor') return t`Editor`;
  return t`Viewer`;
};

export const formatNotificationDate = (isoDate: string) => {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleString();
};
