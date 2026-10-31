// Pre-compresses the built app for nginx: every text asset of 1 KB or more gets
// a .br (brotli, quality 11) and a .gz (gzip, level 9) next to it. nginx serves
// the .br to browsers that accept brotli and the .gz through gzip_static — no
// compression on the fly. Brotli makes the main bundle ~19% smaller than the
// gzip nginx used to produce. Usage: node infra/web/precompress.mjs dist
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = process.argv[2] || 'dist';
const COMPRESSIBLE = /\.(?:js|mjs|css|svg|json|txt|xml|webmanifest)$/;
const MIN_BYTES = 1024;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

let files = 0;
let before = 0;
let afterBr = 0;
for (const path of walk(root)) {
  if (!COMPRESSIBLE.test(path)) continue;
  const source = readFileSync(path);
  if (source.length < MIN_BYTES) continue;
  const br = brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  });
  const gz = gzipSync(source, { level: 9 });
  if (br.length < source.length) writeFileSync(`${path}.br`, br);
  if (gz.length < source.length) writeFileSync(`${path}.gz`, gz);
  files += 1;
  before += source.length;
  afterBr += Math.min(br.length, source.length);
}
console.log(`precompress: ${files} files, ${Math.round(before / 1024)} KB -> ${Math.round(afterBr / 1024)} KB brotli`);
