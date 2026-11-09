import type { SystemStatus } from '@/features/admin/lib/systemStatus';
import type { ServerSetting } from '@/features/admin/store/serverSettingsStore';
import type { SignInChecks } from '@/features/admin/hooks/useSignInChecks';

// Admin → System → Support report: one file that describes this install for a
// bug report. Built from what the console already shows; everything personal
// is left out on purpose — who changed a setting, people's names and email
// addresses, the realm's display names. What remains: versions, switches,
// service health, sign-in configuration, counts.

export type SupportReportCounts = Record<string, number | null>;

export const buildSupportReport = (input: {
  generatedAt: string;
  appVersion: string;
  buildFlags: Array<{ name: string; enabled: boolean }>;
  status: SystemStatus | null;
  settings: ServerSetting[] | null;
  signIn: SignInChecks | null;
  counts: SupportReportCounts | null;
  problems: string[];
}) => ({
  format: 'motio-support-report',
  version: 1,
  generatedAt: input.generatedAt,
  app: {
    version: input.appVersion,
    buildFlags: Object.fromEntries(input.buildFlags.map((flag) => [flag.name, flag.enabled])),
  },
  system: input.status
    ? {
      selfHosted: input.status.selfHosted,
      latestRelease: input.status.latestRelease?.tag ?? null,
      updateCheck: input.status.updateCheck,
      services: Object.fromEntries(input.status.services.map((service) => [service.key, service.ok])),
      configured: input.status.configured,
    }
    : null,
  settings: input.settings
    ? Object.fromEntries(input.settings.map((setting) => [setting.key, { value: setting.value, source: setting.source }]))
    : null,
  signIn: input.signIn
    ? {
      registrationAllowed: input.signIn.snapshot.registrationAllowed,
      verifyEmail: input.signIn.snapshot.verifyEmail,
      resetPasswordAllowed: input.signIn.snapshot.resetPasswordAllowed,
      smtpConfigured: input.signIn.snapshot.smtpConfigured,
      identityProviders: input.signIn.snapshot.identityProviders.map((provider) => ({
        type: provider.providerId,
        enabled: provider.enabled,
        trustEmail: provider.trustEmail,
        syncMode: provider.syncMode,
        groupMappers: provider.groupMappers.map((mapper) => mapper.syncMode),
      })),
      advice: input.signIn.advice.map((advice) => advice.code),
    }
    : null,
  counts: input.counts,
  // Parts that could not be read, so the reader knows what is missing and why.
  problems: input.problems,
});

export const supportReportFileName = (generatedAt: string) => `motio-support-report-${generatedAt.slice(0, 10)}.json`;
