import { describe, expect, it } from 'vitest';
import { formatDateCompact, formatStorageExactBytes, formatStorageMain } from '@/features/admin/lib/format';

describe('admin format', () => {
  it('pads day and month with zeros', () => {
    expect(formatDateCompact('2026-11-03T12:00:00Z', 'de')).toBe('03.11.2026');
    expect(formatDateCompact('2026-11-03T12:00:00Z', 'ru')).toBe('03.11.2026');
  });

  it('uses the decimal separator of the interface language', () => {
    expect(formatStorageMain(503.4 * 1024, 'de')).toBe('503,4 KB');
    expect(formatStorageMain(503.4 * 1024, 'en')).toBe('503.4 KB');
    expect(formatStorageExactBytes(1234567, 'de')).toBe('1.234.567 B');
  });
});
