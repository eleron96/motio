import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// infra/scripts/install.sh --env-only writes the .env of a self-hosted install
// without starting anything. Every secret is generated, every public address is
// derived from one URL, and nothing points at the public site's own hosts.

const dir = mkdtempSync(join(tmpdir(), "motio-install-"));
const envPath = join(dir, ".env");

execFileSync(
  "bash",
  [
    resolve(process.cwd(), "infra/scripts/install.sh"),
    "--env-only",
    "--domain", "planner.example.com",
    "--email", "ops@example.com",
    "--mode", "proxy",
    "--http-port", "8088",
  ],
  { env: { ...process.env, MOTIO_ENV_FILE: envPath }, stdio: "pipe" },
);

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const decodeSegment = (segment: string) =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;

const verifyJwt = (token: string, secret: string) => {
  const [header, payload, signature] = token.split(".");
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return { valid: expected === signature, header: decodeSegment(header), payload: decodeSegment(payload) };
};

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("install.sh --env-only", () => {
  it("signs the anon and service-role keys with the generated JWT secret", () => {
    expect(env.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
    const anon = verifyJwt(env.ANON_KEY, env.JWT_SECRET);
    const service = verifyJwt(env.SERVICE_ROLE_KEY, env.JWT_SECRET);
    expect(anon).toMatchObject({ valid: true, header: { alg: "HS256" }, payload: { role: "anon" } });
    expect(service).toMatchObject({ valid: true, payload: { role: "service_role" } });
    expect(env.VITE_SUPABASE_ANON_KEY).toBe(env.ANON_KEY);
  });

  it("derives every public address from the one domain", () => {
    const url = "https://planner.example.com";
    expect(env).toMatchObject({
      SITE_URL: url,
      APP_URL: url,
      API_EXTERNAL_URL: url,
      VITE_SUPABASE_URL: url,
      VITE_PUBLIC_SITE_URL: url,
      KEYCLOAK_PUBLIC_URL: url,
      GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI: `${url}/auth/v1/callback`,
      OAUTH2_PROXY_REDIRECT_URL: `${url}/oauth2/callback`,
      OAUTH2_PROXY_OIDC_ISSUER_URL: `${url}/realms/timeline`,
      OAUTH2_PROXY_WHITELIST_DOMAINS: "planner.example.com",
      OAUTH2_PROXY_COOKIE_SECURE: "true",
      MOTIO_SITE_ADDRESS: ":80",
      MOTIO_HTTP_BIND: "127.0.0.1:8088",
    });
  });

  it("generates distinct secrets and one shared Keycloak client secret", () => {
    expect(env.POSTGRES_PASSWORD).toMatch(/^[0-9a-f]{48}$/);
    expect(env.KEYCLOAK_ADMIN_PASSWORD).not.toBe("admin");
    expect(env.GOTRUE_EXTERNAL_KEYCLOAK_SECRET.length).toBeGreaterThanOrEqual(24);
    expect(env.OAUTH2_PROXY_CLIENT_SECRET).toBe(env.GOTRUE_EXTERNAL_KEYCLOAK_SECRET);
    expect(env.OAUTH2_PROXY_COOKIE_SECRET).toMatch(/^[0-9a-f]{32}$/);
    expect(env.PGRST_DB_URI).toContain(`:${env.POSTGRES_PASSWORD}@db:5432/`);
    expect(new Set([env.POSTGRES_PASSWORD, env.JWT_SECRET, env.KEYCLOAK_ADMIN_PASSWORD]).size).toBe(3);
  });

  it("creates Web Push keys in the web-push format", () => {
    expect(Buffer.from(env.VAPID_PUBLIC_KEY, "base64url")).toHaveLength(65);
    expect(Buffer.from(env.VAPID_PRIVATE_KEY, "base64url")).toHaveLength(32);
    expect(env.VITE_PUSH_VAPID_PUBLIC_KEY).toBe(env.VAPID_PUBLIC_KEY);
  });

  it("keeps the reserve admin apart from the person installing", () => {
    expect(env.RESERVE_ADMIN_EMAIL).toBe("admin@planner.example.com");
    expect(env.RESERVE_ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(12);
  });

  it("sends nothing to the public site's analytics or error tracking", () => {
    expect(env.VITE_PLAUSIBLE_DOMAIN).toBe("");
    expect(env.VITE_GLITCHTIP_DSN).toBe("");
    const values = Object.entries(env)
      .filter(([key]) => key !== "MOTIO_DOMAIN")
      .map(([, value]) => value)
      .join("\n");
    expect(values).not.toMatch(/nikog|webtm/);
  });
});
