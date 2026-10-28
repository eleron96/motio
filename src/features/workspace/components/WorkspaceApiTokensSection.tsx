import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { localeIntlTags } from '@/shared/lib/locale';
import { useLocaleStore } from '@/shared/store/localeStore';
import { Block } from '@/features/workspace/components/settingsBlocks';
import { useWorkspaceApiTokens } from '@/features/workspace/hooks/useWorkspaceApiTokens';
import type { ApiTokenErrorCode, WorkspaceApiToken } from '@/infrastructure/workspace/apiTokenRepository';

const API_DOCS_URL = 'https://github.com/eleron96/motio/blob/main/docs/api.md';

const errorText = (code: ApiTokenErrorCode) => {
  switch (code) {
    case 'limit':
      return t`A workspace can have at most 10 active tokens. Revoke one you no longer use.`;
    case 'invalid_name':
      return t`Give the token a name of 1 to 80 characters.`;
    case 'not_allowed':
      return t`Only workspace admins can manage API tokens.`;
    default:
      return t`Something went wrong. Please try again.`;
  }
};

/**
 * Workspace settings → API: tokens that let another system (time tracking, HR)
 * import absences into this workspace. Admin only; behind VITE_FEATURE_WORKSPACE_API.
 */
export const WorkspaceApiTokensSection: React.FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const locale = useLocaleStore((state) => state.locale);
  const { tokens, loading, error, created, busy, create, revoke, dismissCreated } =
    useWorkspaceApiTokens(workspaceId, true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<WorkspaceApiToken | null>(null);
  const [copied, setCopied] = useState(false);

  const formatDate = (value: string) => new Date(value).toLocaleDateString(localeIntlTags[locale]);

  const handleCreate = async () => {
    if (await create(name.trim())) {
      setName('');
      setCreateOpen(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const closeCreated = () => {
    setCopied(false);
    dismissCreated();
  };

  return (
    <div className="space-y-5">
      <Block
        title={t`Import absences`}
        description={t`A token lets another system, such as your time tracking, create, update and delete absences in this workspace. It can do nothing else.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!workspaceId || busy}>
            <KeyRound className="mr-2 h-4 w-4" />
            {t`Create token`}
          </Button>
          <a
            href={API_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t`API reference`}
          </a>
        </div>
        {error && <p className="text-xs text-destructive">{errorText(error)}</p>}
      </Block>

      <Block title={t`Active tokens`}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t`Loading…`}</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t`No tokens yet.`}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{token.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{token.tokenPrefix}…</span>
                    {' · '}
                    {t`created ${formatDate(token.createdAt)}`}
                    {' · '}
                    {token.lastUsedAt ? t`last used ${formatDate(token.lastUsedAt)}` : t`never used`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setRevokeTarget(token)}
                  disabled={busy}
                  aria-label={t`Revoke token ${token.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t`New API token`}</DialogTitle>
            <DialogDescription>{t`Name it after the system that will use it.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="api-token-name">{t`Name`}</Label>
            <Input
              id="api-token-name"
              value={name}
              maxLength={80}
              placeholder={t`e.g. Time tracking sync`}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) void handleCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t`Cancel`}</Button>
            <Button onClick={() => void handleCreate()} disabled={!name.trim() || busy}>{t`Create token`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(created)} onOpenChange={(open) => { if (!open) closeCreated(); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t`Copy your token now`}</DialogTitle>
            <DialogDescription>
              {t`This is the only time it is shown. Store it in the system that will use it; if it is lost, revoke it and create a new one.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
              {created?.token}
            </code>
            <Button variant="outline" size="sm" onClick={() => void handleCopy()} aria-label={t`Copy token`}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {copied && <p className="text-xs text-muted-foreground">{t`Copied`}</p>}
          <DialogFooter>
            <Button onClick={closeCreated}>{t`Done`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Revoke this token?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`Systems using "${revokeTarget?.name ?? ''}" lose access right away. Absences already imported stay.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeTarget) void revoke(revokeTarget.id);
                setRevokeTarget(null);
              }}
            >
              {t`Revoke`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
