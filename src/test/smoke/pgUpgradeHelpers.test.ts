import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// infra/scripts/pg-upgrade-17.py does the bookkeeping of the move from
// PostgreSQL 15 to 17 (pg-upgrade-17.sh): which dump entries to load, which
// roles and extensions to carry over, and whether the two catalog fingerprints
// match. A mistake here either loses data quietly or stops every update, so
// each helper is checked on small hand-written inputs.

const helper = resolve(process.cwd(), "infra/scripts/pg-upgrade-17.py");
const dir = mkdtempSync(join(tmpdir(), "motio-pg-upgrade-"));
let fileCount = 0;

const file = (lines: string[] | string) => {
  fileCount += 1;
  const path = join(dir, `input-${fileCount}`);
  writeFileSync(path, Array.isArray(lines) ? `${lines.join("\n")}\n` : lines);
  return path;
};

const run = (args: string[], input?: string) => {
  const result = spawnSync("python3", [helper, ...args], { input, encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr };
};

const lines = (text: string) => text.split("\n").filter(Boolean);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("layout", () => {
  it("reads the volume, image, network and services from the compose configuration", () => {
    const config = {
      name: "planner",
      services: { db: { image: "supabase/postgres:17.6.1.136" }, web: {}, auth: {} },
      volumes: { supabase_db_data: { name: "planner_db_data_pg17" } },
    };
    const { status, out } = run(["layout"], JSON.stringify(config));
    expect(status).toBe(0);
    expect(lines(out)).toEqual([
      "project=planner",
      "new_volume=planner_db_data_pg17",
      "new_volume_external=false",
      "image17=supabase/postgres:17.6.1.136",
      "network=planner_default",
      "services='auth db web'",
    ]);
  });

  it("knows an external volume and a named default network", () => {
    const config = {
      name: "infra",
      services: { db: { image: "supabase/postgres:17.6.1.136" } },
      volumes: { supabase_db_data: { name: "supabase_db_data_pg17", external: true } },
      networks: { default: { name: "shared_net" } },
    };
    const out = lines(run(["layout"], JSON.stringify(config)).out);
    expect(out).toContain("new_volume_external=true");
    expect(out).toContain("network=shared_net");
  });
});

describe("toc lists for pg_restore", () => {
  const toc = file([
    ";",
    "; Archive created at 2026-11-08",
    "5; 2615 2200 SCHEMA - public pg_database_owner",
    "4100; 0 0 COMMENT - SCHEMA public pg_database_owner",
    "300; 1259 16400 TABLE public tasks postgres",
    "4101; 0 16400 TABLE DATA public tasks postgres",
    "4102; 0 16500 TABLE DATA auth users supabase_auth_admin",
    "4103; 0 16501 TABLE DATA auth schema_migrations supabase_auth_admin",
    "4104; 0 16600 TABLE DATA storage objects supabase_storage_admin",
    "4105; 0 16601 TABLE DATA storage migrations supabase_storage_admin",
    "4106; 0 16700 TABLE DATA realtime subscription supabase_admin",
    "4107; 0 16502 SEQUENCE SET auth refresh_tokens_id_seq supabase_auth_admin",
    "4108; 2620 16800 TRIGGER auth users on_auth_user_created postgres",
    "4109; 3256 16801 POLICY storage objects avatars_read postgres",
    "4110; 2620 16802 TRIGGER storage objects update_objects_updated_at supabase_storage_admin",
  ]);

  it("loads every public entry except the schema itself and its comment", () => {
    const out = lines(run(["toc-public", toc]).out);
    expect(out).toContain("300; 1259 16400 TABLE public tasks postgres");
    expect(out).toContain("4101; 0 16400 TABLE DATA public tasks postgres");
    expect(out.some((line) => line.includes("SCHEMA - public"))).toBe(false);
    expect(out.some((line) => line.includes("COMMENT - SCHEMA public"))).toBe(false);
  });

  it("copies the data of auth and storage, not their migration bookkeeping or Realtime", () => {
    expect(lines(run(["toc-service-data", toc]).out)).toEqual([
      "4102; 0 16500 TABLE DATA auth users supabase_auth_admin",
      "4104; 0 16600 TABLE DATA storage objects supabase_storage_admin",
      "4107; 0 16502 SEQUENCE SET auth refresh_tokens_id_seq supabase_auth_admin",
    ]);
  });

  it("adds Motio's triggers and policies on service tables that the new database lacks", () => {
    const present = file(["trigger|storage objects update_objects_updated_at"]);
    expect(lines(run(["toc-service-extras", toc, present]).out)).toEqual([
      "4108; 2620 16800 TRIGGER auth users on_auth_user_created postgres",
      "4109; 3256 16801 POLICY storage objects avatars_read postgres",
    ]);
  });
});

describe("compare", () => {
  const base = [
    "ext|pg_trgm|1.6|extensions||",
    "func|public.is_member(uuid)|postgres|true/search_path=public|{postgres=X/postgres,authenticated=X/postgres}|abc",
    "rel|public.tasks|r|postgres|{postgres=arwdDxt/postgres,authenticated=arwd/postgres}|true/false/d",
    "policy|public.tasks.members read|PERMISSIVE/SELECT|authenticated|is_member(workspace_id)|",
    "trigger|auth.users.on_auth_user_created|CREATE TRIGGER …|O||",
    "rel|auth.users|r|supabase_auth_admin||false/false/d",
    "role|motio_reporter|login||search_path=public|",
    "role|authenticated|||statement_timeout=8s|",
    "rel|pgsodium.key|r|supabase_admin||false/false/d",
  ];

  it("accepts identical fingerprints", () => {
    expect(run(["compare", file(base), file(base)]).status).toBe(0);
  });

  it("ignores the MAINTAIN privilege of PostgreSQL 17 and the order of grants", () => {
    const target = base.map((line) =>
      line.startsWith("rel|public.tasks")
        ? "rel|public.tasks|r|postgres|{authenticated=arwd/postgres,postgres=arwdDxtm/postgres}|true/false/d"
        : line,
    );
    expect(run(["compare", file(base), file(target)]).status).toBe(0);
  });

  it("stops on a function, policy or trigger of Motio that did not come over", () => {
    const target = base.filter((line) => !line.startsWith("func|") && !line.startsWith("trigger|"));
    const { status, out } = run(["compare", file(base), file(target)]);
    expect(status).toBe(1);
    expect(out).toContain("missing after the upgrade: func|public.is_member(uuid)");
    expect(out).toContain("missing after the upgrade: trigger|auth.users.on_auth_user_created");
  });

  it("stops on changed privileges of a public object", () => {
    const target = base.map((line) =>
      line.startsWith("func|") ? line.replace("authenticated=X/postgres", "anon=X/postgres,authenticated=X/postgres") : line,
    );
    const { status, out } = run(["compare", file(base), file(target)]);
    expect(status).toBe(1);
    expect(out).toContain("only after the upgrade:    func|public.is_member(uuid)");
  });

  it("lets the services own their schemas and drops what went away with an extension", () => {
    const target = base
      .filter((line) => !line.startsWith("rel|pgsodium."))
      .map((line) => (line.startsWith("rel|auth.users") ? "rel|auth.users|r|supabase_auth_admin||true/false/d" : line));
    expect(run(["compare", file(base), file(target)]).status).toBe(0);
  });

  it("requires Motio's own roles to come over exactly, not the image's built-in ones", () => {
    const changedBuiltin = base.map((line) =>
      line.startsWith("role|authenticated") ? "role|authenticated|||statement_timeout=10s|" : line,
    );
    expect(run(["compare", file(base), file(changedBuiltin)]).status).toBe(0);

    const lostRole = base.filter((line) => !line.startsWith("role|motio_reporter"));
    const { status, out } = run(["compare", file(base), file(lostRole)]);
    expect(status).toBe(1);
    expect(out).toContain("role missing after the upgrade: motio_reporter");
  });
});

describe("roles", () => {
  const role = (name: string, extra: Record<string, unknown> = {}) => ({
    name, super: false, inherit: true, createrole: false, createdb: false, login: true,
    replication: false, bypassrls: false, connlimit: -1, password: null, validuntil: null,
    settings: null, memberof: null, ...extra,
  });

  it("creates missing roles, carries passwords, settings, memberships and database grants", () => {
    const source = file(JSON.stringify({
      database: "postgres",
      roles: [
        role("authenticator", { password: "SCRAM-SHA-256$4096:aaa", settings: [{ db: null, config: ["statement_timeout=8s"] }] }),
        role("motio_reporter", { password: "SCRAM-SHA-256$4096:bbb", memberof: ["authenticated"] }),
        role("pgsodium_keyholder", { login: false }),
        role("authenticated", { login: false }),
      ],
      database_grants: [{ grantee: "motio_reporter", priv: "CONNECT" }],
    }));
    const target = file(JSON.stringify({
      database: "postgres",
      roles: [role("authenticator"), role("authenticated", { login: false })],
      database_grants: [],
    }));
    const out = run(["roles", source, target]).out;
    expect(out).toContain('CREATE ROLE "motio_reporter" WITH NOSUPERUSER INHERIT');
    expect(out).not.toContain("pgsodium_keyholder");
    expect(out).toContain(`ALTER ROLE "authenticator" WITH PASSWORD 'SCRAM-SHA-256$4096:aaa';`);
    expect(out).toContain(`ALTER ROLE "authenticator" SET statement_timeout TO '8s';`);
    expect(out).toContain('GRANT "authenticated" TO "motio_reporter";');
    expect(out).toContain('GRANT CONNECT ON DATABASE "postgres" TO "motio_reporter";');
  });
});

describe("extensions and publications", () => {
  it("creates the extensions the new database lacks, except the ones Motio does not use", () => {
    const source = file(["ext|pg_trgm|1.6|extensions||", "ext|pgjwt|0.2.0|extensions||", "ext|pg_net|0.8|extensions||"]);
    const target = file(["ext|pg_net|0.14|extensions||"]);
    expect(lines(run(["extensions", source, target]).out)).toEqual([
      'CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";',
    ]);
  });

  it("puts every table back into the live-update publication, not Realtime's own", () => {
    const catalog = file([
      "pubtable|supabase_realtime|public.tasks|||",
      "pubtable|supabase_realtime_messages_publication|realtime.messages_2026_11_08|||",
    ]);
    const out = run(["publications", catalog]).out;
    expect(out).toContain(`alter publication "supabase_realtime" add table "public"."tasks";`);
    expect(out).not.toContain("messages_2026_11_08");
  });
});
