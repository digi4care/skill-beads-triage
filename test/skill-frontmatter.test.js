import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { frontmatterProblem } from "../bin/bt-triage.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = join(REPO_ROOT, "src");
const SKILL_DIR = join(SRC_ROOT, ".agents", "skills", "bead-triage");
const CANONICAL_SKILL = join(SKILL_DIR, "SKILL.md");

/** Collect every packaged markdown file below the source tree. */
function collectMarkdown(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectMarkdown(full));
    } else if (entry.endsWith(".md")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Extract the raw YAML frontmatter of a markdown file.
 * Returns null for files without a frontmatter block.
 */
function readFrontmatter(file) {
  const raw = readFileSync(file, "utf8");
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---", 3);
  assert.notEqual(end, -1, `${relative(REPO_ROOT, file)} has an unterminated frontmatter block`);
  return raw.slice(4, end);
}

describe("packaged frontmatter", () => {
  it("parses every packaged frontmatter block as valid YAML", () => {
    for (const file of collectMarkdown(SRC_ROOT)) {
      const yaml = readFrontmatter(file);
      if (yaml === null) continue;
      // A malformed frontmatter block makes the harness skip the file
      // silently, so the defect has to fail the test suite instead.
      assert.doesNotThrow(
        () => parse(yaml),
        `${relative(REPO_ROOT, file)} has frontmatter that no YAML parser accepts`,
      );
    }
  });

  it("keeps the canonical skill addressable by name and description", () => {
    const yaml = readFrontmatter(CANONICAL_SKILL);
    assert.notEqual(yaml, null, "the canonical skill must carry frontmatter");
    const data = parse(yaml);
    assert.equal(data.name, "bead-triage");
    assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(data.name.length <= 64);
    assert.equal(typeof data.description, "string");
    assert.ok(data.description.length > 0);
    assert.ok(data.description.length <= 1024);
  });

  it("disables model invocation through the portable frontmatter field", () => {
    const yaml = readFrontmatter(CANONICAL_SKILL);
    const data = parse(yaml);
    // Every adapter shares this one skill file. `disable-model-invocation` is
    // the field OpenCode, Pi and Claude Code all honour; an OpenCode-only
    // metadata key would leave the other adapters auto-invoking the skill.
    assert.equal(data["disable-model-invocation"], true);
  });

  it("gives every OpenCode command wrapper a description", () => {
    const commandDir = join(SRC_ROOT, ".opencode", "commands");
    const commands = readdirSync(commandDir).filter((name) => name.endsWith(".md"));
    assert.equal(commands.length, 7);
    for (const name of commands) {
      const yaml = readFrontmatter(join(commandDir, name));
      assert.notEqual(yaml, null, `${name} must carry frontmatter`);
      const data = parse(yaml);
      assert.equal(typeof data.description, "string");
      assert.ok(data.description.length > 0);
    }
  });

  it("reaches the same verdict as a YAML parser on every packaged document", () => {
    // The CLI judges frontmatter without a YAML parser, because a release
    // artifact has to work without an installed dependency tree. Both judges
    // must agree on the documents this package ships.
    for (const file of collectMarkdown(SRC_ROOT)) {
      const yaml = readFrontmatter(file);
      if (yaml === null) continue;
      let parses = true;
      try {
        parse(yaml);
      } catch {
        parses = false;
      }
      const problem = frontmatterProblem(file);
      assert.equal(
        problem === null,
        parses,
        `${relative(REPO_ROOT, file)}: dependency-free check reports "${problem ?? "no problem"}", YAML parser reports "${parses ? "valid" : "invalid"}"`,
      );
    }
  });

  it("flags the compact nested mapping that broke the shipped skill", () => {
    const dir = mkdtempSync(join(tmpdir(), "bt-triage-frontmatter-"));
    const file = join(dir, "SKILL.md");
    writeFileSync(
      file,
      "---\nname: bead-triage\nmetadata: opencode/autoinvoke: false\n---\n\n# Bead Triage\n",
    );
    const problem = frontmatterProblem(file);
    assert.notEqual(problem, null, "a compact nested mapping must be reported");
    assert.match(problem, /nested mapping/);
  });
});
