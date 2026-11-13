// How to connect an AI assistant to the workspace's MCP server (docs/mcp.md):
// for each client, the exact text a person pastes — a terminal command, or a
// block for the client's settings file. Pure: the address and the token go in,
// text comes out. Each recipe follows the client's own documentation; when one
// changes, change it here and in docs/mcp.md and docs/ru/mcp.md.

export const MCP_CLIENT_IDS = ['claude', 'codex', 'gemini', 'kimi'] as const;

export type McpClientId = (typeof MCP_CLIENT_IDS)[number];

export type McpConnectRecipe = {
  id: McpClientId;
  /** The product's own name: not translated. */
  label: string;
  /** A command to run in a terminal, or text to add to a settings file. */
  kind: 'command' | 'file';
  /** For kind "file": where the settings file lives. */
  file?: string;
  code: string;
};

/** Stands in for the token where it is not known: tokens are shown once, at creation. */
export const MCP_TOKEN_PLACEHOLDER = 'motio_YOUR_TOKEN';

export const buildMcpConnectRecipes = (params: { url: string; token?: string | null }): McpConnectRecipe[] => {
  const { url } = params;
  const bearer = `Bearer ${params.token || MCP_TOKEN_PLACEHOLDER}`;

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      kind: 'command',
      code: `claude mcp add --transport http motio ${url} --header "Authorization: ${bearer}"`,
    },
    {
      id: 'codex',
      label: 'Codex',
      kind: 'file',
      file: '~/.codex/config.toml',
      code: [
        '[mcp_servers.motio]',
        `url = "${url}"`,
        `http_headers = { "Authorization" = "${bearer}" }`,
      ].join('\n'),
    },
    {
      id: 'gemini',
      label: 'Gemini CLI',
      kind: 'command',
      code: `gemini mcp add --scope user --transport http --header "Authorization: ${bearer}" motio ${url}`,
    },
    {
      id: 'kimi',
      label: 'Kimi Code',
      kind: 'file',
      file: '~/.kimi-code/mcp.json',
      code: JSON.stringify(
        { mcpServers: { motio: { url, headers: { Authorization: bearer } } } },
        null,
        2,
      ),
    },
  ];
};
