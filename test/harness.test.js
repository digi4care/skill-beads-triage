import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HARNESS,
  HARNESS_IDS,
  HARNESS_TABLE,
  installAssets,
  loadRegistry,
  migrateRegistry,
  resolveHarnessSelection,
  resolveScope,
  resolveSource,
  SKILL_ID,
  uninstallAssets,
} from "../bin/bt-triage.js";
import { cleanup, makeFixture, makeTempDir } from "./helpers.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "bt-triage.js");

const dirs = [];
function tmp() {
  const d = makeTempDir("bt-triage-harness-");
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

describe("harness adapters", () => {
  it("documents the five adapters", () => {
    assert.deepEqual(HARNESS_IDS, ["opencode", "claude", "codex", "pi", "agents"]);
    assert.equal(DEFAULT_HARNESS, "opencode");
  });

  it("resolves a selection", () => {
    assert.deepEqual(resolveHarnessSelection(undefined), ["opencode"]);
    assert.deepEqual(resolveHarnessSelection("claude"), ["claude"]);
    assert.deepEqual(resolveHarnessSelection("claude,codex"), ["claude", "codex"]);
    assert.deepEqual(resolveHarnessSelection("all"), HARNESS_IDS);
    assert.deepEqual(resolveHarnessSelection("all,claude"), HARNESS_IDS);
    assert.throws(() => resolveHarnessSelection("nope"), /Unknown harness/);
  });

  it("uses the documented project paths", () => {
    const scope = resolveScope({ scope: "project", cwd: "/tmp/proj" });
    const expected = {
      opencode: join("/tmp/proj", ".agents", "skills", SKILL_ID),
      claude: join("/tmp/proj", ".claude", "skills", SKILL_ID),
      codex: join("/tmp/proj", ".agents", "skills", SKILL_ID),
      pi: join("/tmp/proj", ".agents", "skills", SKILL_ID),
      agents: join("/tmp/proj", ".agents", "skills", SKILL_ID),
    };
    for (const [harnessId, dest] of Object.entries(expected)) {
      const groups = HARNESS_TABLE[harnessId].commands ? ["skill", "commands"] : ["skill"];
      assert.deepEqual(
        groups.map((g) =>
          join(
            scope.root,
            ...(g === "skill"
              ? HARNESS_TABLE[harnessId].skill
              : HARNESS_TABLE[harnessId].commands.project),
          ),
        ),
        [dest, ...(groups.length > 1 ? [join("/tmp/proj", ".opencode", "commands")] : [])],
      );
    }
  });

  it("installs the canonical skill for every adapter", () => {
    const fixture = makeFixture();
    for (const harnessId of HARNESS_IDS) {
      const project = tmp();
      const scope = resolveScope({ scope: "project", cwd: project });
      const result = installAssets({
        scope,
        source: resolveSource(fixture.root),
        harnesses: [harnessId],
      });
      assert.equal(result.skipped.length, 0, `${harnessId} must install cleanly`);
      const skillRoot =
        harnessId === "claude"
          ? join(project, ".claude", "skills", SKILL_ID)
          : join(project, ".agents", "skills", SKILL_ID);
      assert.ok(existsSync(join(skillRoot, "SKILL.md")), `${harnessId} must install SKILL.md`);
      assert.ok(
        existsSync(join(skillRoot, "references", "status.md")),
        `${harnessId} must install the references`,
      );
      const commandsDir = join(project, ".opencode", "commands");
      if (harnessId === "opencode") {
        assert.ok(existsSync(join(commandsDir, "bt_status.md")));
      } else {
        assert.equal(existsSync(commandsDir), false, `${harnessId} must not install commands`);
      }
    }
  });

  it("installs the global equivalents under the injected home", () => {
    const fixture = makeFixture();
    for (const harnessId of HARNESS_IDS) {
      const home = tmp();
      const scope = resolveScope({ scope: "global", home });
      installAssets({ scope, source: resolveSource(fixture.root), harnesses: [harnessId] });
      const skillRoot =
        harnessId === "claude"
          ? join(home, ".claude", "skills", SKILL_ID)
          : join(home, ".agents", "skills", SKILL_ID);
      assert.ok(existsSync(join(skillRoot, "SKILL.md")), `${harnessId} must install globally`);
      if (harnessId === "opencode") {
        assert.ok(existsSync(join(home, ".config", "opencode", "commands", "bt_status.md")));
      } else {
        assert.equal(existsSync(join(home, ".config", "opencode", "commands")), false);
      }
    }
  });

  it("installs the custom-target equivalents", () => {
    const fixture = makeFixture();
    for (const harnessId of HARNESS_IDS) {
      const target = tmp();
      const scope = resolveScope({ scope: "custom", target });
      installAssets({ scope, source: resolveSource(fixture.root), harnesses: [harnessId] });
      const skillRoot =
        harnessId === "claude"
          ? join(target, ".claude", "skills", SKILL_ID)
          : join(target, ".agents", "skills", SKILL_ID);
      assert.ok(
        existsSync(join(skillRoot, "SKILL.md")),
        `${harnessId} must install into the target`,
      );
    }
  });

  it("defaults to opencode for backward compatibility", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });
    const registry = loadRegistry(scope.registryPath);
    assert.deepEqual(Object.keys(registry.harnesses), ["opencode"]);
    assert.ok(existsSync(join(project, ".opencode", "commands", "bt_status.md")));
    assert.equal(existsSync(join(project, ".claude", "skills", SKILL_ID)), false);
  });

  it("installs every adapter with the all selection", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const result = installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: resolveHarnessSelection("all"),
    });
    assert.equal(result.skipped.length, 0, "the all selection must not report conflicts");
    assert.ok(existsSync(join(project, ".agents", "skills", SKILL_ID, "SKILL.md")));
    assert.ok(existsSync(join(project, ".claude", "skills", SKILL_ID, "SKILL.md")));
    assert.ok(existsSync(join(project, ".opencode", "commands", "bt_status.md")));
    const registry = loadRegistry(scope.registryPath);
    assert.deepEqual(Object.keys(registry.harnesses).sort(), [...HARNESS_IDS].sort());
  });
});

