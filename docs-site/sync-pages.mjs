// The pages are written in docs/ (readable on GitHub as they are). VitePress builds
// them from a copy in ./pages, next to the site's own home pages and public files,
// so the site never needs anything outside docs-site/:
//
//   docs/guides/*.md          → pages/guide/           (the user guide, English)
//   docs/guides/ru/*.md       → pages/ru/guide/        (the user guide, Russian)
//   docs/self-hosting/*.md    → pages/self-hosting/    (English)
//                             → pages/ru/self-hosting/ (the same English text, marked as such,
//                               so the Russian site has the section and its language switch
//                               always leads to a real page)
//   docs/api.md, docs/mcp.md  → pages/api.md, pages/mcp.md (English) and pages/ru/ (the
//                               same English text, marked): the workspace API and the MCP
//                               server. Their links to docs that are not on the site are
//                               pointed at GitHub.
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const pages = here('./pages');

rmSync(pages, { recursive: true, force: true });
cpSync(here('../docs/guides'), `${pages}/guide`, {
  recursive: true,
  filter: (source) => !source.startsWith(here('../docs/guides/ru')),
});
cpSync(here('../docs/guides/ru'), `${pages}/ru/guide`, { recursive: true });
cpSync(here('../docs/self-hosting'), `${pages}/self-hosting`, { recursive: true });
cpSync(here('../docs/self-hosting'), `${pages}/ru/self-hosting`, { recursive: true });
cpSync(here('./home.md'), `${pages}/index.md`);
cpSync(here('./home.ru.md'), `${pages}/ru/index.md`);
cpSync(here('./public'), `${pages}/public`, { recursive: true });

// Under the title of an English page shown on the Russian site.
const markEnglishOnly = (text, note) => {
  const [title, ...rest] = text.split('\n');
  return [title, `\n::: info Только на английском\n${note}\n:::\n`, ...rest].join('\n');
};

for (const name of readdirSync(`${pages}/ru/self-hosting`)) {
  if (!name.endsWith('.md')) continue;
  const file = join(pages, 'ru/self-hosting', name);
  writeFileSync(file, markEnglishOnly(readFileSync(file, 'utf8'), 'Инструкция для своих серверов пока есть только на английском.'));
}

// The workspace API and the MCP server: docs/api.md and docs/mcp.md link to each other
// (both are on the site) and to docs/configuration.md (which is not).
const onGitHub = 'https://github.com/eleron96/motio/blob/main/docs/';
for (const name of ['api.md', 'mcp.md']) {
  const text = readFileSync(here(`../docs/${name}`), 'utf8')
    .replace(/\]\((?!https?:|#|\.\/|api\.md|mcp\.md)([a-z-]+\.md)/g, `](${onGitHub}$1`)
    .replace(/\]\((api|mcp)\.md/g, '](./$1.md');
  writeFileSync(`${pages}/${name}`, text);
  writeFileSync(`${pages}/ru/${name}`, markEnglishOnly(text, 'Описание API и MCP-сервера пока есть только на английском.'));
}
