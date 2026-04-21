import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { AlertTriangle } from 'lucide-react';
import {
  useAuthStore,
  type DeletionPreview,
  type DeletionPreviewWorkspace,
  type DeletionTransfer,
} from '@/features/auth/store/authStore';
import { useLocaleStore } from '@/shared/store/localeStore';

const CONFIRMATION_PHRASES = {
  ru: 'Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам',
  en: 'I understand that I am permanently deleting my account and losing access to all workspaces',
} as const;

type WorkspaceDecision =
  | { kind: 'transfer'; newOwnerId: string }
  | { kind: 'delete' }
  | { kind: 'pending' };

const buildTransfers = (
  workspaces: DeletionPreviewWorkspace[],
  decisions: Record<string, WorkspaceDecision>,
): DeletionTransfer[] => (
  workspaces.map((workspace) => {
    const decision = decisions[workspace.id];
    if (!decision || decision.kind === 'pending') {
      return { workspace_id: workspace.id, action: 'delete' as const };
    }
    if (decision.kind === 'transfer') {
      return {
        workspace_id: workspace.id,
        action: 'transfer' as const,
        new_owner_id: decision.newOwnerId,
      };
    }
    return { workspace_id: workspace.id, action: 'delete' as const };
  })
);

export interface DeleteAccountWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditDisplayName?: () => void;
}

export const DeleteAccountWizard: React.FC<DeleteAccountWizardProps> = ({
  open,
  onOpenChange,
  onEditDisplayName,
}) => {
  const previewAccountDeletion = useAuthStore((state) => state.previewAccountDeletion);
  const requestAccountDeletion = useAuthStore((state) => state.requestAccountDeletion);
  const profileDisplayName = useAuthStore((state) => state.profileDisplayName);
  const user = useAuthStore((state) => state.user);
  const locale = useLocaleStore((state) => state.locale);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, WorkspaceDecision>>({});
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStep(1);
    setError(null);
    setPhrase('');
    setDecisions({});
    setLoading(true);
    previewAccountDeletion().then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(result.data ?? null);
      const initial: Record<string, WorkspaceDecision> = {};
      result.data?.workspacesRequiringAction.forEach((workspace) => {
        initial[workspace.id] = { kind: 'pending' };
      });
      setDecisions(initial);
    });
    return () => {
      active = false;
    };
  }, [open, previewAccountDeletion]);

  const expectedPhrase = CONFIRMATION_PHRASES[locale] ?? CONFIRMATION_PHRASES.en;
  const requiringAction = preview?.workspacesRequiringAction ?? [];
  const autoHandled = preview?.workspacesAutoHandled ?? [];

  const allDecided = useMemo(
    () => requiringAction.every((workspace) => {
      const decision = decisions[workspace.id];
      return decision && decision.kind !== 'pending';
    }),
    [requiringAction, decisions],
  );

  const phraseMatches = phrase === expectedPhrase;

  const handleConfirmDeletion = async () => {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    const transfers = buildTransfers(requiringAction, decisions);
    const result = await requestAccountDeletion(transfers, phrase);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setStep(3);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (submitting) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && t`Delete account — review workspaces`}
            {step === 2 && t`Delete account — confirm`}
            {step === 3 && t`Account deletion scheduled`}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && t`Choose an heir for workspaces where you are the sole admin.`}
            {step === 2 && t`This action is irreversible after the grace period. Read carefully.`}
            {step === 3 && t`You have 30 days to restore your account before it is permanently purged.`}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t`Loading your workspaces…`}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && preview && step === 1 && (
          <div className="space-y-4">
            {requiringAction.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t`No workspaces need your attention — you can continue.`}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t`You are the sole admin in these workspaces. Pick an heir or delete the workspace.`}
                </p>
                {requiringAction.map((workspace) => {
                  const decision = decisions[workspace.id] ?? { kind: 'pending' };
                  const selectValue = decision.kind === 'transfer' ? `transfer:${decision.newOwnerId}`
                    : decision.kind === 'delete' ? 'delete' : '';
                  return (
                    <div key={workspace.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{workspace.name}</span>
                      </div>
                      <Label htmlFor={`workspace-${workspace.id}`} className="text-xs text-muted-foreground">
                        {t`Who takes over?`}
                      </Label>
                      <Select
                        value={selectValue}
                        onValueChange={(value) => {
                          setDecisions((prev) => {
                            if (value === 'delete') {
                              return { ...prev, [workspace.id]: { kind: 'delete' } };
                            }
                            if (value.startsWith('transfer:')) {
                              return {
                                ...prev,
                                [workspace.id]: {
                                  kind: 'transfer',
                                  newOwnerId: value.slice('transfer:'.length),
                                },
                              };
                            }
                            return prev;
                          });
                        }}
                      >
                        <SelectTrigger id={`workspace-${workspace.id}`}>
                          <SelectValue placeholder={t`Choose an option`} />
                        </SelectTrigger>
                        <SelectContent>
                          {workspace.candidates.map((candidate) => (
                            <SelectItem
                              key={candidate.user_id}
                              value={`transfer:${candidate.user_id}`}
                            >
                              {candidate.display_name ?? candidate.user_id}
                            </SelectItem>
                          ))}
                          <SelectItem value="delete">
                            {t`Delete this workspace`}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {decision.kind === 'transfer' && (
                        <p className="text-xs text-emerald-600" data-testid={`transfer-preview-${workspace.id}`}>
                          {t`New owner: ${workspace.candidates.find((c) => c.user_id === decision.newOwnerId)?.display_name ?? decision.newOwnerId}`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {autoHandled.length > 0 && (
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                <div className="mb-1 font-medium">{t`Workspaces you will simply leave:`}</div>
                <ul className="list-disc pl-5">
                  {autoHandled.map((workspace) => (
                    <li key={workspace.id}>{workspace.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t`Cancel`}
              </Button>
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!allDecided}
              >
                {t`Continue`}
              </Button>
            </div>
          </div>
        )}

        {!loading && preview && step === 2 && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div className="space-y-1">
                  <p>{t`Your account will be scheduled for deletion in ${preview.purgeDelayDays} days.`}</p>
                  <p>{t`During this period, you can sign in to restore the account.`}</p>
                  <p>{t`After the grace period, all data (comments, tasks, profile) will be anonymized and cannot be recovered.`}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t`Your display name stays visible in historical comments:`}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-medium">{profileDisplayName ?? user?.email ?? t`(no name set)`}</span>
                {onEditDisplayName && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onEditDisplayName}
                  >
                    {t`Change name`}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmation-phrase">{t`Type the phrase to confirm:`}</Label>
              <p className="rounded-md bg-muted p-2 font-mono text-xs">{expectedPhrase}</p>
              <Input
                id="confirmation-phrase"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder={expectedPhrase}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                {t`Back`}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDeletion}
                disabled={!phraseMatches || submitting}
              >
                {submitting ? t`Deleting…` : t`Delete account`}
              </Button>
            </div>
          </div>
        )}

        {!loading && step === 3 && (
          <div className="space-y-4">
            <p className="text-sm">
              {t`Your account is now pending deletion. You will be redirected to the restore screen the next time you sign in.`}
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t`Close`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
