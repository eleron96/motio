import { Link } from 'react-router-dom';
import { t, Trans } from '@lingui/macro';

export const LandingFooter = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-0.5 px-4 py-3 text-[11px] leading-tight text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p>
          © {currentYear} Motio. {t`Team planning workspace.`}
          {' · '}
          <Link
            to="/privacy"
            className="underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-600"
          >
            {t`Privacy Policy`}
          </Link>
          {' · '}
          <Link
            to="/terms"
            className="underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-600"
          >
            {t`Terms of Service`}
          </Link>
        </p>
        <p>
          <a
            href="https://github.com/eleron96/motio"
            target="_blank"
            rel="noopener"
            className="underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-600"
          >
            GitHub
          </a>
          {' · '}
          <a
            href="https://github.com/eleron96/motio/blob/main/LICENSE"
            target="_blank"
            rel="noopener"
            className="underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-600"
          >
            {t`Open source (AGPL-3.0)`}
          </a>
          {' · '}
          <a
            href="mailto:inbox@nikog.net"
            className="underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-600"
          >
            inbox@nikog.net
          </a>
          {' · '}
          <Trans>
            Designed and developed by{' '}
            <a
              href="https://nikog.net"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-primary"
            >
              NIKO G.
            </a>
          </Trans>
        </p>
      </div>
    </footer>
  );
};
