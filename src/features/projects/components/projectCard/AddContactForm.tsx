import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';

interface AddContactFormProps {
  onSave: (payload: {
    name: string;
    role: string;
    email: string;
    phone: string;
    tag: string;
  }) => Promise<void> | void;
  onCancel: () => void;
}

export const AddContactForm: React.FC<AddContactFormProps> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tag, setTag] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        role: role.trim(),
        email: email.trim(),
        phone: phone.trim(),
        tag: tag.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-3 flex flex-col gap-1.5 rounded-lg bg-muted p-3">
      <Field
        placeholder={t`Full name`}
        value={name}
        onChange={setName}
        autoFocus
      />
      <Field placeholder={t`Role / job title`} value={role} onChange={setRole} />
      <Field placeholder={t`Tag (e.g. subcontractor)`} value={tag} onChange={setTag} />
      <Field placeholder="Email" value={email} onChange={setEmail} type="email" />
      <Field placeholder={t`Phone`} value={phone} onChange={setPhone} />
      <div className="mt-1 flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {t`Cancel`}
        </Button>
        <Button size="sm" onClick={() => void handleSubmit()} disabled={!name.trim() || submitting}>
          {t`Add`}
        </Button>
      </div>
    </div>
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
    className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
  />
);
