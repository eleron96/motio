import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  TEST_WORKSPACE_IDS,
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

// 0190: a task can carry a reminder — "N days before the start". Every minute
// fire_task_reminders() writes a 'task_reminder' notification for each assignee
// whose clock shows 09:00–12:00 of the reminder day. The existing push ticker
// and the bell then treat it like any other notification.
//
// now() cannot be moved inside a test, so the tests move the clock instead:
// they pick the time zone in which it is 10:00 (or 20:00, or 07:00) right now.

const WORKSPACE_ID = TEST_WORKSPACE_IDS.bobShared; // Bob admin, Charlie admin
const { bob, charlie } = TEST_USER_IDS;

/** An "Etc/GMT±N" zone in which the local hour is `localHour` right now, and today's date there. */
async function zoneWhereHourIs(client: PoolClient, localHour: number): Promise<{ zone: string; today: string }> {
  const { rows: hourRows } = await client.query<{ utc_hour: number }>(
    "select extract(hour from now() at time zone 'UTC')::int as utc_hour",
  );
  let offset = localHour - hourRows[0].utc_hour;
  if (offset < -12) offset += 24;
  if (offset > 14) offset -= 24;
  // POSIX sign: Etc/GMT-3 is three hours AHEAD of UTC.
  const zone = offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
  const { rows } = await client.query<{ today: string }>(
    "select (now() at time zone $1)::date::text as today",
    [zone],
  );
  return { zone, today: rows[0].today };
}

async function assigneeIdFor(client: PoolClient, userId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.assignees where workspace_id = $1 and user_id = $2",
    [WORKSPACE_ID, userId],
  );
  expect(rows[0]?.id, "the member-sync trigger must provide an assignee row").toBeTruthy();
  return rows[0].id;
}

// A test may create several tasks; status and type names are unique per workspace.
async function seedCatalog(
  client: PoolClient,
  flags: { isFinal?: boolean; isCancelled?: boolean } = {},
): Promise<{ statusId: string; typeId: string }> {
  const status = await client.query<{ id: string }>(
    `insert into public.statuses (workspace_id, name, color, is_final, is_cancelled)
     values ($1, 'Reminder status ' || gen_random_uuid(), '#94a3b8', $2, $3) returning id`,
    [WORKSPACE_ID, flags.isFinal ?? false, flags.isCancelled ?? false],
  );
  const type = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Reminder type ' || gen_random_uuid()) returning id",
    [WORKSPACE_ID],
  );
  return { statusId: status.rows[0].id, typeId: type.rows[0].id };
}

