import { t } from '@lingui/macro';

// Admin console → Settings: names and explanations of the server switches
// (keys from shared/contracts/instanceSettingsRegistry.ts). A key missing here
// still shows, under its own name.

export type ServerSettingSection = 'groups' | 'timeline' | 'heatmap' | 'workspaces' | 'dashboards';

export const SERVER_SETTING_SECTIONS: ServerSettingSection[] = ['groups', 'timeline', 'heatmap', 'workspaces', 'dashboards'];

export const serverSettingSectionTitle = (section: ServerSettingSection) => {
  switch (section) {
    case 'groups': return t`Sign-in and groups`;
    case 'timeline': return t`Timeline`;
    case 'heatmap': return t`Workload heatmap`;
    case 'workspaces': return t`Workspaces`;
    case 'dashboards': return t`Dashboards`;
  }
};

export const serverSettingSection = (key: string): ServerSettingSection => {
  const area = key.split('.')[0];
  if (area === 'groups' || area === 'timeline' || area === 'heatmap' || area === 'dashboards') return area;
  return 'workspaces';
};

export const serverSettingText = (key: string): { title: string; description: string } => {
  switch (key) {
    case 'groups.workspaces':
      return {
        title: t`Workspaces from groups`,
        description: t`Keycloak groups put people into workspaces the next time they open Motio. The mappings are in Group access.`,
      };
    case 'groups.removeOnLeave':
      return {
        title: t`Take access away when someone leaves a group`,
        description: t`Only the access a group gave. Access given by hand or by an invitation stays.`,
      };
    case 'groups.syncRoles':
      return {
        title: t`Change the role with the group`,
        description: t`When someone moves to another group, the role their group gave changes too, up or down. A role a workspace admin changed by hand is never touched.`,
      };
    case 'groups.superAdmin':
      return {
        title: t`Super admins from a group`,
        description: t`The super admin role may come from a Keycloak group, not only from the person's own roles.`,
      };
    case 'timeline.density':
      return {
        title: t`Timeline density`,
        description: t`Workspace admins can make the timeline denser to fit more people on screen: smaller photos, lower rows. Each workspace chooses in its settings; phones stay as they are.`,
      };
    case 'heatmap.personCapacity':
      return {
        title: t`Each person's share in the workload heatmap`,
        description: t`Workspace admins give each person a share from 0 to 100%: a coordinator at 0% adds nothing to the team's capacity, a part-timer at 50% counts half.`,
      };
    case 'workspaces.closures':
      return {
        title: t`Days off for the whole workspace`,
        description: t`Workspace admins add company closures. They show like public holidays on the timeline, in the calendar and in the workload heatmap; nobody's time off changes.`,
      };
    case 'dashboards.transfer':
      return {
        title: t`Copy, export and import dashboards`,
        description: t`Editors can duplicate a dashboard, save it to a file and load it into another workspace.`,
      };
    case 'dashboards.calendarPeriods':
      return {
        title: t`Calendar periods in dashboards`,
        description: t`Widgets can also show this or next calendar week or month, not only the last day, week or month.`,
      };
    default:
      return { title: key, description: '' };
  }
};
