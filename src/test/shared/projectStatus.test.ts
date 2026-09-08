import { describe, expect, it } from 'vitest';
import { formatProjectStatusInput, normalizeProjectStatus } from '@/shared/domain/projectStatus';

describe('project status normalization', () => {
  it('caps a draft as the user types', () => {
    expect(formatProjectStatusInput('в работе')).toBe('В РАБОТЕ');
    expect(formatProjectStatusInput('On hold')).toBe('ON HOLD');
  });

  it('stores a trimmed, capped value', () => {
    expect(normalizeProjectStatus('  в работе ')).toBe('В РАБОТЕ');
    expect(normalizeProjectStatus('Заморожен')).toBe('ЗАМОРОЖЕН');
  });

  it('treats blank input as "no status"', () => {
    expect(normalizeProjectStatus('')).toBeNull();
    expect(normalizeProjectStatus('   ')).toBeNull();
    expect(normalizeProjectStatus(null)).toBeNull();
    expect(normalizeProjectStatus(undefined)).toBeNull();
  });

  it('is idempotent — an already normalized value survives untouched', () => {
    expect(normalizeProjectStatus(normalizeProjectStatus('в работе'))).toBe('В РАБОТЕ');
  });
});
