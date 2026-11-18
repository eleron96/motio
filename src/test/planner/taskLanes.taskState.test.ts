import { describe, expect, it } from 'vitest';
import { Task } from '@/features/planner/types/planner';
import {
  calculateTaskLanes,
  getMaxLanes,
  type TaskStateRanks,
  type TaskWithLane,
} from '@/features/planner/lib/taskLanes';

/**
 * Open tasks lie above done ones and done above cancelled: what is still to do
 * is on top of what is over. The state decides among bars of one length — the
 * longest still go first, or closed long bars would hang under open short ones
 * with empty lanes above them.
 */

const OPEN = 'status-open';
const DONE = 'status-done';
const CANCELLED = 'status-cancelled';
const ranks: TaskStateRanks = new Map([[DONE, 1], [CANCELLED, 2]]);

const day = (date: number) => `2026-11-${String(date).padStart(2, '0')}`;
const span = (id: string, from: number, to: number, statusId: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: id,
  projectId: null,
  assigneeIds: [],
  startDate: day(from),
  endDate: day(to),
  statusId,
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const pack = (tasks: Task[]) => calculateTaskLanes(tasks, [], undefined, undefined, ranks);
const byId = (rows: TaskWithLane[], id: string) => rows.find((row) => row.id === id)!;
const lanesOfIds = (rows: TaskWithLane[], ids: string[]) => ids.map((id) => byId(rows, id).lane);

/** Empty places with a bar under them: what reads as a hole in the stack. */
const countHoles = (rows: TaskWithLane[]): number => {
  const days = new Set<string>();
  rows.forEach((row) => {
    for (let time = Date.parse(row.startDate); time <= Date.parse(row.endDate); time += 86_400_000) {
      days.add(new Date(time).toISOString().slice(0, 10));
    }
  });
  let holes = 0;
  days.forEach((date) => {
    const lanes = rows.filter((row) => row.startDate <= date && row.endDate >= date).map((row) => row.lane);
    holes += Math.max(...lanes) + 1 - lanes.length;
  });
  return holes;
};

describe('calculateTaskLanes — open above done above cancelled', () => {
  it('lays one-day tasks of a day out open, done, cancelled, whatever order they came in', () => {
    const cancelled = span('cancelled', 18, 18, CANCELLED);
    const done = span('done', 18, 18, DONE);
    const open = span('open', 18, 18, OPEN);

    [[cancelled, done, open], [done, open, cancelled], [open, cancelled, done]].forEach((order) => {
      expect(lanesOfIds(pack(order), ['open', 'done', 'cancelled'])).toEqual([0, 1, 2]);
    });
  });

  it('puts the open tasks of a day above the cancelled one, with no empty place between them', () => {
    // The screenshot: on the 18th a cancelled one-day task sat in the top lane
    // and the open tasks of that day lay under it; on the 17th cancelled and
    // done tasks were mixed.
    const result = pack([
      span('long', 13, 17, OPEN),
      span('lighthouse', 13, 16, DONE),
      span('fixes', 16, 17, DONE),
      span('audit', 17, 17, CANCELLED),
      span('bim', 17, 17, CANCELLED),
      span('lecture', 17, 17, DONE),
      span('exam', 17, 17, CANCELLED),
      span('added', 17, 17, DONE),
      span('export', 18, 18, CANCELLED),
      span('update', 18, 18, OPEN),
      span('exchange', 18, 18, OPEN),
      span('finish', 18, 18, OPEN),
      span('n1', 19, 19, OPEN), span('n2', 19, 19, OPEN), span('n3', 19, 19, OPEN),
    ]);

    expect(lanesOfIds(result, ['update', 'exchange', 'finish', 'export'])).toEqual([0, 1, 2, 3]);
    // The 17th: the long bars keep the top, then the done one-day tasks, then the cancelled.
    expect(lanesOfIds(result, ['long', 'fixes'])).toEqual([0, 2]);
    expect(lanesOfIds(result, ['lecture', 'added'])).toEqual([1, 3]);
    expect(lanesOfIds(result, ['audit', 'bim', 'exam'])).toEqual([4, 5, 6]);
    expect(countHoles(result)).toBe(0);
    expect(getMaxLanes(result)).toBe(7);
  });

  it('lets the state decide before the priority', () => {
    const result = pack([
      span('done-urgent', 18, 19, DONE, { priority: 'high' }),
      span('open-plain', 18, 19, OPEN),
    ]);

    expect(lanesOfIds(result, ['open-plain', 'done-urgent'])).toEqual([0, 1]);
  });

  it('still orders tasks of one state by priority', () => {
    const result = pack([
      span('done-plain', 18, 18, DONE),
      span('done-urgent', 18, 18, DONE, { priority: 'high' }),
      span('open-low', 18, 18, OPEN, { priority: 'low' }),
      span('open-high', 18, 18, OPEN, { priority: 'high' }),
    ]);

    expect(lanesOfIds(result, ['open-high', 'open-low', 'done-urgent', 'done-plain'])).toEqual([0, 1, 2, 3]);
  });

  it('lets the length decide before the state: a longer done bar stays above a shorter open one', () => {
    // Open first whatever the length, the done bar would hang in lane 1 for
    // nine days with nothing above it on eight of them.
    const result = pack([span('open', 14, 14, OPEN), span('done-long', 10, 18, DONE)]);

    expect(lanesOfIds(result, ['done-long', 'open'])).toEqual([0, 1]);
    expect(countHoles(result)).toBe(0);
  });

  it('counts a task whose status is not among the ranks as open', () => {
    const result = pack([span('done', 18, 18, DONE), span('unknown', 18, 18, 'status-removed')]);

    expect(lanesOfIds(result, ['unknown', 'done'])).toEqual([0, 1]);
  });

  it('packs as before when it is not told which statuses are closed', () => {
    const tasks = [span('cancelled', 18, 18, CANCELLED), span('open', 19, 19, OPEN), span('done', 18, 19, DONE)];

    expect(calculateTaskLanes(tasks, [], undefined, undefined, new Map())).toEqual(calculateTaskLanes(tasks));
  });

  it('never lays bars on the same days out in another order, is never taller, leaves no more holes than the old order', () => {
    let seed = 41;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const dayAt = (offset: number) => new Date(Date.UTC(2026, 1, 1 + offset)).toISOString().slice(0, 10);
    const statuses = [OPEN, OPEN, DONE, DONE, CANCELLED];
    const priorities = [null, null, 'low', 'high'] as const;
    const packedAsBefore = (tasks: Task[]): TaskWithLane[] => {
      const placed: TaskWithLane[] = [];
      [...tasks]
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))
        .forEach((task) => {
          let lane = 0;
          const taken = (bar: TaskWithLane) => bar.lane === lane && bar.startDate <= task.endDate && task.startDate <= bar.endDate;
          while (placed.some(taken)) lane += 1;
          placed.push({ ...task, lane });
        });
      return placed;
    };
    const mixes = [{ perDay: 3, oneDay: 0.65, longest: 12 }, { perDay: 1, oneDay: 0.2, longest: 25 }, { perDay: 0.2, oneDay: 0.1, longest: 30 }];
    mixes.forEach((mix) => {
      for (let round = 0; round < 40; round += 1) {
        const tasks: Task[] = [];
        for (let offset = 0; offset < 40; offset += 1) {
          const count = Math.floor(random() * (mix.perDay * 2 + 1));
          for (let index = 0; index < count; index += 1) {
            const length = random() < mix.oneDay ? 0 : 1 + Math.floor(random() * mix.longest);
            tasks.push({
              ...span(`t${offset}-${index}`, 1, 1, statuses[Math.floor(random() * statuses.length)]),
              startDate: dayAt(offset),
              endDate: dayAt(offset + length),
              priority: priorities[Math.floor(random() * priorities.length)],
            });
          }
        }
        if (tasks.length === 0) continue;
        const result = pack(tasks);
        const before = packedAsBefore(tasks);

        expect(getMaxLanes(result)).toBeLessThanOrEqual(getMaxLanes(before));
        expect(countHoles(result)).toBeLessThanOrEqual(countHoles(before));

        result.forEach((upper) => result.forEach((lower) => {
          if (upper.lane >= lower.lane) return;
          if (upper.startDate !== lower.startDate || upper.endDate !== lower.endDate) return;
          const closedAbove = (ranks.get(upper.statusId) ?? 0) > (ranks.get(lower.statusId) ?? 0);
          expect(closedAbove, `${upper.id} (${upper.statusId}) lies above ${lower.id} (${lower.statusId})`).toBe(false);
        }));
      }
    });
  });
});

