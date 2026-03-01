import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import { toast } from '@/shared/ui/sonner';
import { t } from '@lingui/macro';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';

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
  } = useAuthStore();
  const attemptedTokenRef = useRef<string | null>(null);
  const [acceptError, setAcceptError] = useState('');

  useEffect(() => {
    if (!user || loading || !inviteToken) return;
    if (attemptedTokenRef.current === inviteToken) return;
    attemptedTokenRef.current = inviteToken;

    let active = true;
    const accept = async () => {
      setAcceptError('');
      const result = await acceptInvite(inviteToken);
      if (!active) return;

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
  }, [acceptInvite, fetchWorkspaces, inviteToken, loading, navigate, setCurrentWorkspaceId, user]);

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

  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      {t`Checking invite...`}
    </div>
  );
};

export default InvitePage;
