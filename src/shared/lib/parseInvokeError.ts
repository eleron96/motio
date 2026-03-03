/**
 * Extracts a human-readable error message from a Supabase Functions invoke error.
 *
 * Supabase wraps HTTP errors: the response body may contain a JSON `{ error: string }`
 * field or a plain-text message that is more descriptive than the top-level error.message.
 * Falls back to error.message when the body cannot be read or parsed.
 *
 * Previously duplicated as `parseInvokeError` in functionsGateway.ts,
 * `parseFunctionError` in InviteNotifications.tsx, and
 * `parseInvokeErrorMessage` in WorkspaceMembersPanel.tsx.
 */
export const parseInvokeError = async (
  error: { message: string },
  response?: Response,
): Promise<string> => {
  let message = error.message;
  if (!response) return message;

  try {
    const body = await response.clone().json();
    if (body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string') {
      message = (body as { error: string }).error;
    }
  } catch (_error) {
    try {
      const text = await response.clone().text();
      if (text) message = text;
    } catch (_innerError) {
      // Ignore response parsing errors and keep the original message.
    }
  }

  return message;
};
