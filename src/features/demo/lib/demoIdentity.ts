/**
 * The sandbox's fake user has an id of its own shape, never a real account's
 * uuid. Seeing one outside /demo means sandbox state leaked into the real app.
 */
export const DEMO_USER_ID_PREFIX = 'demo-user-';

export const isDemoUserId = (id: string | null | undefined): boolean => (
  typeof id === 'string' && id.startsWith(DEMO_USER_ID_PREFIX)
);
