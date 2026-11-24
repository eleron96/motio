// People on the timeline who have no Motio account: a row in `assignees` with
// no user behind it. They can be given tasks and time off and see nothing.
//
// Server setting `people.withoutAccount` (off by default) lets workspace admins
// add such people by hand. With it off Motio works as before: the only rows
// without an account are a new workspace's sample colleagues and whatever older
// data left behind, and those are listed only while a task points at them.

type PersonRef = {
  userId?: string | null;
  isSample?: boolean;
};

/** Added by hand, by name only — not a sample colleague. */
export const isAccountlessPerson = (person: PersonRef): boolean => (
  !person.userId && person.isSample !== true
);

/**
 * Whether a row of `assignees` belongs in the workspace's list of people.
 * A row with an account always does.
 */
export const isAssigneeRowListed = (
  row: { userId: string | null; hasLoadedTask: boolean },
  options: { accountlessPeopleEnabled: boolean },
): boolean => {
  if (row.userId !== null) return true;
  if (options.accountlessPeopleEnabled) return true;
  return row.hasLoadedTask;
};

const NAME_MAX_LENGTH = 120;

/** Trims the name and collapses runs of spaces; null when nothing is left. */
export const normalizeAccountlessName = (raw: string): string | null => {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH).trim();
  return name.length > 0 ? name : null;
};
