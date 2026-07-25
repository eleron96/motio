// Presentational half of the "latest changes" dialog. Kept apart from
// AccountSettingsDialog so the rendering of loading / empty / populated states is
// testable without mocking the auth store, and so the dialog stays readable.
//
// Type-only import: the release-notes module inlines both CHANGELOG files and is
// loaded on demand by the dialog (see src/test/shared/releaseNotesBoundary.test.ts).
import type { ReleaseNotesEntry } from '@/shared/lib/releaseNotes';

type ReleaseNotesListProps = {
  /** `null` while the notes chunk is still loading, `[]` when there is nothing. */
  entries: ReleaseNotesEntry[] | null;
  isRussianLocale: boolean;
};

export const ReleaseNotesList = ({ entries, isRussianLocale }: ReleaseNotesListProps) => {
  if (entries === null) {
    return (
      <p className="text-sm text-muted-foreground">
        {isRussianLocale ? 'Загружаем историю изменений…' : 'Loading the change history…'}
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isRussianLocale ? 'Нет записей о последних изменениях.' : 'No recent change entries available.'}
      </p>
    );
  }

  return (
    <>
      {entries.map((entry) => (
        <article key={`${entry.version}-${entry.date}`} className="space-y-3">
          <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b pb-1">
            <h4 className="text-sm font-semibold text-foreground">
              {entry.version === 'Unreleased'
                ? (isRussianLocale ? 'Готовится' : 'Unreleased')
                : (isRussianLocale ? `Версия ${entry.version}` : `Version ${entry.version}`)}
            </h4>
            {entry.date && (
              <span className="text-xs text-muted-foreground">{entry.date}</span>
            )}
          </header>
          {entry.sections.map((section) => (
            <section key={`${entry.version}-${section.title}`} className="space-y-2">
              <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h5>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {section.items.map((item) => (
                  <li key={`${entry.version}-${section.title}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      ))}
    </>
  );
};
