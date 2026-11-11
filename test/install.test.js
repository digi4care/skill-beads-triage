import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  installAssets,
  loadRegistry,
  REQUIRED_COMMANDS,
  resolveScope,
  resolveSource,
  SKILL_ID,
  uninstallAssets,
} from "../bin/bt-triage.js";
import { cleanup, makeFixture, makeTempDir } from "./helpers.js";

const dirs = [];
function tmp() {
  const d = makeTempDir();
  dirs.push(d);
  return d;
}

after(() => {
  for (const d of dirs) cleanup(d);
});

describe("scope and source resolution", () => {
  it("maps the project scope", () => {
    const scope = resolveScope({ scope: "project", cwd: "/tmp/proj" });
    assert.equal(scope.kind, "project");
    assert.equal(scope.skillDir, join("/tmp/proj", ".agents", "skills", SKILL_ID));
    assert.equal(scope.commandsDir, join("/tmp/proj", ".opencode", "commands"));
    assert.equal(scope.registryPath, join("/tmp/proj", ".bt-triage-registry.json"));
  });

  it("maps the global scope under the home directory", () => {
    const scope = resolveScope({ scope: "global", home: "/tmp/home" });
    assert.equal(scope.kind, "global");
    assert.equal(scope.skillDir, join("/tmp/home", ".agents", "skills", SKILL_ID));
    assert.equal(scope.commandsDir, join("/tmp/home", ".config", "opencode", "commands"));
    assert.equal(scope.registryPath, join("/tmp/home", ".bt-triage-registry.json"));
  });

  it("maps a custom scope under the target directory", () => {
    const scope = resolveScope({ scope: "custom", target: "/tmp/custom" });
    assert.equal(scope.kind, "custom");
    assert.equal(scope.skillDir, join("/tmp/custom", ".agents", "skills", SKILL_ID));
    assert.equal(scope.commandsDir, join("/tmp/custom", ".opencode", "commands"));
  });

  it("resolves the canonical source layout", () => {
    const source = resolveSource("/tmp/pkg/src");
    assert.equal(source.skillDir, join("/tmp/pkg/src", ".agents", "skills", SKILL_ID));
    assert.equal(source.commandsDir, join("/tmp/pkg/src", ".opencode", "commands"));
  });
});

describe("install", () => {
  it("installs the real packaged sources", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const result = installAssets({ scope, source: resolveSource() });

    assert.equal(result.skipped.length, 0);
    assert.ok(existsSync(join(project, ".agents", "skills", SKILL_ID, "SKILL.md")));
    for (const command of REQUIRED_COMMANDS) {
      assert.ok(
        existsSync(join(project, ".opencode", "commands", command)),
        `expected ${command} to be installed`,
      );
    }
  });

  it("installs the skill and all seven commands into a project scope", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    assert.equal(result.skipped.length, 0);
    assert.ok(existsSync(join(project, ".agents", "skills", SKILL_ID, "SKILL.md")));
    assert.ok(existsSync(join(project, ".agents", "skills", SKILL_ID, "references", "status.md")));
    for (const command of REQUIRED_COMMANDS) {
      assert.ok(
        existsSync(join(project, ".opencode", "commands", command)),
        `expected ${command} to be installed`,
      );
    }

    const registry = loadRegistry(scope.registryPath);
    assert.ok(registry, "registry should exist");
    assert.equal(registry.groups.skill.files.length, 8);
    assert.equal(registry.groups.commands.files.length, 7);
  });

  it("installs into the global scope", () => {
    const fixture = makeFixture();
    const home = tmp();
    const scope = resolveScope({ scope: "global", home });
    installAssets({ scope, source: resolveSource(fixture.root) });

    assert.ok(existsSync(join(home, ".agents", "skills", SKILL_ID, "SKILL.md")));
    assert.ok(existsSync(join(home, ".config", "opencode", "commands", "bt_status.md")));
  });

  it("installs into a custom scope", () => {
    const fixture = makeFixture();
    const target = tmp();
    const scope = resolveScope({ scope: "custom", target });
    installAssets({ scope, source: resolveSource(fixture.root) });

    assert.ok(existsSync(join(target, ".agents", "skills", SKILL_ID, "SKILL.md")));
    assert.ok(existsSync(join(target, ".opencode", "commands", "bt_tests.md")));
  });

  it("does not mutate anything during a dry run", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const result = installAssets({ scope, source: resolveSource(fixture.root), dryRun: true });

    assert.ok(result.plan.files.length > 0);
    assert.equal(existsSync(scope.skillDir), false);
    assert.equal(existsSync(scope.commandsDir), false);
    assert.equal(existsSync(scope.registryPath), false);
  });

  it("keeps unregistered colliding files and reports them", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    mkdirSync(scope.commandsDir, { recursive: true });
    const collision = join(scope.commandsDir, "bt_status.md");
    writeFileSync(collision, "user owned\n");

    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    const conflict = result.skipped.find((f) => f.rel === "bt_status.md");
    assert.ok(conflict, "expected a reported conflict");
    assert.equal(conflict.action, "conflict");
    assert.equal(readFileSync(collision, "utf8"), "user owned\n");
  });

  it("overwrites a colliding file when force is given", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    mkdirSync(scope.commandsDir, { recursive: true });
    const collision = join(scope.commandsDir, "bt_status.md");
    writeFileSync(collision, "user owned\n");

    const result = installAssets({ scope, source: resolveSource(fixture.root), force: true });

    assert.equal(result.skipped.length, 0);
    assert.notEqual(readFileSync(collision, "utf8"), "user owned\n");
  });

  it("keeps locally modified installed files", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const skillFile = join(scope.skillDir, "SKILL.md");
    writeFileSync(skillFile, "locally edited\n");

    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    const modified = result.skipped.find((f) => f.rel === "SKILL.md");
    assert.ok(modified, "expected a reported modification");
    assert.equal(modified.action, "modified");
    assert.equal(readFileSync(skillFile, "utf8"), "locally edited\n");
  });

  it("is idempotent: a second install reports everything as unchanged", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    assert.equal(
      result.plan.files.every((f) => f.action === "unchanged"),
      true,
    );
    assert.equal(result.skipped.length, 0);
  });
});

