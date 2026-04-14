import { Link } from 'react-router-dom';
import { useLocaleStore } from '@/shared/store/localeStore';

const CONTACT = 'info@nikog.net';
const SITE = 'motio.nikog.net';
const UPDATED_EN = 'April 12, 2026';
const UPDATED_RU = '12 апреля 2026 г.';

function TermsContentEn() {
  return (
    <article className="prose prose-sm max-w-none text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Terms of Service</h1>
      <p className="text-xs text-slate-400">Last updated: {UPDATED_EN}</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using Motio ({SITE}), you agree to be bound by these Terms of
        Service. If you do not agree to these terms, you may not use the Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        Motio is a team planning workspace that provides task management,
        collaboration, and project planning tools. The Service is provided
        "as is" and "as available."
      </p>

      <h2>3. User Accounts</h2>
      <ul>
        <li>You must provide accurate information when creating an account.</li>
        <li>You are responsible for maintaining the security of your account credentials.</li>
        <li>You must notify us immediately of any unauthorized use of your account.</li>
        <li>One person may not maintain more than one account.</li>
      </ul>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose</li>
        <li>Attempt to gain unauthorized access to any part of the Service</li>
        <li>Interfere with or disrupt the integrity or performance of the Service</li>
        <li>Upload malicious code, viruses, or harmful data</li>
        <li>Harass, abuse, or harm other users</li>
      </ul>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of all content you create within the Service (tasks,
        comments, files). By using the Service, you grant Motio a limited license to
        store and display your content solely for the purpose of providing the Service.
      </p>
      <p>
        You are responsible for the content you create. We reserve the right to remove
        content that violates these terms.
      </p>

      <h2>6. Workspace and Collaboration</h2>
      <p>
        Content within a workspace is visible to all members of that workspace.
        Workspace administrators are responsible for managing membership and access.
      </p>

      <h2>7. Intellectual Property</h2>
      <p>
        The Service, its original content (excluding user content), features, and
        functionality are owned by Motio and are protected by copyright, trademark,
        and other intellectual property laws.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate your account at our discretion if you violate
        these terms. You may delete your account at any time by contacting us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Upon termination, your data
        will be permanently deleted within 30 days.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Motio shall not be liable for any
        indirect, incidental, special, consequential, or punitive damages resulting
        from your use or inability to use the Service.
      </p>

      <h2>10. Changes to Terms</h2>
      <p>
        We reserve the right to modify these terms at any time. The current version
        is always available at{' '}
        <a href={`https://${SITE}/terms`} target="_blank" rel="noreferrer">
          {SITE}/terms
        </a>
        . Continued use of the Service after changes constitutes acceptance of the
        new terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        For questions about these terms:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}

function TermsContentRu() {
  return (
    <article className="prose prose-sm max-w-none text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Условия использования</h1>
      <p className="text-xs text-slate-400">Последнее обновление: {UPDATED_RU}</p>

      <h2>1. Принятие условий</h2>
      <p>
        Используя Motio ({SITE}), вы соглашаетесь с настоящими Условиями
        использования. Если вы не согласны с условиями, вы не можете использовать
        Сервис.
      </p>

      <h2>2. Описание сервиса</h2>
      <p>
        Motio — это рабочее пространство для командного планирования, предоставляющее
        инструменты управления задачами, совместной работы и планирования проектов.
        Сервис предоставляется «как есть» и «по мере доступности».
      </p>

      <h2>3. Учётные записи</h2>
      <ul>
        <li>При создании учётной записи необходимо указать достоверные данные.</li>
        <li>Вы несёте ответственность за сохранность своих учётных данных.</li>
        <li>При обнаружении несанкционированного доступа необходимо немедленно уведомить нас.</li>
        <li>Один человек может иметь только одну учётную запись.</li>
      </ul>

      <h2>4. Допустимое использование</h2>
      <p>Запрещается:</p>
      <ul>
        <li>Использовать Сервис в незаконных целях</li>
        <li>Пытаться получить несанкционированный доступ к любой части Сервиса</li>
        <li>Нарушать целостность или работоспособность Сервиса</li>
        <li>Загружать вредоносный код, вирусы или опасные данные</li>
        <li>Оскорблять или причинять вред другим пользователям</li>
      </ul>

      <h2>5. Пользовательский контент</h2>
      <p>
        Вы сохраняете право собственности на весь контент, созданный вами в Сервисе
        (задачи, комментарии, файлы). Используя Сервис, вы предоставляете Motio
        ограниченную лицензию на хранение и отображение вашего контента исключительно
        для предоставления Сервиса.
      </p>
      <p>
        Вы несёте ответственность за создаваемый контент. Мы оставляем за собой право
        удалить контент, нарушающий настоящие условия.
      </p>

      <h2>6. Рабочее пространство и совместная работа</h2>
      <p>
        Контент в рабочем пространстве виден всем его участникам. Администраторы
        рабочего пространства отвечают за управление участниками и доступом.
      </p>

      <h2>7. Интеллектуальная собственность</h2>
      <p>
        Сервис, его оригинальный контент (за исключением пользовательского контента),
        функции и функциональность принадлежат Motio и защищены законами об авторском
        праве, товарных знаках и интеллектуальной собственности.
      </p>

      <h2>8. Прекращение использования</h2>
      <p>
        Мы можем приостановить или прекратить действие вашей учётной записи по нашему
        усмотрению в случае нарушения настоящих условий. Вы можете удалить свою
        учётную запись в любое время, обратившись по адресу{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. После удаления ваши данные будут
        безвозвратно удалены в течение 30 дней.
      </p>

      <h2>9. Ограничение ответственности</h2>
      <p>
        В максимальной степени, допускаемой законом, Motio не несёт ответственности за
        косвенные, случайные, особые, последующие или штрафные убытки, возникшие в
        результате использования или невозможности использования Сервиса.
      </p>

      <h2>10. Изменение условий</h2>
      <p>
        Мы оставляем за собой право изменять настоящие условия в любое время.
        Актуальная версия всегда доступна по адресу{' '}
        <a href={`https://${SITE}/terms`} target="_blank" rel="noreferrer">
          {SITE}/terms
        </a>
        . Продолжение использования Сервиса после изменений означает принятие новых
        условий.
      </p>

      <h2>11. Контакты</h2>
      <p>
        По вопросам об условиях использования:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}

const TermsPage = () => {
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
            {isRu ? 'RU' : 'EN'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {isRu ? <TermsContentRu /> : <TermsContentEn />}
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-xs text-slate-400 sm:px-6">
          © {new Date().getFullYear()} Motio · {SITE}
        </div>
      </footer>
    </div>
  );
};

export default TermsPage;
