import { supabase } from '@/shared/lib/supabaseClient';
import {
  WORKSPACE_MEMBER_ACTIVITY_ACTIONS,
  WorkspaceMemberActivityAction,
  WorkspaceMemberActivityDetails,
  WorkspaceMemberActivityEntry,
} from '@/shared/domain/workspaceMemberActivity';

type WorkspaceMemberActivityRow = {
  id: string;
  workspace_id: string;
  action: string;
  actor_user_id: string | null;
  actor_label: string;
  target_user_id: string | null;
  target_label: string | null;
  target_email: string | null;
  details: WorkspaceMemberActivityDetails | null;
  created_at: string;
};

type RecordWorkspaceMemberActivityInput = {
  workspaceId: string;
  action: WorkspaceMemberActivityAction;
  actorUserId?: string | null;
  actorLabel: string;
  targetUserId?: string | null;
  targetLabel?: string | null;
  targetEmail?: string | null;
  details?: WorkspaceMemberActivityDetails;
};

const isWorkspaceMemberActivityAction = (value: string): value is WorkspaceMemberActivityAction => (
  WORKSPACE_MEMBER_ACTIVITY_ACTIONS.includes(value as WorkspaceMemberActivityAction)
);

const mapWorkspaceMemberActivityRow = (
  row: WorkspaceMemberActivityRow,
): WorkspaceMemberActivityEntry => ({
  id: row.id,
  workspaceId: row.workspace_id,
  action: isWorkspaceMemberActivityAction(row.action) ? row.action : 'member_status_changed',
  actorUserId: row.actor_user_id,
  actorLabel: row.actor_label,
  targetUserId: row.target_user_id,
  targetLabel: row.target_label,
  targetEmail: row.target_email,
  details: row.details ?? {},
  createdAt: row.created_at,
});

export const recordWorkspaceMemberActivity = async (
  input: RecordWorkspaceMemberActivityInput,
) => {
  const { error } = await supabase
    .from('workspace_member_activity')
    .insert({
      workspace_id: input.workspaceId,
      action: input.action,
      actor_user_id: input.actorUserId ?? null,
      actor_label: input.actorLabel,
      target_user_id: input.targetUserId ?? null,
      target_label: input.targetLabel ?? null,
      target_email: input.targetEmail ?? null,
      details: input.details ?? {},
    });

  if (error) {
    return { error: error.message };
  }

  return {};
};

export const listWorkspaceMemberActivity = async (
  workspaceId: string,
  options?: { limit?: number },
) => {
  const limit = options?.limit && options.limit > 0 ? options.limit : 100;
  const { data, error } = await supabase
    .from('workspace_member_activity')
    .select('id, workspace_id, action, actor_user_id, actor_label, target_user_id, target_label, target_email, details, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { entries: [] as WorkspaceMemberActivityEntry[], error: error.message };
  }

  return {
    entries: ((data ?? []) as WorkspaceMemberActivityRow[]).map(mapWorkspaceMemberActivityRow),
  };
};

export const fetchWorkspaceGroupNameMap = async (
  workspaceId: string,
  groupIds: Array<string | null | undefined>,
) => {
  const uniqueIds = Array.from(new Set(
    groupIds
      .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim().length > 0)
      .map((groupId) => groupId.trim()),
  ));

  if (uniqueIds.length === 0) {
    return { groupNameById: new Map<string, string>() };
  }

  const { data, error } = await supabase
    .from('member_groups')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueIds);

  if (error) {
    return { groupNameById: new Map<string, string>(), error: error.message };
  }

  return {
    groupNameById: new Map(
      ((data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
    ),
  };
};
