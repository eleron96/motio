import { defineConfig, type DefaultTheme } from 'vitepress';

const repo = 'https://github.com/eleron96/motio';
const demo = 'https://motio.nikog.net/demo?utm_source=docs&utm_medium=site';
// GitHub Pages serves the site at https://<owner>.github.io/motio/; DOCS_BASE=/
// builds it for a custom domain or a local preview.
const base = process.env.DOCS_BASE ?? '/motio/';

// Where each page of the site is written, for "Suggest a change". VitePress ships this
// function to the browser on its own, so it must not use anything from this file.
const editLinkPattern = ({ filePath }: { filePath: string }) => {
  const source = filePath.startsWith('ru/guide/')
    ? `docs/guides/ru/${filePath.slice('ru/guide/'.length)}`
    : filePath.startsWith('guide/')
      ? `docs/guides/${filePath.slice('guide/'.length)}`
      : filePath.startsWith('ru/self-hosting/')
        ? `docs/self-hosting/ru/${filePath.slice('ru/self-hosting/'.length)}`
        : `docs/${filePath}`;
  return `https://github.com/eleron96/motio/edit/main/${source}`;
};

// The self-hosting guide has the same pages in both languages; only the titles differ.
const selfHostingSidebar = (prefix: string, text: Record<string, string>): DefaultTheme.SidebarItem[] => {
  const page = (slug: string) => ({ text: text[slug], link: `${prefix}/self-hosting/${slug === 'overview' ? '' : slug}` });
  return [
    { text: text.start, items: ['overview', 'requirements', 'install', 'reverse-proxy'].map(page) },
    { text: text.setUp, items: ['admins', 'people', 'sign-in', 'email', 'settings'].map(page) },
    { text: text.keepRunning, items: ['updates', 'backups', 'running', 'security'].map(page) },
    { text: text.help, items: ['troubleshooting', 'faq'].map(page) },
  ];
};

const englishSelfHosting = selfHostingSidebar('', {
  start: 'Get started', setUp: 'Set it up', keepRunning: 'Keep it running', help: 'Help',
  overview: 'Overview', requirements: 'Requirements', install: 'Install', 'reverse-proxy': 'Reverse proxy',
  admins: 'Administrators', people: 'People and workspaces', 'sign-in': 'Your own sign-in', email: 'Email',
  settings: 'Settings', updates: 'Updates and rollback', backups: 'Backups and restore', running: 'Day to day',
  security: 'Security', troubleshooting: 'Troubleshooting', faq: 'FAQ and limits',
});

const russianSelfHosting = selfHostingSidebar('/ru', {
  start: 'Начало', setUp: 'Настройка', keepRunning: 'Эксплуатация', help: 'Помощь',
  overview: 'Обзор', requirements: 'Требования', install: 'Установка', 'reverse-proxy': 'Обратный прокси',
  admins: 'Администраторы', people: 'Люди и пространства', 'sign-in': 'Свой вход', email: 'Почта',
  settings: 'Настройки', updates: 'Обновления и откат', backups: 'Бэкапы и восстановление', running: 'Повседневное',
  security: 'Безопасность', troubleshooting: 'Решение проблем', faq: 'Вопросы и ограничения',
});

// The workspace API and the MCP server: the same two pages in both languages.
const integrationsSidebar = (prefix: string, text: Record<string, string>): DefaultTheme.SidebarItem[] => [
  {
    text: text.group,
    items: [
      { text: text.api, link: `${prefix}/api` },
      { text: text.mcp, link: `${prefix}/mcp` },
    ],
  },
];

const englishIntegrations = integrationsSidebar('', {
  group: 'Connect other programs', api: 'Workspace API', mcp: 'MCP server for AI assistants',
});

const russianIntegrations = integrationsSidebar('/ru', {
  group: 'Подключение других программ', api: 'API пространства', mcp: 'MCP-сервер для ИИ-ассистентов',
});

// The user guide has the same pages in both languages; only the titles differ.
const guideSidebar = (prefix: string, text: Record<string, string>): DefaultTheme.SidebarItem[] => {
  const page = (slug: string) => ({ text: text[slug], link: `${prefix}/guide/${slug === 'overview' ? '' : slug}` });
  return [
    { text: text.start, items: ['overview', 'getting-started', 'phone'].map(page) },
    { text: text.plan, items: ['timeline', 'tasks', 'board'].map(page) },
    { text: text.teamAndProjects, items: ['team', 'projects', 'dashboard'].map(page) },
    { text: text.upToDate, items: ['notifications'].map(page) },
    { text: text.settings, items: ['workspaces', 'account'].map(page) },
    { text: text.playbooks, items: ['first-week', 'multiple-projects', 'spotting-overload'].map(page) },
    { text: text.reference, items: ['shortcuts'].map(page) },
  ];
};

const englishGuide = guideSidebar('', {
  start: 'Start',
  plan: 'Plan',
  teamAndProjects: 'Team and projects',
  upToDate: 'Stay up to date',
  settings: 'Settings',
  playbooks: 'Playbooks',
  reference: 'Reference',
  overview: 'Using Motio',
  'getting-started': 'Getting started',
  phone: 'Motio on a phone',
  timeline: 'The timeline',
  tasks: 'Tasks',
  board: 'The board',
  team: 'Team',
  projects: 'Projects and customers',
  dashboard: 'Dashboard and heatmap',
  notifications: 'Notifications',
  workspaces: 'Workspace and roles',
  account: 'Your account',
  'first-week': 'Your first week',
  'multiple-projects': 'Several projects, one team',
  'spotting-overload': 'Spotting overload',
  shortcuts: 'Keyboard shortcuts',
});

