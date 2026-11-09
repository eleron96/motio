import React from 'react';
import { t } from '@lingui/macro';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import type { UserDiagnosis } from '@/features/admin/hooks/useUserDiagnosis';
import { formatDate, formatWorkspaceRole } from '@/features/admin/lib/format';
import type { Locale } from '@/shared/lib/locale';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

const roleLabel = (role: string) => (
  role === 'admin' || role === 'editor' || role === 'viewer' || role === 'owner' ? formatWorkspaceRole(role) : role
);

const Fact: React.FC<{ ok: boolean | null; children: React.ReactNode }> = ({ ok, children }) => (
  <li className="flex items-start gap-2 text-sm">
    {ok === null
      ? <span className="mt-0.5 h-4 w-4 shrink-0 text-center text-muted-foreground">?</span>
      : ok
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
    <span>{children}</span>
  </li>
);

const GroupSyncPreview: React.FC<{ sync: NonNullable<UserDiagnosis['groupSync']> }> = ({ sync }) => {
  if (sync.error) return <p className="text-sm text-destructive">{sync.error}</p>;
  if (sync.noMappings) return <p className="text-sm text-muted-foreground">{t`No group mappings yet.`}</p>;
  const lines = [
    ...(sync.add ?? []).map((item) => {
      const role = roleLabel(item.role);
      return t`Joins ${item.workspaceName} as ${role}`;
    }),
    ...(sync.remove ?? []).map((item) => t`Leaves ${item.workspaceName}`),
    ...(sync.changeRole ?? []).map((item) => {
      const from = roleLabel(item.from);
      const to = roleLabel(item.role);
      return t`${item.workspaceName}: ${from} → ${to}`;
    }),
    ...(sync.manualRoles ?? []).map((item) => t`${item.workspaceName}: the role was set by hand and stays`),
  ];
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{t`Nothing to change: the groups and the workspaces agree.`}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
};

/**
 * Admin → Users → a person → Sign-in: what Keycloak says about the account and
 * what the group sync would do at their next visit. Read only.
 */
export const AdminUserSignInSection: React.FC<{
  diagnosis: UserDiagnosis | null;
  loading: boolean;
  error: string | null;
  locale: Locale;
  onReload: () => void;
}> = ({ diagnosis, loading, error, locale, onReload }) => {
  const keycloak = diagnosis?.keycloak;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t`Sign-in`}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onReload} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {t`Check again`}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!diagnosis && loading && <p className="text-sm text-muted-foreground">{t`Checking…`}</p>}

      {diagnosis && (
        <>
          <p className="text-xs text-muted-foreground">
            {t`Last sign-in`}: {formatDate(diagnosis.user.lastSignInAt, locale)}
          </p>
          {keycloak && !keycloak.linked && (
            <p className="text-sm text-muted-foreground">
              {t`No Keycloak account linked: a password-only service account (such as the reserve admin) or someone who never signed in.`}
            </p>
          )}
          {keycloak && keycloak.linked && (
            <>
              {keycloak.error && <p className="text-sm text-destructive">{keycloak.error}</p>}
              <ul className="space-y-1.5">
                <Fact ok={keycloak.found === null ? null : keycloak.found && keycloak.enabled !== false}>
                  {keycloak.found === false
                    ? t`The Keycloak account is gone.`
                    : keycloak.enabled === false ? t`The account is turned off in Keycloak.` : t`The account is on in Keycloak.`}
                </Fact>
                <Fact ok={keycloak.emailVerified}>
                  {keycloak.emailVerified ? t`The address is confirmed.` : t`The address is not confirmed: with confirmation on, Keycloak asks for it at sign-in.`}
                </Fact>
                {keycloak.requiredActions.length > 0 && (
                  <Fact ok={false}>
                    {t`Asked at the next sign-in:`} {keycloak.requiredActions.join(', ')}
                  </Fact>
                )}
              </ul>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t`Signs in through`}</p>
                <div className="flex flex-wrap gap-1.5">
                  {keycloak.providers.length === 0
                    ? <Badge variant="outline">{t`Keycloak password`}</Badge>
                    : keycloak.providers.map((provider) => (
                      <Badge key={provider.alias} variant="secondary">
                        {provider.alias}{provider.userName ? ` · ${provider.userName}` : ''}
                      </Badge>
                    ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t`Keycloak groups`}</p>
                {keycloak.groupsError
                  ? <p className="text-sm text-destructive">{keycloak.groupsError}</p>
                  : (keycloak.groups ?? []).length === 0
                    ? <p className="text-sm text-muted-foreground">{t`None.`}</p>
                    : (
                      <div className="flex flex-wrap gap-1.5">
                        {(keycloak.groups ?? []).map((group) => <Badge key={group} variant="outline">{group}</Badge>)}
                      </div>
                    )}
              </div>
              <p className="text-sm">
                {keycloak.superAdmin.direct
                  ? t`Super admin: by a role of their own.`
                  : keycloak.superAdmin.viaGroup
                    ? (keycloak.superAdmin.fromGroupsAllowed
                      ? t`Super admin: through a group.`
                      : t`The super admin role comes through a group, but Super admins from a group is off: no access to this console.`)
                    : t`Not a super admin.`}
              </p>
            </>
          )}
          {diagnosis.groupSync?.enabled && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t`Workspaces from groups, at the next visit`}</p>
              <GroupSyncPreview sync={diagnosis.groupSync} />
            </div>
          )}
        </>
      )}
    </section>
  );
};
