// Admin → System → Sign-in checks: reads the Keycloak realm, its identity
// providers and their group mappers (read only), and says what needs attention
// (../_shared/signInChecks.ts).
import { keycloakRequest, parseKeycloakError, type KeycloakConfig } from "../_shared/keycloak.ts";
import {
  signInAdvice,
  type IdentityProviderSnapshot,
  type SignInSnapshot,
} from "../_shared/signInChecks.ts";
import type { InstanceSettingValues } from "../_shared/instanceSettings.ts";

type RealmRepresentation = {
  registrationAllowed?: boolean;
  verifyEmail?: boolean;
  resetPasswordAllowed?: boolean;
  smtpServer?: { host?: string } | null;
};

type ProviderRepresentation = {
  alias: string;
  displayName?: string;
  providerId?: string;
  enabled?: boolean;
  trustEmail?: boolean;
  config?: { syncMode?: string };
};

type MapperRepresentation = {
  name?: string;
  identityProviderMapper?: string;
  config?: { syncMode?: string };
};

const realmPath = (config: KeycloakConfig) => `/admin/realms/${encodeURIComponent(config.realm)}`;

const getJson = async <T>(config: KeycloakConfig, path: string): Promise<{ data: T } | { error: string }> => {
  const response = await keycloakRequest(config, path, { method: "GET" });
  if (!response.ok) return { error: await parseKeycloakError(response) };
  return { data: await response.json() as T };
};

export const readSignInChecks = async (config: KeycloakConfig, settings: InstanceSettingValues) => {
  const realm = await getJson<RealmRepresentation>(config, realmPath(config));
  if ("error" in realm) return { error: realm.error };

  const providersResult = await getJson<ProviderRepresentation[]>(config, `${realmPath(config)}/identity-provider/instances`);
  if ("error" in providersResult) return { error: providersResult.error };

  const identityProviders: IdentityProviderSnapshot[] = [];
  for (const provider of providersResult.data) {
    const mappers = await getJson<MapperRepresentation[]>(
      config,
      `${realmPath(config)}/identity-provider/instances/${encodeURIComponent(provider.alias)}/mappers`,
    );
    const groupMappers = "error" in mappers
      ? []
      : mappers.data
        .filter((mapper) => (mapper.identityProviderMapper ?? "").includes("group"))
        .map((mapper) => ({ name: mapper.name ?? "", syncMode: mapper.config?.syncMode ?? "INHERIT" }));
    identityProviders.push({
      alias: provider.alias,
      displayName: provider.displayName ?? null,
      providerId: provider.providerId ?? "",
      enabled: provider.enabled !== false,
      trustEmail: provider.trustEmail === true,
      syncMode: (provider.config?.syncMode ?? "IMPORT").toUpperCase(),
      groupMappers,
    });
  }

  const snapshot: SignInSnapshot = {
    registrationAllowed: realm.data.registrationAllowed === true,
    verifyEmail: realm.data.verifyEmail === true,
    resetPasswordAllowed: realm.data.resetPasswordAllowed === true,
    smtpConfigured: Boolean(realm.data.smtpServer?.host),
    identityProviders,
    workspacesFromGroups: settings["groups.workspaces"],
    superAdminFromGroups: settings["groups.superAdmin"],
  };
  return { realm: config.realm, snapshot, advice: signInAdvice(snapshot) };
};
