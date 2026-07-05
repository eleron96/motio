import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/features/auth/store/authStore';
import { AccountRestoreScreen } from '@/features/auth/components/AccountRestoreScreen';
import { isAccountDeletionEnabled } from '@/shared/lib/featureFlags';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, signOutRedirectInProgress, profileStatus } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      loading: state.loading,
      signOutRedirectInProgress: state.signOutRedirectInProgress,
      profileStatus: state.profileStatus,
    })),
  );
  const location = useLocation();

  if (loading || signOutRedirectInProgress) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!user) {
    const redirectTarget = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectTarget)}`} replace />;
  }

  // During the grace period, everything except sign-out funnels through the
  // restore screen. Keeps the user from accidentally creating new data in a
  // soon-to-be-purged account.
  if (isAccountDeletionEnabled() && profileStatus === 'PENDING_DELETION') {
    return <AccountRestoreScreen />;
  }

  return <>{children}</>;
};
