import { useCallback, useEffect, useState } from 'react';
import {
  createWorkspaceApiToken,
  listWorkspaceApiTokens,
  revokeWorkspaceApiToken,
  type ApiTokenErrorCode,
  type CreatedWorkspaceApiToken,
  type WorkspaceApiToken,
} from '@/infrastructure/workspace/apiTokenRepository';

/**
 * Workspace API tokens for the settings section: the active list, creating one
 * (whose full value is kept only until the admin closes the dialog) and revoking.
 */
export const useWorkspaceApiTokens = (workspaceId: string | null, enabled: boolean) => {
  const [tokens, setTokens] = useState<WorkspaceApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiTokenErrorCode | null>(null);
  const [created, setCreated] = useState<CreatedWorkspaceApiToken | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!workspaceId || !enabled) return;
    setLoading(true);
    const result = await listWorkspaceApiTokens(workspaceId);
    setTokens(result.tokens);
    setError(result.error ?? null);
    setLoading(false);
  }, [workspaceId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (name: string) => {
    if (!workspaceId) return false;
    setBusy(true);
    const result = await createWorkspaceApiToken(workspaceId, name);
    setBusy(false);
    if (result.error || !result.token) {
      setError(result.error ?? 'unknown');
      return false;
    }
    setError(null);
    setCreated(result.token);
    setTokens((current) => [result.token as WorkspaceApiToken, ...current]);
    return true;
  }, [workspaceId]);

  const revoke = useCallback(async (tokenId: string) => {
    setBusy(true);
    const result = await revokeWorkspaceApiToken(tokenId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setTokens((current) => current.filter((token) => token.id !== tokenId));
  }, []);

  const dismissCreated = useCallback(() => setCreated(null), []);

  return { tokens, loading, error, created, busy, create, revoke, dismissCreated };
};
