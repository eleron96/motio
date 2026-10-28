import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/shared/lib/locale";

// An empty msgstr ships as English (fallback) at best and as a hash id at worst,
// and nothing else catches it: lingui:extract only reports the count. Every
// translated catalog must be complete before it merges.

type Entry = { msgid: string; msgstr: string };

const unquote = (line: string) => JSON.parse(line.trim()) as string;

/** Minimal reader for the catalogs lingui writes: msgid/msgstr with "" continuation lines. */
const readCatalog = (locale: string): Entry[] => {
  const lines = readFileSync(resolve(process.cwd(), "src/locales", locale, "messages.po"), "utf8").split("\n");
  const entries: Entry[] = [];
  let current: Partial<Entry> = {};
  let field: keyof Entry | null = null;
  for (const line of lines) {
    if (line.startsWith("msgid ")) {
      if (current.msgid !== undefined) entries.push({ msgid: current.msgid, msgstr: current.msgstr ?? "" });
      current = { msgid: unquote(line.slice(6)) };
      field = "msgid";
    } else if (line.startsWith("msgstr ")) {
      current.msgstr = unquote(line.slice(7));
      field = "msgstr";
    } else if (line.startsWith('"') && field) {
      current[field] = (current[field] ?? "") + unquote(line);
    } else {
      field = null;
    }
  }
  if (current.msgid !== undefined) entries.push({ msgid: current.msgid, msgstr: current.msgstr ?? "" });
  // The header entry (empty msgid) carries catalog metadata, not a message.
  return entries.filter((entry) => entry.msgid !== "");
};

const placeholders = (text: string) =>
  [...new Set(text.match(/\{[A-Za-z0-9_]+\}|<\/?\d+\/?>/g) ?? [])].sort();

const translatedLocales = SUPPORTED_LOCALES.filter((locale) => locale !== "en");
const sourceIds = readCatalog("en").map((entry) => entry.msgid);

describe.each(translatedLocales)("%s catalog", (locale) => {
  const entries = readCatalog(locale);

  it("has the same messages as the source catalog", () => {
    expect(entries.map((entry) => entry.msgid).sort()).toEqual([...sourceIds].sort());
  });

  it("translates every message", () => {
    expect(entries.filter((entry) => !entry.msgstr.trim()).map((entry) => entry.msgid)).toEqual([]);
  });

  it("keeps the placeholders and tags of every message", () => {
    const broken = entries
      .filter((entry) => entry.msgstr && !/^[a-z]+(\.[a-z]+)+$/i.test(entry.msgid))
      .filter((entry) => placeholders(entry.msgid).join() !== placeholders(entry.msgstr).join())
      .map((entry) => entry.msgid);
    expect(broken).toEqual([]);
  });
});
