import { useCallback } from 'react';
import { useInstanceSetting } from '@/shared/store/instanceSettingsStore';
import { isAccountlessPerson } from '@/shared/domain/accountlessPeople';

/**
 * Whether a person in a list of assignees should carry the "no account" mark:
 * added by name only, and the server lets workspaces have such people
 * (people.withoutAccount). With the setting off nobody is marked, as before.
 */
export const useAccountlessMark = () => {
  const enabled = useInstanceSetting('people.withoutAccount');
  return useCallback(
    (person: { userId?: string | null; isSample?: boolean }) => enabled && isAccountlessPerson(person),
    [enabled],
  );
};
