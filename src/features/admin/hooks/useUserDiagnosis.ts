import { useCallback, useEffect, useState } from 'react';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';

export type UserDiagnosis = {
  user: { id: string; email: string | null; createdAt: string | null; lastSignInAt: string | null };
  workspaces: Array<{ id: string; name: string; role: string }>;
  superAdminInTable: boolean;
  keycloak:
    | { linked: false }
    | {
      linked: true;
      error: string | null;
      found: boolean | null;
      enabled: boolean | null;
      emailVerified: boolean | null;
      requiredActions: string[];
      providers: Array<{ alias: string; userName: string | null }>;
      groups: string[] | null;
      groupsError: string | null;
      superAdmin: { direct: boolean | null; viaGroup: boolean | null; fromGroupsAllowed: boolean };
    };
  groupSync?: {
    enabled: boolean;
    error?: string;
    noMappings?: boolean;
    add?: Array<{ workspaceName: string; role: string }>;
    remove?: Array<{ workspaceName: string }>;
    changeRole?: Array<{ workspaceName: string; from: string; role: string }>;
    manualRoles?: Array<{ workspaceName: string }>;
  };
};

/** Admin → Users → a person: how they sign in, their groups, what the sync would do (read only). */
export const useUserDiagnosis = (userId: string | null) => {
  const [diagnosis, setDiagnosis] = useState<UserDiagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await invokeAdminFunction<{ diagnosis: UserDiagnosis }>({
      action: ADMIN_ACTIONS.USERS_DIAGNOSE,
      userId,
    });
    setLoading(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    setDiagnosis(result.data.diagnosis);
  }, [userId]);

  useEffect(() => {
    setDiagnosis(null);
    setError(null);
    void load();
  }, [load]);

  return { diagnosis, loading, error, reload: load };
};
