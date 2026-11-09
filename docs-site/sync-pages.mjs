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

const englishOnly = '\n::: info Только на английском\nИнструкция для своих серверов пока есть только на английском.\n:::\n';
for (const name of readdirSync(`${pages}/ru/self-hosting`)) {
  if (!name.endsWith('.md')) continue;
  const file = join(pages, 'ru/self-hosting', name);
  const [title, ...rest] = readFileSync(file, 'utf8').split('\n');
  writeFileSync(file, [title, englishOnly, ...rest].join('\n'));
}
