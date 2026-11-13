import { supabase } from '@/shared/lib/supabaseClient';

/**
 * What a token may do, chosen when it is created: import absences ('time_off')
 * and/or read the workspace ('read'). Reference: docs/api.md.
 */
export type ApiTokenScope = 'time_off' | 'read';

/** A workspace API token as admins see it: never the token itself. */
export type WorkspaceApiToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  scopes: ApiTokenScope[];
};

/** Returned once, right after creation: the only time the full token is known. */
export type CreatedWorkspaceApiToken = WorkspaceApiToken & { token: string };

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at?: string | null;
  scopes?: string[] | null;
  token?: string;
};

/**
 * The address an AI assistant connects to (the MCP server, docs/mcp.md): the
 * server the app itself talks to, or this site when that is not a full URL.
 */
export const workspaceMcpUrl = (): string => {
  const configured = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const base = /^https?:\/\//.test(configured) ? configured : window.location.origin;
  return `${base}/functions/v1/mcp`;
};

export type ApiTokenErrorCode = 'limit' | 'invalid_name' | 'invalid_scopes' | 'not_allowed' | 'unknown';

const toErrorCode = (message: string | undefined): ApiTokenErrorCode => {
  if (!message) return 'unknown';
  if (message.includes('API_TOKEN_LIMIT')) return 'limit';
  if (message.includes('API_TOKEN_NAME_INVALID')) return 'invalid_name';
  if (message.includes('API_TOKEN_SCOPES_INVALID')) return 'invalid_scopes';
  if (message.includes('not allowed')) return 'not_allowed';
  return 'unknown';
};

const isScope = (value: string): value is ApiTokenScope => value === 'time_off' || value === 'read';

const mapToken = (row: TokenRow): WorkspaceApiToken => ({
  id: row.id,
  name: row.name,
  tokenPrefix: row.token_prefix,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at ?? null,
  scopes: (row.scopes ?? []).filter(isScope),
});

export const listWorkspaceApiTokens = async (
  workspaceId: string,
): Promise<{ tokens: WorkspaceApiToken[]; error?: ApiTokenErrorCode }> => {
  const { data, error } = await supabase.rpc('list_workspace_api_tokens', { p_workspace_id: workspaceId });
  if (error) return { tokens: [], error: toErrorCode(error.message) };
  return { tokens: ((data ?? []) as unknown as TokenRow[]).map(mapToken) };
};

export const createWorkspaceApiToken = async (
  workspaceId: string,
  name: string,
  scopes: ApiTokenScope[],
): Promise<{ token?: CreatedWorkspaceApiToken; error?: ApiTokenErrorCode }> => {
  const { data, error } = await supabase.rpc('create_workspace_api_token', {
    p_workspace_id: workspaceId,
    p_name: name,
    p_scopes: scopes,
  });
  if (error) return { error: toErrorCode(error.message) };
  const row = ((data ?? []) as unknown as TokenRow[])[0];
  if (!row?.token) return { error: 'unknown' };
  return { token: { ...mapToken(row), token: row.token } };
};

export const revokeWorkspaceApiToken = async (
  tokenId: string,
): Promise<{ error?: ApiTokenErrorCode }> => {
  const { error } = await supabase.rpc('revoke_workspace_api_token', { p_token_id: tokenId });
  return error ? { error: toErrorCode(error.message) } : {};
};
