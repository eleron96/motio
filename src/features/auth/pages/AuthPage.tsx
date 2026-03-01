import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useLocaleStore } from '@/shared/store/localeStore';
import { localeLabels, type Locale } from '@/shared/lib/locale';
import { setPendingLocale } from '@/features/auth/lib/pendingLocale';
import { buildAuthPath, getAuthRecoveryPath, getRedirectTargetFromSearch } from '@/features/auth/lib/authRedirect';
import { consumeRecentSignOut } from '@/features/auth/lib/recentSignOut';
import { t } from '@lingui/macro';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';

const AuthPage: React.FC = () => {
  usePageSeo({
    title: 'Вход в Motio',
    description: 'Вход в рабочее пространство Motio через защищенный SSO flow.',
    canonicalPath: '/auth',
    robots: 'noindex, nofollow',
  });

  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    loading,
    signInWithKeycloak,
    signOutRedirectInProgress,
    setSignOutRedirectInProgress,
  } = useAuthStore();
  const forceLoginRef = useRef<boolean>(consumeRecentSignOut());

  const [submitting, setSubmitting] = useState(false);
  const [oauthAttempted, setOauthAttempted] = useState(false);
  const [error, setError] = useState('');

  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const oauthError = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const rawError = searchParams.get('error');
    const rawCode = searchParams.get('error_code');
    const rawDescription = searchParams.get('error_description');
    if (!rawError) return '';

    const description = rawDescription
      ? decodeURIComponent(rawDescription.replace(/\+/g, ' '))
      : t`Authentication failed.`;

    return rawCode ? `${rawCode}: ${description}` : description;
  }, [location.search]);
  const hasOauthCode = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.has('code');
  }, [location.search]);

  const redirectTarget = useMemo(() => {
    return getRedirectTargetFromSearch(location.search);
  }, [location.search]);
  const silentMode = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('silent') === '1';
  }, [location.search]);

  useEffect(() => {
    if (!signOutRedirectInProgress) return;
    setSignOutRedirectInProgress(false);
  }, [setSignOutRedirectInProgress, signOutRedirectInProgress]);

  useEffect(() => {
    if (!oauthError) return;
    setError(oauthError);
    setSubmitting(false);
    setOauthAttempted(true);
  }, [oauthError]);

  useEffect(() => {
    if (!user) return;
    const redirectTo = redirectTarget
      ?? (location.state as { redirectTo?: string } | null)?.redirectTo
      ?? '/app';
    navigate(redirectTo, { replace: true });
  }, [location.state, navigate, redirectTarget, user]);

  useEffect(() => {
    if (loading || user || oauthAttempted || hasOauthCode) return;
    if (silentMode) {
      setOauthAttempted(true);
      setSubmitting(false);
      return;
    }

    setOauthAttempted(true);
    setSubmitting(true);

    const redirectPath = buildAuthPath(redirectTarget);
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${redirectPath}`
      : undefined;
    signInWithKeycloak(redirectTo, { forceLogin: forceLoginRef.current })
      .then(({ error: keycloakError }) => {
        if (keycloakError) {
          setError(keycloakError);
          setSubmitting(false);
        }
      })
      .catch((authError: unknown) => {
        setError(authError instanceof Error ? authError.message : t`Authentication failed.`);
        setSubmitting(false);
      });
  }, [hasOauthCode, loading, oauthAttempted, redirectTarget, signInWithKeycloak, silentMode, user]);

  useEffect(() => {
    if (loading || user || !hasOauthCode || oauthError) return;

    const timeoutId = window.setTimeout(() => {
      setSubmitting(false);
      setOauthAttempted(false);
      navigate(getAuthRecoveryPath(location.search), { replace: true });
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [hasOauthCode, loading, location.search, navigate, oauthError, user]);

  const handleKeycloakSignIn = async () => {
    setError('');
    setSubmitting(true);

    const redirectPath = buildAuthPath(redirectTarget);
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${redirectPath}`
      : undefined;
    const { error: keycloakError } = await signInWithKeycloak(redirectTo, { forceLogin: forceLoginRef.current });
    if (keycloakError) {
      setError(keycloakError);
      setSubmitting(false);
    }
  };

  const handleLocaleChange = (value: string) => {
    const nextLocale = value as Locale;
    setLocale(nextLocale);
    setPendingLocale(nextLocale);
  };

  const authError = error || oauthError;

  if (!user && !authError && !silentMode) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.2),_transparent_46%),linear-gradient(to_bottom,_#f8fafc,_#eef3f8)]" />

      <Card className="relative z-10 w-full max-w-md border-slate-200/85 bg-white/95 shadow-[0_28px_70px_-34px_rgba(15,23,42,0.4)]">
        <CardHeader className="space-y-4">
          <div className="space-y-1 text-center">
            <div className="text-2xl font-semibold tracking-tight text-slate-900">Motio</div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Workspace Planner</div>
          </div>
          <div className="space-y-1">
            <CardTitle>{t`Sign in required`}</CardTitle>
            <CardDescription>{t`Continue with Keycloak to access the workspace.`}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground">{t`Language`}</div>
            <Select value={locale} onValueChange={handleLocaleChange}>
              <SelectTrigger className="w-full border-slate-200 bg-white">
                <SelectValue placeholder={t`Select language`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{localeLabels.en}</SelectItem>
                <SelectItem value="ru">{localeLabels.ru}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authError && (
            <Alert variant="destructive">
              <AlertTitle>{t`Authentication error`}</AlertTitle>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}

          <Button type="button" className="h-11 w-full" onClick={handleKeycloakSignIn} disabled={loading || submitting}>
            {t`Continue with Keycloak`}
          </Button>

          <div className="text-xs text-muted-foreground">
            {t`Passwords and account recovery are managed in Keycloak.`}
          </div>
        </CardContent>
      </Card>

      <div className="absolute bottom-6 z-10 text-center text-[11px] text-slate-500">
        © Motio, NIKO G.
      </div>
    </div>
  );
};

export default AuthPage;
