interface PersonRow {
  name: string;
  userId?: string | null;
}

/**
 * Names of the workspace's people by account id. A member who never filled in
 * the profile name is still a known person: everyone sees them under the name
 * of their own row.
 */
export const rowNamesByUserId = (people: PersonRow[]): Map<string, string> => {
  const names = new Map<string, string>();
  for (const person of people) {
    const name = person.name.trim();
    if (person.userId && name && !names.has(person.userId)) names.set(person.userId, name);
  }
  return names;
};
