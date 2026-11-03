import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useLocaleStore } from '@/shared/store/localeStore';
import { SUPPORTED_LOCALES } from '@/shared/lib/locale';
import { setPendingLocale } from '@/features/auth/lib/pendingLocale';
import { Button } from '@/shared/ui/button';
import logoMotio from '@/shared/assets/branding/logo-motio.png';

export const LandingHeader = () => {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);
  const signOutRedirectInProgress = useAuthStore((s) => s.signOutRedirectInProgress);
  const { locale, setLocale } = useLocaleStore();
  const [manualSignOutLoading, setManualSignOutLoading] = useState(false);

  const handleSignOut = async () => {
    setManualSignOutLoading(true);
    try { await signOut(); } finally { setManualSignOutLoading(false); }
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link to="/" className="flex items-center">
          <img src={logoMotio} alt="Motio" className="h-8 w-auto object-contain" />
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // Cycles through every UI language: EN → RU → DE → EN.
              const nextLocale = SUPPORTED_LOCALES[(SUPPORTED_LOCALES.indexOf(locale) + 1) % SUPPORTED_LOCALES.length];
              setLocale(nextLocale);
              // Только для гостя: его выбор должен пережить вход, иначе язык
              // профиля перезапишет его обратно. У вошедшего человека язык
              // аккаунта менять с витрины нельзя — для этого есть настройки.
              if (!user) {
                setPendingLocale(nextLocale);
              }
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Switch language"
          >
            {locale.toUpperCase()}
          </button>

          {!loading && user ? (
            <>
              <span className="hidden max-w-[180px] truncate text-xs text-slate-500 sm:block">
                {user.email ?? t`Signed in`}
              </span>
              <Button asChild variant="secondary" size="sm">
                <Link to="/app">{t`Go to timeline`}</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                disabled={manualSignOutLoading || signOutRedirectInProgress}
              >
                {t`Sign out`}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-primary/10 hover:text-primary">
                {/* Hard navigation (not React Router push) so AuthProvider
                    remounts under /demo and the supabase mock is wired
                    from the start — never the prod client carrying a
                    logged-in user's data. */}
                <a href="/demo">{t`Try demo`}</a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
              >
                <Link to="/app">{t`Sign in`}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
