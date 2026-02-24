import { z } from 'zod';
import { INVITE_ACTIONS, INVITE_ROLE_VALUES } from '@/shared/contracts/actions';

export const INVITE_ACTION_VALUES = Object.values(INVITE_ACTIONS) as [
  typeof INVITE_ACTIONS[keyof typeof INVITE_ACTIONS],
  ...typeof INVITE_ACTIONS[keyof typeof INVITE_ACTIONS][],
];

export const inviteActionSchema = z.enum(INVITE_ACTION_VALUES);
const inviteRoleSchema = z.enum(INVITE_ROLE_VALUES);

const inviteCreateRequestSchema = z.object({
  action: z.literal(INVITE_ACTIONS.CREATE),
  workspaceId: z.string().min(1),
  email: z.string().email(),
  role: inviteRoleSchema,
  groupId: z.string().nullable().optional(),
}).strict();

const inviteAcceptRequestSchema = z.object({
  action: z.literal(INVITE_ACTIONS.ACCEPT),
  token: z.string().min(1),
}).strict();

const inviteListRequestSchema = z.object({
  action: z.literal(INVITE_ACTIONS.LIST),
}).strict();

const inviteDeclineRequestSchema = z.object({
  action: z.literal(INVITE_ACTIONS.DECLINE),
  token: z.string().min(1),
}).strict();

const inviteListSentRequestSchema = z.object({
  action: z.literal(INVITE_ACTIONS.LIST_SENT),
  pendingOnly: z.boolean().optional(),
}).strict();

const inviteCancelRequestSchema = z.object({
  action: z.literal(INVITE_ACTIONS.CANCEL),
  token: z.string().min(1),
}).strict();

export const inviteRequestSchema = z.discriminatedUnion('action', [
  inviteCreateRequestSchema,
  inviteAcceptRequestSchema,
  inviteListRequestSchema,
  inviteDeclineRequestSchema,
  inviteListSentRequestSchema,
  inviteCancelRequestSchema,
]);

export type InviteRequest = z.infer<typeof inviteRequestSchema>;
export type InviteAction = z.infer<typeof inviteActionSchema>;

export const inviteErrorResponseSchema = z.object({
  error: z.string(),
});

export const inviteBaseResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
  actionLink: z.string().optional(),
  warning: z.string().optional(),
  inviteEmail: z.string().optional(),
  inviteStatus: z.string().optional(),
  workspaceId: z.string().optional(),
}).passthrough();
