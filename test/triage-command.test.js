import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = join(REPO_ROOT, "src");
const SKILL_DIR = join(SRC_ROOT, ".agents", "skills", "bead-triage");
const COMMANDS_DIR = join(SRC_ROOT, ".opencode", "commands");
const WRAPPER = join(COMMANDS_DIR, "bt_triage.md");
const TRIAGE_REFERENCE = join(SKILL_DIR, "references", "triage.md");

/** Extract the raw YAML frontmatter of a markdown file; null when absent. */
function readFrontmatter(file) {
  const raw = readFileSync(file, "utf8");
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---", 3);
  assert.notEqual(end, -1, "unterminated frontmatter block");
  return raw.slice(4, end);
}

/** Every reference file the skill's mode map may point at. */
function referenceNames() {
  return readdirSync(join(SKILL_DIR, "references")).filter((name) => name.endsWith(".md"));
}

describe("triage command", () => {
  it("ships a wrapper with a non-empty YAML description", () => {
    assert.ok(existsSync(WRAPPER), "src/.opencode/commands/bt_triage.md must exist");
    const yaml = readFrontmatter(WRAPPER);
    assert.ok(yaml, "bt_triage.md must start with a frontmatter block");
    const parsed = parse(yaml);
    assert.ok(parsed?.description, "bt_triage.md must declare a non-empty description");
  });

  it("selects triage mode and names only references/triage.md", () => {
    const body = readFileSync(WRAPPER, "utf8");
    assert.ok(body.includes("references/triage.md"), "wrapper must load references/triage.md");
    for (const name of referenceNames()) {
      if (name === "triage.md") continue;
      assert.ok(!body.includes(`references/${name}`), `wrapper must not name references/${name}`);
    }
  });

  it("ships the triage mode reference", () => {
    assert.ok(
      existsSync(TRIAGE_REFERENCE),
      "src/.agents/skills/bead-triage/references/triage.md must exist",
    );
  });

  it("requires the six report elements in the triage reference", () => {
    const body = readFileSync(TRIAGE_REFERENCE, "utf8");
    const lower = body.toLowerCase();
    for (const word of ["priority", "reason", "blocker", "next action"]) {
      assert.ok(lower.includes(word), `triage.md must mention ${word}`);
    }
    assert.ok(
      body.includes("/bt_continue <issue-id>"),
      "triage.md must route claiming through /bt_continue <issue-id>",
    );
  });

  it("keeps the triage mode read-only", () => {
    const body = readFileSync(TRIAGE_REFERENCE, "utf8");
    const lower = body.toLowerCase();
    assert.ok(lower.includes("br ready"), "triage.md must discover work through br ready");
    assert.ok(lower.includes("never"), "triage.md must state a never-claim boundary");
    assert.ok(
      body.includes("/bt_continue <issue-id>"),
      "triage.md must name the explicit claiming route",
    );
  });

  it("lists triage among the skill modes and maps it to references/triage.md", () => {
    const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
    assert.ok(
      /\bcontinue\b[\s\S]*\btriage\b|\btriage\b[\s\S]*\bcontinue\b/.test(skill),
      "SKILL.md usage line must list triage alongside the other modes",
    );
    assert.ok(
      skill.includes("`references/triage.md`"),
      "SKILL.md mode map must map triage to references/triage.md",
    );
  });
});
