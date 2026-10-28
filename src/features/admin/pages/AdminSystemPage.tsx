import React from 'react';
import { t } from '@lingui/macro';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { listBuildFeatureFlags } from '@/shared/lib/featureFlags';
import { useSystemStatus } from '@/features/admin/hooks/useSystemStatus';
import { isNewerVersion, type SystemServiceKey, type TestEmailResult } from '@/features/admin/lib/systemStatus';

const serviceLabel = (key: SystemServiceKey) => {
  switch (key) {
    case 'gateway': return t`API gateway`;
    case 'database': return t`Database`;
    case 'auth': return t`Sign-in (GoTrue)`;
    case 'storage': return t`File storage`;
    case 'realtime': return t`Live updates`;
    case 'keycloak': return t`Keycloak`;
    case 'backup': return t`Backup service`;
    default: return key;
  }
};

const testEmailText = (result: TestEmailResult) => {
  switch (result.status) {
    case 'sent': return t`Sent. Check the inbox of your admin account.`;
    case 'not_configured': return t`Email is not configured: no SMTP server in the settings.`;
    case 'throttled': return t`Wait ${result.retryAfterSeconds} s before sending another one.`;
    case 'failed': return t`Could not send: ${result.message}`;
    default: return '';
  }
};

const YesNo: React.FC<{ value: boolean }> = ({ value }) => (
  value ? (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      {t`on`}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <XCircle className="h-4 w-4" aria-hidden="true" />
      {t`off`}
    </span>
  )
);

/**
 * Admin → System: version and updates, service health, what is switched on,
 * a test email. Read-only — updating stays a command on the server
 * (infra/scripts/install.sh update), see docs/self-hosting.md.
 */
const AdminSystemPage: React.FC = () => {
  const { status, loading, error, refresh, testEmail, sending, sendTestEmail } = useSystemStatus();
  const latest = status?.latestRelease ?? null;
  const updateAvailable = latest ? isNewerVersion(APP_VERSION, latest.tag) : false;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t`Refresh`}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t`Version`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="text-2xl font-semibold tabular-nums">{APP_VERSION}</div>
            {status?.updateCheck === 'disabled' && (
              <p className="text-muted-foreground">{t`Update check is off (MOTIO_UPDATE_CHECK=false).`}</p>
            )}
            {status?.updateCheck === 'unavailable' && (
              <p className="text-muted-foreground">{t`Could not check for updates right now.`}</p>
            )}
            {status?.updateCheck === 'ok' && latest && !updateAvailable && (
              <p className="text-muted-foreground">{t`This is the latest release.`}</p>
            )}
            {updateAvailable && latest && (
              <div className="space-y-2">
                <p>
                  {t`Version ${latest.tag} is available.`}{' '}
                  <a href={latest.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                    {t`What's new`}
                  </a>
                </p>
                {status?.selfHosted && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">{t`To update, run on the server:`}</p>
                    <code className="block break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                      {`infra/scripts/install.sh update --version ${latest.tag}`}
                    </code>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t`Services`}</CardTitle>
          </CardHeader>
          <CardContent>
            {!status ? (
              <p className="text-sm text-muted-foreground">{loading ? t`Checking…` : '—'}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {status.services.map((service) => (
                  <li key={service.key} className="flex items-center justify-between gap-3">
                    <span>{serviceLabel(service.key)}</span>
                    {service.ok ? (
                      <span className="inline-flex items-center gap-1 tabular-nums text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t`works`}{service.ms !== null ? ` · ${service.ms} ms` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        {t`not responding`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t`What is switched on`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1.5">
              <li className="flex items-center justify-between gap-3">
                <span>{t`Email (SMTP)`}</span>
                {status ? <YesNo value={status.configured.email} /> : '—'}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>{t`Push notifications`}</span>
                {status ? <YesNo value={status.configured.push} /> : '—'}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>{t`Error tracking`}</span>
                {status ? <YesNo value={status.configured.errorTracking} /> : '—'}
              </li>
            </ul>
            <ul className="space-y-1.5 border-t border-border pt-3">
              {listBuildFeatureFlags().map((flag) => (
                <li key={flag.name} className="flex items-center justify-between gap-3">
                  <code className="truncate font-mono text-xs">{flag.name}</code>
                  <YesNo value={flag.enabled} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t`Email check`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t`Sends a short test email to the address of your admin account.`}
            </p>
            <Button size="sm" onClick={() => void sendTestEmail()} disabled={sending}>
              {t`Send test email`}
            </Button>
            {testEmail && (
              <p className={testEmail.status === 'sent' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                {testEmailText(testEmail)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSystemPage;
