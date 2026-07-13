import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import type { KnownPerson } from '@/features/projects/lib/knownPeople';
import { PersonSuggestField } from './PersonSuggestField';

const FIELD_CLASS = 'rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-primary';

interface AddContactFormProps {
  /**
   * Resolves to `true` on success, `false` on failure (so the caller can keep
   * the form open and preserve user input). May also resolve to `void` for
   * callers that don't surface failures — in that case the form treats the
   * call as successful.
   */
  onSave: (payload: {
    name: string;
    company: string;
    role: string;
    email: string;
    phone: string;
    tag: string;
  }) => Promise<boolean | void> | boolean | void;
  onCancel: () => void;
  /**
   * Previously-entered people to suggest while typing the name. Empty (the
   * default) makes the name field behave exactly like a plain input.
   */
  people?: readonly KnownPerson[];
}

export const AddContactForm: React.FC<AddContactFormProps> = ({ onSave, onCancel, people }) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tag, setTag] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      // Treat `void` returns as success — only an explicit `false` means
      // "stay open with the user's draft".
      await onSave({
        name: name.trim(),
        company: company.trim(),
        role: role.trim(),
        email: email.trim(),
        phone: phone.trim(),
        tag: tag.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Fill the whole draft from a previously-entered person, whichever field the
  // suggestion was picked in. Only sets values the person actually has.
  const applyPerson = (person: KnownPerson) => {
    setName(person.name);
    if (person.role) setRole(person.role);
    if (person.email) setEmail(person.email);
    if (person.phone) setPhone(person.phone);
    if (person.company) setCompany(person.company);
    if (person.tag) setTag(person.tag);
  };

  return (
    <form
      className="mb-3 flex flex-col gap-1.5 rounded-lg bg-muted p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <PersonSuggestField
        placeholder={t`Full name`}
        value={name}
        onChange={setName}
        onPick={applyPerson}
        people={people ?? []}
        autoFocus
        className={FIELD_CLASS}
      />
      <PersonSuggestField
        placeholder={t`Company`}
        value={company}
        onChange={setCompany}
        onPick={applyPerson}
        people={people ?? []}
        className={FIELD_CLASS}
      />
      <Field placeholder={t`Role / job title`} value={role} onChange={setRole} />
      <Field placeholder={t`Tag`} value={tag} onChange={setTag} />
      <PersonSuggestField
        placeholder="Email"
        value={email}
        onChange={setEmail}
        onPick={applyPerson}
        people={people ?? []}
        className={FIELD_CLASS}
      />
      <Field placeholder={t`Phone`} value={phone} onChange={setPhone} />
      <div className="mt-1 flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {t`Cancel`}
        </Button>
        <Button type="submit" size="sm" disabled={!name.trim() || submitting}>
          {t`Add`}
        </Button>
      </div>
    </form>
  );
};

interface FieldProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
}

const Field: React.FC<FieldProps> = ({ placeholder, value, onChange, type, autoFocus }) => (
  <input
    type={type ?? 'text'}
    autoFocus={autoFocus}
    placeholder={placeholder}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className={FIELD_CLASS}
  />
);
