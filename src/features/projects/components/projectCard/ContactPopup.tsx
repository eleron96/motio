import React, { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Check, Copy, Mail, Phone } from 'lucide-react';

/**
 * Phase 4: any entity that has a name, optional role, and optional email/phone
 * can drive this popup — both customer contacts and project team members.
 */
export interface ContactPopupTarget {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

interface ContactPopupProps {
  contact: ContactPopupTarget;
  anchorRect: DOMRect;
  onClose: () => void;
}

const POPUP_WIDTH = 300;

export const ContactPopup: React.FC<ContactPopupProps> = ({ contact, anchorRect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'email' | 'phone' | null>(null);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const copy = async (value: string, key: 'email' | 'phone') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
    } catch {
      /* ignore — feature still useful even when clipboard is denied */
    }
  };

  const top = anchorRect.bottom + 8;
  const left = Math.min(anchorRect.left, (typeof window !== 'undefined' ? window.innerWidth : 0) - POPUP_WIDTH - 16);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-[300px] rounded-xl border border-border bg-card p-3.5 shadow-lg"
      style={{ top, left }}
      role="dialog"
    >
      <div className="border-b border-border/70 pb-2.5">
        <div className="text-ui-sm font-semibold">{contact.name}</div>
        {contact.role && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{contact.role}</div>
        )}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {contact.email && (
          <PopupRow
            icon={<Mail className="h-3.5 w-3.5" />}
            value={contact.email}
            copied={copied === 'email'}
            onCopy={() => copy(contact.email!, 'email')}
            ariaLabel={t`Copy email`}
          />
        )}
        {contact.phone && (
          <PopupRow
            icon={<Phone className="h-3.5 w-3.5" />}
            value={contact.phone}
            copied={copied === 'phone'}
            onCopy={() => copy(contact.phone!, 'phone')}
            ariaLabel={t`Copy phone`}
          />
        )}
        {!contact.email && !contact.phone && (
          <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            {t`No email or phone for this contact yet.`}
          </div>
        )}
      </div>
    </div>
  );
};

interface PopupRowProps {
  icon: React.ReactNode;
  value: string;
  copied: boolean;
  onCopy: () => void;
  ariaLabel: string;
}

const PopupRow: React.FC<PopupRowProps> = ({ icon, value, copied, onCopy, ariaLabel }) => (
  <div className="flex items-center gap-2.5 rounded-md bg-muted px-3 py-2 text-muted-foreground">
    {icon}
    <span className="flex-1 truncate text-[12px] tabular-nums text-foreground">{value}</span>
    <button
      type="button"
      onClick={onCopy}
      className="grid h-6 min-w-[28px] place-items-center rounded-md bg-card px-2 text-[11px] font-medium text-muted-foreground hover:text-primary"
      aria-label={ariaLabel}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1 text-primary"><Check className="h-3 w-3" /> {t`Copied`}</span>
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  </div>
);
