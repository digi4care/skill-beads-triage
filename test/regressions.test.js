import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanup, makeFixture, makeTempDir } from "./helpers.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "bt-triage.js");

const dirs = [];
function tmp() {
  const d = makeTempDir("bt-triage-regression-");
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

/** An isolated project + home pair with a packaged source fixture. */
function setup() {
  const fixture = makeFixture();
  const project = tmp();
  const home = tmp();
  return {
    fixture,
    project,
    home,
    env: {
      BT_TRIAGE_HOME: home,
      BT_TRIAGE_CWD: project,
      BT_TRIAGE_SOURCE: fixture.root,
    },
  };
}

describe("cli exit codes: install and update", () => {
  it("does not fail a safe update that keeps a file owned by another adapter", () => {
    const { fixture, project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    // The package stops shipping one reference file.
    rmSync(join(fixture.skillDir, "references", "status.md"));

    // Only opencode is updated: the other adapters still own the shared file.
    const update = run(["update", "--project", "--harness", "opencode"], env);
    assert.equal(update.code, 0, update.stdout);
    assert.match(update.stdout, /kept as is/);
    assert.doesNotMatch(update.stdout, /need attention/);
    assert.ok(
      existsSync(join(project, ".agents", "skills", "bead-triage", "references", "status.md")),
      "the shared file survives because another adapter still owns it",
    );
  });

  it("still fails when a file was modified after installation", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "opencode"], env);
    assert.equal(install.code, 0, install.stdout);

    const skillDoc = join(project, ".agents", "skills", "bead-triage", "SKILL.md");
    writeFileSync(skillDoc, `${"local edit\n"}`);

    const update = run(["update", "--project", "--harness", "opencode"], env);
    assert.equal(update.code, 1, update.stdout);
    assert.match(update.stdout, /need attention/);
  });

  it("still fails when an unregistered file collides with a packaged file", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "opencode"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".agents", "skills", "bead-triage", "SKILL.md"));
    writeFileSync(join(project, ".agents", "skills", "bead-triage", "SKILL.md"), "not ours\n");

    const update = run(["update", "--project", "--harness", "opencode"], env);
    assert.equal(update.code, 1, update.stdout);
    assert.match(update.stdout, /need attention/);
  });
});

describe("cli exit codes: doctor", () => {
  it("fails when an installed skill document is missing", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".claude", "skills", "bead-triage", "SKILL.md"));

    const doctor = run(["doctor"], env);
    assert.equal(doctor.code, 1, doctor.stdout);
    assert.match(doctor.stdout, /missing claude skill file: SKILL\.md/);
  });

  it("fails when an installed registry is corrupt", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "opencode"], env);
    assert.equal(install.code, 0, install.stdout);

    writeFileSync(join(project, ".bt-triage-registry.json"), "{ not json");

    const doctor = run(["doctor"], env);
    assert.equal(doctor.code, 1, doctor.stdout);
    assert.match(doctor.stdout, /registry refused/);
  });

  it("ignores an unhealthy adapter that the harness filter excludes", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".claude", "skills", "bead-triage", "SKILL.md"));

    const doctor = run(["doctor", "--harness", "opencode"], env);
    assert.equal(doctor.code, 0, doctor.stdout);
    assert.doesNotMatch(doctor.stdout, /missing claude/);
    assert.match(doctor.stdout, /opencode skill/);
  });

  it("fails on the unhealthy adapter when the filter selects it", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".claude", "skills", "bead-triage", "SKILL.md"));

    const doctor = run(["doctor", "--harness", "claude"], env);
    assert.equal(doctor.code, 1, doctor.stdout);
    assert.match(doctor.stdout, /missing claude skill file: SKILL\.md/);
  });
});

describe("cli exit codes: info", () => {
  it("ignores an unhealthy adapter that the harness filter excludes", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".claude", "skills", "bead-triage", "SKILL.md"));

    const info = run(["info", "project", "--harness", "opencode"], env);
    assert.equal(info.code, 0, info.stdout);
    assert.doesNotMatch(info.stdout, /missing SKILL\.md/);
  });

  it("fails on the unhealthy adapter when the filter selects it", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".claude", "skills", "bead-triage", "SKILL.md"));

    const info = run(["info", "project", "--harness", "claude"], env);
    assert.equal(info.code, 1, info.stdout);
    assert.match(info.stdout, /missing SKILL\.md/);
  });

  it("stays strict without a harness filter", () => {
    const { project, env } = setup();
    const install = run(["install", "--project", "--harness", "all"], env);
    assert.equal(install.code, 0, install.stdout);

    rmSync(join(project, ".claude", "skills", "bead-triage", "SKILL.md"));

    const info = run(["info", "project"], env);
    assert.equal(info.code, 1, info.stdout);
    assert.match(info.stdout, /missing SKILL\.md/);
  });
});
