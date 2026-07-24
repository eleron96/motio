import type { AdminUser, BackupEntry } from '@/features/admin/store/adminStore';
import type { Locale } from '@/shared/lib/locale';

export const formatDate = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const language = locale === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleString(language);
};

export const formatDateCompact = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const language = locale === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleDateString(language);
};

export const formatWorkspaceSummary = (workspaces: AdminUser['workspaces']) => {
  if (workspaces.length === 0) return '—';
  const preview = workspaces.slice(0, 3).map((workspace) => `${workspace.name} (${workspace.role})`);
  const suffix = workspaces.length > 3 ? ` +${workspaces.length - 3}` : '';
  return `${preview.join(', ')}${suffix}`;
};

export const formatStorageMain = (value?: number) => {
  if (!value && value !== 0) return '—';
  const safe = Math.max(0, value);
  const mbThreshold = 1024 * 1024;
  const gbThreshold = 1024 * 1024 * 1024;
  if (safe < mbThreshold) {
    return `${(safe / 1024).toFixed(1)} KB`;
  }
  if (safe < gbThreshold) {
    return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  }
  const gb = safe / gbThreshold;
  return `${gb.toFixed(2)} GB`;
};

export const formatStorageExactBytes = (value?: number) => {
  if (!value && value !== 0) return 'No storage data';
  const safe = Math.max(0, value);
  return `${safe.toLocaleString('en-US')} B`;
};

export const shortId = (value: string, start = 8, end = 6) => {
  if (!value) return '—';
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
};

export const formatBackupType = (type: BackupEntry['type']) => {
  if (type === 'daily') return 'Daily';
  if (type === 'pre-restore') return 'Pre-restore';
  return 'Manual';
};