describe("shared ownership", () => {
  it("adds a second owner of the shared .agents destination without a conflict", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root), harnesses: ["opencode"] });
    const second = installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["codex"],
    });
    assert.equal(second.skipped.length, 0, "adding an owner must not report a conflict");

    const registry = loadRegistry(scope.registryPath);
    const opencode = registry.harnesses.opencode.skill.files.map((f) => f.path).sort();
    const codex = registry.harnesses.codex.skill.files.map((f) => f.path).sort();
    assert.deepEqual(opencode, codex, "both adapters own the same skill files");
    for (const file of registry.harnesses.opencode.skill.files) {
      const other = registry.harnesses.codex.skill.files.find((f) => f.path === file.path);
      assert.equal(other.sha256, file.sha256, "the shared file keeps one checksum");
    }
  });

  it("keeps a shared file until its last owner is removed", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "codex", "pi"],
    });
    const skillFile = join(project, ".agents", "skills", SKILL_ID, "SKILL.md");

    const first = uninstallAssets({ scope, harnesses: ["opencode"] });
    assert.equal(existsSync(skillFile), true, "the file survives while another owner remains");
    assert.ok(first.kept.some((f) => f.path === "SKILL.md"));
    assert.match(first.kept[0].reason, /still owned by/);

    uninstallAssets({ scope, harnesses: ["codex"] });
    assert.equal(existsSync(skillFile), true, "the file survives while the last owner remains");

    const third = uninstallAssets({ scope, harnesses: ["pi"] });
    assert.equal(existsSync(skillFile), false, "the file is removed with its last owner");
    assert.ok(third.removed.some((f) => f.path === "SKILL.md"));
  });

  it("removes the shared file once every owner is uninstalled at once", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "codex", "pi", "agents"],
    });
    const skillFile = join(project, ".agents", "skills", SKILL_ID, "SKILL.md");
    const result = uninstallAssets({
      scope,
      harnesses: ["opencode", "codex", "pi", "agents"],
    });
    assert.equal(existsSync(skillFile), false);
    assert.equal(
      result.kept.length,
      0,
      "a file whose last owner leaves in the same run is not kept",
    );
    assert.equal(result.removed.length, 15, "8 shared skill files + 7 command files");
  });

  it("drops only the uninstalled owner from the registry", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "codex", "pi"],
    });
    uninstallAssets({ scope, harnesses: ["codex"] });

    const registry = loadRegistry(scope.registryPath);
    assert.deepEqual(Object.keys(registry.harnesses).sort(), ["opencode", "pi"]);
    const skillFile = join(project, ".agents", "skills", SKILL_ID, "SKILL.md");
    assert.equal(existsSync(skillFile), true, "the other owners keep the file");
  });

  it("keeps the checksums coherent across owners after an update", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "codex"],
    });
    writeFileSync(join(fixture.skillDir, "SKILL.md"), "new packaged content\n");
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "codex"],
    });

    const registry = loadRegistry(scope.registryPath);
    const opencodeHash = registry.harnesses.opencode.skill.files.find(
      (f) => f.path === "SKILL.md",
    ).sha256;
    const codexHash = registry.harnesses.codex.skill.files.find(
      (f) => f.path === "SKILL.md",
    ).sha256;
    assert.equal(opencodeHash, codexHash, "both owners record the same checksum");
    const installed = readFileSync(
      join(project, ".agents", "skills", SKILL_ID, "SKILL.md"),
      "utf8",
    );
    assert.equal(installed, "new packaged content\n");
  });

  it("keeps a modified shared file for every owner", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "codex"],
    });
    const skillFile = join(project, ".agents", "skills", SKILL_ID, "SKILL.md");
    writeFileSync(skillFile, "hand edited\n");

    const result = uninstallAssets({ scope, harnesses: ["opencode", "codex"] });
    assert.ok(result.kept.some((f) => f.path === "SKILL.md"));
    assert.equal(readFileSync(skillFile, "utf8"), "hand edited\n");
  });
});