async function createTask(
  client: PoolClient,
  options: {
    userIds: string[];
    /** The reminder day; the task starts `daysBefore` days after it. */
    reminderDay: string;
    daysBefore: number | null;
    timeZone: string | null;
    isFinal?: boolean;
    isCancelled?: boolean;
    title?: string;
  },
): Promise<string> {
  const { statusId, typeId } = await seedCatalog(client, {
    isFinal: options.isFinal,
    isCancelled: options.isCancelled,
  });
  const assigneeIds: string[] = [];
  for (const userId of options.userIds) assigneeIds.push(await assigneeIdFor(client, userId));
  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (
       workspace_id, title, assignee_id, assignee_ids, start_date, end_date,
       status_id, type_id, reminder_days_before, reminder_time_zone
     )
     values (
       $1, $2, $3, $4::uuid[],
       $5::date + coalesce($6::int, 0), $5::date + coalesce($6::int, 0),
       $7, $8, $6::smallint, $9
     )
     returning id`,
    [
      WORKSPACE_ID,
      options.title ?? "Site visit",
      assigneeIds[0] ?? null,
      assigneeIds,
      options.reminderDay,
      options.daysBefore,
      statusId,
      typeId,
      options.timeZone,
    ],
  );
  // Assigning people writes 'task_assigned' rows; they are not what is tested.
  await client.query("delete from public.user_notifications where workspace_id = $1", [WORKSPACE_ID]);
  return rows[0].id;
}

async function setProfileZone(client: PoolClient, userId: string, zone: string | null): Promise<void> {
  await client.query("update public.profiles set time_zone = $2 where id = $1", [userId, zone]);
}

/** Runs the scan the way backup-service does and returns how many reminders it wrote. */
async function fire(client: PoolClient): Promise<number> {
  await client.query("set local role service_role");
  const { rows } = await client.query<{ fired: number }>("select public.fire_task_reminders() as fired");
  await client.query("reset role");
  return rows[0].fired;
}

type ReminderRow = {
  recipient_user_id: string;
  task_id: string;
  task_title_snapshot: string;
  task_start_date_snapshot: string;
  reminder_days_before: number;
  actor_user_id: string | null;
};

async function reminders(client: PoolClient): Promise<ReminderRow[]> {
  const { rows } = await client.query<ReminderRow>(
    `select recipient_user_id, task_id, task_title_snapshot,
            task_start_date_snapshot::text as task_start_date_snapshot,
            reminder_days_before, actor_user_id
     from public.user_notifications
     where workspace_id = $1 and type = 'task_reminder'
     order by recipient_user_id`,
    [WORKSPACE_ID],
  );
  return rows;
}

describe("task reminders (0190)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ ready: boolean }>(
        "select to_regprocedure('public.fire_task_reminders()') is not null as ready",
      );
      if (!rows[0]?.ready) throw new Error("0190 not applied: fire_task_reminders() is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("reminds every assignee in the morning of the reminder day", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, morning.zone);
      await setProfileZone(client, charlie, morning.zone);
      const taskId = await createTask(client, {
        userIds: [bob, charlie],
        reminderDay: morning.today,
        daysBefore: 2,
        timeZone: morning.zone,
      });

      expect(await fire(client)).toBe(2);

      const rows = await reminders(client);
      expect(rows.map((row) => row.recipient_user_id).sort()).toEqual([bob, charlie].sort());
      for (const row of rows) {
        expect(row.task_id).toBe(taskId);
        expect(row.task_title_snapshot).toBe("Site visit");
        expect(row.reminder_days_before).toBe(2);
        expect(row.actor_user_id).toBeNull();
      }
      const { rows: taskRows } = await client.query<{ start_date: string }>(
        "select start_date::text as start_date from public.tasks where id = $1",
        [taskId],
      );
      expect(rows[0].task_start_date_snapshot).toBe(taskRows[0].start_date);
    });
  });

  it("reminds once: the next minute's scan writes nothing", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, morning.zone);
      await createTask(client, { userIds: [bob], reminderDay: morning.today, daysBefore: 0, timeZone: morning.zone });

      expect(await fire(client)).toBe(1);
      expect(await fire(client)).toBe(0);
      expect(await reminders(client)).toHaveLength(1);
    });
  });

  it("keeps a reminder the recipient deleted from the bell from coming back", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, morning.zone);
      await createTask(client, { userIds: [bob], reminderDay: morning.today, daysBefore: 1, timeZone: morning.zone });

      expect(await fire(client)).toBe(1);
      await client.query(
        "update public.user_notifications set deleted_at = now() where workspace_id = $1 and type = 'task_reminder'",
        [WORKSPACE_ID],
      );
      expect(await fire(client)).toBe(0);
    });
  });

  it("goes by each person's own clock", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      const evening = await zoneWhereHourIs(client, 20);
      // Bob's morning has come; for Charlie the same day is already evening.
      await setProfileZone(client, bob, morning.zone);
      await setProfileZone(client, charlie, evening.zone);
      await createTask(client, {
        userIds: [bob, charlie],
        reminderDay: morning.today,
        daysBefore: 1,
        timeZone: evening.zone,
      });

      expect(await fire(client)).toBe(1);
      expect((await reminders(client)).map((row) => row.recipient_user_id)).toEqual([bob]);
    });
  });

  it("uses the zone saved with the reminder for a person whose own zone is unknown", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, null);
      await createTask(client, { userIds: [bob], reminderDay: morning.today, daysBefore: 7, timeZone: morning.zone });

      expect(await fire(client)).toBe(1);
    });
  });

  it("waits for 09:00 and gives up three hours after it", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const early = await zoneWhereHourIs(client, 7);
      const late = await zoneWhereHourIs(client, 13);
      await setProfileZone(client, bob, early.zone);
      await setProfileZone(client, charlie, late.zone);
      await createTask(client, { userIds: [bob], reminderDay: early.today, daysBefore: 1, timeZone: early.zone });
      await createTask(client, { userIds: [charlie], reminderDay: late.today, daysBefore: 1, timeZone: late.zone });

      expect(await fire(client)).toBe(0);
    });
  });

  it("skips finished and cancelled tasks, tasks without a reminder, and other days", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, morning.zone);
      const { rows: dayRows } = await client.query<{ tomorrow: string }>(
        "select ($1::date + 1)::text as tomorrow",
        [morning.today],
      );

      await createTask(client, { userIds: [bob], reminderDay: morning.today, daysBefore: 1, timeZone: morning.zone, isFinal: true });
      await createTask(client, { userIds: [bob], reminderDay: morning.today, daysBefore: 1, timeZone: morning.zone, isCancelled: true });
      await createTask(client, { userIds: [bob], reminderDay: morning.today, daysBefore: null, timeZone: null });
      await createTask(client, { userIds: [bob], reminderDay: dayRows[0].tomorrow, daysBefore: 1, timeZone: morning.zone });

      expect(await fire(client)).toBe(0);
    });
  });

  it("reads a time zone it does not know as UTC instead of failing the scan", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, "Mars/Olympus_Mons");
      await setProfileZone(client, charlie, morning.zone);
      await createTask(client, {
        userIds: [bob, charlie],
        reminderDay: morning.today,
        daysBefore: 0,
        timeZone: morning.zone,
      });

      // Charlie is reminded whatever happens to Bob's broken zone.
      const fired = await fire(client);
      expect(fired).toBeGreaterThanOrEqual(1);
      expect((await reminders(client)).map((row) => row.recipient_user_id)).toContain(charlie);

      const { rows } = await client.query<{ same: boolean }>(
        `select public.task_reminder_moment(date '2026-11-25', 'Mars/Olympus_Mons')
                = public.task_reminder_moment(date '2026-11-25', 'UTC') as same`,
      );
      expect(rows[0].same).toBe(true);
    });
  });

  it("puts 09:00 on the wall clock of the zone, daylight saving included", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ winter: string; summer: string; moscow: string }>(
        `select to_char(public.task_reminder_moment(date '2026-01-15', 'Europe/Berlin') at time zone 'UTC', 'HH24:MI') as winter,
                to_char(public.task_reminder_moment(date '2026-07-15', 'Europe/Berlin') at time zone 'UTC', 'HH24:MI') as summer,
                to_char(public.task_reminder_moment(date '2026-07-15', 'Europe/Moscow') at time zone 'UTC', 'HH24:MI') as moscow`,
      );
      expect(rows[0]).toEqual({ winter: "08:00", summer: "07:00", moscow: "06:00" });
    });
  });

  it("hands the reminder to the push ticker and shows it in the bell", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const morning = await zoneWhereHourIs(client, 10);
      await setProfileZone(client, bob, morning.zone);
      const taskId = await createTask(client, {
        userIds: [bob],
        reminderDay: morning.today,
        daysBefore: 1,
        timeZone: morning.zone,
      });
      expect(await fire(client)).toBe(1);

      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [bob]);
      await client.query("set local role authenticated");
      const { rows: inboxRows } = await client.query<{ result: { notifications: Array<Record<string, unknown>> } }>(
        "select public.inbox_list() as result",
      );
      await client.query("reset role");
      const inBell = inboxRows[0].result.notifications.filter((row) => row.type === "task_reminder");
      expect(inBell).toHaveLength(1);
      expect(inBell[0]).toMatchObject({ taskId, taskTitle: "Site visit", taskExists: true, actorUserId: null });

      await client.query("set local role service_role");
      const { rows: claimed } = await client.query<{ type: string; task_id: string; reminder_days_before: number }>(
        "select type, task_id, reminder_days_before from public.claim_push_notifications(50) where type = 'task_reminder'",
      );
      await client.query("reset role");
      expect(claimed).toEqual([{ type: "task_reminder", task_id: taskId, reminder_days_before: 1 }]);
    });
  });

  it("accepts 0 to 30 days and nothing else", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const taskId = await createTask(client, { userIds: [], reminderDay: "2026-11-25", daysBefore: 30, timeZone: "UTC" });
      await client.query("savepoint before_bad_value");
      await expect(
        client.query("update public.tasks set reminder_days_before = 31 where id = $1", [taskId]),
      ).rejects.toThrow(/tasks_reminder_days_before_check/);
      await client.query("rollback to savepoint before_bad_value");
      await expect(
        client.query("update public.tasks set reminder_days_before = -1 where id = $1", [taskId]),
      ).rejects.toThrow(/tasks_reminder_days_before_check/);
    });
  });

  it("is callable by the service only", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ role: string; can_fire: boolean; can_claim: boolean }>(
        `select r.role,
                has_function_privilege(r.role, 'public.fire_task_reminders()', 'execute') as can_fire,
                has_function_privilege(r.role, 'public.claim_push_notifications(integer)', 'execute') as can_claim
         from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
         order by r.role`,
      );
      expect(rows).toEqual([
        { role: "anon", can_fire: false, can_claim: false },
        { role: "authenticated", can_fire: false, can_claim: false },
        { role: "service_role", can_fire: true, can_claim: true },
      ]);
    });
  });
});
