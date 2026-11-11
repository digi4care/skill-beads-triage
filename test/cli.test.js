import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanup, makeFixture, makeTempDir } from "./helpers.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "bt-triage.js");

const dirs = [];
function tmp() {
  const d = makeTempDir();
  dirs.push(d);
  return d;
}
after(() => {
  for (const d of dirs) cleanup(d);
});

function run(args, env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

describe("cli", () => {
  it("contains no leftover Pi branding or repository urls", () => {
    const source = readFileSync(BIN, "utf8");
    for (const forbidden of [
      "pi-skills",
      "pi_skills",
      "@digi4care/pi-",
      "digi4care/pi-skills",
      ".omp",
      "omp-skills",
      "br sync",
      "self-update",
    ]) {
      assert.equal(source.includes(forbidden), false, `found forbidden string: ${forbidden}`);
    }
  });

  it("prints an accurate help screen", () => {
    const { code, stdout } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(stdout, /bt-triage/);
    assert.match(stdout, /install/);
    assert.match(stdout, /update/);
    assert.match(stdout, /uninstall/);
    assert.match(stdout, /doctor/);
    assert.match(stdout, /\.agents\/skills\/bead-triage/);
    assert.match(stdout, /\.config\/opencode\/commands/);
    assert.doesNotMatch(stdout, /pi-skills/i);
    assert.doesNotMatch(stdout, /sync/i);
  });

  it("prints the version", () => {
    const { code, stdout } = run(["--version"]);
    assert.equal(code, 0);
    assert.match(stdout, /\d+\.\d+\.\d+/);
  });

  it("rejects unknown commands", () => {
    const { code, stdout } = run(["nonsense"]);
    assert.equal(code, 1);
    assert.match(stdout, /Unknown command/);
  });

  it("installs, lists and uninstalls through the cli in an injected home", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };

    const install = run(["install", "--global"], env);
    assert.equal(install.code, 0);
    assert.ok(existsSync(join(home, ".agents", "skills", "bead-triage", "SKILL.md")));
    assert.ok(existsSync(join(home, ".config", "opencode", "commands", "bt_status.md")));

    const list = run(["list"], env);
    assert.equal(list.code, 0);
    assert.match(list.stdout, /global/);

    const info = run(["info", "global"], env);
    assert.equal(info.code, 0);
    assert.match(info.stdout, /Package:/);

    const uninstall = run(["uninstall", "--global"], env);
    assert.equal(uninstall.code, 0);
    assert.equal(existsSync(join(home, ".agents", "skills", "bead-triage", "SKILL.md")), false);
  });

  it("does not mutate the filesystem during a cli dry run", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };

    const result = run(["install", "--global", "--dry-run"], env);
    assert.equal(result.code, 0);
    assert.equal(existsSync(join(home, ".agents")), false);
    assert.equal(existsSync(join(home, ".config")), false);
  });

  it("reports collisions and exits non-zero", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };
    mkdirSync(join(home, ".config", "opencode", "commands"), { recursive: true });
    const collision = join(home, ".config", "opencode", "commands", "bt_status.md");
    writeFileSync(collision, "mine\n");

    const result = run(["install", "--global"], env);
    assert.equal(result.code, 1);
    assert.equal(readFileSync(collision, "utf8"), "mine\n");
  });

  it("reports a missing packaged source through doctor", () => {
    const empty = tmp();
    const env = { BT_TRIAGE_SOURCE: empty, BT_TRIAGE_HOME: tmp() };
    const result = run(["doctor"], env);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /missing/);
  });

  it("reports a missing skill document through doctor", () => {
    const fixture = makeFixture();
    rmSync(join(fixture.skillDir, "SKILL.md"));
    const env = { BT_TRIAGE_SOURCE: fixture.root, BT_TRIAGE_HOME: tmp() };
    const result = run(["doctor"], env);
    assert.equal(result.code, 1, "a missing SKILL.md must fail the doctor check");
    assert.match(result.stdout, /missing SKILL\.md/);
  });

  it("refuses an unsafe registry without touching files", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };

    assert.equal(run(["install", "--global"], env).code, 0);

    const outside = join(home, "outside.md");
    writeFileSync(outside, "user data\n");
    const registryPath = join(home, ".bt-triage-registry.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    registry.harnesses.opencode.commands.files.push({
      path: "../outside.md",
      sha256: "a".repeat(64),
    });
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    const uninstall = run(["uninstall", "--global"], env);
    assert.equal(uninstall.code, 1, "an unsafe registry must fail the uninstall");
    assert.equal(readFileSync(outside, "utf8"), "user data\n");
    assert.equal(
      existsSync(join(home, ".config", "opencode", "commands", "bt_status.md")),
      true,
      "no registered file may be removed while the registry is refused",
    );
  });

  it("refuses an unsafe registry on install and writes nothing", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };

    assert.equal(run(["install", "--global"], env).code, 0);
    const registryPath = join(home, ".bt-triage-registry.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    registry.harnesses.opencode.commands.files.push({
      path: "/tmp/absolute.md",
      sha256: "a".repeat(64),
    });
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    const install = run(["install", "--global"], env);
    assert.equal(install.code, 1, "an unsafe registry must fail the install");
    assert.match(`${install.stdout}${install.stderr}`, /corrupt/i);
  });

  it("updates an installation through the cli", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };

    run(["install", "--global"], env);
    writeFileSync(join(fixture.skillDir, "SKILL.md"), "new packaged content\n");

    const update = run(["update", "--global"], env);
    assert.equal(update.code, 0);
    const installed = join(home, ".agents", "skills", "bead-triage", "SKILL.md");
    assert.equal(readFileSync(installed, "utf8"), "new packaged content\n");
  });

  it("keeps unrelated user files when uninstalling through the cli", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };

    run(["install", "--global"], env);
    const userFile = join(home, ".config", "opencode", "commands", "my-command.md");
    writeFileSync(userFile, "mine\n");

    const uninstall = run(["uninstall", "--global"], env);
    assert.equal(uninstall.code, 0);
    assert.equal(readFileSync(userFile, "utf8"), "mine\n");
    assert.equal(existsSync(join(home, ".config", "opencode", "commands", "bt_status.md")), false);
  });

  it("installs into a custom target through the cli", () => {
    const fixture = makeFixture();
    const target = tmp();
    const env = { BT_TRIAGE_SOURCE: fixture.root, BT_TRIAGE_HOME: tmp() };

    const result = run(["install", "--target", target], env);
    assert.equal(result.code, 0);
    assert.ok(existsSync(join(target, ".agents", "skills", "bead-triage", "SKILL.md")));
    assert.ok(existsSync(join(target, ".opencode", "commands", "bt_continue.md")));
  });
});
