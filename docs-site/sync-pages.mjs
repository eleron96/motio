// The pages are written in docs/ (readable on GitHub as they are). VitePress builds
// them from a copy in ./pages, next to the site's own home pages and public files,
// so the site never needs anything outside docs-site/:
//
//   docs/guides/*.md          → pages/guide/           (the user guide, English)
//   docs/guides/ru/*.md       → pages/ru/guide/        (the user guide, Russian)
//   docs/self-hosting/*.md    → pages/self-hosting/    (the self-hosting guide, English)
//   docs/self-hosting/ru/*.md → pages/ru/self-hosting/ (the same guide, Russian; it shares the
//                               pictures of the English one)
//   docs/api.md, docs/mcp.md  → pages/api.md, pages/mcp.md (the workspace API and the MCP server)
//   docs/ru/api.md, mcp.md    → pages/ru/api.md, pages/ru/mcp.md (the same, Russian)
//
// Links from these pages to docs that are not on the site are pointed at GitHub.
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const pages = here('./pages');

rmSync(pages, { recursive: true, force: true });
cpSync(here('../docs/guides'), `${pages}/guide`, {
  recursive: true,
  filter: (source) => source !== here('../docs/guides/ru') && !source.startsWith(here('../docs/guides/ru/')),
});
cpSync(here('../docs/guides/ru'), `${pages}/ru/guide`, { recursive: true });
cpSync(here('../docs/self-hosting'), `${pages}/self-hosting`, {
  recursive: true,
  // The folder itself, not everything whose name starts with "ru" (running.md).
  filter: (source) => source !== here('../docs/self-hosting/ru') && !source.startsWith(here('../docs/self-hosting/ru/')),
});
cpSync(here('../docs/self-hosting/ru'), `${pages}/ru/self-hosting`, { recursive: true });
// The Russian pages reference the pictures of the English guide (../images/…): on the site
// each language has its own copy next to its pages.
cpSync(here('../docs/self-hosting/images'), `${pages}/ru/self-hosting/images`, { recursive: true });
cpSync(here('./home.md'), `${pages}/index.md`);
cpSync(here('./home.ru.md'), `${pages}/ru/index.md`);
cpSync(here('./public'), `${pages}/public`, { recursive: true });

for (const name of readdirSync(`${pages}/ru/self-hosting`)) {
  if (!name.endsWith('.md')) continue;
  const file = join(pages, 'ru/self-hosting', name);
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('](../images/', '](./images/'));
}

// The workspace API and the MCP server: the pages link to each other (both are on the
// site) and to docs/configuration.md (which is not).
const onGitHub = 'https://github.com/eleron96/motio/blob/main/docs/';
const forSite = (text) => text
  .replace(/\]\((?:\.\.\/)?(?!https?:|#|\.\/|api\.md|mcp\.md)([a-z-]+\.md)/g, `](${onGitHub}$1`)
  .replace(/\]\((api|mcp)\.md/g, '](./$1.md');
for (const name of ['api.md', 'mcp.md']) {
  writeFileSync(`${pages}/${name}`, forSite(readFileSync(here(`../docs/${name}`), 'utf8')));
  writeFileSync(`${pages}/ru/${name}`, forSite(readFileSync(here(`../docs/ru/${name}`), 'utf8')));
}
