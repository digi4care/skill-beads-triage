import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  buildPlan,
  installAssets,
  isSafeRelativePath,
  isValidSha256,
  loadRegistry,
  resolveScope,
  resolveSource,
  SKILL_ID,
  uninstallAssets,
} from "../bin/bt-triage.js";
import { cleanup, makeFixture, makeTempDir } from "./helpers.js";

const dirs = [];
function tmp() {
  const d = makeTempDir("bt-triage-security-");
  dirs.push(d);
  return d;
}

after(() => {
  for (const d of dirs) cleanup(d);
});

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Write a legacy (v1) registry by hand, so a malformed or malicious one can be simulated. */
function writeRegistryFile(scope, groups) {
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

/** Write a registry object verbatim, so a v2 registry can be tampered with. */
function writeRegistryObject(scope, registry) {
  writeFileSync(scope.registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

/** The OpenCode command group of a registry, in the current (v2) schema. */
function openCodeCommands(registry) {
  return registry.harnesses.opencode.commands;
}

describe("registry path validation", () => {
  it("accepts plain and nested relative paths", () => {
    assert.equal(isSafeRelativePath("SKILL.md"), true);
    assert.equal(isSafeRelativePath("references/status.md"), true);
    assert.equal(isSafeRelativePath("references/nested/deep/file.md"), true);
  });

  it("rejects escaping, absolute and malformed paths", () => {
    for (const bad of [
      "../outside.md",
      "../../outside.md",
      "references/../../outside.md",
      "/etc/passwd",
      "/tmp/absolute.md",
      "C:\\Windows\\system32",
      "..\\outside.md",
      "./relative.md",
      "",
      "a//b.md",
    ]) {
      assert.equal(
        isSafeRelativePath(bad),
        false,
        `expected ${JSON.stringify(bad)} to be rejected`,
      );
    }
  });

  it("validates sha256 checksums", () => {
    assert.equal(isValidSha256("a".repeat(64)), true);
    assert.equal(isValidSha256("A".repeat(64)), true);
    assert.equal(isValidSha256("not-a-hash"), false);
    assert.equal(isValidSha256(""), false);
    assert.equal(isValidSha256(undefined), false);
    assert.equal(isValidSha256(null), false);
    assert.equal(isValidSha256(123), false);
  });

  it("refuses a registry with an escaping path", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    writeRegistryFile(scope, {
      skill: { dest: scope.skillDir, files: [{ path: "../outside.md", sha256: "a".repeat(64) }] },
      commands: { dest: scope.commandsDir, files: [] },
    });
    const registry = loadRegistry(scope.registryPath);
    assert.equal(registry.corrupt, true);
    assert.match(registry.reason, /unsafe or malformed file path/);
  });

  it("refuses a registry with an absolute path", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    writeRegistryFile(scope, {
      skill: { dest: scope.skillDir, files: [{ path: "/etc/passwd", sha256: "a".repeat(64) }] },
      commands: { dest: scope.commandsDir, files: [] },
    });
    assert.equal(loadRegistry(scope.registryPath).corrupt, true);
  });
});

describe("adversarial registries", () => {
  it("does not delete a file outside the scope on uninstall", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });

    const outside = join(project, "outside.md");
    writeFileSync(outside, "user data\n");
    writeRegistryFile(scope, {
      skill: { dest: scope.skillDir, files: [{ path: "../outside.md", sha256: "a".repeat(64) }] },
      commands: { dest: scope.commandsDir, files: [] },
    });

    assert.throws(
      () => uninstallAssets({ scope }),
      /corrupt/i,
      "uninstall must refuse an unsafe registry",
    );
    assert.equal(existsSync(outside), true, "the file outside the scope must survive");
    assert.equal(readFileSync(outside, "utf8"), "user data\n");
  });

  it("does not delete a file outside the scope on install/update", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });

    const outside = join(project, "outside.md");
    writeFileSync(outside, "user data\n");
    writeRegistryFile(scope, {
      skill: { dest: scope.skillDir, files: [{ path: "../outside.md", sha256: "a".repeat(64) }] },
      commands: { dest: scope.commandsDir, files: [] },
    });

    assert.throws(() => installAssets({ scope, source: resolveSource(fixture.root) }), /corrupt/i);
    assert.equal(existsSync(outside), true);
    assert.equal(readFileSync(outside, "utf8"), "user data\n");
    assert.equal(existsSync(join(project, ".agents")), false, "nothing may be written");
  });

  it("does not delete an absolute path on uninstall", () => {
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const outside = tmp();
    const victim = join(outside, "victim.md");
    writeFileSync(victim, "user data\n");

    writeRegistryFile(scope, {
      skill: { dest: scope.skillDir, files: [{ path: victim, sha256: sha256File(victim) }] },
      commands: { dest: scope.commandsDir, files: [] },
    });

    assert.throws(() => uninstallAssets({ scope }), /corrupt/i);
    assert.equal(existsSync(victim), true, "the absolute path target must survive");
    assert.equal(readFileSync(victim, "utf8"), "user data\n");
  });

  it("keeps a registered file whose checksum is missing", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const registry = loadRegistry(scope.registryPath);
    const installed = join(project, ".opencode", "commands", "bt_status.md");
    const commands = openCodeCommands(registry);
    commands.files = commands.files.map((entry) =>
      entry.path === "bt_status.md" ? { path: entry.path } : entry,
    );
    writeRegistryObject(scope, registry);

    const result = uninstallAssets({ scope });
    assert.ok(
      result.kept.some((f) => f.path === "bt_status.md"),
      "the file without a checksum must be kept",
    );
    assert.equal(existsSync(installed), true, "the file without a checksum must survive");
    assert.ok(
      !result.removed.some((f) => f.path === "bt_status.md"),
      "the file without a checksum must not be reported as removed",
    );
    assert.ok(
      result.removed.some((f) => f.path === "bt_add.md"),
      "the other registered files are still removed",
    );
  });

  it("keeps a registered file whose checksum is invalid", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const registry = loadRegistry(scope.registryPath);
    registry.harnesses.opencode.skill.files = registry.harnesses.opencode.skill.files.map(
      (entry) => (entry.path === "SKILL.md" ? { path: entry.path, sha256: "not-a-hash" } : entry),
    );
    writeRegistryObject(scope, registry);

    const installed = join(project, ".agents", "skills", SKILL_ID, "SKILL.md");
    const result = uninstallAssets({ scope });
    assert.ok(result.kept.some((f) => f.path === "SKILL.md"));
    assert.equal(existsSync(installed), true, "the file with an invalid checksum must survive");
  });

  it("does not remove a modified file during an uninstall with a broken checksum", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const installed = join(project, ".opencode", "commands", "bt_tests.md");
    writeFileSync(installed, "hand edited\n");

    const registry = loadRegistry(scope.registryPath);
    const commands = openCodeCommands(registry);
    commands.files = commands.files.map((entry) =>
      entry.path === "bt_tests.md" ? { path: entry.path } : entry,
    );
    writeRegistryObject(scope, registry);

    const result = uninstallAssets({ scope });
    assert.ok(result.kept.some((f) => f.path === "bt_tests.md"));
    assert.equal(readFileSync(installed, "utf8"), "hand edited\n");
  });

  it("reports an unsafe registry path as unsafe in the plan instead of deleting it", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    const source = resolveSource(fixture.root);

    const registry = {
      package: "@digi4care/skill-beads-triage",
      version: "0.1.0",
      groups: {
        skill: { dest: scope.skillDir, files: [{ path: "../outside.md", sha256: "a".repeat(64) }] },
        commands: { dest: scope.commandsDir, files: [] },
      },
    };
    const plan = buildPlan({ scope, source, registry });
    const unsafe = plan.stale.find((f) => f.rel === "../outside.md");
    assert.ok(unsafe, "the escaping entry must be part of the plan");
    assert.equal(unsafe.action, "unsafe");
    assert.equal(unsafe.dest, null);
    assert.ok(plan.problems.some((p) => p.rel === "../outside.md"));
  });

  it("keeps a nested relative path working", () => {
    const fixture = makeFixture();
    const project = tmp();
    const scope = resolveScope({ scope: "project", cwd: project });
    installAssets({ scope, source: resolveSource(fixture.root) });

    const nested = join(project, ".agents", "skills", SKILL_ID, "references", "status.md");
    assert.equal(existsSync(nested), true);
    const result = uninstallAssets({ scope });
    assert.ok(result.removed.some((f) => f.path === "references/status.md"));
    assert.equal(existsSync(nested), false);
  });
});
