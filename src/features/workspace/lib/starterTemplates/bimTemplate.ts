import { t } from '@lingui/macro';
import type { StarterTemplateContent } from '@/shared/domain/starterTemplate';
import {
  TUESDAY,
  WEEKS_OF_EXAMPLES,
  disciplineTags,
  meetingType,
  people,
  statusesWith,
  urgentTag,
  vacation,
} from '@/features/workspace/lib/starterTemplates/common';

/**
 * A team that serves many projects at once — a BIM department, technical
 * support, quality control: model checks and exports requested by different
 * projects, plus a regular sync. The largest workspace on production works
 * exactly like this.
 */
export const buildBimTemplate = (): StarterTemplateContent => ({
  statuses: statusesWith({ key: 'waiting', name: t`Waiting for input`, emoji: '⏸️', color: '#a855f7' }),
  taskTypes: [
    { key: 'audit', name: t`Model audit` },
    { key: 'coord', name: t`Coordination` },
    { key: 'export', name: t`Export` },
    { key: 'support', name: t`Support` },
    meetingType(),
  ],
  tags: [...disciplineTags(), urgentTag()],
  projects: [
    { key: 'office', name: t`Office building`, code: 'OFF', color: '#3b82f6' },
    { key: 'hospital', name: t`Hospital wing`, code: 'HSP', color: '#22c55e' },
    { key: 'quarter', name: t`Residential quarter`, code: 'RQ', color: '#f59e0b' },
  ],
  people: [people.anna(), people.nina(), people.tom(), people.mark()],
  tasks: [
    { title: t`Audit the architectural model`, project: 'office', people: ['nina'], status: 'doing', type: 'audit', tags: ['arch'], start: -1, days: 2 },
    { title: t`Help set up drawing sheets`, project: 'office', people: ['mark'], status: 'done', type: 'support', start: -3, days: 1 },
    { title: t`Fix issues after the audit`, project: 'office', people: ['tom'], status: 'todo', type: 'coord', tags: ['arch'], start: 4, days: 2 },
    { title: t`Clash detection: structure and services`, project: 'hospital', people: ['tom', 'anna'], status: 'doing', type: 'coord', tags: ['struct', 'mep'], start: 0, days: 3 },
    { title: t`Model exchange with the contractor`, project: 'hospital', people: ['anna'], status: 'waiting', type: 'export', start: 3, days: 1 },
    { title: t`Federated model for the design review`, project: 'hospital', people: ['anna', 'tom'], status: 'todo', type: 'coord', start: 6, days: 2 },
    { title: t`Check the coordinate system`, project: 'quarter', people: ['nina'], status: 'todo', type: 'audit', tags: ['urgent'], start: 0, days: 1 },
    { title: t`IFC export for the client`, project: 'quarter', people: ['nina'], status: 'todo', type: 'export', start: 2, days: 1 },
    { title: t`Update the element library`, people: ['mark'], status: 'todo', type: 'support', start: 1, days: 3 },
    {
      title: t`BIM weekly sync`,
      people: ['anna', 'nina'],
      status: 'todo',
      type: 'meeting',
      start: 0,
      repeat: { key: 'bim-sync', weekday: TUESDAY, count: WEEKS_OF_EXAMPLES },
    },
  ],
  milestones: [
    { project: 'hospital', title: t`Coordinated model handover`, day: 7 },
    { project: 'quarter', title: t`IFC delivery to the client`, day: 9 },
    { project: 'office', title: t`Design review`, day: 12 },
  ],
  timeOff: [{ person: 'tom', start: 10, days: 4, note: vacation() }],
});
