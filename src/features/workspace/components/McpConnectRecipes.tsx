import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Copy } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {
  MCP_TOKEN_PLACEHOLDER,
  buildMcpConnectRecipes,
  type McpClientId,
  type McpConnectRecipe,
} from '@/features/workspace/lib/mcpConnect';

const whereText = (recipe: McpConnectRecipe) => (
  recipe.kind === 'command'
    ? t`Paste this into a terminal and press Enter.`
    : t`Add this to the file ${recipe.file ?? ''}. If the file already lists other servers, put "motio" next to them.`
);

/**
 * Ready-to-paste text that connects an AI assistant to this workspace: one tab
 * per client, with the real address and — right after a token is created — the
 * token itself. Without a token the text carries a placeholder to replace.
 */
export const McpConnectRecipes: React.FC<{ url: string; token?: string | null }> = ({ url, token }) => {
  const recipes = buildMcpConnectRecipes({ url, token });
  const [active, setActive] = useState<McpClientId>(recipes[0].id);
  const [copiedId, setCopiedId] = useState<McpClientId | null>(null);

  const copy = async (recipe: McpConnectRecipe) => {
    try {
      await navigator.clipboard.writeText(recipe.code);
      setCopiedId(recipe.id);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <Tabs value={active} onValueChange={(value) => { setActive(value as McpClientId); setCopiedId(null); }}>
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
        {recipes.map((recipe) => (
          <TabsTrigger key={recipe.id} value={recipe.id} className="px-2.5 py-1 text-xs">
            {recipe.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {recipes.map((recipe) => (
        <TabsContent key={recipe.id} value={recipe.id} className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">{whereText(recipe)}</p>
          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
              {recipe.code}
            </pre>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy(recipe)}
              aria-label={t`Copy the text for ${recipe.label}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {copiedId === recipe.id
              ? t`Copied`
              : token
                ? t`The token is already in the text: keep it to yourself.`
                : t`Replace ${MCP_TOKEN_PLACEHOLDER} with a token that may read the workspace.`}
          </p>
        </TabsContent>
      ))}
    </Tabs>
  );
};
