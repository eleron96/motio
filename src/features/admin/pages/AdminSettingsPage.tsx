import React, { useEffect } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useServerSettingsStore, type ServerSetting } from '@/features/admin/store/serverSettingsStore';
import {
  SERVER_SETTING_SECTIONS,
  serverSettingSection,
  serverSettingSectionTitle,
  serverSettingText,
} from '@/features/admin/lib/serverSettingLabels';
import { formatDate } from '@/features/admin/lib/format';
import { useLocaleStore } from '@/shared/store/localeStore';
import type { Locale } from '@/shared/lib/locale';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/sonner';

const settingStatus = (setting: ServerSetting, locale: Locale) => {
  if (setting.source === 'env') {
    const env = setting.env ?? '';
    return t`On through ${env}=true in .env. Change it there.`;
  }
  if (setting.source === 'admin') {
    const when = formatDate(setting.updatedAt, locale);
    if (setting.updatedBy && setting.updatedByName) {
      const who = setting.updatedByName;
      return t`Changed ${when} by ${who}.`;
    }
    if (setting.updatedBy) return t`Changed ${when} in the admin console.`;
    return t`Changed ${when} from the command line.`;
  }
  return t`As out of the box.`;
};

const SettingRow: React.FC<{
  setting: ServerSetting;
  saving: boolean;
  locale: Locale;
  onChange: (value: boolean | null) => void;
}> = ({ setting, saving, locale, onChange }) => {
  const { title, description } = serverSettingText(setting.key);
  const switchId = `server-setting-${setting.key.replace('.', '-')}`;
  return (
    <div className="flex items-start gap-4 py-3">
      <Switch
        id={switchId}
        checked={setting.value}
        disabled={saving || setting.source === 'env'}
        onCheckedChange={(value) => onChange(value)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={switchId} className="block text-sm font-medium">{title}</label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <p className="text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5">{setting.key}</code>
          {' · '}
          {settingStatus(setting, locale)}
        </p>
      </div>
      {setting.source === 'admin' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => onChange(null)}
        >
          {t`Reset`}
        </Button>
      )}
    </div>
  );
};

// Admin console → Settings: what this server allows beyond Motio out of the
// box. Every switch is off by default; off brings back how Motio works without
// it. The same switches from the command line: install.sh settings.
const AdminSettingsPage: React.FC = () => {
  const { settings, loaded, loading, error, savingKey, load, update } = useServerSettingsStore(useShallow((state) => ({
    settings: state.settings,
    loaded: state.loaded,
    loading: state.loading,
    error: state.error,
    savingKey: state.savingKey,
    load: state.load,
    update: state.update,
  })));
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChange = async (setting: ServerSetting, value: boolean | null) => {
    const result = await update(setting.key, value);
    if (result.error) toast.error(result.error);
  };

  if (!loaded || (loading && settings.length === 0 && !error)) {
    return <p className="text-sm text-muted-foreground">{t`Loading…`}</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t`Could not load the settings`}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{t`What this server allows beyond Motio out of the box. Everything is off by default; turning a switch off brings back how Motio works without it. People get a change the next time they open Motio.`}</p>
        <p>
          {t`The same from the command line:`}
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">infra/scripts/install.sh settings</code>
        </p>
      </div>

      {SERVER_SETTING_SECTIONS.map((section) => {
        const rows = settings.filter((setting) => serverSettingSection(setting.key) === section);
        if (rows.length === 0) return null;
        return (
          <Card key={section}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{serverSettingSectionTitle(section)}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {rows.map((setting) => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  saving={savingKey === setting.key}
                  locale={locale}
                  onChange={(value) => void handleChange(setting, value)}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AdminSettingsPage;
