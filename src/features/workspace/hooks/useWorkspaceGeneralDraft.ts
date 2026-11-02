import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { fetchHolidayCountries, type HolidayCountryOption } from '@/infrastructure/holidays/holidayApi';
import { useHolidayRegionOptions } from '@/features/workspace/hooks/useHolidayRegionOptions';
import { isAbortError } from '@/shared/lib/latestAsyncRequest';

type WorkspaceCalendarFields = {
  name?: string;
  holidayCountry?: string | null;
  holidayRegion?: string | null;
};

/**
 * Settings → General as a draft: the workspace name and its holiday calendar
 * (country, region), what the country picker offers, and saving each. Lives in
 * the panel rather than the section, so a draft survives switching sections;
 * the panel calls `resetFromWorkspace` whenever it opens.
 */
export const useWorkspaceGeneralDraft = (
  open: boolean,
  currentWorkspace: WorkspaceCalendarFields | undefined,
  currentWorkspaceId: string | null,
) => {
  const updateWorkspaceName = useAuthStore((state) => state.updateWorkspaceName);
  const updateWorkspaceHolidayCountry = useAuthStore((state) => state.updateWorkspaceHolidayCountry);

  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceHolidayCountry, setWorkspaceHolidayCountry] = useState('RU');
  const [holidayCountryOptions, setHolidayCountryOptions] = useState<HolidayCountryOption[]>([]);
  const [holidayCountryLoading, setHolidayCountryLoading] = useState(false);
  const [holidayCountryOpen, setHolidayCountryOpen] = useState(false);
  const [holidayCountryQuery, setHolidayCountryQuery] = useState('');
  const [workspaceHolidayRegion, setWorkspaceHolidayRegion] = useState<string | null>(null);
  const [holidayRegionOpen, setHolidayRegionOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  const resetFromWorkspace = useCallback(() => {
    setWorkspaceName(currentWorkspace?.name ?? '');
    setWorkspaceHolidayCountry((currentWorkspace?.holidayCountry ?? 'RU').toUpperCase());
    setHolidayCountryOpen(false);
    setHolidayCountryQuery('');
    setWorkspaceHolidayRegion(currentWorkspace?.holidayRegion ?? null);
    setHolidayRegionOpen(false);
    setWorkspaceError('');
  }, [currentWorkspace?.name, currentWorkspace?.holidayCountry, currentWorkspace?.holidayRegion]);

  const { options: holidayRegionOptions, loading: holidayRegionLoading } = useHolidayRegionOptions(
    workspaceHolidayCountry,
    open,
  );
  const selectedHolidayRegion = holidayRegionOptions.find((option) => option.code === workspaceHolidayRegion);
  const regionHolidayList = selectedHolidayRegion?.holidayNames.join(', ') ?? '';
  const holidayCalendarUnchanged = (
    workspaceHolidayCountry.trim().toUpperCase() === (currentWorkspace?.holidayCountry ?? 'RU').toUpperCase()
    && workspaceHolidayRegion === (currentWorkspace?.holidayRegion ?? null)
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();

    const loadHolidayCountries = async () => {
      setHolidayCountryLoading(true);
      try {
        const data = await fetchHolidayCountries(controller.signal);
        if (!active) return;
        const normalized = data
          .map((item) => ({
            countryCode: (item.countryCode ?? '').toUpperCase(),
            name: item.name ?? '',
          }))
          .filter((item) => /^[A-Z]{2}$/.test(item.countryCode))
          .sort((left, right) => left.name.localeCompare(right.name));
        setHolidayCountryOptions(normalized);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error(error);
        }
      } finally {
        if (active) {
          setHolidayCountryLoading(false);
        }
      }
    };

    void loadHolidayCountries();

    return () => {
      active = false;
      controller.abort();
    };
  }, [open]);

  const holidayCountryLabel = useMemo(() => {
    const code = workspaceHolidayCountry.trim().toUpperCase();
    if (!code) return t`Select country`;
    const option = holidayCountryOptions.find((item) => item.countryCode === code);
    return option ? `${code} - ${option.name}` : code;
  }, [workspaceHolidayCountry, holidayCountryOptions]);

  const filteredHolidayCountryOptions = useMemo(() => {
    const query = holidayCountryQuery.trim().toLowerCase();
    if (!query) return holidayCountryOptions.slice(0, 60);

    const scored = holidayCountryOptions
      .map((option) => {
        const nameLower = option.name.toLowerCase();
        const codeLower = option.countryCode.toLowerCase();
        let score = 3;
        if (codeLower === query || nameLower === query) {
          score = 0;
        } else if (codeLower.startsWith(query) || nameLower.startsWith(query)) {
          score = 1;
        } else if (codeLower.includes(query) || nameLower.includes(query)) {
          score = 2;
        }
        return { option, score };
      })
      .filter((item) => item.score < 3)
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score;
        return left.option.name.localeCompare(right.option.name);
      });

    return scored.map((item) => item.option).slice(0, 60);
  }, [holidayCountryOptions, holidayCountryQuery]);

  const handleSaveWorkspaceName = async () => {
    if (!currentWorkspaceId) {
      setWorkspaceError(t`Workspace not selected.`);
      return;
    }
    setWorkspaceError('');
    setWorkspaceSaving(true);
    const result = await updateWorkspaceName(currentWorkspaceId, workspaceName);
    if (result.error) {
      setWorkspaceError(result.error);
      setWorkspaceSaving(false);
      return;
    }
    setWorkspaceSaving(false);
  };

  const handleSaveWorkspaceHolidayCountry = async () => {
    if (!currentWorkspaceId) {
      setWorkspaceError(t`Workspace not selected.`);
      return;
    }
    const normalized = workspaceHolidayCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) {
      setWorkspaceError(t`Country code must contain 2 letters.`);
      return;
    }

    setWorkspaceError('');
    setWorkspaceSaving(true);
    const result = await updateWorkspaceHolidayCountry(currentWorkspaceId, normalized, workspaceHolidayRegion);
    if (result.error) {
      setWorkspaceError(result.error);
      setWorkspaceSaving(false);
      return;
    }
    setWorkspaceSaving(false);
  };

  return {
    resetFromWorkspace,
    workspaceName,
    setWorkspaceName,
    workspaceHolidayCountry,
    setWorkspaceHolidayCountry,
    holidayCountryLoading,
    holidayCountryOpen,
    setHolidayCountryOpen,
    holidayCountryQuery,
    setHolidayCountryQuery,
    holidayCountryLabel,
    filteredHolidayCountryOptions,
    workspaceHolidayRegion,
    setWorkspaceHolidayRegion,
    holidayRegionOpen,
    setHolidayRegionOpen,
    holidayRegionOptions,
    holidayRegionLoading,
    selectedHolidayRegion,
    regionHolidayList,
    holidayCalendarUnchanged,
    workspaceError,
    setWorkspaceError,
    workspaceSaving,
    handleSaveWorkspaceName,
    handleSaveWorkspaceHolidayCountry,
  };
};

export type WorkspaceGeneralDraft = ReturnType<typeof useWorkspaceGeneralDraft>;
