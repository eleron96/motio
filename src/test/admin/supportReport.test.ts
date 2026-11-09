import { describe, expect, it } from 'vitest';
import { buildSupportReport, supportReportFileName } from '@/features/admin/lib/supportReport';

describe('support report', () => {
  const report = buildSupportReport({
    generatedAt: '2026-11-09T15:00:00.000Z',
    appVersion: '0.10.72',
    buildFlags: [{ name: 'VITE_FEATURE_PUSH', enabled: true }],
    status: {
      services: [{ key: 'gateway', ok: true, ms: 4 }],
      latestRelease: { tag: 'v0.10.72', url: 'https://github.com/eleron96/motio/releases/tag/v0.10.72', publishedAt: null },
      updateCheck: 'ok',
      selfHosted: true,
      configured: { email: true, push: true, errorTracking: false },
    },
    settings: [{
      key: 'timeline.density', value: true, defaultValue: false, source: 'admin', env: null, client: true,
      updatedAt: '2026-11-09T10:00:00Z', updatedBy: 'u-anna', updatedByName: 'Anna Example',
    }],
    signIn: {
      realm: 'timeline',
      snapshot: {
        registrationAllowed: false, verifyEmail: true, resetPasswordAllowed: true, smtpConfigured: true,
        identityProviders: [{
          alias: 'acme-sso', displayName: 'Acme Corp SSO', providerId: 'oidc', enabled: true, trustEmail: false,
          syncMode: 'FORCE', groupMappers: [{ name: 'Acme groups', syncMode: 'INHERIT' }],
        }],
        workspacesFromGroups: true, superAdminFromGroups: false,
      },
      advice: [{ level: 'warning', code: 'trust_email_off', provider: 'acme-sso' }],
    },
    counts: { people: 12, workspaces: 2 },
    problems: [],
  });

  it('describes the install: versions, switches, services, sign-in, counts', () => {
    expect(report.app).toEqual({ version: '0.10.72', buildFlags: { VITE_FEATURE_PUSH: true } });
    expect(report.settings).toEqual({ 'timeline.density': { value: true, source: 'admin' } });
    expect(report.system?.services).toEqual({ gateway: true });
    expect(report.signIn?.advice).toEqual(['trust_email_off']);
    expect(report.counts).toEqual({ people: 12, workspaces: 2 });
  });

  it('leaves out names, provider names and who changed what', () => {
    const text = JSON.stringify(report);
    for (const personal of ['Anna', 'u-anna', 'Acme', 'acme-sso', 'github.com']) {
      expect(text).not.toContain(personal);
    }
  });

  it('names the file by its date', () => {
    expect(supportReportFileName('2026-11-09T15:00:00.000Z')).toBe('motio-support-report-2026-11-09.json');
  });
});