describe("registry migration", () => {
  function writeLegacyRegistry(scope, groups) {
    writeFileSync(
      scope.registryPath,
      `${JSON.stringify(
        {
          package: "@digi4care/skill-beads-triage",
          version: "0.1.0",
          installedAt: "2026-01-01T00:00:00.000Z",
          scope: scope.kind,
          root: scope.root,
          groups,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  it("migrates a v1 registry as an opencode installation", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    writeLegacyRegistry(scope, {
      skill: { dest: scope.skillDir, files: [{ path: "SKILL.md", sha256: "a".repeat(64) }] },
      commands: { dest: scope.commandsDir, files: [] },
    });
    const registry = loadRegistry(scope.registryPath);
    assert.equal(registry.corrupt, undefined);
    assert.equal(registry.schemaVersion, 2);
    assert.equal(registry.migrated, true);
    assert.deepEqual(Object.keys(registry.harnesses), ["opencode"]);
    assert.equal(registry.harnesses.opencode.skill.files[0].path, "SKILL.md");
  });

  it("migrates a v1 registry through migrateRegistry directly", () => {
    const migrated = migrateRegistry({
      groups: { skill: { dest: "/tmp/x", files: [] }, commands: { dest: "/tmp/y", files: [] } },
    });
    assert.equal(migrated.corrupt, undefined);
    assert.equal(migrated.schemaVersion, 2);
    assert.ok(migrated.harnesses.opencode);
  });

  it("refuses an unsupported schema version", () => {
    const migrated = migrateRegistry({ schemaVersion: 99, harnesses: {} });
    assert.equal(migrated.corrupt, true);
    assert.match(migrated.reason, /unsupported registry schema version/);
  });

  it("uninstalls a migrated v1 installation", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });
    const registry = loadRegistry(scope.registryPath);
    const legacy = {
      package: registry.package,
      version: registry.version,
      installedAt: registry.installedAt,
      scope: registry.scope,
      root: registry.root,
      groups: {
        skill: registry.harnesses.opencode.skill,
        commands: registry.harnesses.opencode.commands,
      },
    };
    writeLegacyRegistry(scope, legacy.groups);

    const result = uninstallAssets({ scope });
    assert.ok(result.removed.length > 0, "the migrated installation is uninstalled");
    assert.equal(existsSync(join(project, ".agents", "skills", SKILL_ID, "SKILL.md")), false);
  });

  it("rewrites a v1 registry as v2 on the next install", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });
    const registry = loadRegistry(scope.registryPath);
    writeLegacyRegistry(scope, {
      skill: registry.harnesses.opencode.skill,
      commands: registry.harnesses.opencode.commands,
    });

    installAssets({ scope, source: resolveSource(fixture.root) });
    const rewritten = JSON.parse(readFileSync(scope.registryPath, "utf8"));
    assert.equal(rewritten.schemaVersion, 2);
    assert.ok(rewritten.harnesses.opencode);
    assert.equal(rewritten.groups, undefined);
  });

  it("refuses a registry with an unknown harness", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    writeFileSync(
      scope.registryPath,
      JSON.stringify({
        schemaVersion: 2,
        harnesses: { mystery: { skill: { dest: scope.skillDir, files: [] } } },
      }),
      "utf8",
    );
    const registry = loadRegistry(scope.registryPath, { scope });
    assert.equal(registry.corrupt, true);
    assert.match(registry.reason, /unknown harness/);
  });

  it("refuses a registry whose destination does not match the adapter path", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    writeFileSync(
      scope.registryPath,
      JSON.stringify({
        schemaVersion: 2,
        harnesses: { opencode: { skill: { dest: join(project, "elsewhere"), files: [] } } },
      }),
      "utf8",
    );
    const registry = loadRegistry(scope.registryPath, { scope });
    assert.equal(registry.corrupt, true);
    assert.match(registry.reason, /unexpected destination/);
  });
});

describe("lifecycle", () => {
  it("survives install, update and uninstall for one adapter", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root), harnesses: ["claude"] });
    writeFileSync(join(fixture.skillDir, "SKILL.md"), "changed\n");
    installAssets({ scope, source: resolveSource(fixture.root), harnesses: ["claude"] });
    assert.equal(
      readFileSync(join(project, ".claude", "skills", SKILL_ID, "SKILL.md"), "utf8"),
      "changed\n",
    );
    const result = uninstallAssets({ scope, harnesses: ["claude"] });
    assert.ok(result.removed.length > 0);
    assert.equal(existsSync(join(project, ".claude", "skills", SKILL_ID)), false);
  });

  it("leaves the other adapters untouched when one is uninstalled", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: ["opencode", "claude"],
    });
    uninstallAssets({ scope, harnesses: ["claude"] });
    assert.equal(existsSync(join(project, ".claude", "skills", SKILL_ID)), false);
    assert.ok(existsSync(join(project, ".agents", "skills", SKILL_ID, "SKILL.md")));
    assert.ok(existsSync(join(project, ".opencode", "commands", "bt_status.md")));
  });

  it("reports a dry run without touching anything", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const result = installAssets({
      scope,
      source: resolveSource(fixture.root),
      harnesses: resolveHarnessSelection("all"),
      dryRun: true,
    });
    assert.ok(result.plan.files.length > 0);
    assert.equal(existsSync(scope.registryPath), false);
    assert.equal(existsSync(join(project, ".agents")), false);
    assert.equal(existsSync(join(project, ".claude")), false);
  });
});

describe("cli harness selection", () => {
  it("documents the harness flag in the help screen", () => {
    const { code, stdout } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(stdout, /--harness/);
    assert.match(stdout, /opencode/);
    assert.match(stdout, /claude/);
    assert.match(stdout, /codex/);
    assert.match(stdout, /pi/);
    assert.match(stdout, /agents/);
    assert.match(stdout, /\.claude\/skills\/bead-triage/);
    assert.match(stdout, /\.agents\/skills\/bead-triage/);
    assert.match(stdout, /--harness all/);
  });

  it("installs and uninstalls one adapter through the cli", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };
    const install = run(["install", "--global", "--harness", "claude"], env);
    assert.equal(install.code, 0);
    assert.ok(existsSync(join(home, ".claude", "skills", "bead-triage", "SKILL.md")));
    assert.equal(existsSync(join(home, ".config", "opencode", "commands")), false);

    const uninstall = run(["uninstall", "--global", "--harness", "claude"], env);
    assert.equal(uninstall.code, 0);
    assert.equal(existsSync(join(home, ".claude", "skills", "bead-triage")), false);
  });

  it("installs every adapter through the cli with all", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };
    const install = run(["install", "--global", "--harness", "all"], env);
    assert.equal(install.code, 0);
    assert.ok(existsSync(join(home, ".agents", "skills", "bead-triage", "SKILL.md")));
    assert.ok(existsSync(join(home, ".claude", "skills", "bead-triage", "SKILL.md")));
    assert.ok(existsSync(join(home, ".config", "opencode", "commands", "bt_status.md")));

    const list = run(["list"], env);
    assert.equal(list.code, 0);
    assert.match(list.stdout, /opencode/);
    assert.match(list.stdout, /claude/);
  });

  it("filters the diagnostics commands by harness", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };
    const install = run(["install", "--global", "--harness", "all"], env);
    assert.equal(install.code, 0);

    const list = run(["list", "--harness", "claude"], env);
    assert.equal(list.code, 0);
    assert.match(list.stdout, /claude/);
    assert.doesNotMatch(list.stdout, /opencode/);

    const doctor = run(["doctor", "--harness", "claude"], env);
    assert.equal(doctor.code, 0);
    assert.match(doctor.stdout, /claude skill/);
    assert.doesNotMatch(doctor.stdout, /opencode skill/);
  });

  it("rejects an unknown harness", () => {
    const fixture = makeFixture();
    const home = tmp();
    const env = { BT_TRIAGE_HOME: home, BT_TRIAGE_SOURCE: fixture.root };
    const result = run(["install", "--global", "--harness", "nope"], env);
    assert.equal(result.code, 1);
    assert.match(`${result.stdout}${result.stderr}`, /Unknown harness/);
  });
});
