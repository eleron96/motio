import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// infra/web/nginx.conf: pre-compressed brotli and the archive of earlier
// releases. Regex locations match in file order, so the order is the contract.
const conf = readFileSync(join(process.cwd(), 'infra/web/nginx.conf'), 'utf8');
const position = (needle: string) => {
  const index = conf.indexOf(needle);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  return index;
};

describe('web nginx config', () => {
  it('serves .br files with the right encoding and type, before the generic /assets block', () => {
    const jsBr = position('location ~ ^/assets/.+\\.js\\.br$');
    const cssBr = position('location ~ ^/assets/.+\\.css\\.br$');
    const assets = position('location ~ ^/assets/(?<asset>.+)$');
    expect(jsBr).toBeLessThan(assets);
    expect(cssBr).toBeLessThan(assets);
    const jsBlock = conf.slice(jsBr, conf.indexOf('}', conf.indexOf('try_files', jsBr)));
    expect(jsBlock).toContain('default_type application/javascript;');
    expect(jsBlock).toContain('add_header Content-Encoding br;');
    expect(jsBlock).toContain('gzip off;');
  });

  it('falls back to the archive of earlier releases and keeps assets immutable', () => {
    const lookup = conf.slice(position('location ~ ^/__assets/(?<asset_file>.+)$'));
    expect(lookup.slice(0, 400)).toContain('internal;');
    expect(lookup.slice(0, 400)).toContain('try_files /assets/$asset_file /assets-archive/$asset_file =404;');
    expect(lookup.slice(0, 400)).toContain('max-age=31536000, immutable');
    // Both blocks precede the generic static-file regex, which has no fallback.
    const generic = position('location ~* \\.(?:css|js|mjs');
    expect(position('location ~ ^/assets/(?<asset>.+)$')).toBeLessThan(generic);
    expect(position('location ~ ^/__assets/(?<asset_file>.+)$')).toBeLessThan(generic);
  });

  it('keeps try_files out of the block that uses if (an if there disables it)', () => {
    const start = position('location ~ ^/assets/(?<asset>.+)$');
    const block = conf.slice(start, position('location ~ ^/__assets/(?<asset_file>.+)$'));
    expect(block).toContain('if (');
    expect(block).not.toContain('try_files');
    expect(block).toContain('rewrite ^ /__assets/$asset last;');
  });

  it('keeps index.html uncached, so the published version is always current', () => {
    const index = conf.slice(position('location = /index.html'));
    expect(index.slice(0, 200)).toContain('no-cache, no-store, must-revalidate');
  });
});
