// Admin → System → Sign-in checks: what in the Keycloak realm needs attention,
// without any I/O (unit-tested in src/test/shared/signInChecks.test.ts).
// Reading the realm is admin/signInChecks.ts.

export type IdentityProviderSnapshot = {
  alias: string;
  displayName: string | null;
  providerId: string;
  enabled: boolean;
  trustEmail: boolean;
  // IMPORT (only the first sign-in copies data), FORCE (every sign-in), LEGACY.
  syncMode: string;
  // Mappers that put people into Keycloak groups, with their own sync mode
  // (INHERIT = the provider's).
  groupMappers: Array<{ name: string; syncMode: string }>;
};

export type SignInSnapshot = {
  registrationAllowed: boolean;
  verifyEmail: boolean;
  resetPasswordAllowed: boolean;
  smtpConfigured: boolean;
  identityProviders: IdentityProviderSnapshot[];
  workspacesFromGroups: boolean;
  superAdminFromGroups: boolean;
};

export type SignInAdviceCode =
  | "verify_without_smtp"
  | "trust_email_off"
  | "groups_not_forced"
  | "no_group_mappers"
  | "registration_open";

export type SignInAdvice = {
  level: "warning" | "info";
  code: SignInAdviceCode;
  provider?: string;
};

const effectiveSyncMode = (provider: IdentityProviderSnapshot, mapperMode: string) => {
  const mode = (mapperMode || "INHERIT").toUpperCase();
  return mode === "INHERIT" ? (provider.syncMode || "IMPORT").toUpperCase() : mode;
};

export const signInAdvice = (snapshot: SignInSnapshot): SignInAdvice[] => {
  const advice: SignInAdvice[] = [];
  const providers = snapshot.identityProviders.filter((provider) => provider.enabled);
  const groupsUsed = snapshot.workspacesFromGroups || snapshot.superAdminFromGroups;

  // Sign-up and email changes wait for a confirmation that never arrives.
  if (snapshot.verifyEmail && !snapshot.smtpConfigured) {
    advice.push({ level: "warning", code: "verify_without_smtp" });
  }

  for (const provider of providers) {
    // People from this provider are asked to confirm an address their own
    // sign-in has already vouched for.
    if (snapshot.verifyEmail && !provider.trustEmail) {
      advice.push({ level: "warning", code: "trust_email_off", provider: provider.alias });
    }
    // A group change in the provider would reach Keycloak only at the first
    // sign-in, never again.
    if (groupsUsed && provider.groupMappers.some((mapper) => effectiveSyncMode(provider, mapper.syncMode) !== "FORCE")) {
      advice.push({ level: "warning", code: "groups_not_forced", provider: provider.alias });
    }
  }

  if (groupsUsed && providers.length > 0 && providers.every((provider) => provider.groupMappers.length === 0)) {
    advice.push({ level: "info", code: "no_group_mappers" });
  }

  if (snapshot.registrationAllowed) {
    advice.push({ level: "info", code: "registration_open" });
  }

  return advice;
};
