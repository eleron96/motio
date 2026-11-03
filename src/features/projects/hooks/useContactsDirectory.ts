import { useCallback, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import type { Customer, CustomerContact, ProjectMember } from '@/features/planner/types/planner';
import {
  ALL_COMPANIES,
  buildContactList,
  buildCompanyBuckets,
  filterEntriesByCompany,
  searchContactList,
} from '@/features/projects/lib/contactList';

interface UseContactsDirectoryOptions {
  customerContacts: CustomerContact[];
  projectMemberRows: ProjectMember[];
  customerById: Map<string, Customer>;
}

/**
 * The contacts tab: one flat list of every person (customer contacts plus the
 * deduplicated external project members), searched as a whole and narrowed
 * to one company.
 */
export const useContactsDirectory = ({
  customerContacts,
  projectMemberRows,
  customerById,
}: UseContactsDirectoryOptions) => {
  const [contactSearch, setContactSearch] = useState('');
  const [selectedCompanyKey, setSelectedCompanyKey] = useState<string>(ALL_COMPANIES);

  const contactEntries = useMemo(
    () => buildContactList(customerContacts, projectMemberRows, customerById),
    [customerContacts, projectMemberRows, customerById],
  );
  // The single sidebar search runs over EVERYTHING (companies, people, tags,
  // roles, emails, phones): the company list shows only buckets that still
  // contain matches, the panel shows the matching people.
  const searchedContactEntries = useMemo(
    () => searchContactList(contactEntries, contactSearch),
    [contactEntries, contactSearch],
  );
  const companyBuckets = useMemo(
    () => buildCompanyBuckets(searchedContactEntries),
    [searchedContactEntries],
  );
  // A selected company can drop out of the results while the user types; fall
  // back to "All contacts" instead of showing an empty panel (the selection
  // comes back as soon as the company matches again).
  const effectiveCompanyKey = useMemo(() => (
    selectedCompanyKey === ALL_COMPANIES
    || companyBuckets.some((bucket) => bucket.key === selectedCompanyKey)
      ? selectedCompanyKey
      : ALL_COMPANIES
  ), [selectedCompanyKey, companyBuckets]);
  const companyFilteredEntries = useMemo(
    () => filterEntriesByCompany(searchedContactEntries, effectiveCompanyKey),
    [searchedContactEntries, effectiveCompanyKey],
  );
  // Typing a fresh query widens the view to all companies, so matches are
  // never hidden by a previously selected bucket; clicking a company after
  // that narrows within the results.
  const handleContactSearchChange = useCallback((value: string) => {
    if (value.trim() && !contactSearch.trim()) setSelectedCompanyKey(ALL_COMPANIES);
    setContactSearch(value);
  }, [contactSearch]);

  const selectedCompanyBucket = companyBuckets.find((bucket) => bucket.key === effectiveCompanyKey) ?? null;
  const contactsPanelTitle = effectiveCompanyKey === ALL_COMPANIES
    ? t`All contacts`
    : selectedCompanyBucket
      ? (selectedCompanyBucket.company ?? t`No company`)
      : t`All contacts`;

  return {
    contactEntries,
    companyBuckets,
    effectiveCompanyKey,
    companyFilteredEntries,
    contactSearch,
    handleContactSearchChange,
    setSelectedCompanyKey,
    selectedCompanyBucket,
    contactsPanelTitle,
  };
};
