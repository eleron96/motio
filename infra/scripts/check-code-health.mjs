#!/usr/bin/env node
// Code-health ratchet for src/. It lists what makes the code base harder to
// keep clean and fails when something NEW shows up that the baseline
// (infra/scripts/code-health-baseline.json) does not already hold:
//
//   unusedFiles                    files nothing imports (from src/app/main.tsx)
//   unusedExports                  exports nobody uses, not even their own file
//   testOnlyExports                exports only tests use: code kept alive by its tests
//   unusedDependencies             package.json entries nothing imports
//   largeFiles                     files over 600 lines (AGENTS.md: god files)
//   supabaseOutsideInfrastructure  feature code that talks to Supabase directly
//   crossFeatureComponentImports   features/A importing features/B/components
//
// Old debt may stay; new debt may not. After fixing some, shrink the baseline:
//   node infra/scripts/check-code-health.mjs --write-baseline
// Comments `REMOVE-AFTER: YYYY-MM-DD` mark temporary code; a passed date is
// reported as a warning, not a failure.
//
// Plain Node, no dependencies. The analysis is textual (imports and
// identifiers by regex): good enough for a ratchet, not a compiler.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const srcDir = path.join(root, 'src');
const baselineFile = path.join(root, 'infra/scripts/code-health-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const LARGE_FILE_LINES = 600;

// Dependencies used without an import in code: CLIs, PostCSS plugins, peers, types.
const IMPLICIT_DEPENDENCIES = new Set([
  'typescript', // tsc in `npm run typecheck`
  'eslint', // `npm run lint`
  'postcss', // runs postcss.config.js
  'autoprefixer', // plugin key in postcss.config.js
  'babel-plugin-macros', // peer dependency of @lingui/macro
]);

const rel = (file) => path.relative(root, file).split(path.sep).join('/');

const walk = (dir, accept, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(full)) out.push(full);
  }
  return out;
};

