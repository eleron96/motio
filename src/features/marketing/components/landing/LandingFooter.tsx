import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t, Trans } from '@lingui/macro';
import { docsHomeUrl, selfHostingGuideUrl, userGuideUrl } from '@/shared/lib/docsLinks';
import { MOTIO_SOURCE_URL } from '@/shared/lib/startPage';
import { useLocaleStore } from '@/shared/store/localeStore';
import logoMotio from '@/shared/assets/branding/logo-motio.png';

type FooterLink = {
  label: string;
  /** Another site: opens in a new tab. */
  href?: string;
  /** A page of this app. */
  to?: string;
  /**
   * The demo needs a full page load, not a router push: AuthProvider has to
   * remount under /demo with its mock, never the signed-in client.
   */
  hardNavigation?: string;
};

const linkClassName = 'text-sm text-slate-500 transition-colors hover:text-slate-900';

const FooterLinkItem = ({ link }: { link: FooterLink }) => {
  if (link.to) return <Link to={link.to} className={linkClassName}>{link.label}</Link>;
  if (link.hardNavigation) return <a href={link.hardNavigation} className={linkClassName}>{link.label}</a>;
  return (
    <a href={link.href} target="_blank" rel="noopener" className={linkClassName}>
      {link.label}
    </a>
  );
};

const FooterColumn = ({ title, links, className }: { title: string; links: FooterLink[]; className?: string }) => (
  <nav aria-label={title} className={className}>
    <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
    <ul className="mt-3 space-y-2.5">
      {links.map((link) => (
        <li key={link.label}>
          <FooterLinkItem link={link} />
        </li>
      ))}
    </ul>
  </nav>
);

const BottomLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="transition-colors hover:text-slate-700">{children}</Link>
);

export const LandingFooter = () => {
  const currentYear = new Date().getFullYear();
  const locale = useLocaleStore((state) => state.locale);

  const columns: Array<{ title: string; links: FooterLink[] }> = [
    {
      title: t`Product`,
      links: [
        { label: t`Try demo`, hardNavigation: '/demo' },
        { label: t`Sign in`, to: '/app' },
        { label: t`What's new`, href: `${MOTIO_SOURCE_URL}/releases` },
      ],
    },
    {
      title: t`Documentation`,
      links: [
        { label: t`User guide`, href: userGuideUrl(locale) },
        { label: t`Self-hosting`, href: selfHostingGuideUrl(locale) },
        { label: t`All documentation`, href: docsHomeUrl(locale) },
      ],
    },
    {
      title: t`About`,
      links: [
        { label: 'GitHub', href: MOTIO_SOURCE_URL },
        { label: t`Open source (AGPL-3.0)`, href: `${MOTIO_SOURCE_URL}/blob/main/LICENSE` },
        { label: 'inbox@nikog.net', href: 'mailto:inbox@nikog.net' },
      ],
    },
  ];

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-12 sm:px-6 lg:px-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex">
              <img src={logoMotio} alt="Motio" className="h-7 w-auto object-contain" />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500">{t`Team planning workspace.`}</p>
          </div>
          {columns.map((column, index) => (
            <FooterColumn
              key={column.title}
              title={column.title}
              links={column.links}
              // Alone on its row on a phone: the whole width, so a long label such as the
              // German licence line doesn't break inside "AGPL-3.0".
              className={index === columns.length - 1 ? 'col-span-2 sm:col-span-1' : undefined}
            />
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {currentYear} Motio</span>
            <BottomLink to="/privacy">{t`Privacy Policy`}</BottomLink>
            <BottomLink to="/terms">{t`Terms of Service`}</BottomLink>
          </p>
          <p>
            <Trans>
              Designed and developed by{' '}
              <a
                href="https://nikog.net"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-600 transition-colors hover:text-primary"
              >
                NIKO G.
              </a>
            </Trans>
          </p>
        </div>
      </div>
    </footer>
  );
};
