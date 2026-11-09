// The guide is written in docs/self-hosting/ (readable on GitHub as it is).
// VitePress builds it from a copy in ./pages, next to the site's own home page
// and public files, so the site never needs anything outside docs-site/.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const pages = here('./pages');

rmSync(pages, { recursive: true, force: true });
cpSync(here('../docs/self-hosting'), pages, { recursive: true });
cpSync(here('./home.md'), `${pages}/index.md`);
cpSync(here('./public'), `${pages}/public`, { recursive: true });
