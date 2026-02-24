import { z } from 'zod';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';

export const ADMIN_ACTION_VALUES = Object.values(ADMIN_ACTIONS) as [
  typeof ADMIN_ACTIONS[keyof typeof ADMIN_ACTIONS],
  ...typeof ADMIN_ACTIONS[keyof typeof ADMIN_ACTIONS][],
];

export const adminActionSchema = z.enum(ADMIN_ACTION_VALUES);

const adminBootstrapSyncRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BOOTSTRAP_SYNC),
}).strict();

const adminUsersListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_LIST),
  search: z.string().optional(),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
  loadAll: z.boolean().optional(),
}).strict();

const adminUsersCreateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_CREATE),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
}).strict();

const adminUsersUpdateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_UPDATE),
  userId: z.string().optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  superAdmin: z.boolean().optional(),
}).strict();

const adminUsersResetPasswordRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_RESET_PASSWORD),
  userId: z.string().optional(),
}).strict();

const adminUsersDeleteRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_DELETE),
  userId: z.string().optional(),
}).strict();

const adminWorkspacesListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_LIST),
}).strict();

const adminWorkspacesUpdateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_UPDATE),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
}).strict();

const adminWorkspacesDeleteRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_DELETE),
  workspaceId: z.string().min(1),
}).strict();

const adminSuperAdminsListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_LIST),
}).strict();

const adminSuperAdminsCreateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_CREATE),
  email: z.string().email(),
  displayName: z.string().optional(),
}).strict();

const adminSuperAdminsDeleteRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_DELETE),
  userId: z.string().min(1),
}).strict();

const adminKeycloakSyncRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.KEYCLOAK_SYNC),
}).strict();

export const adminRequestSchema = z.discriminatedUnion('action', [
  adminBootstrapSyncRequestSchema,
  adminUsersListRequestSchema,
  adminUsersCreateRequestSchema,
  adminUsersUpdateRequestSchema,
  adminUsersResetPasswordRequestSchema,
  adminUsersDeleteRequestSchema,
  adminWorkspacesListRequestSchema,
  adminWorkspacesUpdateRequestSchema,
  adminWorkspacesDeleteRequestSchema,
  adminSuperAdminsListRequestSchema,
  adminSuperAdminsCreateRequestSchema,
  adminSuperAdminsDeleteRequestSchema,
  adminKeycloakSyncRequestSchema,
]);

export type AdminRequest = z.infer<typeof adminRequestSchema>;
export type AdminAction = z.infer<typeof adminActionSchema>;

export const adminErrorResponseSchema = z.object({
  error: z.string(),
});

export const adminBaseResponseSchema = z.object({
  error: z.string().optional(),
}).passthrough();