const isCode = (file) => /\.(tsx?|mjs|cjs|js)$/.test(file) && !file.endsWith('.d.ts');
const isTest = (file) => rel(file).startsWith('src/test/') || /\.test\.tsx?$/.test(file);
const sourceFiles = walk(srcDir, (file) => isCode(file) && !rel(file).startsWith('src/locales/'));
const text = new Map(sourceFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const prodFiles = sourceFiles.filter((file) => !isTest(file));
const testFiles = sourceFiles.filter(isTest);

// ── imports ─────────────────────────────────────────────────────────────────
const SPECIFIER = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|vi\.mock\(\s*['"]([^'"]+)['"]/g;
const specifiers = (source) => [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);

const resolveImport = (from, specifier) => {
  let base;
  if (specifier.startsWith('@/')) base = path.join(srcDir, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else return null;
  base = base.replace(/\?.*$/, '');
  for (const ext of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
    const candidate = base + ext;
    if (text.has(candidate)) return candidate;
  }
  return null;
};

const edges = new Map(sourceFiles.map((file) => [
  file,
  specifiers(text.get(file)).map((s) => resolveImport(file, s)).filter(Boolean),
]));

const reachableFrom = (starts) => {
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    for (const next of edges.get(queue.pop()) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
};

const live = reachableFrom([path.join(srcDir, 'app/main.tsx')]);
const unusedFiles = prodFiles.filter((file) => !live.has(file)).map(rel);

// ── exports ─────────────────────────────────────────────────────────────────
// shared/ui wraps whole component libraries (Radix/shadcn); unused variants
// there are expected, so it is left out.
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
const identifiers = new Map(sourceFiles.map((file) => [file, new Set(text.get(file).match(IDENTIFIER))]));
const EXPORT = /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const occurrences = (source, name) => source.match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))?.length ?? 0;

const unusedExports = [];
const testOnlyExports = [];
for (const file of prodFiles) {
  if (rel(file).startsWith('src/shared/ui/')) continue;
  const source = text.get(file);
  for (const [, name] of source.matchAll(EXPORT)) {
    if (occurrences(source, name) > 1) continue; // used in its own file
    if (prodFiles.some((other) => other !== file && identifiers.get(other).has(name))) continue;
    const entry = `${rel(file)} :: ${name}`;
    if (testFiles.some((test) => identifiers.get(test).has(name))) testOnlyExports.push(entry);
    else unusedExports.push(entry);
  }
}

// ── dependencies ────────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencyNames = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const configFiles = fs.readdirSync(root)
  .filter((name) => /\.(ts|js|mjs|cjs)$/.test(name))
  .map((name) => path.join(root, name));
const consumerTexts = [
  ...text.values(),
  ...[
    ...configFiles,
    ...walk(path.join(root, 'vite'), isCode),
    ...walk(path.join(root, 'tests'), isCode),
    ...walk(path.join(root, 'infra/scripts'), isCode),
  ].map((file) => fs.readFileSync(file, 'utf8')),
  Object.values(pkg.scripts ?? {}).join('\n'),
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const unusedDependencies = dependencyNames.filter((name) => {
  if (IMPLICIT_DEPENDENCIES.has(name) || name.startsWith('@types/')) return false;
  const quoted = new RegExp(`['"\`]${escapeRegExp(name)}(?:/[^'"\`]*)?['"\`]`);
  const cli = new RegExp(`(?:^|\\s)${escapeRegExp(name.replace(/^@[^/]+\//, ''))}(?:\\s|$)`);
  return !consumerTexts.some((source) => quoted.test(source) || cli.test(source));
});

// ── structure ───────────────────────────────────────────────────────────────
const largeFiles = prodFiles
  .filter((file) => text.get(file).split('\n').length > LARGE_FILE_LINES)
  .map(rel);

const featureOf = (file) => rel(file).match(/^src\/features\/([^/]+)\//)?.[1] ?? null;
const supabaseOutsideInfrastructure = prodFiles
  .filter((file) => featureOf(file) && featureOf(file) !== 'demo')
  .filter((file) => specifiers(text.get(file)).some((s) => s === '@supabase/supabase-js' || /(^|\/)supabaseClient$/.test(s)))
  .map(rel);

const crossFeatureComponentImports = [...new Set(prodFiles.flatMap((file) => {
  const own = featureOf(file);
  if (!own) return [];
  return specifiers(text.get(file))
    .map((s) => s.match(/^@\/features\/([^/]+)\/components\b/)?.[1])
    .filter((target) => target && target !== own)
    .map((target) => `${rel(file)} -> ${target}`);
}))];

// ── removal markers ─────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const markerFiles = [
  ...sourceFiles,
  ...walk(path.join(root, 'infra'), (file) => /\.(ts|tsx|js|mjs|sh|sql|yml|conf)$/.test(file)),
  ...walk(path.join(root, 'tests'), isCode),
];
const expiredMarkers = [];
for (const file of markerFiles) {
  if (file === new URL(import.meta.url).pathname) continue;
  const lines = (text.get(file) ?? fs.readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    const date = line.match(/REMOVE-AFTER:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    if (date && date < today) expiredMarkers.push({ file: rel(file), line: index + 1, date });
  });
}

// ── report ──────────────────────────────────────────────────────────────────
const current = {
  unusedFiles,
  unusedExports,
  testOnlyExports,
  unusedDependencies,
  largeFiles,
  supabaseOutsideInfrastructure,
  crossFeatureComponentImports,
};
for (const key of Object.keys(current)) current[key] = [...new Set(current[key])].sort();

for (const marker of expiredMarkers) {
  console.log(`::warning file=${marker.file},line=${marker.line}::REMOVE-AFTER ${marker.date} has passed — remove the temporary code.`);
}

if (writeBaseline) {
  fs.writeFileSync(baselineFile, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Baseline written: ${rel(baselineFile)}`);
  for (const [key, items] of Object.entries(current)) console.log(`  ${key}: ${items.length}`);
  process.exit(0);
}

const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
let failed = false;
for (const [key, items] of Object.entries(current)) {
  const known = new Set(baseline[key] ?? []);
  const added = items.filter((item) => !known.has(item));
  const gone = [...known].filter((item) => !items.includes(item)).length;
  console.log(`${added.length ? '✗' : '✓'} ${key}: ${items.length}${gone ? ` (${gone} fixed — run --write-baseline)` : ''}`);
  for (const item of added) console.log(`    new: ${item}`);
  if (added.length) failed = true;
}

if (failed) {
  console.log('\n::error::New code-health debt (marked "new" above). Remove it, or, if it is deliberate, explain why and refresh the baseline with --write-baseline.');
  process.exit(1);
}
