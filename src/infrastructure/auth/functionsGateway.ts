import { supabase } from '@/shared/lib/supabaseClient';
import {
  adminBaseResponseSchema,
  adminRequestSchema,
  type AdminRequest,
} from '@/shared/contracts/admin.contract';
import {
  inviteBaseResponseSchema,
  inviteRequestSchema,
  type InviteRequest,
} from '@/shared/contracts/invite.contract';

const parseInvokeError = async (error: { message: string }, response?: Response) => {
  let message = error.message;
  if (response) {
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
  }
  return message;
};

export const invokeAdminFunction = async <T>(payload: AdminRequest) => {
  const parsedPayload = adminRequestSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { error: 'Invalid admin request payload.' };
  }

  const { data, error, response } = await supabase.functions.invoke('admin', { body: parsedPayload.data });
  if (error) {
    const message = await parseInvokeError(error, response);
    return { error: message };
  }

  const parsedResponse = adminBaseResponseSchema.safeParse(data ?? {});
  if (!parsedResponse.success) {
    return { error: 'Invalid admin response payload.' };
  }
  if (typeof parsedResponse.data.error === 'string') {
    return { error: parsedResponse.data.error };
  }

  return { data: parsedResponse.data as T };
};

export const invokeInviteFunction = async <T>(payload: InviteRequest) => {
  const parsedPayload = inviteRequestSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { error: 'Invalid invite request payload.' };
  }

  const { data, error, response } = await supabase.functions.invoke('invite', { body: parsedPayload.data });
  if (error) {
    const message = await parseInvokeError(error, response);
    return { error: message };
  }

  const parsedResponse = inviteBaseResponseSchema.safeParse(data ?? {});
  if (!parsedResponse.success) {
    return { error: 'Invalid invite response payload.' };
  }
  if (typeof parsedResponse.data.error === 'string') {
    return { error: parsedResponse.data.error };
  }

  return { data: parsedResponse.data as T };
};
