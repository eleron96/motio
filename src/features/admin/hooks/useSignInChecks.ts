import { useCallback, useEffect, useState } from 'react';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';

export type SignInAdviceCode =
  | 'verify_without_smtp'
  | 'trust_email_off'
  | 'groups_not_forced'
  | 'no_group_mappers'
  | 'registration_open';

export type SignInChecks = {
  realm: string;
  snapshot: {
    registrationAllowed: boolean;
    verifyEmail: boolean;
    resetPasswordAllowed: boolean;
    smtpConfigured: boolean;
    identityProviders: Array<{
      alias: string;
      displayName: string | null;
      providerId: string;
      enabled: boolean;
      trustEmail: boolean;
      syncMode: string;
      groupMappers: Array<{ name: string; syncMode: string }>;
    }>;
    workspacesFromGroups: boolean;
    superAdminFromGroups: boolean;
  };
  advice: Array<{ level: 'warning' | 'info'; code: SignInAdviceCode; provider?: string }>;
};

export const fetchSignInChecks = async () => (
  invokeAdminFunction<{ checks: SignInChecks }>({ action: ADMIN_ACTIONS.SYSTEM_SIGN_IN })
);

/** Admin → System → Sign-in checks: the realm, its providers and what needs attention. */
export const useSignInChecks = () => {
  const [checks, setChecks] = useState<SignInChecks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchSignInChecks();
    setLoading(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    setChecks(result.data.checks);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { checks, loading, error, refresh: load };
};
