import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import { AddContactForm } from '@/features/projects/components/projectCard/AddContactForm';
import type { KnownPerson } from '@/features/projects/lib/knownPeople';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const people: KnownPerson[] = [
  { name: 'Анна Смирнова', role: 'Архитектор', company: 'СтройГрупп', email: 'anna@stroy.ru', phone: '+7900', usageCount: 3 },
];

beforeEach(() => cleanup());

describe('AddContactForm — people suggestions', () => {
  it('picking a suggestion fills the other fields and submit carries them', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddContactForm onSave={onSave} onCancel={vi.fn()} people={people} />);

    const nameInput = screen.getByPlaceholderText('Full name');
    fireEvent.focus(nameInput);
    fireEvent.change(nameInput, { target: { value: 'Анна' } });
    fireEvent.mouseDown(screen.getByText('Анна Смирнова'));

    // Role / company / email / phone are prefilled from the picked person.
    expect((screen.getByPlaceholderText('Role / job title') as HTMLInputElement).value).toBe('Архитектор');
    expect((screen.getByPlaceholderText('Company / contractor') as HTMLInputElement).value).toBe('СтройГрупп');
    expect((screen.getByPlaceholderText('Email') as HTMLInputElement).value).toBe('anna@stroy.ru');
    expect((screen.getByPlaceholderText('Phone') as HTMLInputElement).value).toBe('+7900');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      name: 'Анна Смирнова',
      role: 'Архитектор',
      email: 'anna@stroy.ru',
      phone: '+7900',
      tag: 'СтройГрупп',
    }));
  });

  it('behaves like a plain form when no people are given', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddContactForm onSave={onSave} onCancel={vi.fn()} />);

    const nameInput = screen.getByPlaceholderText('Full name');
    fireEvent.focus(nameInput);
    fireEvent.change(nameInput, { target: { value: 'Новый Контакт' } });
    // No suggestion list ever appears without known people.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      name: 'Новый Контакт',
      role: '',
      email: '',
      phone: '',
      tag: '',
    }));
  });
});
