import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanup, makeFixture, makeTempDir } from "./helpers.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "bt-triage.js");

const dirs = [];
function tmp(prefix = "bt-triage-frontmatter-") {
  const d = makeTempDir(prefix);
  dirs.push(d);
  return d;
}
after(() => {
  for (const d of dirs) cleanup(d);
});

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf8",
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

/**
 * Rewrite the frontmatter of the fixture skill with the compact mapping that
 * breaks every YAML parser: `metadata: opencode/autoinvoke: false`.
 */
function breakSkillFrontmatter(root) {
  writeFileSync(
    join(root, ".agents", "skills", "bead-triage", "SKILL.md"),
    "---\nname: bead-triage\nmetadata: opencode/autoinvoke: false\n---\n\n# Bead Triage\n",
  );
}

describe("doctor frontmatter check", () => {
  it("passes for a package with valid frontmatter", () => {
    const fixture = makeFixture();
    const result = run(["doctor", "--source", fixture.root, "--home", tmp(), "--cwd", tmp()]);
    assert.equal(result.code, 0, result.stdout);
    assert.match(result.stdout, /frontmatter 8 document\(s\)/);
  });

  it("fails when a packaged document carries invalid frontmatter", () => {
    const fixture = makeFixture();
    breakSkillFrontmatter(fixture.root);
    const result = run(["doctor", "--source", fixture.root, "--home", tmp(), "--cwd", tmp()]);
    assert.equal(result.code, 1, "invalid frontmatter must fail the doctor check");
    assert.match(result.stdout, /invalid frontmatter/);
    assert.match(result.stdout, /SKILL\.md/);
  });

  it("detects invalid frontmatter in an installed copy", () => {
    const broken = makeFixture();
    breakSkillFrontmatter(broken.root);
    const valid = makeFixture();
    const home = tmp("bt-triage-frontmatter-home-");
    const cwd = tmp("bt-triage-frontmatter-cwd-");
    const install = run([
      "install",
      "--global",
      "--source",
      broken.root,
      "--home",
      home,
      "--cwd",
      cwd,
    ]);
    assert.equal(install.code, 0, install.stdout);
    const doctor = run(["doctor", "--source", valid.root, "--home", home, "--cwd", cwd]);
    assert.equal(doctor.code, 1, "a broken installed copy must fail the doctor check");
    assert.match(doctor.stdout, /invalid frontmatter/);
    assert.match(doctor.stdout, /bead-triage/);
  });
});