const russianGuide = guideSidebar('/ru', {
  start: 'Начало',
  plan: 'Планирование',
  teamAndProjects: 'Команда и проекты',
  upToDate: 'Быть в курсе',
  settings: 'Настройки',
  playbooks: 'Сценарии',
  reference: 'Справка',
  overview: 'Работа в Motio',
  'getting-started': 'Начало работы',
  phone: 'Motio на телефоне',
  timeline: 'Таймлайн',
  tasks: 'Задачи',
  board: 'Доска',
  team: 'Команда',
  projects: 'Проекты и клиенты',
  dashboard: 'Дашборд и тепловая карта',
  notifications: 'Уведомления',
  workspaces: 'Пространство и роли',
  account: 'Ваш аккаунт',
  'first-week': 'Первая неделя',
  'multiple-projects': 'Несколько проектов, одна команда',
  'spotting-overload': 'Как заметить перегрузку',
  shortcuts: 'Горячие клавиши',
});

export default defineConfig({
  title: 'Motio docs',
  description: 'How to plan with Motio, the shared team timeline, and how to run it on your own server.',
  base,
  srcDir: 'pages',
  // Each folder's README.md is what GitHub shows for it; on the site it is the folder's index.
  rewrites: {
    'guide/README.md': 'guide/index.md',
    'ru/guide/README.md': 'ru/guide/index.md',
    'self-hosting/README.md': 'self-hosting/index.md',
    'ru/self-hosting/README.md': 'ru/self-hosting/index.md',
  },
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.ico` }],
    ['meta', { name: 'theme-color', content: '#c4693f' }],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Using Motio', link: '/guide/', activeMatch: '^/guide/' },
          { text: 'Self-hosting', link: '/self-hosting/', activeMatch: '^/self-hosting/' },
          { text: 'API and MCP', link: '/api', activeMatch: '^/(api|mcp)$' },
          { text: 'Live demo', link: demo },
          { text: 'Releases', link: `${repo}/releases` },
        ],
        sidebar: {
          '/guide/': englishGuide,
          '/self-hosting/': englishSelfHosting,
          '/api': englishIntegrations,
          '/mcp': englishIntegrations,
        },
        editLink: {
          pattern: editLinkPattern,
          text: 'Suggest a change to this page',
        },
        footer: {
          message: `Motio is open source under <a href="${repo}/blob/main/LICENSE">AGPL-3.0</a>. Questions: <a href="${repo}/discussions/categories/q-a">Discussions</a>.`,
        },
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru',
      link: '/ru/',
      title: 'Документация Motio',
      description: 'Как планировать в Motio — общем таймлайне команды — и как запустить его на своём сервере.',
      themeConfig: {
        nav: [
          { text: 'Работа в Motio', link: '/ru/guide/', activeMatch: '^/ru/guide/' },
          { text: 'Свой сервер', link: '/ru/self-hosting/', activeMatch: '^/ru/self-hosting/' },
          { text: 'API и MCP', link: '/ru/api', activeMatch: '^/ru/(api|mcp)$' },
          { text: 'Демо', link: demo },
          { text: 'Релизы', link: `${repo}/releases` },
        ],
        sidebar: {
          '/ru/guide/': russianGuide,
          '/ru/self-hosting/': russianSelfHosting,
          '/ru/api': russianIntegrations,
          '/ru/mcp': russianIntegrations,
        },
        editLink: {
          pattern: editLinkPattern,
          text: 'Предложить правку этой страницы',
        },
        footer: {
          message: `Motio — открытый код под лицензией <a href="${repo}/blob/main/LICENSE">AGPL-3.0</a>. Вопросы — в <a href="${repo}/discussions/categories/q-a">Discussions</a>.`,
        },
        outline: { level: [2, 3], label: 'На этой странице' },
        docFooter: { prev: 'Назад', next: 'Далее' },
        darkModeSwitchLabel: 'Тема',
        lightModeSwitchTitle: 'Светлая тема',
        darkModeSwitchTitle: 'Тёмная тема',
        sidebarMenuLabel: 'Меню',
        returnToTopLabel: 'Наверх',
        langMenuLabel: 'Язык',
        notFound: {
          title: 'Страница не найдена',
          quote: 'Такой страницы здесь нет. Возможно, она переехала.',
          linkLabel: 'На главную',
          linkText: 'На главную',
        },
      },
    },
  },
  themeConfig: {
    logo: { src: '/wordmark.png', alt: 'Motio' },
    siteTitle: false,
    outline: { level: [2, 3], label: 'On this page' },
    search: {
      provider: 'local',
      options: {
        locales: {
          ru: {
            translations: {
              button: { buttonText: 'Поиск', buttonAriaLabel: 'Поиск' },
              modal: {
                displayDetails: 'Подробный список',
                resetButtonTitle: 'Сбросить поиск',
                backButtonTitle: 'Закрыть поиск',
                noResultsText: 'Ничего не нашлось по запросу',
                footer: { selectText: 'выбрать', navigateText: 'перейти', closeText: 'закрыть' },
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: 'github', link: repo }],
  },
});
