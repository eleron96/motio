import { t } from '@lingui/macro';
import type { AdminUser, BackupEntry } from '@/features/admin/store/adminStore';
import { localeIntlTags, type Locale } from '@/shared/lib/locale';

// Two-digit day and month keep the columns aligned: 03.11.2026, not 3.11.2026.
const DATE_PARTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME_PARTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };

export const formatDate = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(localeIntlTags[locale], { ...DATE_PARTS, ...TIME_PARTS });
};

export const formatDateCompact = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(localeIntlTags[locale], DATE_PARTS);
};

export const formatWorkspaceRole = (role: AdminUser['workspaces'][number]['role']) => {
  if (role === 'owner') return t`Owner`;
  if (role === 'admin') return t`Admin`;
  if (role === 'editor') return t`Editor`;
  return t`Viewer`;
};

export const formatWorkspaceSummary = (workspaces: AdminUser['workspaces']) => {
  if (workspaces.length === 0) return '—';
  const preview = workspaces
    .slice(0, 3)
    .map((workspace) => `${workspace.name} (${formatWorkspaceRole(workspace.role)})`);
  const suffix = workspaces.length > 3 ? ` +${workspaces.length - 3}` : '';
  return `${preview.join(', ')}${suffix}`;
};

const formatFraction = (value: number, digits: number, locale: Locale) => (
  value.toLocaleString(localeIntlTags[locale], { minimumFractionDigits: digits, maximumFractionDigits: digits })
);

export const formatStorageMain = (value: number | undefined, locale: Locale) => {
  if (!value && value !== 0) return '—';
  const safe = Math.max(0, value);
  const mbThreshold = 1024 * 1024;
  const gbThreshold = 1024 * 1024 * 1024;
  if (safe < mbThreshold) {
    return `${formatFraction(safe / 1024, 1, locale)} KB`;
  }
  if (safe < gbThreshold) {
    return `${formatFraction(safe / (1024 * 1024), 1, locale)} MB`;
  }
  return `${formatFraction(safe / gbThreshold, 2, locale)} GB`;
};

export const formatStorageExactBytes = (value: number | undefined, locale: Locale) => {
  if (!value && value !== 0) return t`No storage data`;
  const safe = Math.max(0, value);
  return `${safe.toLocaleString(localeIntlTags[locale])} B`;
};

export const shortId = (value: string, start = 8, end = 6) => {
  if (!value) return '—';
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
};

export const formatBackupType = (type: BackupEntry['type']) => {
  if (type === 'daily') return t`Daily`;
  if (type === 'pre-restore') return t`Before restore`;
  return t`Manual`;
};
