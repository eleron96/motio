import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { toast } from '@/shared/ui/sonner';
import { t, Trans } from '@lingui/macro';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useLocaleStore } from '@/shared/store/localeStore';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';

function ConsentCheckbox({ checked, onCheckedChange }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const isRu = locale === 'ru';

  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="privacy-consent"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5"
      />
      <Label htmlFor="privacy-consent" className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
        {isRu ? (
          <Trans>
            Я соглашаюсь с{' '}
            <Link to="/privacy" target="_blank" className="underline underline-offset-4 hover:text-foreground">
              Политикой конфиденциальности
            </Link>
          </Trans>
        ) : (
          <Trans>
            I agree to the{' '}
            <Link to="/privacy" target="_blank" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
          </Trans>
        )}
      </Label>
    </div>
  );
}

const InvitePage: React.FC = () => {
  usePageSeo({
    title: 'Приглашение в workspace — Motio',
    description: 'Страница принятия приглашения в рабочее пространство Motio.',
    canonicalPath: '/invite',
    robots: 'noindex, nofollow',
  });

  const { inviteToken } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    loading,
    acceptInvite,
    fetchWorkspaces,
    setCurrentWorkspaceId,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    loading: state.loading,
    acceptInvite: state.acceptInvite,
    fetchWorkspaces: state.fetchWorkspaces,
    setCurrentWorkspaceId: state.setCurrentWorkspaceId,
  })));

  const attemptedTokenRef = useRef<string | null>(null);
  const [acceptError, setAcceptError] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!confirmed) return;
    if (!user || loading || !inviteToken) return;
    if (attemptedTokenRef.current === inviteToken) return;
    attemptedTokenRef.current = inviteToken;

    let active = true;
    const accept = async () => {
      setAccepting(true);
      setAcceptError('');
      const result = await acceptInvite(inviteToken);
      if (!active) return;

      setAccepting(false);

      if (result.error) {
        setAcceptError(result.error);
        return;
      }

      await fetchWorkspaces();
      if (!active) return;

      if (result.workspaceId) {
        setCurrentWorkspaceId(result.workspaceId);
      }
      toast(t`Workspace joined`, {
        description: t`You were added to a new workspace.`,
      });
      navigate('/app', { replace: true });
    };

    void accept();
    return () => {
      active = false;
    };
  }, [confirmed, acceptInvite, fetchWorkspaces, inviteToken, loading, navigate, setCurrentWorkspaceId, user]);

  if (!user && !loading) {
    const redirectTarget = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectTarget)}`} replace />;
  }

  if (!inviteToken) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-destructive">
        Invalid invite link.
      </div>
    );
  }

  if (acceptError) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-destructive">
        {acceptError}
      </div>
    );
  }

  if (accepting) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        {t`Checking invite...`}
      </div>
    );
  }

  if (!confirmed) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-xl font-semibold text-foreground">
              {t`You've been invited to Motio`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t`Accept the invitation to join your team workspace.`}
            </p>
          </div>

          <div className="flex w-full flex-col gap-4">
            <ConsentCheckbox
              checked={consentChecked}
              onCheckedChange={setConsentChecked}
            />
            <Button
              className="w-full"
              disabled={!consentChecked}
              onClick={() => setConfirmed(true)}
            >
              {t`Accept & Join`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      {t`Checking invite...`}
    </div>
  );
};

export default InvitePage;