describe('calculateTaskLanes — the state and the lanes kept from the last layout', () => {
  const remembered = (rows: TaskWithLane[]) => new Map(rows.map((row) => [row.id, row]));

  it('does not move a bar when its task is closed on screen', () => {
    const first = span('first', 18, 18, OPEN);
    const second = span('second', 18, 18, OPEN);
    const before = pack([first, second]);
    expect(lanesOfIds(before, ['first', 'second'])).toEqual([0, 1]);

    const closed = { ...first, statusId: DONE };
    const after = calculateTaskLanes([closed, second], [], remembered(before), undefined, ranks);

    expect(lanesOfIds(after, ['first', 'second'])).toEqual([0, 1]);
    // Laid out afresh (the page reopened, the filters changed) it sinks under the open one.
    expect(lanesOfIds(pack([closed, second]), ['second', 'first'])).toEqual([0, 1]);
  });

  it('places the tasks that arrive open first, around the bars already laid out', () => {
    const kept = span('kept', 25, 25, DONE);
    const previous = new Map([['kept', { lane: 0, startDate: kept.startDate, endDate: kept.endDate }]]);

    const after = calculateTaskLanes(
      [span('cancelled', 18, 18, CANCELLED), span('done', 18, 18, DONE), span('open', 18, 18, OPEN), kept],
      [],
      previous,
      undefined,
      ranks,
    );

    expect(lanesOfIds(after, ['open', 'done', 'cancelled'])).toEqual([0, 1, 2]);
    expect(byId(after, 'kept').lane).toBe(0);
  });
});
