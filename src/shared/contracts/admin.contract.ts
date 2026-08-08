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

const adminSuperAdminsWhoamiRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_WHOAMI),
}).strict();

const adminKeycloakSyncRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.KEYCLOAK_SYNC),
}).strict();

const adminEasterEggsListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_LIST),
}).strict();

const adminEasterEggsSaveRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_SAVE),
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  eggKey: z.string().min(1).max(64),
  enabled: z.boolean(),
  note: z.string().max(500).optional(),
}).strict();

const adminEasterEggsDeleteRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_DELETE),
  id: z.string().uuid(),
}).strict();

const broadcastMessageTypeSchema = z.enum(['announcement', 'service']);
const broadcastAudienceKindSchema = z.enum(['subscribers', 'domain', 'workspace', 'all_active']);

const adminBroadcastsAudienceRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BROADCASTS_AUDIENCE),
  messageType: broadcastMessageTypeSchema,
  audienceKind: broadcastAudienceKindSchema,
  audienceValue: z.string().max(255).optional(),
}).strict();

const adminBroadcastsSendRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BROADCASTS_SEND),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  messageType: broadcastMessageTypeSchema,
  audienceKind: broadcastAudienceKindSchema,
  audienceValue: z.string().max(255).optional(),
  // ISO timestamp; absent/empty = send now.
  scheduledAt: z.string().datetime().optional(),
}).strict();

const adminBroadcastsProcessRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BROADCASTS_PROCESS),
  broadcastId: z.string().uuid(),
}).strict();

const adminBroadcastsListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BROADCASTS_LIST),
}).strict();

const adminBroadcastsCancelRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BROADCASTS_CANCEL),
  broadcastId: z.string().uuid(),
}).strict();

const adminBroadcastsTickRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BROADCASTS_TICK),
}).strict();

const announcementLevelSchema = z.enum(['info', 'critical']);
const announcementAudienceKindSchema = z.enum(['all_active', 'domain', 'workspace']);

const adminAnnouncementsPublishRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH),
  titleRu: z.string().min(1).max(200),
  titleEn: z.string().max(200).optional(),
  bodyRu: z.string().max(2000).optional(),
  bodyEn: z.string().max(2000).optional(),
  level: announcementLevelSchema,
  audienceKind: announcementAudienceKindSchema,
  audienceValue: z.string().max(255).optional(),
  endsAt: z.string().datetime().optional(),
  published: z.boolean().optional(),
}).strict();

const adminAnnouncementsListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.ANNOUNCEMENTS_LIST),
}).strict();

const adminAnnouncementsUnpublishRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.ANNOUNCEMENTS_UNPUBLISH),
  announcementId: z.string().uuid(),
}).strict();

const adminAnnouncementsUpdateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE),
  announcementId: z.string().uuid(),
  titleRu: z.string().min(1).max(200).optional(),
  titleEn: z.string().max(200).optional(),
  bodyRu: z.string().max(2000).optional(),
  bodyEn: z.string().max(2000).optional(),
  level: announcementLevelSchema.optional(),
  audienceKind: announcementAudienceKindSchema.optional(),
  audienceValue: z.string().max(255).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  published: z.boolean().optional(),
}).strict();

const adminAnnouncementsDeleteRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.ANNOUNCEMENTS_DELETE),
  announcementId: z.string().uuid(),
}).strict();

const adminAnnouncementsResetReadsRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.ANNOUNCEMENTS_RESET_READS),
  announcementId: z.string().uuid(),
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
  adminSuperAdminsWhoamiRequestSchema,
  adminKeycloakSyncRequestSchema,
  adminEasterEggsListRequestSchema,
  adminEasterEggsSaveRequestSchema,
  adminEasterEggsDeleteRequestSchema,
  adminBroadcastsAudienceRequestSchema,
  adminBroadcastsSendRequestSchema,
  adminBroadcastsProcessRequestSchema,
  adminBroadcastsListRequestSchema,
  adminBroadcastsCancelRequestSchema,
  adminBroadcastsTickRequestSchema,
  adminAnnouncementsPublishRequestSchema,
  adminAnnouncementsListRequestSchema,
  adminAnnouncementsUnpublishRequestSchema,
  adminAnnouncementsUpdateRequestSchema,
  adminAnnouncementsDeleteRequestSchema,
  adminAnnouncementsResetReadsRequestSchema,
]);

export type AdminRequest = z.infer<typeof adminRequestSchema>;
export type AdminAction = z.infer<typeof adminActionSchema>;

export const adminErrorResponseSchema = z.object({
  error: z.string(),
});

export const adminBaseResponseSchema = z.object({
  error: z.string().optional(),
}).passthrough();
