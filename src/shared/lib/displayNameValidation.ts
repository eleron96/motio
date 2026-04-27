// Validation for renaming a PURGED profile's display_name.
// Mirrors public.rename_purged_profile() server-side length check, and adds
// client-side rules to keep admins from replacing an offensive name with
// another problematic value (URL, @mention, reserved role word).
//
// Keep this pure — it's consumed by the RenamePurgedDialog component and
// unit-tested independently.

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

// Lowercase, trimmed comparison against these words.
// Intentionally conservative — rely on super_admin judgement for edge cases.
export const RESERVED_DISPLAY_NAMES: readonly string[] = [
  'admin',
  'administrator',
  'moderator',
  'support',
  'system',
  'root',
  'staff',
  'motio',
  'motio-team',
  'motio team',
  'owner',
  'superuser',
  'super-admin',
  'super admin',
  'bot',
  'sysadmin',
];

export type DisplayNameValidationErrorCode =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'contains_url'
  | 'contains_mention'
  | 'reserved_word';

export interface DisplayNameValidationResult {
  ok: boolean;
  error?: DisplayNameValidationErrorCode;
  trimmed: string;
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;

export function validateDisplayName(raw: string): DisplayNameValidationResult {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty', trimmed };
  }
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
    return { ok: false, error: 'too_short', trimmed };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: 'too_long', trimmed };
  }
  if (trimmed.includes('@')) {
    return { ok: false, error: 'contains_mention', trimmed };
  }
  if (URL_PATTERN.test(trimmed)) {
    return { ok: false, error: 'contains_url', trimmed };
  }
  const lowered = trimmed.toLowerCase();
  if (RESERVED_DISPLAY_NAMES.some((word) => word === lowered)) {
    return { ok: false, error: 'reserved_word', trimmed };
  }
  return { ok: true, trimmed };
}
