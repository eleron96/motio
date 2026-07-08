import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PersonSuggestField } from '@/features/projects/components/projectCard/PersonSuggestField';
import type { KnownPerson } from '@/features/projects/lib/knownPeople';

// The lingui macro isn't transformed in the test build; stub it like the other
// project-card component tests do.
vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const people: KnownPerson[] = [
  { name: 'Анна Смирнова', role: 'Архитектор', company: 'СтройГрупп', email: 'anna@stroy.ru', phone: '+7900', usageCount: 3 },
  { name: 'Борис Иванов', role: null, company: null, email: 'boris@x.ru', phone: null, usageCount: 1 },
];

const Harness: React.FC<{ people: readonly KnownPerson[]; onPick: (p: KnownPerson) => void }> = ({
  people: source,
  onPick,
}) => {
  const [value, setValue] = React.useState('');
  return (
    <PersonSuggestField
      value={value}
      onChange={setValue}
      onPick={onPick}
      people={source}
      placeholder="Full name"
    />
  );
};

describe('PersonSuggestField', () => {
  it('filters suggestions by the typed query and picks one', () => {
    const onPick = vi.fn();
    render(<Harness people={people} onPick={onPick} />);
    const input = screen.getByPlaceholderText('Full name');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Анна' } });

    expect(screen.getByText('Анна Смирнова')).toBeInTheDocument();
    expect(screen.queryByText('Борис Иванов')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Анна Смирнова'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Анна Смирнова', email: 'anna@stroy.ru' }));
  });

  it('shows no suggestions on focus or a single typed character', () => {
    render(<Harness people={people} onPick={vi.fn()} />);
    const input = screen.getByPlaceholderText('Full name');

    // Focus alone must not surface the directory.
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // One character is still below the threshold.
    fireEvent.change(input, { target: { value: 'А' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Two characters cross it.
    fireEvent.change(input, { target: { value: 'Ан' } });
    expect(screen.getByText('Анна Смирнова')).toBeInTheDocument();
  });

  it('renders no suggestion list when there are no known people', () => {
    render(<Harness people={[]} onPick={vi.fn()} />);
    const input = screen.getByPlaceholderText('Full name');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'x' } });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('hides a lone suggestion that already equals the current input', () => {
    const onPick = vi.fn();
    render(<Harness people={[people[0]]} onPick={onPick} />);
    const input = screen.getByPlaceholderText('Full name');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Анна Смирнова' } });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
