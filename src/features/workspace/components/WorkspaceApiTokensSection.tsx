import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Checkbox } from '@/shared/ui/checkbox';
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
import { McpConnectRecipes } from '@/features/workspace/components/McpConnectRecipes';
import {
  workspaceMcpUrl,
  type ApiTokenErrorCode,
  type ApiTokenScope,
  type WorkspaceApiToken,
} from '@/infrastructure/workspace/apiTokenRepository';

const API_DOCS_URL = 'https://github.com/eleron96/motio/blob/main/docs/api.md';
const MCP_DOCS_URL = 'https://github.com/eleron96/motio/blob/main/docs/mcp.md';

const errorText = (code: ApiTokenErrorCode) => {
  switch (code) {
    case 'limit':
      return t`A workspace can have at most 10 active tokens. Revoke one you no longer use.`;
    case 'invalid_name':
      return t`Give the token a name of 1 to 80 characters.`;
    case 'invalid_scopes':
      return t`Choose what the token may do.`;
    case 'not_allowed':
      return t`Only workspace admins can manage API tokens.`;
    default:
      return t`Something went wrong. Please try again.`;
  }
};

// The order the scopes are offered and listed in.
const SCOPES: ApiTokenScope[] = ['read', 'time_off'];

const scopeLabel = (scope: ApiTokenScope) => (
  scope === 'read' ? t`Read the workspace` : t`Import absences`
);

const scopeHint = (scope: ApiTokenScope) => (
  scope === 'read'
    ? t`People, projects, tasks, milestones and absences. Changes nothing.`
    : t`Create, update and delete absences, as your time tracking or HR system records them.`
);

/**
 * Workspace settings → API: tokens that let another system read this workspace
 * and/or import absences into it, as chosen per token. Admin only; behind
 * VITE_FEATURE_WORKSPACE_API.
 */
export const WorkspaceApiTokensSection: React.FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const locale = useLocaleStore((state) => state.locale);
  const { tokens, loading, error, created, busy, create, revoke, dismissCreated } =
    useWorkspaceApiTokens(workspaceId, true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<WorkspaceApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const mcpUrl = workspaceMcpUrl();

  const formatDate = (value: string) => new Date(value).toLocaleDateString(localeIntlTags[locale]);

  const handleCreate = async () => {
    if (await create(name.trim(), SCOPES.filter((scope) => scopes.includes(scope)))) {
      setName('');
      setScopes([]);
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

  const toggleScope = (scope: ApiTokenScope, on: boolean) => {
    setScopes((current) => (on ? [...current.filter((item) => item !== scope), scope] : current.filter((item) => item !== scope)));
  };
  const canCreate = Boolean(name.trim()) && scopes.length > 0 && !busy;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setAddressCopied(true);
    } catch {
      setAddressCopied(false);
    }
  };

  const closeCreated = () => {
    setCopied(false);
    dismissCreated();
  };

  return (
    <div className="space-y-5">
      <Block
        title={t`Access for other systems`}
        description={t`Connect another program to this workspace: for reports, or to bring in absences from your time tracking. Create a separate token for each program.`}
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
                    {SCOPES.filter((scope) => token.scopes.includes(scope)).map(scopeLabel).join(', ')}
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

      <Block
        title={t`AI assistants`}
        description={t`An assistant that supports MCP can read this workspace and answer questions about it; it cannot change anything. Create a token that may read the workspace: the ready text for your assistant appears right after. Or use the address and the text below.`}
      >
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
            {mcpUrl}
          </code>
          <Button variant="outline" size="sm" onClick={() => void handleCopyAddress()} aria-label={t`Copy address`}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <a
            href={MCP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t`How to connect`}
          </a>
          {addressCopied && <span>{t`Copied`}</span>}
        </div>
        <McpConnectRecipes url={mcpUrl} />
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
                if (event.key === 'Enter' && canCreate) void handleCreate();
              }}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{t`What the token may do`}</legend>
            {SCOPES.map((scope) => (
              <div key={scope} className="flex items-start gap-2">
                <Checkbox
                  id={`api-token-scope-${scope}`}
                  className="mt-0.5"
                  checked={scopes.includes(scope)}
                  onCheckedChange={(value) => toggleScope(scope, value === true)}
                />
                <Label htmlFor={`api-token-scope-${scope}`} className="cursor-pointer space-y-0.5 font-normal">
                  <span className="block text-sm text-foreground">{scopeLabel(scope)}</span>
                  <span className="block text-xs text-muted-foreground">{scopeHint(scope)}</span>
                </Label>
              </div>
            ))}
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t`Cancel`}</Button>
            <Button onClick={() => void handleCreate()} disabled={!canCreate}>{t`Create token`}</Button>
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
          {created?.scopes.includes('read') && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-medium text-foreground">{t`Connect an AI assistant`}</p>
              <McpConnectRecipes url={mcpUrl} token={created.token} />
            </div>
          )}
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
