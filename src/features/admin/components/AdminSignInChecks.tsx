import React from 'react';
import { t } from '@lingui/macro';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useSignInChecks, type SignInChecks } from '@/features/admin/hooks/useSignInChecks';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

type Advice = SignInChecks['advice'][number];

const adviceText = (advice: Advice) => {
  const provider = advice.provider ?? '';
  switch (advice.code) {
    case 'verify_without_smtp':
      return t`Address confirmation is on, but Keycloak has no mail server: sign-up waits for an email that never comes. Set up email or turn confirmation off.`;
    case 'trust_email_off':
      return t`${provider}: Trust Email is off, so people signing in through it are asked to confirm an address their own sign-in already vouches for. Turn on Trust Email (with Sync mode: force for people who already signed in).`;
    case 'groups_not_forced':
      return t`${provider}: a group mapper does not use Sync mode: force, so a group change in the provider reaches Keycloak only at the first sign-in. Set it to force.`;
    case 'no_group_mappers':
      return t`Groups decide access here, but no sign-in provider has a group mapper: groups have to be assigned in Keycloak itself.`;
    case 'registration_open':
      return t`Anyone who reaches the sign-in page can create an account.`;
    default:
      return advice.code;
  }
};

const YesNoBadge: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => (
  <Badge variant={on ? 'secondary' : 'outline'} className="font-normal">
    {children}: {on ? t`on` : t`off`}
  </Badge>
);

/**
 * Admin → System → Sign-in checks: the Keycloak realm (sign-up, address
 * confirmation, mail) and each external sign-in provider (Trust Email, Sync
 * mode, group mappers), with what needs attention. Read only: changes are made
 * in Keycloak's own console.
 */
export const AdminSignInChecks: React.FC = () => {
  const { checks, loading, error, refresh } = useSignInChecks();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">{t`Sign-in checks`}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="sr-only">{t`Refresh`}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="text-destructive">{error}</p>}
        {!checks && loading && <p className="text-muted-foreground">{t`Checking…`}</p>}
        {checks && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <YesNoBadge on={checks.snapshot.registrationAllowed}>{t`Sign-up`}</YesNoBadge>
              <YesNoBadge on={checks.snapshot.verifyEmail}>{t`Address confirmation`}</YesNoBadge>
              <YesNoBadge on={checks.snapshot.smtpConfigured}>{t`Keycloak email`}</YesNoBadge>
              <YesNoBadge on={checks.snapshot.resetPasswordAllowed}>{t`Forgot password`}</YesNoBadge>
            </div>

            {checks.snapshot.identityProviders.length === 0 ? (
              <p className="text-muted-foreground">{t`No external sign-in providers: people sign in with a Keycloak password.`}</p>
            ) : (
              <ul className="space-y-1.5">
                {checks.snapshot.identityProviders.map((provider) => (
                  <li key={provider.alias} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{provider.displayName || provider.alias}</span>
                    {!provider.enabled && <Badge variant="outline">{t`turned off`}</Badge>}
                    <YesNoBadge on={provider.trustEmail}>Trust Email</YesNoBadge>
                    <Badge variant="outline" className="font-normal">Sync mode: {provider.syncMode.toLowerCase()}</Badge>
                    <Badge variant="outline" className="font-normal">
                      {t`group mappers`}: {provider.groupMappers.length}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            {checks.advice.length === 0 ? (
              <p className="text-emerald-600 dark:text-emerald-400">{t`Nothing needs attention.`}</p>
            ) : (
              <ul className="space-y-2">
                {checks.advice.map((advice) => (
                  <li key={`${advice.code}:${advice.provider ?? ''}`} className="flex items-start gap-2">
                    {advice.level === 'warning'
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span>{adviceText(advice)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
