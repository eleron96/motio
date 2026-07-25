import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseNotesList } from '@/features/auth/components/ReleaseNotesList';
import type { ReleaseNotesEntry } from '@/shared/lib/releaseNotes';

const entries: ReleaseNotesEntry[] = [
  {
    version: 'Unreleased',
    date: '',
    sections: [{ title: 'Added', items: ['Something brewing'] }],
  },
  {
    version: '0.9.35',
    date: '2026-07-24',
    sections: [
      { title: 'Fixed', items: ['Service worker cache header'] },
      { title: 'Added', items: ['Badge count', 'Deep link'] },
    ],
  },
];

describe('ReleaseNotesList', () => {
  it('shows a loading line while the notes chunk is still in flight', () => {
    render(<ReleaseNotesList entries={null} isRussianLocale={false} />);

    expect(screen.getByText('Loading the change history…')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('distinguishes "still loading" from "loaded and empty"', () => {
    render(<ReleaseNotesList entries={[]} isRussianLocale={false} />);

    expect(screen.getByText('No recent change entries available.')).toBeInTheDocument();
    expect(screen.queryByText('Loading the change history…')).not.toBeInTheDocument();
  });

  it('renders every release with its sections and items', () => {
    render(<ReleaseNotesList entries={entries} isRussianLocale={false} />);

    expect(screen.getByText('Version 0.9.35')).toBeInTheDocument();
    expect(screen.getByText('2026-07-24')).toBeInTheDocument();
    expect(screen.getByText('Service worker cache header')).toBeInTheDocument();
    expect(screen.getByText('Badge count')).toBeInTheDocument();
    expect(screen.getByText('Deep link')).toBeInTheDocument();

    // Two releases rendered, so a scrollable history rather than only the newest.
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('labels an Unreleased entry instead of printing the word as a version', () => {
    render(<ReleaseNotesList entries={entries} isRussianLocale={false} />);

    expect(screen.getByText('Unreleased')).toBeInTheDocument();
    expect(screen.queryByText('Version Unreleased')).not.toBeInTheDocument();
  });

  it('localizes headings and states for Russian', () => {
    const { rerender } = render(<ReleaseNotesList entries={entries} isRussianLocale />);

    expect(screen.getByText('Версия 0.9.35')).toBeInTheDocument();
    expect(screen.getByText('Готовится')).toBeInTheDocument();

    rerender(<ReleaseNotesList entries={null} isRussianLocale />);
    expect(screen.getByText('Загружаем историю изменений…')).toBeInTheDocument();

    rerender(<ReleaseNotesList entries={[]} isRussianLocale />);
    expect(screen.getByText('Нет записей о последних изменениях.')).toBeInTheDocument();
  });

  it('does not drop releases that repeat a section title', () => {
    render(<ReleaseNotesList entries={entries} isRussianLocale={false} />);

    // "Added" appears in both entries — keys are scoped per release, so both survive.
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });
});
