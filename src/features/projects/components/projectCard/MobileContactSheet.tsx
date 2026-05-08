import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Check, Copy, Mail, Phone } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import type { ContactPopupTarget } from './ContactPopup';

interface MobileContactSheetProps {
  contact: ContactPopupTarget | null;
  onClose: () => void;
}

/**
 * Bottom sheet variant of `ContactPopup` for mobile viewports. Replaces the
 * absolute-positioned overlay with a native-feeling bottom drawer that plays
 * nicely with on-screen keyboards and small viewports.
 *
 * Email/phone rows are also wrapped in `mailto:` / `tel:` links so the user
 * can launch the platform's default handler without first copying.
 */
export const MobileContactSheet: React.FC<MobileContactSheetProps> = ({ contact, onClose }) => {
  const [copied, setCopied] = useState<'email' | 'phone' | null>(null);

  const copy = async (value: string, key: 'email' | 'phone') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
    } catch {
      /* clipboard may be unavailable on some browsers — silently ignore */
    }
  };

  const open = contact !== null;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{contact?.name ?? ''}</SheetTitle>
          <SheetDescription>
            {contact?.role ? contact.role : t`Contact details`}
          </SheetDescription>
        </SheetHeader>

        {contact && (
          <div className="mt-3 flex flex-col gap-2 pb-2">
            {contact.email && (
              <ContactRow
                href={`mailto:${contact.email}`}
                icon={<Mail className="h-4 w-4" aria-hidden="true" />}
                value={contact.email}
                copied={copied === 'email'}
                onCopy={() => copy(contact.email!, 'email')}
                copyLabel={t`Copy email`}
              />
            )}
            {contact.phone && (
              <ContactRow
                href={`tel:${contact.phone}`}
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
                value={contact.phone}
                copied={copied === 'phone'}
                onCopy={() => copy(contact.phone!, 'phone')}
                copyLabel={t`Copy phone`}
              />
            )}
            {!contact.email && !contact.phone && (
              <div className="rounded-md bg-muted px-3 py-3 text-[12px] text-muted-foreground">
                {t`No email or phone for this contact yet.`}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

interface ContactRowProps {
  href: string;
  icon: React.ReactNode;
  value: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
}

const ContactRow: React.FC<ContactRowProps> = ({ href, icon, value, copied, onCopy, copyLabel }) => (
  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
    <a
      href={href}
      className="flex flex-1 items-center gap-2.5 text-foreground"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate text-[14px] tabular-nums">{value}</span>
    </a>
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onCopy}
      aria-label={copyLabel}
      className="h-9 px-2.5"
    >
      {copied ? (
        <span className="inline-flex items-center gap-1 text-primary"><Check className="h-3.5 w-3.5" /> {t`Copied`}</span>
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  </div>
);
