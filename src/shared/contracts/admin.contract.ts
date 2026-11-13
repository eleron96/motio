import { z } from 'zod';
import { ADMIN_ACTIONS, INVITE_ROLE_VALUES } from '@/shared/contracts/actions';

const adminBootstrapSyncRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.BOOTSTRAP_SYNC),
}).strict();

const adminUsersListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_LIST),
  search: z.string().optional(),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
  loadAll: z.boolean().optional(),
  // The user list hides super admins, which is right for the users page and
  // wrong when picking somebody to give an easter egg to — including yourself.
  includeSuperAdmins: z.boolean().optional(),
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

const adminWorkspacesAddMemberRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_ADD_MEMBER),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(INVITE_ROLE_VALUES),
}).strict();

const adminWorkspacesMembersRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_MEMBERS),
  workspaceId: z.string().min(1),
}).strict();

const adminWorkspacesSetMemberRoleRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_SET_MEMBER_ROLE),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(INVITE_ROLE_VALUES),
}).strict();

const adminWorkspacesRemoveMemberRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.WORKSPACES_REMOVE_MEMBER),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
}).strict();

// Keycloak group → workspace mappings (self-hosted, KEYCLOAK_WORKSPACES_FROM_GROUPS).
const adminGroupWorkspacesListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.GROUP_WORKSPACES_LIST),
}).strict();

const adminGroupWorkspacesCreateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.GROUP_WORKSPACES_CREATE),
  groupPath: z.string().trim().min(1).max(255),
  workspaceId: z.string().min(1),
  role: z.enum(INVITE_ROLE_VALUES),
}).strict();

const adminGroupWorkspacesDeleteRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.GROUP_WORKSPACES_DELETE),
  id: z.string().min(1),
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

const adminEasterEggsListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_LIST),
}).strict();

const easterEggAudienceKindSchema = z.enum(['user', 'domain', 'workspace', 'all_active']);

const adminEasterEggsSaveRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_SAVE),
  id: z.string().uuid().optional(),
  audienceKind: easterEggAudienceKindSchema,
  // Set for a personal assignment; every other audience carries its value in
  // `audienceValue` instead.
  userId: z.string().uuid().optional(),
  audienceValue: z.string().max(255).optional(),
  eggKey: z.string().min(1).max(64),
  enabled: z.boolean(),
  note: z.string().max(500).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).strict();

const adminEasterEggsAudienceRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_AUDIENCE),
  audienceKind: easterEggAudienceKindSchema,
  audienceValue: z.string().max(255).optional(),
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
  titleRu: z.string().max(200).optional(),
  titleEn: z.string().max(200).optional(),
  titleDe: z.string().max(200).optional(),
  bodyRu: z.string().max(2000).optional(),
  bodyEn: z.string().max(2000).optional(),
  bodyDe: z.string().max(2000).optional(),
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
  titleRu: z.string().max(200).optional(),
  titleEn: z.string().max(200).optional(),
  titleDe: z.string().max(200).optional(),
  bodyRu: z.string().max(2000).optional(),
  bodyEn: z.string().max(2000).optional(),
  bodyDe: z.string().max(2000).optional(),
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

const adminSystemStatusRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SYSTEM_STATUS),
}).strict();

const adminSystemTestEmailRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SYSTEM_TEST_EMAIL),
}).strict();

const adminSystemVersionRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SYSTEM_VERSION),
}).strict();

// Settings section: server switches (instance_settings, 0176). value null = back to the default.
const adminSettingsListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SETTINGS_LIST),
}).strict();

const adminSettingsUpdateRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SETTINGS_UPDATE),
  key: z.string().min(1).max(100),
  value: z.boolean().nullable(),
}).strict();

const adminAuditListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.AUDIT_LIST),
  before: z.number().int().positive().optional(),
}).strict();

const adminUsersDiagnoseRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.USERS_DIAGNOSE),
  userId: z.string().min(1),
}).strict();

const adminSystemSignInRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SYSTEM_SIGN_IN),
}).strict();

const adminSystemReportRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.SYSTEM_REPORT),
}).strict();

const adminInvitesListRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.INVITES_LIST),
}).strict();

const adminInvitesRevokeRequestSchema = z.object({
  action: z.literal(ADMIN_ACTIONS.INVITES_REVOKE),
  inviteId: z.string().min(1),
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
  adminWorkspacesAddMemberRequestSchema,
  adminWorkspacesMembersRequestSchema,
  adminWorkspacesSetMemberRoleRequestSchema,
  adminWorkspacesRemoveMemberRequestSchema,
  adminGroupWorkspacesListRequestSchema,
  adminGroupWorkspacesCreateRequestSchema,
  adminGroupWorkspacesDeleteRequestSchema,
  adminSuperAdminsListRequestSchema,
  adminSuperAdminsCreateRequestSchema,
  adminSuperAdminsDeleteRequestSchema,
  adminSuperAdminsWhoamiRequestSchema,
  adminEasterEggsListRequestSchema,
  adminEasterEggsSaveRequestSchema,
  adminEasterEggsDeleteRequestSchema,
  adminEasterEggsAudienceRequestSchema,
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
  adminSystemStatusRequestSchema,
  adminSystemTestEmailRequestSchema,
  adminSystemVersionRequestSchema,
  adminSettingsListRequestSchema,
  adminSettingsUpdateRequestSchema,
  adminAuditListRequestSchema,
  adminUsersDiagnoseRequestSchema,
  adminSystemSignInRequestSchema,
  adminSystemReportRequestSchema,
  adminInvitesListRequestSchema,
  adminInvitesRevokeRequestSchema,
]);

export type AdminRequest = z.infer<typeof adminRequestSchema>;

export const adminBaseResponseSchema = z.object({
  error: z.string().optional(),
}).passthrough();
