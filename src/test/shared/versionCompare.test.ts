import { describe, expect, it } from 'vitest';

import { isNewerVersion, isNotableUpdate } from '@/shared/domain/versionCompare';

describe('isNotableUpdate', () => {
  it('is true for a new minor or major version', () => {
    expect(isNotableUpdate('0.10.71', '0.11.0')).toBe(true);
    expect(isNotableUpdate('0.10.71', '0.12.3')).toBe(true);
    expect(isNotableUpdate('0.10.71', '1.0.0')).toBe(true);
    expect(isNotableUpdate('0.10.71', 'v0.11.0')).toBe(true);
  });

  it('is false for patch releases, the same version and older ones', () => {
    expect(isNotableUpdate('0.10.71', '0.10.72')).toBe(false);
    expect(isNotableUpdate('0.10.71', '0.10.150')).toBe(false);
    expect(isNotableUpdate('0.10.71', '0.10.71')).toBe(false);
    expect(isNotableUpdate('0.11.0', '0.10.99')).toBe(false);
    expect(isNotableUpdate('1.0.0', '0.99.0')).toBe(false);
  });

  it('is false when either version cannot be read', () => {
    expect(isNotableUpdate('0.10.71', 'nightly')).toBe(false);
    expect(isNotableUpdate('', '0.11.0')).toBe(false);
  });

  it('is stricter than isNewerVersion: every notable update is a newer version', () => {
    for (const candidate of ['0.10.72', '0.11.0', '1.0.0', '0.10.70']) {
      if (isNotableUpdate('0.10.71', candidate)) {
        expect(isNewerVersion('0.10.71', candidate)).toBe(true);
      }
    }
  });
});
