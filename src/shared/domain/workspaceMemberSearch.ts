type WorkspaceMemberSearchRecord = {
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  groupName?: string | null;
};

const normalizeSearchValue = (value: string | null | undefined) => (
  value?.trim().toLocaleLowerCase() ?? ''
);

export const matchesWorkspaceMemberSearch = (
  member: WorkspaceMemberSearchRecord,
  search: string,
) => {
  const query = normalizeSearchValue(search);
  if (!query) return true;

  return [
    member.displayName,
    member.email,
    member.role,
    member.groupName,
  ].some((value) => normalizeSearchValue(value).includes(query));
};
