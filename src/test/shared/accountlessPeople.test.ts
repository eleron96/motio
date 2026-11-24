import { describe, expect, it } from 'vitest';
import {
  isAccountlessPerson,
  isAssigneeRowListed,
  normalizeAccountlessName,
} from '@/shared/domain/accountlessPeople';

describe('isAssigneeRowListed', () => {
  it('always lists a person with an account', () => {
    for (const accountlessPeopleEnabled of [false, true]) {
      expect(isAssigneeRowListed(
        { userId: 'user-1', hasLoadedTask: false },
        { accountlessPeopleEnabled },
      )).toBe(true);
    }
  });

  it('with the setting off, lists a row without an account only while a loaded task points at it', () => {
    const options = { accountlessPeopleEnabled: false };
    expect(isAssigneeRowListed({ userId: null, hasLoadedTask: true }, options)).toBe(true);
    expect(isAssigneeRowListed({ userId: null, hasLoadedTask: false }, options)).toBe(false);
  });

  it('with the setting on, lists a row without an account even with no tasks', () => {
    const options = { accountlessPeopleEnabled: true };
    expect(isAssigneeRowListed({ userId: null, hasLoadedTask: false }, options)).toBe(true);
    expect(isAssigneeRowListed({ userId: null, hasLoadedTask: true }, options)).toBe(true);
  });
});

describe('isAccountlessPerson', () => {
  it('is someone added by name: no user and not a sample colleague', () => {
    expect(isAccountlessPerson({ userId: null })).toBe(true);
    expect(isAccountlessPerson({})).toBe(true);
    expect(isAccountlessPerson({ userId: null, isSample: false })).toBe(true);
  });

  it('is not a member or a sample colleague', () => {
    expect(isAccountlessPerson({ userId: 'user-1' })).toBe(false);
    expect(isAccountlessPerson({ userId: null, isSample: true })).toBe(false);
  });
});

describe('normalizeAccountlessName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeAccountlessName('  Anna   Becker ')).toBe('Anna Becker');
    expect(normalizeAccountlessName('Van\t2')).toBe('Van 2');
  });

  it('returns null for an empty name', () => {
    expect(normalizeAccountlessName('')).toBeNull();
    expect(normalizeAccountlessName('   ')).toBeNull();
  });

  it('cuts a name that is too long', () => {
    expect(normalizeAccountlessName('a'.repeat(300))).toHaveLength(120);
  });
});
