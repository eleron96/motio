/**
 * Product broadcast email. Two message types with different footers:
 *  - "announcement" (marketing): reason line naming the opt-in + a one-click
 *    unsubscribe link. Requires unsubscribeUrl.
 *  - "service" (transactional: account/maintenance/legal): a "why you got this"
 *    line tied to the account, NO unsubscribe link.
 * Pure rendering, mirroring the welcome email's minimal inline-styled layout.
 * The body is plain text: blank lines split paragraphs, single newlines break.
 */

export type BroadcastLocale = "ru" | "en";
export type BroadcastMessageType = "announcement" | "service";

interface BroadcastEmailInput {
  locale: BroadcastLocale;
  messageType: BroadcastMessageType;
  subject: string;
  body: string;
  /** Required for announcements, null/absent for service mail. */
  unsubscribeUrl?: string | null;
}

interface RenderedBroadcast {
  subject: string;
  html: string;
  text: string;
}

const ANNOUNCEMENT_FOOTER: Record<BroadcastLocale, { reason: string; unsubscribe: string }> = {
  ru: {
    reason: "Вы получили это письмо, потому что включили новости Motio в настройках аккаунта.",
    unsubscribe: "Отписаться",
  },
  en: {
    reason: "You are receiving this because you enabled Motio product news in your account settings.",
    unsubscribe: "Unsubscribe",
  },
};

const SERVICE_FOOTER: Record<BroadcastLocale, string> = {
  ru: "Вы получили это служебное письмо, потому что оно касается вашего аккаунта Motio.",
  en: "You are receiving this service email because it concerns your Motio account.",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const renderParagraphs = (body: string) =>
  body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) =>
      `<p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">${
        escapeHtml(paragraph).replace(/\n/g, "<br />")
      }</p>`)
    .join("");

export const renderBroadcastEmail = (
  { locale, messageType, subject, body, unsubscribeUrl }: BroadcastEmailInput,
): RenderedBroadcast => {
  const lang: BroadcastLocale = locale === "ru" ? "ru" : "en";
  const isAnnouncement = messageType === "announcement";

  let footerHtml: string;
  let footerText: string;
  if (isAnnouncement && unsubscribeUrl) {
    const copy = ANNOUNCEMENT_FOOTER[lang];
    const safeUnsubscribe = escapeHtml(unsubscribeUrl);
    footerHtml = `${escapeHtml(copy.reason)} <a href="${safeUnsubscribe}" style="color: #8a857d; text-decoration: underline;">${escapeHtml(copy.unsubscribe)}</a>`;
    footerText = `${copy.reason}\n${copy.unsubscribe}: ${unsubscribeUrl}`;
  } else {
    const reason = SERVICE_FOOTER[lang];
    footerHtml = escapeHtml(reason);
    footerText = reason;
  }

  const html = `<div style="margin: 0; padding: 32px 16px; background-color: #f6f5f3;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e2dd; border-radius: 12px; padding: 32px; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f1d1a;">
    <p style="margin: 0 0 24px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Motio</p>
    <p style="margin: 0 0 16px; font-size: 17px; font-weight: 600;">${escapeHtml(subject)}</p>
    ${renderParagraphs(body)}
    <p style="margin: 24px 0 0; font-size: 12px; line-height: 1.5; color: #8a857d;">${footerHtml}</p>
  </div>
</div>`;

  const text = [subject, "", body.trim(), "", footerText].join("\n");

  return { subject, html, text };
};
