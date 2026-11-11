import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Build a temporary directory tree that mimics the packaged source layout:
 *   <root>/.agents/skills/bead-triage/SKILL.md
 *   <root>/.agents/skills/bead-triage/references/<mode>.md
 *   <root>/.opencode/commands/bt_*.md
 */
export function makeFixture({ commands } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bt-triage-fixture-"));
  const skillDir = join(root, ".agents", "skills", "bead-triage");
  const commandsDir = join(root, ".opencode", "commands");
  mkdirSync(join(skillDir, "references"), { recursive: true });
  mkdirSync(commandsDir, { recursive: true });

  const skillDoc = [
    "---",
    "name: bead-triage",
    "description: Triage beads work items.",
    "---",
    "",
    "# Bead Triage",
    "",
  ].join("\n");
  writeFileSync(join(skillDir, "SKILL.md"), skillDoc);
  const modes = ["add", "complete", "continue", "reflect", "scaffold", "status", "tests"];
  for (const mode of modes) {
    const body = `# ${mode}\n\nReference for ${mode}.\n`;
    writeFileSync(join(skillDir, "references", `${mode}.md`), body);
  }

  const commandNames = commands ?? [
    "bt_add.md",
    "bt_complete.md",
    "bt_continue.md",
    "bt_reflect.md",
    "bt_scaffold.md",
    "bt_status.md",
    "bt_tests.md",
  ];
  for (const name of commandNames) {
    writeFileSync(join(commandsDir, name), `---\ndescription: ${name}\n---\n\n@bead-triage\n`);
  }

  return { root, skillDir, commandsDir };
}

export function makeTempDir(prefix = "bt-triage-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}