describe("update", () => {
  it("updates installed files from the local package source", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const skillFile = join(scope.skillDir, "SKILL.md");
    writeFileSync(join(fixture.skillDir, "SKILL.md"), "new packaged content\n");

    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    const updated = result.plan.files.find((f) => f.rel === "SKILL.md");
    assert.equal(updated.action, "update");
    assert.equal(readFileSync(skillFile, "utf8"), "new packaged content\n");
  });

  it("removes files that are no longer shipped", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    rmSync(join(fixture.commandsDir, "bt_tests.md"));
    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    assert.equal(existsSync(join(scope.commandsDir, "bt_tests.md")), false);
    const stale = result.plan.stale.find((f) => f.rel === "bt_tests.md");
    assert.ok(stale);
    assert.equal(stale.action, "stale");
  });

  it("removes files that are no longer shipped, but keeps modified ones", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const commandFile = join(scope.commandsDir, "bt_tests.md");
    writeFileSync(commandFile, "hand edited\n");
    rmSync(join(fixture.commandsDir, "bt_tests.md"));

    const result = installAssets({ scope, source: resolveSource(fixture.root) });

    assert.ok(existsSync(commandFile), "modified stale file must be preserved");
    const stale = result.plan.stale.find((f) => f.rel === "bt_tests.md");
    assert.ok(stale);
    assert.equal(stale.action, "modified");
  });
});

describe("uninstall", () => {
  it("removes only registered files and preserves unrelated user files", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const userCommand = join(scope.commandsDir, "my-command.md");
    const userSkillFile = join(scope.skillDir, "my-notes.md");
    writeFileSync(userCommand, "mine\n");
    writeFileSync(userSkillFile, "mine\n");

    const result = uninstallAssets({ scope });

    assert.equal(result.removed.length, 15);
    assert.equal(result.kept.length, 0);
    assert.equal(existsSync(join(scope.skillDir, "SKILL.md")), false);
    assert.equal(existsSync(join(scope.commandsDir, "bt_status.md")), false);
    assert.equal(readFileSync(userCommand, "utf8"), "mine\n");
    assert.equal(readFileSync(userSkillFile, "utf8"), "mine\n");
    assert.equal(existsSync(scope.registryPath), false);
  });

  it("keeps modified files and their registry entry", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const skillFile = join(scope.skillDir, "SKILL.md");
    writeFileSync(skillFile, "hand edited\n");

    const result = uninstallAssets({ scope });

    assert.equal(result.kept.length, 1);
    assert.equal(result.kept[0].path, "SKILL.md");
    assert.equal(readFileSync(skillFile, "utf8"), "hand edited\n");
    assert.equal(existsSync(join(scope.commandsDir, "bt_status.md")), false);
    assert.ok(existsSync(scope.registryPath), "registry must survive for kept files");
    const registry = loadRegistry(scope.registryPath);
    assert.equal(registry.groups.skill.files.length, 1);
    assert.equal(registry.groups.skill.files[0].path, "SKILL.md");
  });

  it("prunes the empty skill directory but keeps the shared commands directory", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    uninstallAssets({ scope });

    assert.equal(existsSync(scope.skillDir), false);
    assert.ok(existsSync(scope.commandsDir), "the commands directory is shared and stays");
  });

  it("does nothing when no installation exists", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const result = uninstallAssets({ scope });
    assert.equal(result.nothing, true);
  });

  it("does not mutate anything during a dry run", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const result = uninstallAssets({ scope, dryRun: true });

    assert.ok(result.removed.length > 0);
    assert.ok(existsSync(join(scope.skillDir, "SKILL.md")));
    assert.ok(existsSync(scope.registryPath));
  });
});
