import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// infra/scripts/motio-settings.sh (install.sh settings, make settings): the
// command line for the switches of Admin → Settings. The "sql" mode prints what
// it would run, so this needs neither Docker nor a database.

const dir = mkdtempSync(join(tmpdir(), "motio-settings-"));
const envPath = join(dir, ".env");
writeFileSync(envPath, "KEYCLOAK_WORKSPACES_FROM_GROUPS=true\nKEYCLOAK_SUPER_ADMIN_FROM_GROUPS=false\n");

const run = (args: string[]) => {
  try {
    const stdout = execFileSync("bash", [resolve(process.cwd(), "infra/scripts/motio-settings.sh"), "sql", ...args], {
      env: { ...process.env, MOTIO_ENV_FILE: envPath },
      stdio: "pipe",
    });
    return { code: 0, out: stdout.toString() };
  } catch (error) {
    const failed = error as { status: number; stderr: Buffer; stdout: Buffer };
    return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
  }
};

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("motio-settings.sh", () => {
  it("stores a value for a known key", () => {
    const result = run(["set", "timeline.density", "on"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("insert into public.instance_settings");
    expect(result.out).toContain("('timeline.density', 'true'::jsonb");
    expect(run(["set", "timeline.density", "OFF"]).out).toContain("'false'::jsonb");
  });

  it("goes back to the default by removing the row", () => {
    const result = run(["reset", "dashboards.transfer"]);
    expect(result.code).toBe(0);
    expect(result.out.trim().split("\n")[0]).toBe("delete from public.instance_settings where key = 'dashboards.transfer';");
  });

  it("leaves a line in the activity log, where the database has one", () => {
    const set = run(["set", "timeline.density", "on"]).out;
    expect(set).toContain("to_regclass('public.admin_audit_log') is not null");
    expect(set).toContain("'settings.update', jsonb_build_object('key', 'timeline.density', 'value', 'true'::jsonb, 'via', 'cli')");
    expect(run(["reset", "timeline.density"]).out).toContain("'value', 'null'::jsonb");
  });

  it("refuses keys it does not know, so nothing typed reaches the database as is", () => {
    const result = run(["set", "x'); drop table public.tasks; --", "on"]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("unknown setting");
    expect(result.out).not.toContain("insert into");
  });

  it("refuses values other than on and off", () => {
    const result = run(["set", "timeline.density", "maybe"]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("on or off");
  });

  it("leaves a setting that .env turns on to .env", () => {
    const result = run(["set", "groups.workspaces", "off"]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("KEYCLOAK_WORKSPACES_FROM_GROUPS=true");
    // false in .env locks nothing.
    expect(run(["set", "groups.superAdmin", "on"]).code).toBe(0);
  });

  it("lists every setting with where its value comes from", () => {
    const result = run(["list", "timeline.density\ttrue\t2026-11-09 10:00 UTC"]);
    expect(result.code).toBe(0);
    const lines = result.out.trim().split("\n");
    const line = (key: string) => lines.find((entry) => entry.startsWith(`${key} `)) ?? "";
    expect(line("timeline.density")).toMatch(/\bon\b.*set 2026-11-09 10:00 UTC/);
    expect(line("groups.workspaces")).toMatch(/\bon\b.*KEYCLOAK_WORKSPACES_FROM_GROUPS=true in \.env/);
    expect(line("workspaces.closures")).toMatch(/\boff\b.*default/);
  });
});
