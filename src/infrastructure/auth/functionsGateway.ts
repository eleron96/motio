import { supabase } from '@/shared/lib/supabaseClient';
import { parseInvokeError } from '@/shared/lib/parseInvokeError';
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

// Discriminated union so callers narrow correctly: an error result never carries
// `data`, and a success result never carries `error`. This also gives the generic
// `T` real meaning — on success `data` is typed `T`, not `T | undefined`.
type FunctionResult<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };

export const invokeAdminFunction = async <T>(payload: AdminRequest): Promise<FunctionResult<T>> => {
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

export const invokeInviteFunction = async <T>(payload: InviteRequest): Promise<FunctionResult<T>> => {
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
