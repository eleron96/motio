/**
 * The IANA time zone this browser runs in ("Europe/Berlin"), or null when the
 * browser cannot tell. Reminders use it to arrive at 09:00 on the person's clock.
 */
export const getBrowserTimeZone = (): string | null => {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.length > 0 && timeZone.length <= 64 ? timeZone : null;
  } catch (_error) {
    return null;
  }
};
