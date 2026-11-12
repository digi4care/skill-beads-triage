#!/usr/bin/env node
/**
 * Verify the artifact that users install, not just the working tree.
 *
 * The test suite validates the sources in `src/`. This script validates the
 * packed tarball, which is what npm publishes and what `npx` installs. It
 * checks that:
 *
 *   - the tarball contains the canonical skill and all seven command wrappers
 *   - every packaged markdown document with a frontmatter block parses as YAML
 *   - the canonical skill declares the portable `disable-model-invocation` field
 *
 * The tarball is read with a minimal tar reader (zlib plus the ustar header
 * format) so the check adds no runtime dependency and stays portable.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse as parseYaml } from "yaml";

const BLOCK = 512;
const REQUIRED_COMMANDS = [
  "bt_add.md",
  "bt_complete.md",
  "bt_continue.md",
  "bt_reflect.md",
  "bt_scaffold.md",
  "bt_status.md",
  "bt_tests.md",
];
const SKILL_MEMBER = "package/src/.agents/skills/bead-triage/SKILL.md";
const COMMAND_MEMBER = (name) => `package/src/.opencode/commands/${name}`;

/**
 * Read the entries of an uncompressed tar archive.
 * @param {Buffer} buffer tar archive
 * @returns {{ name: string, type: string, data: Buffer }[]}
 */
export function readTarEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK);
    let empty = true;
    for (const byte of header) {
      if (byte !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break;
    const name = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const sizeField = header.toString("ascii", 124, 136).replace(/\0/g, "").trim();
    const size = sizeField ? Number.parseInt(sizeField, 8) : 0;
    const type = String.fromCharCode(header[156] || 0x30);
    const start = offset + BLOCK;
    entries.push({ name, type, data: buffer.subarray(start, start + size) });
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}

/**
 * Extract the YAML frontmatter of a markdown document.
 * @returns {{ yaml: string|null, error: string|null }}
 */
export function frontmatterOf(raw) {
  if (!raw.startsWith("---\n")) return { yaml: null, error: null };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { yaml: null, error: "unterminated frontmatter block" };
  const yaml = raw.slice(4, end);
  try {
    parseYaml(yaml);
  } catch (err) {
    return {
      yaml,
      error: String(err?.message ?? err)
        .split("\n")[0]
        .trim(),
    };
  }
  return { yaml, error: null };
}

function main() {
  const tmp = mkdtempSync(join(tmpdir(), "bt-triage-pack-"));
  const problems = [];
  try {
    const stdout = execFileSync("npm", ["pack", "--json", "--pack-destination", tmp], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(stdout);
    // npm 11 reports one object per package, older npm reports an array.
    const info = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
    if (!info?.filename) {
      problems.push("npm pack did not report a tarball filename");
    } else {
      const entries = readTarEntries(gunzipSync(readFileSync(join(tmp, info.filename))));
      const names = new Set(entries.map((entry) => entry.name));
      const read = (name) => entries.find((entry) => entry.name === name)?.data;

      if (!names.has(SKILL_MEMBER)) problems.push(`missing ${SKILL_MEMBER}`);
      for (const command of REQUIRED_COMMANDS) {
        if (!names.has(COMMAND_MEMBER(command)))
          problems.push(`missing ${COMMAND_MEMBER(command)}`);
      }

      let checked = 0;
      const requiredMembers = new Set([SKILL_MEMBER, ...REQUIRED_COMMANDS.map(COMMAND_MEMBER)]);
      for (const entry of entries) {
        if (entry.type !== "0" && entry.type !== "") continue;
        if (!entry.name.startsWith("package/src/") || !entry.name.endsWith(".md")) continue;
        const raw = entry.data.toString("utf8");
        const { yaml, error } = frontmatterOf(raw);
        if (error) {
          problems.push(`${entry.name}: ${error}`);
        } else if (requiredMembers.has(entry.name) && yaml === null) {
          problems.push(`${entry.name}: missing frontmatter block`);
        }
        checked += 1;
      }

      const skill = read(SKILL_MEMBER);
      if (skill) {
        const { yaml } = frontmatterOf(skill.toString("utf8"));
        if (yaml !== null) {
          const data = parseYaml(yaml);
          if (data["disable-model-invocation"] !== true) {
            problems.push(`${SKILL_MEMBER}: disable-model-invocation is not true`);
          }
        }
      }

      console.log(`bt-triage verify:package`);
      console.log(`  tarball: ${info.filename} (${info.entryCount ?? entries.length} entries)`);
      console.log(
        `  ${problems.length === 0 ? "✔" : "✖"} frontmatter ${checked} packaged document(s)`,
      );
      for (const problem of problems) console.log(`    ✖ ${problem}`);
    }
  } catch (err) {
    console.error(`verify:package failed: ${err?.message ?? err}`);
    return 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return problems.length === 0 ? 0 : 1;
}

process.exit(main());
