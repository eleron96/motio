import React from 'react';
import { t } from '@lingui/macro';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type {
  AnnouncementAudienceKind,
  AnnouncementDraft,
  AnnouncementLevel,
} from '@/features/admin/lib/announcements';

interface AnnouncementFieldsProps {
  draft: AnnouncementDraft;
  onChange: (patch: Partial<AnnouncementDraft>) => void;
  workspaces: Array<{ id: string; name: string }>;
  /** Unique per instance: the same fields render in the form and in the edit dialog. */
  idPrefix: string;
}

/**
 * The announcement's own fields, shared by the "new announcement" form and the
 * edit dialog so the two can never drift apart.
 */
export const AnnouncementFields: React.FC<AnnouncementFieldsProps> = ({
  draft,
  onChange,
  workspaces,
  idPrefix,
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t`Level`}</Label>
        <SegmentedControl>
          <SegmentedControlItem
            active={draft.level === 'info'}
            onClick={() => onChange({ level: 'info' as AnnouncementLevel })}
          >
            {t`Banner`}
          </SegmentedControlItem>
          <SegmentedControlItem
            active={draft.level === 'critical'}
            onClick={() => onChange({ level: 'critical' as AnnouncementLevel })}
          >
            {t`Important`}
          </SegmentedControlItem>
        </SegmentedControl>
        <p className="text-xs text-muted-foreground">
          {draft.level === 'info'
            ? t`A strip above the workspace that can be dismissed.`
            : t`Interrupts once with a dialog. Use for maintenance and outages.`}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{t`Audience`}</Label>
        <Select
          value={draft.audienceKind}
          onValueChange={(value) => onChange({ audienceKind: value as AnnouncementAudienceKind })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all_active">{t`All active users`}</SelectItem>
            <SelectItem value="domain">{t`Email domain`}</SelectItem>
            <SelectItem value="workspace">{t`Workspace`}</SelectItem>
          </SelectContent>
        </Select>
        {draft.audienceKind === 'domain' && (
          <Input
            placeholder="example.com"
            value={draft.domain}
            onChange={(event) => onChange({ domain: event.target.value })}
          />
        )}
        {draft.audienceKind === 'workspace' && (
          <Select value={draft.workspaceId} onValueChange={(value) => onChange({ workspaceId: value })}>
            <SelectTrigger><SelectValue placeholder={t`Select a workspace`} /></SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title-ru`}>{t`Title (RU)`}</Label>
        <Input
          id={`${idPrefix}-title-ru`}
          value={draft.titleRu}
          onChange={(event) => onChange({ titleRu: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title-en`}>{t`Title (EN)`}</Label>
        <Input
          id={`${idPrefix}-title-en`}
          value={draft.titleEn}
          onChange={(event) => onChange({ titleEn: event.target.value })}
          placeholder={t`Leave empty to reuse the Russian text`}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-body-ru`}>{t`Text (RU)`}</Label>
        <Textarea
          id={`${idPrefix}-body-ru`}
          rows={4}
          value={draft.bodyRu}
          onChange={(event) => onChange({ bodyRu: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-body-en`}>{t`Text (EN)`}</Label>
        <Textarea
          id={`${idPrefix}-body-en`}
          rows={4}
          value={draft.bodyEn}
          onChange={(event) => onChange({ bodyEn: event.target.value })}
        />
      </div>
    </div>

    <div className="space-y-1.5 sm:max-w-[220px]">
      <Label htmlFor={`${idPrefix}-ends-at`}>{t`Show until`}</Label>
      <Input
        id={`${idPrefix}-ends-at`}
        type="date"
        value={draft.endsAt}
        onChange={(event) => onChange({ endsAt: event.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        {t`Empty means it stays until each person dismisses it.`}
      </p>
    </div>
  </div>
);
