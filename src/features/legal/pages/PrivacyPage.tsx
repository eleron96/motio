import { Link } from 'react-router-dom';
import { useLocaleStore } from '@/shared/store/localeStore';

const CONTACT = 'info@nikog.net';
const SITE = 'motio.nikog.net';
const UPDATED_EN = 'April 1, 2025';
const UPDATED_RU = '1 апреля 2025 г.';

function PrivacyContentEn() {
  return (
    <article className="prose prose-sm max-w-none text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Privacy Policy</h1>
      <p className="text-xs text-slate-400">Last updated: {UPDATED_EN}</p>

      <h2>1. Introduction</h2>
      <p>
        This Privacy Policy describes how Motio ({SITE}) collects, uses, and protects
        personal data in accordance with the General Data Protection Regulation (GDPR).
      </p>
      <p>
        Data Controller: Motio ({SITE}). Contact:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>2. Data We Collect</h2>
      <ul>
        <li>Email address</li>
        <li>Display name</li>
        <li>Profile photo (avatar) — optional, uploaded by the user</li>
        <li>Activity data within your workspace (tasks, comments, assignments)</li>
        <li>Interface preferences (language, settings)</li>
      </ul>

      <h2>3. Purpose and Legal Basis</h2>
      <p>
        We process your data solely to provide the Service: user authentication,
        workspace collaboration, task management, and in-app notifications.
      </p>
      <p>
        Legal basis: performance of a contract (providing the Service you were invited
        to use) and legitimate interest in operating a functional collaboration tool.
      </p>
      <p>
        Essential emails about your account and the Service — such as security notices,
        planned maintenance affecting availability, and material changes to these terms —
        are sent to your account email as part of providing the Service and cannot be
        opted out of while your account is active. Product news and tips are separate:
        they are sent only if you enable them in your account settings, and every such
        email includes a one-click unsubscribe.
      </p>

      <h2>4. Data Storage and Retention</h2>
      <p>
        All personal data is stored on servers located in Moscow, Russian Federation
        (TimeWeb hosting). Data is retained for the duration of your use of the
        Service and permanently deleted within 30 days of account removal.
      </p>

      <h2>5. Third-Party Sharing</h2>
      <p>
        We do not sell, trade, or share your personal data with third parties.
        Data is only visible to members of the workspaces you belong to.
      </p>

      <h2>6. Your Rights (GDPR)</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal data</li>
        <li>Rectify inaccurate or incomplete data</li>
        <li>Request erasure of your data ("right to be forgotten")</li>
        <li>Restrict or object to processing</li>
        <li>Data portability</li>
        <li>Withdraw consent at any time</li>
      </ul>
      <p>
        To exercise your rights, contact us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will respond within 30 days.
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use only essential session cookies required for authentication.
        No tracking, analytics, or advertising cookies are used.
      </p>

      <h2>8. Security</h2>
      <p>
        We implement appropriate technical and organisational measures to protect your
        data, including HTTPS encryption, role-based access controls, and regular
        encrypted backups.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Policy from time to time. The current version is always
        available at{' '}
        <a href={`https://${SITE}/privacy`} target="_blank" rel="noreferrer">
          {SITE}/privacy
        </a>
        . Continued use of the Service after an update constitutes acceptance.
      </p>

      <h2>10. Contact</h2>
      <p>
        For any privacy-related questions:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}

function PrivacyContentRu() {
  return (
    <article className="prose prose-sm max-w-none text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Политика конфиденциальности</h1>
      <p className="text-xs text-slate-400">Последнее обновление: {UPDATED_RU}</p>

      <h2>1. Введение</h2>
      <p>
        Настоящая Политика конфиденциальности описывает, как Motio ({SITE}) собирает,
        использует и защищает персональные данные в соответствии с Общим регламентом
        о защите данных (GDPR).
      </p>
      <p>
        Оператор данных: Motio ({SITE}). Контакт:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>2. Какие данные мы собираем</h2>
      <ul>
        <li>Адрес электронной почты</li>
        <li>Имя пользователя (отображаемое имя)</li>
        <li>Фотография профиля (аватар) — по желанию пользователя</li>
        <li>Данные активности в рабочем пространстве (задачи, комментарии, назначения)</li>
        <li>Настройки интерфейса (язык, предпочтения)</li>
      </ul>

      <h2>3. Цели обработки и правовое основание</h2>
      <p>
        Мы обрабатываем данные исключительно для обеспечения работы Сервиса:
        аутентификации пользователей, совместной работы в рабочем пространстве,
        управления задачами и внутренних уведомлений.
      </p>
      <p>
        Правовое основание: исполнение договора (предоставление Сервиса, в который
        вы были приглашены) и законный интерес в поддержании работоспособного
        инструмента для совместной работы.
      </p>
      <p>
        Важные письма о вашем аккаунте и Сервисе — например, уведомления
        безопасности, о плановых работах, влияющих на доступность, и о существенных
        изменениях этих условий — отправляются на адрес вашего аккаунта в рамках
        предоставления Сервиса, и от них нельзя отказаться, пока аккаунт активен.
        Новости и советы о продукте — отдельная категория: они приходят только если
        вы включили их в настройках аккаунта, и в каждом таком письме есть отписка
        в один клик.
      </p>

      <h2>4. Хранение данных</h2>
      <p>
        Все персональные данные хранятся на серверах в Москве, Россия
        (хостинг TimeWeb). Данные хранятся в течение всего срока использования
        Сервиса и безвозвратно удаляются в течение 30 дней после удаления аккаунта.
      </p>

      <h2>5. Передача третьим лицам</h2>
      <p>
        Мы не продаём и не передаём ваши данные третьим лицам. Данные доступны
        только участникам рабочих пространств, в которые вы входите.
      </p>

      <h2>6. Ваши права (GDPR)</h2>
      <p>Вы имеете право:</p>
      <ul>
        <li>Получить доступ к своим персональным данным</li>
        <li>Исправить неточные или неполные данные</li>
        <li>Запросить удаление данных («право на забвение»)</li>
        <li>Ограничить или возразить против обработки</li>
        <li>Получить данные в переносимом формате</li>
        <li>Отозвать согласие в любой момент</li>
      </ul>
      <p>
        Для реализации прав обратитесь по адресу{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Мы ответим в течение 30 дней.
      </p>

      <h2>7. Файлы cookie</h2>
      <p>
        Мы используем только необходимые сессионные cookie для аутентификации.
        Трекинговые, аналитические и рекламные cookie не используются.
      </p>

      <h2>8. Безопасность</h2>
      <p>
        Мы применяем технические и организационные меры защиты данных: шифрование
        соединения (HTTPS), разграничение прав доступа и регулярное зашифрованное
        резервное копирование.
      </p>

      <h2>9. Изменение политики</h2>
      <p>
        Мы можем обновлять настоящую Политику. Актуальная версия всегда доступна по
        адресу{' '}
        <a href={`https://${SITE}/privacy`} target="_blank" rel="noreferrer">
          {SITE}/privacy
        </a>
        . Продолжение использования Сервиса означает принятие обновлённой редакции.
      </p>

      <h2>10. Контакты</h2>
      <p>
        По любым вопросам конфиденциальности:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}

const PrivacyPage = () => {
  const locale = useLocaleStore((state) => state.locale);
  const isRu = locale === 'ru';

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-sm font-semibold text-slate-900 hover:text-blue-600">
            ← Motio
          </Link>
          <span className="text-xs text-slate-400">
            {isRu ? 'RU · GDPR' : 'EN · GDPR'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {isRu ? <PrivacyContentRu /> : <PrivacyContentEn />}
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-xs text-slate-400 sm:px-6">
          © {new Date().getFullYear()} Motio · {SITE}
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPage;
