import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Check, Copy, Mail, Phone } from 'lucide-react';

/**
 * Any entity that has a name, optional role, and optional email/phone can
 * drive this popup — both customer contacts and project team members.
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
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

interface PopupPlacement {
  top: number;
  left: number;
  /** Set when the popup couldn't fit at full natural width on a small viewport. */
  width: number;
}

const computePlacement = (anchorRect: DOMRect, popupHeight: number): PopupPlacement => {
  if (typeof window === 'undefined') {
    return { top: anchorRect.bottom + ANCHOR_GAP, left: anchorRect.left, width: POPUP_WIDTH };
  }
  const { innerWidth, innerHeight } = window;
  const width = Math.min(POPUP_WIDTH, innerWidth - VIEWPORT_MARGIN * 2);

  // Horizontal: anchor's left, but clamp into [margin, innerWidth - width - margin].
  const desiredLeft = anchorRect.left;
  const maxLeft = innerWidth - width - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(desiredLeft, maxLeft));

  // Vertical: prefer below, but flip above if no room and there is room above.
  const spaceBelow = innerHeight - anchorRect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = anchorRect.top - VIEWPORT_MARGIN;
  const fitsBelow = popupHeight + ANCHOR_GAP <= spaceBelow;
  const fitsAbove = popupHeight + ANCHOR_GAP <= spaceAbove;
  let top: number;
  if (fitsBelow || !fitsAbove) {
    top = anchorRect.bottom + ANCHOR_GAP;
    if (top + popupHeight + VIEWPORT_MARGIN > innerHeight) {
      // Last-resort clamp into viewport so we don't render off-screen.
      top = Math.max(VIEWPORT_MARGIN, innerHeight - popupHeight - VIEWPORT_MARGIN);
    }
  } else {
    top = Math.max(VIEWPORT_MARGIN, anchorRect.top - popupHeight - ANCHOR_GAP);
  }

  return { top, left, width };
};

export const ContactPopup: React.FC<ContactPopupProps> = ({ contact, anchorRect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'email' | 'phone' | null>(null);
  const [placement, setPlacement] = useState<PopupPlacement>(() => (
    computePlacement(anchorRect, 200)
  ));
  const titleId = useId();

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

  // Recompute placement once the popup has rendered so we know its real height
  // and can flip vertically near the bottom of the viewport.
  useLayoutEffect(() => {
    if (!ref.current) return;
    const { height } = ref.current.getBoundingClientRect();
    setPlacement(computePlacement(anchorRect, height));
  }, [anchorRect, contact.email, contact.phone]);

  // Move focus into the popup so it can be navigated by keyboard.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const copy = async (value: string, key: 'email' | 'phone') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
    } catch {
      /* ignore — feature still useful even when clipboard is denied */
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed z-50 rounded-xl border border-border bg-card p-3.5 shadow-lg outline-none"
      style={{ top: placement.top, left: placement.left, width: placement.width }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="border-b border-border/70 pb-2.5">
        <div id={titleId} className="text-ui-sm font-semibold">{contact.name}</div>
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
