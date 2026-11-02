import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tests that need the real translations — "does this template still make
 * sense in German?" — read them straight from the catalogs and translate the
 * `t` macro through them. Keys are `context \u0004 message`, as gettext has it.
 */
export type PoCatalog = Map<string, string>;

export const readPoCatalog = (locale: string): PoCatalog => {
  const lines = readFileSync(resolve(process.cwd(), 'src/locales', locale, 'messages.po'), 'utf8').split('\n');
  const catalog: PoCatalog = new Map();
  let context = '';
  let msgid: string | null = null;
  let msgstr = '';
  let field: 'msgid' | 'msgstr' | null = null;

  const flush = () => {
    if (msgid !== null) catalog.set(`${context}\u0004${msgid}`, msgstr);
    context = '';
    msgid = null;
    msgstr = '';
    field = null;
  };

  for (const line of lines) {
    if (line.startsWith('msgctxt ')) {
      if (msgid !== null) flush();
      context = JSON.parse(line.slice(8));
    } else if (line.startsWith('msgid ')) {
      if (msgid !== null) flush();
      msgid = JSON.parse(line.slice(6));
      field = 'msgid';
    } else if (line.startsWith('msgstr ')) {
      msgstr = JSON.parse(line.slice(7));
      field = 'msgstr';
    } else if (line.startsWith('"') && field) {
      const part = JSON.parse(line) as string;
      if (field === 'msgid') msgid += part;
      else msgstr += part;
    }
  }
  flush();
  return catalog;
};

type MessageDescriptor = { message: string; context?: string };

/**
 * A stand-in for the `t` macro that answers from `catalog`, falling back to
 * the English source; untranslated messages are collected in `missing`.
 */
export const translateThrough = (state: { catalog: PoCatalog; missing: string[] }) => (
  first: TemplateStringsArray | MessageDescriptor,
  ...values: unknown[]
): string => {
  const message = Array.isArray(first)
    ? (first as TemplateStringsArray).reduce((acc, part, index) => acc + part + (index < values.length ? `{${index}}` : ''), '')
    : (first as MessageDescriptor).message;
  const context = Array.isArray(first) ? '' : ((first as MessageDescriptor).context ?? '');
  const translated = state.catalog.get(`${context}\u0004${message}`);
  if (!translated) state.missing.push(message);
  return translated || message;
};
