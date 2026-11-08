import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Realm settings are applied by the keycloak-ensure-*.sh scripts on every
// deploy (AGENTS.md §5.3 p.2). A new script has to be wired into the deploy of
// motio.nikog.net (prod-compose.sh), the testing deploy (test-compose.sh) and
// the self-hosted installer (install.sh, bring_up) — §5.6 p.4. Forgetting one
// leaves that kind of install with an old realm; calling a missing one stops it.

const scripts = resolve(process.cwd(), "infra/scripts");
const read = (name: string) => readFileSync(join(scripts, name), "utf8");

const ensureScripts = readdirSync(scripts)
  .filter((name) => /^keycloak-ensure-.+\.sh$/.test(name))
  .map((name) => name.replace(/^keycloak-ensure-/, "").replace(/\.sh$/, ""))
  .sort();

// Self-hosted installs set the realm's mail from .env; motio.nikog.net and the
// testing realm have theirs set up by hand.
const selfHostedOnly = ["realm-smtp"];

const calledByDeploy = (name: string) =>
  [...read(name).matchAll(/^\s*(?:\S+=\S+\s+)*infra\/scripts\/keycloak-ensure-([a-z0-9-]+)\.sh\s+"\$env_file"/gm)]
    .map((match) => match[1])
    .sort();

const calledByInstaller = () => {
  const installer = read("install.sh");
  const loop = installer.match(/for script in ([^;]+); do\s+infra\/scripts\/keycloak-ensure-"\$script"\.sh/);
  expect(loop, "the ensure loop of bring_up in install.sh").not.toBeNull();
  return loop![1].replace(/\\\n/g, " ").split(/\s+/).filter(Boolean).sort();
};

describe("Keycloak ensure scripts", () => {
  it("are found", () => {
    expect(ensureScripts.length).toBeGreaterThan(10);
  });

  it.each(["prod-compose.sh", "test-compose.sh"])("all run in %s, except the self-hosted ones", (deploy) => {
    expect(calledByDeploy(deploy)).toEqual(ensureScripts.filter((name) => !selfHostedOnly.includes(name)));
  });

  it("all run in install.sh", () => {
    expect(calledByInstaller()).toEqual(ensureScripts);
  });

  it("are executable", () => {
    for (const name of ensureScripts) {
      const mode = statSync(join(scripts, `keycloak-ensure-${name}.sh`)).mode;
      expect(mode & 0o111, `keycloak-ensure-${name}.sh`).not.toBe(0);
    }
  });
});
