export type AnnouncementTextInput = {
  titleRu?: string;
  titleEn?: string;
  titleDe?: string;
  bodyRu?: string;
  bodyEn?: string;
  bodyDe?: string;
};

export type AnnouncementTextColumns = {
  title_ru: string;
  title_en: string;
  title_de: string | null;
  body_ru: string | null;
  body_en: string | null;
  body_de: string | null;
};

// One title in any language is enough. ru and en are required columns, so an
// empty one reuses another language — a half-translated announcement is worse
// than one that reads the same everywhere. German stays empty instead: readers
// without a German title get the English pair (announcementText in the app).
export const resolveAnnouncementTexts = (
  input: AnnouncementTextInput,
): AnnouncementTextColumns | { error: string } => {
  const clean = (value: string | undefined) => value?.trim() ?? "";
  const title = { ru: clean(input.titleRu), en: clean(input.titleEn), de: clean(input.titleDe) };
  const body = { ru: clean(input.bodyRu), en: clean(input.bodyEn), de: clean(input.bodyDe) };

  if (!title.ru && !title.en && !title.de) {
    return { error: "A title is required." };
  }

  return {
    title_ru: title.ru || title.en || title.de,
    title_en: title.en || title.ru || title.de,
    title_de: title.de || null,
    // A Russian title keeps its own body, even an empty one; a borrowed title
    // brings its body along.
    body_ru: (title.ru ? body.ru : body.en || body.de) || null,
    body_en: body.en || body.ru || body.de || null,
    body_de: body.de || null,
  };
};
