import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  RESERVED_DISPLAY_NAMES,
  validateDisplayName,
} from '@/shared/lib/displayNameValidation';

describe('validateDisplayName', () => {
  it('rejects empty input', () => {
    expect(validateDisplayName('')).toEqual({ ok: false, error: 'empty', trimmed: '' });
    expect(validateDisplayName('   ')).toEqual({ ok: false, error: 'empty', trimmed: '' });
  });

  it('rejects single character', () => {
    const result = validateDisplayName('A');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('too_short');
  });

  it(`accepts minimum length (${DISPLAY_NAME_MIN_LENGTH} chars)`, () => {
    const result = validateDisplayName('Al');
    expect(result.ok).toBe(true);
    expect(result.trimmed).toBe('Al');
  });

  it(`accepts maximum length (${DISPLAY_NAME_MAX_LENGTH} chars)`, () => {
    const name = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH);
    const result = validateDisplayName(name);
    expect(result.ok).toBe(true);
    expect(result.trimmed).toBe(name);
  });

  it(`rejects too long (${DISPLAY_NAME_MAX_LENGTH + 1} chars)`, () => {
    const name = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    const result = validateDisplayName(name);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('too_long');
  });

  it('rejects names containing @', () => {
    expect(validateDisplayName('bad@name').error).toBe('contains_mention');
    expect(validateDisplayName('@root').error).toBe('contains_mention');
  });

  it('rejects names containing http URL', () => {
    expect(validateDisplayName('visit http://evil.example').error).toBe('contains_url');
  });

  it('rejects names containing https URL', () => {
    expect(validateDisplayName('https://example.com/me').error).toBe('contains_url');
  });

  it('rejects names containing www. URL', () => {
    expect(validateDisplayName('www.evil.test').error).toBe('contains_url');
  });

  it('rejects reserved words case-insensitively', () => {
    for (const reserved of RESERVED_DISPLAY_NAMES) {
      const mixedCase = reserved
        .split('')
        .map((char, idx) => (idx % 2 ? char.toUpperCase() : char.toLowerCase()))
        .join('');
      const result = validateDisplayName(mixedCase);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('reserved_word');
    }
  });

  it('trims whitespace before validating', () => {
    const result = validateDisplayName('   Valid Name   ');
    expect(result.ok).toBe(true);
    expect(result.trimmed).toBe('Valid Name');
  });

  it('accepts a regular human name', () => {
    const result = validateDisplayName('Alice Johnson');
    expect(result.ok).toBe(true);
    expect(result.trimmed).toBe('Alice Johnson');
    expect(result.error).toBeUndefined();
  });

  it('allows names with hyphens and digits', () => {
    expect(validateDisplayName('Jean-Luc 7').ok).toBe(true);
    expect(validateDisplayName('user42').ok).toBe(true);
  });
});
