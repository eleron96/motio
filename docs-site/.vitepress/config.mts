import { defineConfig } from 'vitepress';

const repo = 'https://github.com/eleron96/motio';
// GitHub Pages serves the site at https://<owner>.github.io/motio/; DOCS_BASE=/
// builds it for a custom domain or a local preview.
const base = process.env.DOCS_BASE ?? '/motio/';

export default defineConfig({
  title: 'Motio self-hosting',
  description:
    'Run Motio, the team planner, on your own server: install, sign-in, updates, backups and troubleshooting.',
  lang: 'en',
  base,
  srcDir: 'pages',
  // docs/self-hosting/README.md is the overview GitHub shows for the folder.
  rewrites: { 'README.md': 'overview.md' },
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.ico` }],
    ['meta', { name: 'theme-color', content: '#c4693f' }],
  ],
  themeConfig: {
    logo: { src: '/wordmark.png', alt: 'Motio' },
    siteTitle: false,
    nav: [
      { text: 'Guide', link: '/overview', activeMatch: '^/(?!$)' },
      { text: 'Releases', link: `${repo}/releases` },
      { text: 'Questions', link: `${repo}/discussions/categories/q-a` },
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'Overview', link: '/overview' },
          { text: 'Requirements', link: '/requirements' },
          { text: 'Install', link: '/install' },
          { text: 'Reverse proxy', link: '/reverse-proxy' },
        ],
      },
      {
        text: 'Set it up',
        items: [
          { text: 'Administrators', link: '/admins' },
          { text: 'People and workspaces', link: '/people' },
          { text: 'Your own sign-in', link: '/sign-in' },
          { text: 'Email', link: '/email' },
          { text: 'Settings', link: '/settings' },
        ],
      },
      {
        text: 'Keep it running',
        items: [
          { text: 'Updates and rollback', link: '/updates' },
          { text: 'Backups and restore', link: '/backups' },
          { text: 'Day to day', link: '/running' },
          { text: 'Security', link: '/security' },
        ],
      },
      {
        text: 'Help',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'FAQ and limits', link: '/faq' },
        ],
      },
    ],
    outline: { level: [2, 3], label: 'On this page' },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/self-hosting/:path`,
      text: 'Suggest a change to this page',
    },
    footer: {
      message: `Motio is open source under <a href="${repo}/blob/main/LICENSE">AGPL-3.0</a>. Self-hosting is community-supported.`,
    },
  },
});
