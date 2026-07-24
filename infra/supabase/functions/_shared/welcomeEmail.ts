/**
 * One-time welcome email sent after a user's first sign-in.
 * Pure rendering — no I/O — so the copy is easy to review and test.
 * Layout mirrors the minimal Keycloak email theme: plain typography,
 * inline styles only (email clients strip <style> blocks).
 */

export type WelcomeLocale = "ru" | "en";

interface WelcomeEmailInput {
  locale: WelcomeLocale;
  name: string;
  appUrl: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const COPY: Record<WelcomeLocale, {
  subject: string;
  greeting: (name: string) => string;
  intro: string;
  steps: string[];
  button: string;
  footer: string;
}> = {
  ru: {
    subject: "Добро пожаловать в Motio",
    greeting: (name) => `Здравствуйте, ${name}!`,
    intro: "Motio — общий таймлайн вашей команды. Вот с чего проще всего начать:",
    steps: [
      "Создайте первую задачу — это займёт 10 секунд.",
      "Откройте таймлайн и посмотрите, над чем работает команда.",
      "Пригласите коллег, чтобы планировать вместе.",
    ],
    button: "Открыть Motio",
    footer:
      "Это одноразовое приветственное письмо. Новостных рассылок без вашего согласия не будет — только важные письма о вашем аккаунте.",
  },
  en: {
    subject: "Welcome to Motio",
    greeting: (name) => `Hi ${name},`,
    intro: "Motio is your team's shared timeline. Here's the easiest way to get started:",
    steps: [
      "Create your first task — it takes 10 seconds.",
      "Open the timeline to see what your team is working on.",
      "Invite teammates to plan together.",
    ],
    button: "Open Motio",
    footer:
      "This is a one-time welcome email. We won't send you newsletters without your consent — only essential emails about your account.",
  },
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const renderWelcomeEmail = ({ locale, name, appUrl }: WelcomeEmailInput): RenderedEmail => {
  const copy = COPY[locale] ?? COPY.en;
  const safeName = escapeHtml(name.trim() || "!");
  const safeUrl = escapeHtml(appUrl);

  const stepsHtml = copy.steps
    .map((step) =>
      `<li style="margin: 0 0 8px; line-height: 1.5;">${escapeHtml(step)}</li>`)
    .join("");

  const html = `<div style="margin: 0; padding: 32px 16px; background-color: #f6f5f3;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e2dd; border-radius: 12px; padding: 32px; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f1d1a;">
    <p style="margin: 0 0 24px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Motio</p>
    <p style="margin: 0 0 12px; font-size: 16px; line-height: 1.5;">${copy.greeting(safeName)}</p>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">${escapeHtml(copy.intro)}</p>
    <ol style="margin: 0 0 24px; padding-left: 20px; font-size: 15px;">${stepsHtml}</ol>
    <p style="margin: 0 0 28px;">
      <a href="${safeUrl}" style="display: inline-block; background-color: #b5654a; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 10px 22px; border-radius: 8px;">${escapeHtml(copy.button)}</a>
    </p>
    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #8a857d;">${escapeHtml(copy.footer)}</p>
  </div>
</div>`;

  const text = [
    copy.greeting(name.trim() || "!"),
    "",
    copy.intro,
    ...copy.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `${copy.button}: ${appUrl}`,
    "",
    copy.footer,
  ].join("\n");

  return { subject: copy.subject, html, text };
};
