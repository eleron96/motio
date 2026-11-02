import { t } from '@lingui/macro';
import type { StarterTemplateContent } from '@/shared/domain/starterTemplate';
import {
  MONDAY,
  WEEKS_OF_EXAMPLES,
  meetingType,
  people,
  statusesWith,
  vacation,
} from '@/features/workspace/lib/starterTemplates/common';

/**
 * Crews on sites: who is where this week, deliveries, inspections, a Monday
 * briefing. Rows are the crew leads; the timeline answers "which site is
 * short of hands" at a glance.
 */
export const buildConstructionTemplate = (): StarterTemplateContent => ({
  statuses: statusesWith({ key: 'hold', name: t`On hold`, emoji: '⏸️', color: '#a855f7' }),
  taskTypes: [
    { key: 'site', name: t`Site work` },
    { key: 'inspection', name: t`Inspection` },
    { key: 'delivery', name: t`Delivery` },
    { key: 'paperwork', name: t`Paperwork` },
    meetingType(),
  ],
  tags: [
    { key: 'electric', name: t`Electrical`, color: '#eab308' },
    { key: 'plumbing', name: t`Plumbing`, color: '#0ea5e9' },
    { key: 'hvac', name: t`Ventilation`, color: '#14b8a6' },
  ],
  projects: [
    { key: 'office', name: t`Office renovation`, code: 'REN', color: '#3b82f6' },
    { key: 'warehouse', name: t`Warehouse fit-out`, code: 'WH', color: '#22c55e' },
    { key: 'house', name: t`Private house`, code: 'HSE', color: '#f59e0b' },
  ],
  people: [people.anna(), people.tom(), people.mark(), people.nina()],
  tasks: [
    { title: t`Remove the old partitions`, project: 'office', people: ['mark'], status: 'done', type: 'site', start: -4, days: 2 },
    { title: t`Wiring, second floor`, project: 'office', people: ['mark'], status: 'doing', type: 'site', tags: ['electric'], start: -1, days: 3 },
    { title: t`Punch list`, project: 'office', people: ['anna', 'mark'], status: 'todo', type: 'inspection', start: 6, days: 1 },
    { title: t`As-built documents`, project: 'office', people: ['anna'], status: 'todo', type: 'paperwork', start: 7, days: 2 },
    { title: t`Material delivery`, project: 'warehouse', people: ['tom'], status: 'todo', type: 'delivery', start: 0, days: 1 },
    { title: t`Install ventilation units`, project: 'warehouse', people: ['tom', 'nina'], status: 'todo', type: 'site', tags: ['hvac'], start: 1, days: 2 },
    { title: t`Roof membrane delivery`, project: 'warehouse', people: ['tom'], status: 'hold', type: 'delivery', start: 4, days: 1 },
    { title: t`Lighting installation`, project: 'warehouse', people: ['mark'], status: 'todo', type: 'site', tags: ['electric'], start: 3, days: 3 },
    { title: t`Site walk with the client`, project: 'house', people: ['anna'], status: 'todo', type: 'inspection', start: 2, days: 1 },
    { title: t`Plumbing rough-in`, project: 'house', people: ['nina'], status: 'todo', type: 'site', tags: ['plumbing'], start: 3, days: 3 },
    {
      title: t`Monday crew briefing`,
      people: ['anna', 'tom'],
      status: 'todo',
      type: 'meeting',
      start: 0,
      repeat: { key: 'crew-briefing', weekday: MONDAY, count: WEEKS_OF_EXAMPLES },
    },
  ],
  milestones: [
    { project: 'warehouse', title: t`Building enclosed`, day: 6 },
    { project: 'office', title: t`Handover to the client`, day: 9 },
    { project: 'house', title: t`Final inspection`, day: 13 },
  ],
  timeOff: [{ person: 'nina', start: 8, days: 5, note: vacation() }],
});
