import { t } from '@lingui/macro';
import type { StarterTemplateContent } from '@/shared/domain/starterTemplate';
import {
  MONDAY,
  WEEKS_OF_EXAMPLES,
  meetingType,
  people,
  statusesWith,
  urgentTag,
  vacation,
} from '@/features/workspace/lib/starterTemplates/common';

/** Product teams and studios: features, bugs, a review step, releases as milestones. */
export const buildSoftwareTemplate = (): StarterTemplateContent => ({
  statuses: statusesWith({ key: 'review', name: t`In review`, emoji: '👀', color: '#f59e0b' }),
  taskTypes: [
    { key: 'feature', name: t`Feature` },
    { key: 'bug', name: t`Bug` },
    { key: 'task', name: t`Task` },
    meetingType(),
  ],
  tags: [
    { key: 'backend', name: t`Backend`, color: '#8b5cf6' },
    { key: 'frontend', name: t`Frontend`, color: '#3b82f6' },
    { key: 'design', name: t`Design`, color: '#ec4899' },
    urgentTag(),
  ],
  projects: [
    { key: 'app', name: t`Mobile app`, code: 'APP', color: '#3b82f6' },
    { key: 'web', name: t`Website`, code: 'WEB', color: '#22c55e' },
    { key: 'api', name: t`Platform API`, code: 'API', color: '#8b5cf6' },
  ],
  people: [people.anna(), people.mark(), people.sofia(), people.tom(), people.nina()],
  tasks: [
    { title: t`Sign-in screen`, project: 'app', people: ['tom'], status: 'doing', type: 'feature', tags: ['frontend'], start: -2, days: 4 },
    { title: t`Crash on older Android phones`, project: 'app', people: ['tom'], status: 'todo', type: 'bug', tags: ['urgent'], start: 2, days: 1 },
    { title: t`Push notifications`, project: 'app', people: ['tom', 'mark'], status: 'todo', type: 'feature', tags: ['backend'], start: 3, days: 3 },
    { title: t`Regression testing`, project: 'app', people: ['nina'], status: 'todo', type: 'task', start: 6, days: 2 },
    { title: t`Release notes`, project: 'app', people: ['anna'], status: 'todo', type: 'task', start: 8, days: 1 },
    { title: t`Pricing page design`, project: 'web', people: ['sofia'], status: 'review', type: 'feature', tags: ['design'], start: -1, days: 2 },
    { title: t`Pricing page build`, project: 'web', people: ['sofia'], status: 'todo', type: 'feature', tags: ['frontend'], start: 2, days: 3 },
    { title: t`Fix slow search`, project: 'api', people: ['mark'], status: 'done', type: 'bug', tags: ['backend'], start: -4, days: 2 },
    { title: t`API rate limits`, project: 'api', people: ['mark'], status: 'doing', type: 'feature', tags: ['backend'], start: -1, days: 3 },
    {
      title: t`Weekly team meeting`,
      people: ['anna', 'mark'],
      status: 'todo',
      type: 'meeting',
      start: 0,
      repeat: { key: 'team-meeting', weekday: MONDAY, count: WEEKS_OF_EXAMPLES },
    },
  ],
  milestones: [
    { project: 'web', title: t`Website launch`, day: 8 },
    { project: 'app', title: t`Release 2.0`, day: 10 },
    { project: 'api', title: t`Beta for partners`, day: 14 },
  ],
  timeOff: [{ person: 'sofia', start: 9, days: 3, note: vacation() }],
});
