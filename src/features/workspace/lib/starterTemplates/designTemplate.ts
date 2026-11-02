import { t } from '@lingui/macro';
import type { StarterTemplateContent } from '@/shared/domain/starterTemplate';
import {
  MONDAY,
  WEEKS_OF_EXAMPLES,
  disciplineTags,
  meetingType,
  people,
  statusesWith,
  vacation,
} from '@/features/workspace/lib/starterTemplates/common';

/**
 * Architecture, engineering, interior design: several buildings at once, each
 * moving towards a handover to the client. Milestones are those handovers;
 * labels are disciplines, which exist everywhere — stages and permits differ
 * between countries, so the template names none.
 */
export const buildDesignTemplate = (): StarterTemplateContent => ({
  statuses: statusesWith({ key: 'review', name: t`Client review`, emoji: '⏳', color: '#f59e0b' }),
  taskTypes: [
    { key: 'design', name: t`Design work` },
    { key: 'model', name: t`Modelling` },
    { key: 'check', name: t`Quality check` },
    meetingType(),
    { key: 'letter', name: t`Client correspondence` },
  ],
  tags: [...disciplineTags(), { key: 'interior', name: t`Interior`, color: '#ec4899' }],
  projects: [
    { key: 'res', name: t`Residential building by the park`, code: 'RES', color: '#3b82f6' },
    { key: 'school', name: t`School for 600 pupils`, code: 'SCH', color: '#22c55e' },
    { key: 'rest', name: t`Riverside restaurant interior`, code: 'INT', color: '#f59e0b' },
  ],
  people: [people.anna(), people.mark(), people.sofia(), people.tom()],
  tasks: [
    { title: t`Floor plans, levels 1–4`, project: 'res', people: ['mark'], status: 'doing', type: 'design', tags: ['arch'], start: -2, days: 4 },
    { title: t`Facade model`, project: 'res', people: ['mark', 'anna'], status: 'todo', type: 'model', tags: ['arch'], start: 3, days: 3 },
    { title: t`Drawing set for the client`, project: 'res', people: ['anna'], status: 'todo', type: 'design', tags: ['arch'], start: 6, days: 2 },
    { title: t`Model check before handover`, project: 'res', people: ['tom'], status: 'todo', type: 'check', start: 8, days: 1 },
    { title: t`Coordinate the structural grid`, project: 'school', people: ['tom', 'anna'], status: 'todo', type: 'meeting', tags: ['struct'], start: 0, days: 1 },
    { title: t`Site plan and landscaping`, project: 'school', people: ['anna'], status: 'todo', type: 'design', tags: ['arch'], start: 1, days: 3 },
    { title: t`Answer client comments`, project: 'school', people: ['anna'], status: 'todo', type: 'letter', start: 4, days: 1 },
    { title: t`Ventilation routing`, project: 'school', people: ['tom'], status: 'todo', type: 'model', tags: ['mep'], start: 5, days: 3 },
    { title: t`Mood board and materials`, project: 'rest', people: ['sofia'], status: 'done', type: 'design', tags: ['interior'], start: -5, days: 3 },
    { title: t`Furniture layout`, project: 'rest', people: ['sofia'], status: 'review', type: 'design', tags: ['interior'], start: -2, days: 2 },
    { title: t`Lighting plan`, project: 'rest', people: ['sofia', 'tom'], status: 'doing', type: 'design', tags: ['mep', 'interior'], start: 0, days: 3 },
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
    { project: 'res', title: t`Concept presentation`, day: 4 },
    { project: 'school', title: t`Submission for approval`, day: 10 },
    { project: 'rest', title: t`Handover to the contractor`, day: 14 },
  ],
  timeOff: [{ person: 'mark', start: 9, days: 5, note: vacation() }],
});
