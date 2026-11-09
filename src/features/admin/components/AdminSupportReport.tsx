import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Download } from 'lucide-react';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { listBuildFeatureFlags } from '@/shared/lib/featureFlags';
import type { SystemStatus } from '@/features/admin/lib/systemStatus';
import type { ServerSetting } from '@/features/admin/store/serverSettingsStore';
import { fetchSignInChecks } from '@/features/admin/hooks/useSignInChecks';
import {
  buildSupportReport,
  supportReportFileName,
  type SupportReportCounts,
} from '@/features/admin/lib/supportReport';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { toast } from '@/shared/ui/sonner';

const download = (name: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Admin → System → Support report: a file describing this install (versions,
 * switches, service health, sign-in configuration, counts) to attach to a bug
 * report. No names, email addresses or secrets.
 */
export const AdminSupportReport: React.FC = () => {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    const [status, settings, signIn, counts] = await Promise.all([
      invokeAdminFunction<{ status: SystemStatus }>({ action: ADMIN_ACTIONS.SYSTEM_STATUS }),
      invokeAdminFunction<{ settings: ServerSetting[] }>({ action: ADMIN_ACTIONS.SETTINGS_LIST }),
      fetchSignInChecks(),
      invokeAdminFunction<{ counts: SupportReportCounts }>({ action: ADMIN_ACTIONS.SYSTEM_REPORT }),
    ]);
    setBusy(false);
    const problems = [
      status.error !== undefined ? `status: ${status.error}` : null,
      settings.error !== undefined ? `settings: ${settings.error}` : null,
      signIn.error !== undefined ? `sign-in checks: ${signIn.error}` : null,
      counts.error !== undefined ? `counts: ${counts.error}` : null,
    ].filter((problem): problem is string => problem !== null);
    const generatedAt = new Date().toISOString();
    const report = buildSupportReport({
      generatedAt,
      appVersion: APP_VERSION,
      buildFlags: listBuildFeatureFlags(),
      status: status.error === undefined ? status.data.status : null,
      settings: settings.error === undefined ? settings.data.settings : null,
      signIn: signIn.error === undefined ? signIn.data.checks : null,
      counts: counts.error === undefined ? counts.data.counts : null,
      problems,
    });
    download(supportReportFileName(generatedAt), JSON.stringify(report, null, 2));
    toast.success(t`Downloaded. Have a look before sending it: there are no names, addresses or secrets in it.`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t`Support report`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t`One file to attach to a bug report: versions, switches, service health, sign-in configuration and counts. No names, email addresses or secrets.`}
        </p>
        <Button size="sm" variant="outline" onClick={() => void handleDownload()} disabled={busy}>
          <Download className="mr-2 h-4 w-4" />
          {t`Download report`}
        </Button>
      </CardContent>
    </Card>
  );
};
