import { describe, expect, it } from 'vitest';
import { MCP_TOKEN_PLACEHOLDER, buildMcpConnectRecipes } from '@/features/workspace/lib/mcpConnect';

const URL_ = 'https://planner.example/functions/v1/mcp';
const TOKEN = `motio_${'a1'.repeat(32)}`;
const byId = (token?: string) => Object.fromEntries(
  buildMcpConnectRecipes({ url: URL_, token }).map((recipe) => [recipe.id, recipe]),
);

describe('buildMcpConnectRecipes', () => {
  it('offers the four clients in a fixed order, under their own names', () => {
    expect(buildMcpConnectRecipes({ url: URL_ }).map((recipe) => [recipe.id, recipe.label, recipe.kind])).toEqual([
      ['claude', 'Claude Code', 'command'],
      ['codex', 'Codex', 'file'],
      ['gemini', 'Gemini CLI', 'command'],
      ['kimi', 'Kimi Code', 'file'],
    ]);
  });

  it('writes each recipe the way the client documents it', () => {
    const recipes = byId(TOKEN);
    expect(recipes.claude.code).toBe(
      `claude mcp add --transport http motio ${URL_} --header "Authorization: Bearer ${TOKEN}"`,
    );
    expect(recipes.gemini.code).toBe(
      `gemini mcp add --scope user --transport http --header "Authorization: Bearer ${TOKEN}" motio ${URL_}`,
    );
    expect(recipes.codex.file).toBe('~/.codex/config.toml');
    expect(recipes.codex.code).toBe([
      '[mcp_servers.motio]',
      `url = "${URL_}"`,
      `http_headers = { "Authorization" = "Bearer ${TOKEN}" }`,
    ].join('\n'));
    expect(recipes.kimi.file).toBe('~/.kimi-code/mcp.json');
    expect(JSON.parse(recipes.kimi.code)).toEqual({
      mcpServers: { motio: { url: URL_, headers: { Authorization: `Bearer ${TOKEN}` } } },
    });
  });

  it('every recipe carries the address and the token, and nothing else of the kind', () => {
    for (const recipe of buildMcpConnectRecipes({ url: URL_, token: TOKEN })) {
      expect(recipe.code, recipe.id).toContain(URL_);
      expect(recipe.code.split(TOKEN), recipe.id).toHaveLength(2);
      expect(recipe.code, recipe.id).not.toContain(MCP_TOKEN_PLACEHOLDER);
    }
  });

  it('leaves a placeholder to replace when the token is not known', () => {
    for (const token of [undefined, null, '']) {
      for (const recipe of buildMcpConnectRecipes({ url: URL_, token })) {
        expect(recipe.code, recipe.id).toContain(`Bearer ${MCP_TOKEN_PLACEHOLDER}`);
      }
    }
  });
});
