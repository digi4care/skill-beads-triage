#!/usr/bin/env node
/**
 * bt-triage - installer for the bead-triage skill and the /bt_* OpenCode commands.
 *
 * Product: @digi4care/skill-beads-triage
 *
 * Canonical sources (inside this package):
 *   src/.agents/skills/bead-triage/   -> SKILL.md + references/
 *   src/.opencode/commands/           -> bt_*.md command templates
 *
 * Every adapter installs the one canonical skill. Only the OpenCode adapter
 * additionally installs the command templates.
 *
 * Harness adapters (declarative, see HARNESS_TABLE):
 *   opencode  skill .agents/skills/bead-triage   commands .opencode/commands
 *   claude    skill .claude/skills/bead-triage   (no commands)
 *   codex     skill .agents/skills/bead-triage   (no commands)
 *   pi        skill .agents/skills/bead-triage   (no commands)
 *   agents    skill .agents/skills/bead-triage   (no commands)
 *
 * The global scope uses the same relative paths under the home directory; the
 * OpenCode command directory is the documented global compatibility path
 * <home>/.config/opencode/commands.
 *
 * Safety model:
 *   - One registry per scope root (.bt-triage-registry.json) tracks every file
 *     this installer wrote, per harness, together with its sha256 checksum.
 *   - Several harnesses share one destination (for example .agents/skills).
 *     A file is owned by every harness that registered it and is only removed
 *     after its last owner is gone.
 *   - Uninstall removes only registered files, and only when the file on disk is
 *     still byte-identical to the registered checksum. Modified files are kept.
 *   - Unregistered user files are never touched. No recursive directory deletion
 *     is used anywhere.
 *   - Collisions (target file exists but is not ours) are reported and skipped
 *     unless --force is given.
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve a path to its real, symlink-free form.
 *
 * Falls back to the plain resolved path when the file cannot be resolved (for
 * example when it does not exist).
 */
export function realPathOrResolve(filePath) {
  try {
    return realpathSync(filePath);
  } catch {
    return resolve(filePath);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(realPathOrResolve(__filename));

/** Root of the installed package (the directory holding package.json). */
export const PACKAGE_ROOT = resolve(__dirname, "..");

/**
 * True when this module is the entry point of the current process.
 *
 * npm installs the CLI as a symlink:
 *   <prefix>/bin/bt-triage -> ../lib/node_modules/<pkg>/bin/bt-triage.js
 * Node resolves the main entry to its real path, so `import.meta.url` and
 * `process.argv[1]` point at two different paths for the very same file. A
 * plain string comparison therefore never matches and the CLI stays silent.
 *
 * Comparing the real paths of both sides keeps the CLI working for a symlinked
 * install, for a direct `node bin/bt-triage.js` call and for the shebang, while
 * an import from another module (a different real path) still does not run the
 * CLI.
 */
export function isMainModule(argv = process.argv, moduleUrl = import.meta.url) {
  const entry = argv[1];
  if (!entry) return false;
  return realPathOrResolve(entry) === realPathOrResolve(fileURLToPath(moduleUrl));
}

/** The package this installer belongs to. */
export const EXPECTED_PACKAGE_NAME = "@digi4care/skill-beads-triage";

function readPackageJson(root = PACKAGE_ROOT) {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return { name: EXPECTED_PACKAGE_NAME, version: "0.0.0" };
  }
}

export const packageJson = readPackageJson();
export const packageName = packageJson.name;
export const version = packageJson.version;

/** Skill id; every harness derives the skill id from the directory name. */
export const SKILL_ID = "bead-triage";

/** The seven command templates shipped by this package. */
export const REQUIRED_COMMANDS = [
  "bt_add.md",
  "bt_complete.md",
  "bt_continue.md",
  "bt_reflect.md",
  "bt_scaffold.md",
  "bt_status.md",
  "bt_tests.md",
];

export const REGISTRY_FILENAME = ".bt-triage-registry.json";

/** Current registry schema version. */
export const REGISTRY_SCHEMA_VERSION = 2;

/**
 * The declarative adapter table.
 *
 * `skill` is the path of the skill directory relative to the scope root.
 * `commands` is the path of the command directory relative to the scope root,
 * per scope kind; a harness without commands installs the skill only.
 */
export const HARNESS_TABLE = {
  opencode: {
    label: "OpenCode",
    skill: [".agents", "skills", SKILL_ID],
    commands: {
      project: [".opencode", "commands"],
      custom: [".opencode", "commands"],
      global: [".config", "opencode", "commands"],
    },
  },
  claude: {
    label: "Claude Code",
    skill: [".claude", "skills", SKILL_ID],
  },
  codex: {
    label: "Codex CLI",
    skill: [".agents", "skills", SKILL_ID],
  },
  pi: {
    label: "Pi",
    skill: [".agents", "skills", SKILL_ID],
  },
  agents: {
    label: "Generic Agent Skills",
    skill: [".agents", "skills", SKILL_ID],
  },
};

/** All known harness ids, in a stable order. */
export const HARNESS_IDS = Object.keys(HARNESS_TABLE);

/** The harness used when no `--harness` flag is given. */
export const DEFAULT_HARNESS = "opencode";

/** The selection keyword that means "every known harness". */
export const ALL_HARNESSES = "all";

// ─── Small helpers ───────────────────────────────────────────────────────────

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function toPosix(p) {
  return p.split(/[\\/]/).join("/");
}

/** Relative file paths (posix) of every file below `dir`, sorted. */
export function listFilesRecursive(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else if (entry.isFile()) {
      out.push(toPosix(relative(base, full)));
    }
  }
  return out.sort();
}

/**
 * Remove empty directories below `root`, deepest first.
 *
 * Only directories that are empty are removed (rmdirSync refuses otherwise), so
 * no user file can be lost. `root` itself is kept unless it is empty and
 * `removeRoot` is set.
 */
function pruneEmptyDirs(root, { removeRoot = false } = {}) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    pruneEmptyDirs(full, { removeRoot: true });
  }
  if (removeRoot) {
    try {
      rmdirSync(root);
    } catch {
      // Not empty: keep it.
    }
  }
}

// ─── Harness adapters ────────────────────────────────────────────────────────

/**
 * The groups a harness installs: always the skill, plus commands for the
 * harnesses that document a command directory.
 */
export function harnessGroups(harnessId) {
  const def = HARNESS_TABLE[harnessId];
  if (!def) throw new Error(`Unknown harness "${harnessId}"`);
  const groups = ["skill"];
  if (def.commands) groups.push("commands");
  return groups;
}

/**
 * The absolute destination directory of one group of one harness.
 *
 * The scope root is the home directory for the global scope, the working
 * directory for the project scope and the target directory for a custom scope.
 */
export function harnessDest(scope, harnessId, group) {
  const def = HARNESS_TABLE[harnessId];
  if (!def) throw new Error(`Unknown harness "${harnessId}"`);
  if (group === "skill") return join(scope.root, ...def.skill);
  if (group === "commands") {
    if (!def.commands) throw new Error(`Harness "${harnessId}" installs no command files`);
    const rel = def.commands[scope.kind] ?? def.commands.project;
    return join(scope.root, ...rel);
  }
  throw new Error(`Unknown group "${group}"`);
}

/**
 * Resolve a `--harness` selection into a list of harness ids.
 *
 * Accepts a single harness id, the keyword "all" or a comma separated list.
 * An unknown id is an error, so a typo never silently installs nothing.
 */
export function resolveHarnessSelection(selection) {
  if (selection === undefined || selection === null || selection === true) {
    return [DEFAULT_HARNESS];
  }
  const raw = Array.isArray(selection) ? selection : String(selection).split(",");
  const out = [];
  for (const item of raw) {
    const name = String(item).trim().toLowerCase();
    if (!name) continue;
    if (name === ALL_HARNESSES) {
      for (const id of HARNESS_IDS) if (!out.includes(id)) out.push(id);
      continue;
    }
    if (!HARNESS_TABLE[name]) {
      throw new Error(
        `Unknown harness "${name}". Known harnesses: ${HARNESS_IDS.join(", ")}, ${ALL_HARNESSES}.`,
      );
    }
    if (!out.includes(name)) out.push(name);
  }
  if (out.length === 0) return [DEFAULT_HARNESS];
  return out;
}

// ─── Scope and source resolution ────────────────────────────────────────────

/**
 * Resolve one installation scope.
 *
 * @param {object} options
 * @param {"global"|"project"|"custom"} options.scope
 * @param {string} [options.target] custom root directory
 * @param {string} [options.home] home directory (injectable)
 * @param {string} [options.cwd] working directory (injectable)
 */
export function resolveScope({ scope = "project", target, home, cwd } = {}) {
  const homeDir = resolve(home ?? homedir());
  const cwdDir = resolve(cwd ?? process.cwd());

  if (scope === "global") {
    const root = homeDir;
    return {
      kind: "global",
      label: "global",
      root,
      // Backwards compatible aliases: the OpenCode destinations.
      skillDir: harnessDest({ kind: "global", root }, "opencode", "skill"),
      commandsDir: harnessDest({ kind: "global", root }, "opencode", "commands"),
      registryPath: join(root, REGISTRY_FILENAME),
    };
  }
  if (scope === "custom") {
    if (!target) throw new Error("Custom scope requires a target directory");
    const root = resolve(target);
    return {
      kind: "custom",
      label: `custom (${root})`,
      root,
      skillDir: harnessDest({ kind: "custom", root }, "opencode", "skill"),
      commandsDir: harnessDest({ kind: "custom", root }, "opencode", "commands"),
      registryPath: join(root, REGISTRY_FILENAME),
    };
  }
  const root = cwdDir;
  return {
    kind: "project",
    label: "project",
    root,
    skillDir: harnessDest({ kind: "project", root }, "opencode", "skill"),
    commandsDir: harnessDest({ kind: "project", root }, "opencode", "commands"),
    registryPath: join(root, REGISTRY_FILENAME),
  };
}

/**
 * Resolve the canonical asset sources.
 * @param {string} [sourceRoot] root that contains `.agents/` and `.opencode/`
 */
export function resolveSource(sourceRoot) {
  const root = resolve(sourceRoot ?? join(PACKAGE_ROOT, "src"));
  return {
    root,
    skillDir: join(root, ".agents", "skills", SKILL_ID),
    commandsDir: join(root, ".opencode", "commands"),
  };
}

function sourceDestDir(source, group) {
  return group === "skill" ? source.skillDir : source.commandsDir;
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────

/**
 * Judge one frontmatter scalar.
 *
 * A plain scalar cannot contain ": ": that is the compact mapping that YAML
 * rejects with "nested mappings are not allowed in compact mappings". A quoted
 * scalar may contain anything as long as its quote is closed.
 *
 * @param {string} value scalar text
 * @returns {string|null} a message describing the problem, or null
 */
function frontmatterScalarProblem(value) {
  if (value === "") return null;
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    if (value.length < 2 || value.at(-1) !== quote) return "unterminated quoted value";
    return null;
  }
  if (value.startsWith("[") || value.startsWith("{") || value.startsWith("-")) {
    return "unsupported frontmatter value";
  }
  if (value.includes(": ") || value.endsWith(":")) {
    return "nested mapping in a compact value";
  }
  return null;
}

/**
 * Check the YAML frontmatter of a markdown document.
 *
 * A harness skips a document whose frontmatter cannot be parsed, so a broken
 * block turns a shipped asset into dead weight without any visible error.
 *
 * The installer runs from a downloaded release artifact without an installed
 * dependency tree, so this judges the frontmatter subset the package uses
 * instead of parsing YAML: top level keys, optional nested blocks, and quoted
 * or plain scalars. Anything outside that subset is reported instead of
 * passing silently.
 *
 * @param {string} filePath document to check
 * @param {{ required?: boolean }} [options] when required, a document without a
 *   frontmatter block counts as a problem
 * @returns {string|null} a message describing the problem, or null when the
 *   document has no frontmatter block or that block is acceptable
 */
export function frontmatterProblem(filePath, { required = false } = {}) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (!raw.startsWith("---\n")) {
    return required ? "missing frontmatter block" : null;
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return "unterminated frontmatter block";
  const lines = raw.slice(4, end).split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    const nested = /^\s+([A-Za-z0-9_./-]+):(\s+(.*))?$/.exec(line);
    if (nested) {
      const problem = frontmatterScalarProblem((nested[3] ?? "").trim());
      if (problem) return `line ${index + 1}: ${problem}`;
      continue;
    }
    const top = /^([A-Za-z0-9_./-]+):(\s+(.*))?$/.exec(line);
    if (!top) return `line ${index + 1}: unsupported frontmatter line: ${line.trim()}`;
    const value = (top[3] ?? "").trim();
    if (value === "") continue;
    const problem = frontmatterScalarProblem(value);
    if (problem) return `line ${index + 1}: ${problem}`;
  }
  return null;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

/** True when `value` is a usable sha256 hex digest. */
export function isValidSha256(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

/**
 * True when `rel` is a relative path that can only address a file inside the
 * destination directory of its group.
 *
 * Absolute paths, drive letters, empty segments and any `..` segment are
 * rejected: a registry must never be able to point outside its scope.
 */
export function isSafeRelativePath(rel) {
  if (typeof rel !== "string" || rel.length === 0) return false;
  if (rel.includes("\0")) return false;
  if (rel.includes("\\")) return false;
  if (rel.startsWith("/") || rel.startsWith("\\")) return false;
  if (/^[A-Za-z]:[\\/]/.test(rel)) return false;
  for (const part of rel.split("/")) {
    if (part === "" || part === "." || part === "..") return false;
  }
  return true;
}

/**
 * Join a validated relative path to a destination directory.
 *
 * Returns null when the result would leave `destDir`, so a caller can fail
 * closed instead of touching a file outside the scope.
 */
export function safeJoin(destDir, rel) {
  if (!isSafeRelativePath(rel)) return null;
  const base = resolve(destDir);
  const dest = resolve(base, ...rel.split("/"));
  if (dest !== base && !dest.startsWith(base + sep)) return null;
  return dest;
}

function corrupt(reason) {
  return { corrupt: true, reason };
}

/**
 * Migrate a legacy (v1) registry object to the current schema.
 *
 * A v1 registry has no `schemaVersion` and holds a flat `groups` section with a
 * skill group and a command group. Those files were only ever installed by the
 * OpenCode adapter, so a v1 registry migrates transparently to an OpenCode
 * owned v2 registry.
 */
export function migrateRegistry(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return corrupt("registry is not an object");
  }
  const version = data.schemaVersion ?? 1;
  if (version === 1) {
    if (!data.groups || typeof data.groups !== "object") {
      return corrupt("missing groups section");
    }
    const harnesses = {};
    const groups = {};
    for (const group of ["skill", "commands"]) {
      const g = data.groups[group];
      if (!g || typeof g !== "object") continue;
      if (typeof g.dest !== "string" || g.dest.length === 0) {
        return corrupt(`missing destination for group "${group}"`);
      }
      if (!Array.isArray(g.files)) {
        return corrupt(`missing file list for group "${group}"`);
      }
      groups[group] = { dest: g.dest, files: g.files };
    }
    if (Object.keys(groups).length === 0) {
      return corrupt("missing groups section");
    }
    harnesses.opencode = groups;
    return {
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      package: data.package ?? packageName,
      version: data.version ?? version,
      installedAt: data.installedAt ?? new Date().toISOString(),
      scope: data.scope,
      root: data.root,
      harnesses,
      migrated: true,
    };
  }
  if (version !== REGISTRY_SCHEMA_VERSION) {
    return corrupt(`unsupported registry schema version ${version}`);
  }
  if (!data.harnesses || typeof data.harnesses !== "object" || Array.isArray(data.harnesses)) {
    return corrupt("missing harnesses section");
  }
  return { ...data, schemaVersion: REGISTRY_SCHEMA_VERSION, migrated: false };
}

/**
 * Validate the structure of a v2 registry.
 *
 * Every check fails closed: an unknown harness, an unknown group, a missing
 * destination, a missing file list, an unsafe path or a destination that does
 * not match the documented adapter path makes the whole registry unusable.
 */
export function validateRegistry(registry, { scope } = {}) {
  if (!registry || typeof registry !== "object") return corrupt("registry is not an object");
  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    return corrupt(`unsupported registry schema version ${registry.schemaVersion}`);
  }
  const harnesses = registry.harnesses;
  if (!harnesses || typeof harnesses !== "object" || Array.isArray(harnesses)) {
    return corrupt("missing harnesses section");
  }
  for (const [harnessId, groups] of Object.entries(harnesses)) {
    if (!HARNESS_TABLE[harnessId]) {
      return corrupt(`unknown harness in registry: ${JSON.stringify(harnessId)}`);
    }
    if (!groups || typeof groups !== "object" || Array.isArray(groups)) {
      return corrupt(`malformed harness section: ${harnessId}`);
    }
    for (const [group, section] of Object.entries(groups)) {
      if (group !== "skill" && group !== "commands") {
        return corrupt(`unknown group in registry: ${JSON.stringify(group)}`);
      }
      if (!section || typeof section !== "object") {
        return corrupt(`malformed group section: ${harnessId}/${group}`);
      }
      if (typeof section.dest !== "string" || section.dest.length === 0) {
        return corrupt(`missing destination for group "${group}" of harness "${harnessId}"`);
      }
      if (!Array.isArray(section.files)) {
        return corrupt(`missing file list for group "${group}" of harness "${harnessId}"`);
      }
      if (scope) {
        let expected;
        try {
          expected = harnessDest(scope, harnessId, group);
        } catch {
          return corrupt(`harness "${harnessId}" does not install group "${group}"`);
        }
        if (resolve(section.dest) !== resolve(expected)) {
          return corrupt(
            `unexpected destination for ${harnessId}/${group}: ${section.dest} ` +
              `(expected ${expected})`,
          );
        }
      }
      for (const entry of section.files) {
        if (!entry || typeof entry !== "object" || !isSafeRelativePath(entry.path)) {
          // Fail closed: a registry that points outside its scope is never used.
          return corrupt(
            `unsafe or malformed file path in group "${group}"` +
              (entry && typeof entry.path === "string" ? `: ${JSON.stringify(entry.path)}` : ""),
          );
        }
      }
    }
  }
  return registry;
}

export function loadRegistry(registryPath, { scope } = {}) {
  if (!existsSync(registryPath)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch {
    return corrupt("not valid JSON");
  }
  const migrated = migrateRegistry(data);
  if (migrated.corrupt) return migrated;
  const validated = validateRegistry(migrated, { scope });
  if (validated.corrupt) return validated;
  return migrated;
}

function writeRegistry(registryPath, data) {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// ─── Source assets ──────────────────────────────────────────────────────────

/**
 * Collect the source asset list. Throws when a mandatory source is missing.
 */
export function collectSourceAssets(source, { requireAll = true } = {}) {
  if (!existsSync(source.skillDir)) {
    throw new Error(`Skill source not found: ${source.skillDir}`);
  }
  if (!existsSync(join(source.skillDir, "SKILL.md"))) {
    throw new Error(`SKILL.md not found in skill source: ${source.skillDir}`);
  }
  const skill = listFilesRecursive(source.skillDir);
  const commands = existsSync(source.commandsDir)
    ? listFilesRecursive(source.commandsDir).filter((f) => f.endsWith(".md"))
    : [];
  if (requireAll) {
    const missing = REQUIRED_COMMANDS.filter((c) => !commands.includes(c));
    if (missing.length > 0) {
      throw new Error(
        `Command source is incomplete, missing: ${missing.join(", ")} ` +
          `(expected in ${source.commandsDir})`,
      );
    }
  }
  return { skill, commands };
}

// ─── Ownership bookkeeping ───────────────────────────────────────────────────

function ownershipKey(dest, rel) {
  return `${dest}\u0000${rel}`;
}

function splitOwnershipKey(key) {
  const index = key.indexOf("\u0000");
  return [key.slice(0, index), key.slice(index + 1)];
}

/**
 * Build the ownership map of a registry.
 *
 * The map is keyed by destination directory and relative path and holds the
 * harnesses that registered the file, each with the checksum that was written.
 * Several harnesses can own the same file; that is the normal case for the
 * shared .agents skill directory.
 */
export function buildOwners(registry) {
  const owners = new Map();
  const harnesses = registry?.harnesses ?? {};
  for (const [harnessId, groups] of Object.entries(harnesses)) {
    for (const section of Object.values(groups ?? {})) {
      for (const entry of section?.files ?? []) {
        if (!entry || typeof entry.path !== "string") continue;
        const key = ownershipKey(section.dest, entry.path);
        if (!owners.has(key)) owners.set(key, new Map());
        owners.get(key).set(harnessId, entry.sha256);
      }
    }
  }
  return owners;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

/**
 * Build a full plan for one scope and a set of harnesses.
 *
 * Pure: does not touch the filesystem.
 *
 * @returns {{files: Array, stale: Array, problems: Array, owners: Map}}
 */
export function buildPlan({ scope, source, registry, force = false, harnesses }) {
  const selected = harnesses ?? [DEFAULT_HARNESS];
  // A registry handed in by hand (or read from an older version) is normalized
  // first, so a v1 registry is planned as an OpenCode owned installation.
  const normalized = registry ? migrateRegistry(registry) : null;
  const usable = normalized && !normalized.corrupt ? normalized : null;
  const owners = buildOwners(usable);
  const planned = new Map(); // key -> hash that will be on disk
  const assets = collectSourceAssets(source, { requireAll: false });
  const files = [];

  for (const harnessId of selected) {
    for (const group of harnessGroups(harnessId)) {
      const dest = harnessDest(scope, harnessId, group);
      const srcDir = sourceDestDir(source, group);
      for (const rel of assets[group] ?? []) {
        const src = join(srcDir, ...rel.split("/"));
        const destFile = join(dest, ...rel.split("/"));
        const srcHash = sha256(src);
        const key = ownershipKey(dest, rel);
        const ownerMap = owners.get(key);
        const registered = ownerMap && ownerMap.size > 0;
        const recordedHashes = registered
          ? [...ownerMap.values()].filter((value) => isValidSha256(value))
          : [];

        let onDiskHash = null;
        if (planned.has(key)) {
          onDiskHash = planned.get(key);
        } else if (existsSync(destFile)) {
          onDiskHash = sha256(destFile);
        }

        let action;
        let reason;
        if (onDiskHash === null) {
          action = "create";
          reason = "not installed yet";
        } else if (!registered) {
          action = force ? "overwrite" : "conflict";
          reason = force
            ? "existing unregistered file, overwritten because --force was given"
            : "existing unregistered file (not installed by this tool)";
        } else if (recordedHashes.length === 0) {
          action = force ? "overwrite" : "modified";
          reason = force
            ? "no valid checksum in the registry, overwritten because --force was given"
            : "no valid checksum in the registry, kept as is";
        } else if (!recordedHashes.includes(onDiskHash)) {
          action = force ? "overwrite" : "modified";
          reason = force
            ? "locally modified file, overwritten because --force was given"
            : "locally modified file, kept as is";
        } else if (onDiskHash === srcHash) {
          action = "unchanged";
          reason = "identical to the packaged version";
        } else {
          action = "update";
          reason = "newer packaged version available";
        }

        files.push({
          harness: harnessId,
          group,
          rel,
          src,
          dest,
          destFile,
          srcHash,
          action,
          reason,
        });

        // Ownership bookkeeping.
        if (action === "create" || action === "update" || action === "overwrite") {
          planned.set(key, srcHash);
          if (!owners.has(key)) owners.set(key, new Map());
          const map = owners.get(key);
          for (const owner of [...map.keys()]) map.set(owner, srcHash);
          map.set(harnessId, srcHash);
        } else if (action === "unchanged") {
          if (!owners.has(key)) owners.set(key, new Map());
          const map = owners.get(key);
          for (const owner of [...map.keys()]) map.set(owner, srcHash);
          map.set(harnessId, srcHash);
        } else if (action === "modified" && recordedHashes.length > 0) {
          if (!owners.has(key)) owners.set(key, new Map());
          const map = owners.get(key);
          map.set(harnessId, recordedHashes[0]);
        }
      }
    }
  }

  // Files registered previously that are no longer part of the package.
  const stale = [];
  const registryHarnesses = usable?.harnesses ?? {};
  const staleSeen = new Set();
  for (const harnessId of Object.keys(registryHarnesses)) {
    if (!selected.includes(harnessId)) continue;
    const groups = registryHarnesses[harnessId] ?? {};
    for (const [group, section] of Object.entries(groups)) {
      const dest = section.dest;
      const shipped = assets[group] ?? [];
      for (const entry of section.files ?? []) {
        if (!entry?.path) continue;
        if (shipped.includes(entry.path)) continue;
        const key = ownershipKey(dest, entry.path);
        if (staleSeen.has(key)) {
          // The same file is registered by several harnesses; report it once.
          continue;
        }
        const destFile = safeJoin(dest, entry.path);
        if (!destFile) {
          // Never touch a path that leaves the destination directory.
          stale.push({
            harness: harnessId,
            group,
            rel: entry.path,
            dest: null,
            action: "unsafe",
            reason: "registry path escapes the destination directory, kept as is",
          });
          continue;
        }
        const map = owners.get(key);
        // Owners outside this update keep the file alive.
        const others = map
          ? [...map.keys()].filter((owner) => owner !== harnessId && !selected.includes(owner))
          : [];
        if (others.length > 0) {
          // The file is still owned by a harness outside this update: keep the
          // file on disk, but drop the ownership of every harness we update.
          for (const owner of selected) map.delete(owner);
          staleSeen.add(key);
          stale.push({
            harness: harnessId,
            group,
            rel: entry.path,
            dest: destFile,
            action: "stale-shared",
            reason: `still owned by ${others.join(", ")}, kept as is`,
          });
          continue;
        }
        let action = "stale";
        let reason = "no longer shipped by this package";
        if (existsSync(destFile)) {
          if (!isValidSha256(entry.sha256)) {
            action = "modified";
            reason = "no valid checksum in the registry, kept as is";
          } else if (sha256(destFile) !== entry.sha256) {
            action = "modified";
            reason = "locally modified stale file, kept as is";
          }
        }
        if (action === "stale") {
          // Every owner that this update touches loses the file together.
          for (const owner of selected) map?.delete(owner);
          staleSeen.add(key);
        }
        stale.push({ harness: harnessId, group, rel: entry.path, dest: destFile, action, reason });
      }
    }
  }

  const problems = [
    ...files.filter((f) => f.action === "conflict" || f.action === "modified"),
    ...stale.filter((f) => f.action === "modified" || f.action === "unsafe"),
  ];

  return { files, stale, problems, owners };
}

// ─── Install / update ────────────────────────────────────────────────────────

/**
 * Build the next registry from the ownership map.
 *
 * Every harness keeps its own entry list, so a shared file is registered once
 * per owner with the same checksum.
 */
export function buildNextRegistry(scope, owners, previous) {
  const harnesses = {};
  const ids = new Set([
    ...Object.keys(previous?.harnesses ?? {}),
    ...[...owners.values()].flatMap((map) => [...map.keys()]),
  ]);
  for (const harnessId of [...ids].sort()) {
    const groups = {};
    for (const group of harnessGroups(harnessId)) {
      const dest = harnessDest(scope, harnessId, group);
      const files = [];
      for (const [key, map] of owners) {
        const [keyDest, rel] = splitOwnershipKey(key);
        if (keyDest !== dest) continue;
        if (!map.has(harnessId)) continue;
        const checksum = map.get(harnessId);
        files.push({
          path: rel,
          ...(isValidSha256(checksum) ? { sha256: checksum } : {}),
        });
      }
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      if (files.length > 0) groups[group] = { dest, files };
    }
    if (Object.keys(groups).length > 0) harnesses[harnessId] = groups;
  }
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    package: packageName,
    version,
    installedAt: new Date().toISOString(),
    scope: scope.kind,
    root: scope.root,
    harnesses,
  };
}

/**
 * Install or update the assets of one scope for a set of harnesses.
 *
 * @param {object} options
 * @param {object} options.scope resolved scope
 * @param {object} options.source resolved source
 * @param {string[]} [options.harnesses] harness ids to install
 * @param {boolean} [options.dryRun] compute the plan without writing anything
 * @param {boolean} [options.force] overwrite modified / unregistered files
 */
export function installAssets({ scope, source, harnesses, dryRun = false, force = false }) {
  const selected = harnesses ?? [DEFAULT_HARNESS];
  const registry = loadRegistry(scope.registryPath, { scope });
  if (registry?.corrupt) {
    throw new Error(
      `Registry file is corrupt and cannot be trusted: ${scope.registryPath} ` +
        `(${registry.reason ?? "unreadable"}). Fix or remove it, then retry.`,
    );
  }

  // A first install requires the complete package: the skill document and, for
  // the OpenCode adapter, all seven command templates. Later updates tolerate a
  // source where a command was dropped; that file is then retired.
  const installsCommands = selected.includes("opencode");
  const isFirstInstall = !registry?.harnesses?.opencode?.commands;
  if (installsCommands) {
    collectSourceAssets(source, { requireAll: isFirstInstall });
  } else {
    collectSourceAssets(source, { requireAll: false });
  }

  const plan = buildPlan({ scope, source, registry, force, harnesses: selected });
  const written = [];
  const removed = [];
  const skipped = [];

  if (!dryRun) {
    for (const file of plan.files) {
      if (file.action === "conflict") {
        // Not ours: never register it, never touch it.
        skipped.push(file);
        continue;
      }
      if (file.action === "modified") {
        // Ours but locally edited: keep the file and keep the registered
        // checksum so uninstall still recognises it as user-modified.
        skipped.push(file);
        continue;
      }
      if (file.action !== "unchanged") {
        mkdirSync(dirname(file.destFile), { recursive: true });
        copyFileSync(file.src, file.destFile);
        written.push(file);
      }
    }

    for (const file of plan.stale) {
      if (file.action === "unsafe" || file.action === "stale-shared") {
        skipped.push(file);
        continue;
      }
      if (file.action === "modified") {
        skipped.push(file);
        continue;
      }
      if (file.dest && existsSync(file.dest)) {
        rmSync(file.dest, { force: true });
        removed.push(file);
      }
    }

    const next = buildNextRegistry(scope, plan.owners, registry);
    writeRegistry(scope.registryPath, next);
  } else {
    for (const file of plan.files) {
      if (file.action === "conflict" || file.action === "modified") {
        skipped.push(file);
        continue;
      }
      if (file.action !== "unchanged") written.push(file);
    }
    for (const file of plan.stale) {
      if (file.action === "modified" || file.action === "unsafe") skipped.push(file);
      else if (file.action === "stale-shared") skipped.push(file);
      else removed.push(file);
    }
  }

  return { scope, plan, written, removed, skipped, dryRun, harnesses: selected };
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

/**
 * Uninstall the assets of one scope for a set of harnesses.
 *
 * Only registered, unmodified files are removed. A file that is still owned by
 * another harness stays on disk until its last owner is removed.
 */
/**
 * Drop every owner that this uninstall touches from an ownership map.
 *
 * A shared file is one entry in the map with one owner per harness. When a set
 * of harnesses is uninstalled together, all of them lose the file at once, so
 * the last owner can remove it from disk.
 */
function dropOwners(map, selected) {
  if (!map) return;
  for (const owner of selected) map.delete(owner);
}

export function uninstallAssets({ scope, harnesses, dryRun = false }) {
  const selected = harnesses ?? [DEFAULT_HARNESS];
  const registry = loadRegistry(scope.registryPath, { scope });
  if (!registry) {
    return {
      scope,
      registry: null,
      removed: [],
      kept: [],
      missing: [],
      dryRun,
      nothing: true,
      harnesses: selected,
    };
  }
  if (registry.corrupt) {
    throw new Error(
      `Registry file is corrupt, refusing to uninstall: ${scope.registryPath}. ` +
        "Remove it manually after inspection.",
    );
  }

  const owners = buildOwners(registry);
  const removed = [];
  const kept = [];
  const missing = [];
  // Files that this run already handled. A shared file is removed once, by the
  // last owner that this uninstall touches.
  const handled = new Set();

  for (const harnessId of selected) {
    const groups = registry.harnesses?.[harnessId];
    if (!groups) continue;
    for (const [group, section] of Object.entries(groups)) {
      for (const entry of section.files ?? []) {
        if (!entry?.path) continue;
        const destFile = safeJoin(section.dest, entry.path);
        if (!destFile) {
          kept.push({
            harness: harnessId,
            group,
            path: entry.path,
            dest: null,
            reason: "registry path escapes the destination directory, kept as is",
          });
          continue;
        }
        const key = ownershipKey(section.dest, entry.path);
        if (handled.has(key)) continue;
        const map = owners.get(key);
        // Owners that this uninstall does not touch keep the file alive.
        const others = map
          ? [...map.keys()].filter((owner) => owner !== harnessId && !selected.includes(owner))
          : [];
        if (others.length > 0) {
          // Still owned by another harness: keep the file, drop only this owner.
          map.delete(harnessId);
          kept.push({
            harness: harnessId,
            group,
            path: entry.path,
            dest: destFile,
            reason: `still owned by ${others.join(", ")}, kept as is`,
          });
          continue;
        }
        if (!existsSync(destFile)) {
          handled.add(key);
          missing.push({ harness: harnessId, group, path: entry.path, dest: destFile });
          dropOwners(map, selected);
          continue;
        }
        if (!isValidSha256(entry.sha256)) {
          // Without a trustworthy checksum the file cannot be proven to be ours.
          kept.push({
            harness: harnessId,
            group,
            path: entry.path,
            dest: destFile,
            reason: "no valid checksum in the registry, kept as is",
          });
          continue;
        }
        if (sha256(destFile) !== entry.sha256) {
          kept.push({
            harness: harnessId,
            group,
            path: entry.path,
            dest: destFile,
            reason: "modified since installation",
          });
          continue;
        }
        if (!dryRun) rmSync(destFile, { force: true });
        dropOwners(map, selected);
        handled.add(key);
        removed.push({ harness: harnessId, group, path: entry.path, dest: destFile });
      }
    }
  }

  if (!dryRun) {
    // Prune empty directories only. rmdirSync refuses to remove a directory
    // that still holds files, so unrelated user content always survives.
    for (const harnessId of selected) {
      for (const group of harnessGroups(harnessId)) {
        const dest = harnessDest(scope, harnessId, group);
        // The command directory may be shared with other commands, so its root
        // is kept; only empty subdirectories are pruned. The skill directory is
        // owned by this tool and is removed when it is empty.
        pruneEmptyDirs(dest, { removeRoot: group === "skill" });
      }
    }

    const next = buildNextRegistry(scope, owners, registry);
    const hasEntries = Object.values(next.harnesses).some((groups) =>
      Object.values(groups).some((section) => section.files.length > 0),
    );
    if (!hasEntries) {
      // Nothing was preserved, so the registry is obsolete.
      if (existsSync(scope.registryPath)) rmSync(scope.registryPath, { force: true });
    } else {
      // Keep the registry with only the preserved files, so a later uninstall
      // can still recognise them as user-owned.
      writeRegistry(scope.registryPath, next);
    }
  }

  return { scope, registry, removed, kept, missing, dryRun, nothing: false, harnesses: selected };
}

// ─── Introspection ───────────────────────────────────────────────────────────

/** Known scopes that may hold an installation. */
export function knownScopes({ home, cwd } = {}) {
  const scopes = [resolveScope({ scope: "global", home }), resolveScope({ scope: "project", cwd })];
  for (const scope of scopes) {
    scope.registry = loadRegistry(scope.registryPath, { scope });
  }
  return scopes;
}

/** Every scope that holds a registry, including refused (corrupt) ones. */
export function findInstallations({ home, cwd, target } = {}) {
  const scopes = knownScopes({ home, cwd });
  if (target) {
    const custom = resolveScope({ scope: "custom", target });
    custom.registry = loadRegistry(custom.registryPath, { scope: custom });
    scopes.push(custom);
  }
  return scopes.filter((s) => s.registry);
}

/** Diagnostics for a single scope, per harness and group. */
export function inspectScope(scope) {
  const registry = loadRegistry(scope.registryPath, { scope });
  const issues = [];
  // Structured issues next to the human readable strings, so callers can
  // filter by harness without matching on message text.
  const issueDetails = [];
  const harnesses = {};
  const addIssue = (harnessId, group, kind, path, message) => {
    issues.push(message);
    issueDetails.push({ harness: harnessId, group, kind, path, message });
  };
  for (const [harnessId, groups] of Object.entries(registry?.harnesses ?? {})) {
    const harnessReport = {};
    for (const [group, section] of Object.entries(groups ?? {})) {
      const entries = section.files ?? [];
      const present = [];
      const absent = [];
      const modified = [];
      const unverifiable = [];
      for (const entry of entries) {
        const dest = safeJoin(section.dest, entry.path);
        if (!dest) {
          addIssue(
            harnessId,
            group,
            "unsafe",
            entry.path,
            `unsafe ${harnessId} ${group} path in registry: ${entry.path}`,
          );
          continue;
        }
        if (!existsSync(dest)) {
          absent.push(entry.path);
          continue;
        }
        if (!isValidSha256(entry.sha256)) {
          unverifiable.push(entry.path);
          continue;
        }
        if (sha256(dest) !== entry.sha256) modified.push(entry.path);
        else present.push(entry.path);
      }
      harnessReport[group] = {
        dest: section.dest,
        present,
        absent,
        modified,
        unverifiable,
        total: entries.length,
      };
      for (const p of absent) {
        addIssue(harnessId, group, "missing", p, `missing ${harnessId} ${group} file: ${p}`);
      }
      for (const p of modified) {
        addIssue(harnessId, group, "modified", p, `modified ${harnessId} ${group} file: ${p}`);
      }
      for (const p of unverifiable) {
        addIssue(
          harnessId,
          group,
          "unverifiable",
          p,
          `unverifiable ${harnessId} ${group} file (no checksum): ${p}`,
        );
      }
    }
    harnesses[harnessId] = harnessReport;
  }
  return { scope, registry, harnesses, issues, issueDetails };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const SYMBOL = { ok: "✔", bad: "✖", warn: "⚠", info: "ℹ" };

function out(...lines) {
  for (const line of lines) console.log(line);
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const [key, inline] = a.slice(2).split(/=(.*)/s);
      if (inline !== undefined) {
        args.flags[key] = inline;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
        args.flags[key] = argv[++i];
      } else {
        args.flags[key] = true;
      }
      continue;
    }
    if (a === "-h") {
      args.flags.help = true;
      continue;
    }
    if (a === "-v") {
      args.flags.version = true;
      continue;
    }
    args._.push(a);
  }
  return args;
}

function scopeFromFlags(flags) {
  if (flags.target) {
    return { scope: "custom", target: flags.target };
  }
  if (flags.global) return { scope: "global" };
  if (flags.project) return { scope: "project" };
  return { scope: "project" };
}

function cliContext(flags) {
  return {
    home: flags.home || process.env.BT_TRIAGE_HOME || homedir(),
    cwd: flags.cwd || process.env.BT_TRIAGE_CWD || process.cwd(),
    sourceRoot: flags.source || process.env.BT_TRIAGE_SOURCE || undefined,
  };
}

function harnessSelectionFromFlags(flags) {
  return resolveHarnessSelection(flags.harness);
}

function printPlan(result) {
  const { plan, written, removed, skipped, dryRun } = result;
  const prefix = dryRun ? "[dry-run] " : "";
  let currentHarness = null;
  for (const file of plan.files) {
    if (file.harness !== currentHarness) {
      currentHarness = file.harness;
      out(`  harness: ${currentHarness}`);
    }
    const symbol =
      file.action === "conflict" || file.action === "modified"
        ? SYMBOL.warn
        : file.action === "unchanged"
          ? SYMBOL.info
          : SYMBOL.ok;
    out(
      `  ${symbol} ${file.action.padEnd(9)} ${file.group}/${file.rel} -> ${file.dest}${
        file.action === "conflict" || file.action === "modified" ? ` (${file.reason})` : ""
      }`,
    );
  }
  for (const file of plan.stale) {
    out(
      `  ${SYMBOL.warn} stale    ${file.harness} ${file.group}/${file.rel} -> ${file.dest} ` +
        `(${file.reason})`,
    );
  }
  out("");
  out(
    `  ${prefix}${written.length} file(s) written, ${removed.length} removed, ` +
      `${skipped.length} skipped`,
  );
}

function printHelp() {
  out(
    `bt-triage v${version} - installer for the bead-triage skill and the /bt_* OpenCode commands`,
  );
  out("");
  out("Usage:");
  out("  bt-triage <command> [options]");
  out("");
  out("Commands:");
  out("  install      Install the skill into a scope for the selected harness(es)");
  out("  update       Re-install from the packaged sources and refresh registered files");
  out("  uninstall    Remove the files this tool registered in a scope");
  out("  list         List the installations found in the global and project scope");
  out("               (add --target <path> to include a custom scope)");
  out("  info         Show details of an installation (scope: global|project|<path>)");
  out("  doctor       Check the packaged sources and the local installations");
  out("");
  out("Scope options (install, update, uninstall):");
  out("  --global             Use the global scope");
  out("  --project            Use the project scope (default)");
  out("  --target <path>      Use a custom scope rooted at <path>");
  out("");
  out("Harness options:");
  out(`  --harness <name>     Install, update or uninstall one harness adapter.`);
  out(`                       Known harnesses: ${HARNESS_IDS.join(", ")}.`);
  out("                       Default for install, update and uninstall: opencode.");
  out(`  --harness all        Use every known harness adapter.`);
  out("                       For list, info and doctor, --harness filters the");
  out("                       reported adapters; without it all adapters are reported.");
  out("");
  out("Common options:");
  out("  --dry-run            Report what would change, without touching any file");
  out("  --force              Overwrite modified or unregistered files");
  out("  --source <path>      Read the assets from <path> instead of the packaged sources");
  out("  --home <path>        Override the home directory (default: $HOME)");
  out("  --cwd <path>         Override the project directory (default: current directory)");
  out("");
  out("Harness adapters (every adapter installs the same canonical skill):");
  out("  Adapters that share a destination (opencode, codex, pi, agents) own the");
  out("  shared files together; a shared file is removed only when its last");
  out("  owner is uninstalled.");
  out("  opencode  .agents/skills/bead-triage  +  .opencode/commands (global:");
  out("                                                     .config/opencode/commands)");
  out("  claude    .claude/skills/bead-triage");
  out("  codex     .agents/skills/bead-triage");
  out("  pi        .agents/skills/bead-triage");
  out("  agents    .agents/skills/bead-triage");
  out("  Only the opencode adapter installs the /bt_* command files; the other");
  out("  adapters install the skill only.");
  out("");
  out("Global scope:");
  out("  <home>/.agents/skills/bead-triage/");
  out("  <home>/.claude/skills/bead-triage/");
  out("  <home>/.config/opencode/commands/");
  out("");
  out("Project and custom scopes:");
  out("  <root>/.agents/skills/bead-triage/");
  out("  <root>/.claude/skills/bead-triage/");
  out("  <root>/.opencode/commands/");
  out("");
  out("Exit code 1 means the command reported unresolved collisions or modified files.");
  out("For info and doctor it means a visible installation has a problem: a corrupt");
  out("registry, a missing, modified or unverifiable file. A --harness filter");
  out("limits that check to the selected adapters.");
}

function cmdInstall(flags, { update = false } = {}) {
  const ctx = cliContext(flags);
  const scope = resolveScope({ ...scopeFromFlags(flags), home: ctx.home, cwd: ctx.cwd });
  const source = resolveSource(ctx.sourceRoot);
  const harnesses = harnessSelectionFromFlags(flags);

  out("");
  out(`${update ? "Update" : "Install"} -> ${scope.kind} scope`);
  out(`  root:     ${scope.root}`);
  out(`  harness:  ${harnesses.join(", ")}`);
  for (const harnessId of harnesses) {
    for (const group of harnessGroups(harnessId)) {
      out(`  ${harnessId} ${group}: ${harnessDest(scope, harnessId, group)}`);
    }
  }
  out("");

  const result = installAssets({
    scope,
    source,
    harnesses,
    dryRun: !!flags["dry-run"],
    force: !!flags.force,
  });
  printPlan(result);

  // Only genuine problems (collisions, modified files, unsafe paths) fail the
  // command. A stale file that is kept because another harness still owns it is
  // a normal, safe outcome and must not demand --force.
  const problems = result.plan?.problems ?? [];
  if (problems.length > 0) {
    out("");
    out(
      `  ${SYMBOL.warn} ${problems.length} file(s) need attention: ` +
        "modified or unregistered files were kept.",
    );
    out("    Re-run with --force to overwrite them, or inspect them first.");
    return 1;
  }
  if (result.skipped.length > 0) {
    out("");
    out(
      `  ${SYMBOL.info} ${result.skipped.length} file(s) kept as is: ` +
        "still owned by another harness, or modified after installation.",
    );
  }
  out("");
  if (flags["dry-run"]) {
    out(`  ${SYMBOL.info} Dry run: nothing was written.`);
    return 0;
  }
  out(`  ${SYMBOL.ok} ${update ? "Update" : "Installation"} complete.`);
  return 0;
}

function cmdUninstall(flags) {
  const ctx = cliContext(flags);
  const scope = resolveScope({ ...scopeFromFlags(flags), home: ctx.home, cwd: ctx.cwd });
  const harnesses = harnessSelectionFromFlags(flags);

  out("");
  out(`Uninstall <- ${scope.kind} scope`);
  out(`  root:    ${scope.root}`);
  out(`  harness: ${harnesses.join(", ")}`);
  out("");

  const result = uninstallAssets({ scope, harnesses, dryRun: !!flags["dry-run"] });
  if (result.nothing) {
    out(`  ${SYMBOL.warn} No installation found at ${scope.registryPath}`);
    return 0;
  }
  for (const file of result.removed) {
    const verb = flags["dry-run"] ? "would remove" : "removed";
    out(`  ${SYMBOL.ok} ${verb}  ${file.harness} ${file.group}/${file.path}`);
  }
  for (const file of result.kept) {
    out(`  ${SYMBOL.warn} kept    ${file.harness} ${file.group}/${file.path} (${file.reason})`);
  }
  for (const file of result.missing) {
    out(`  ${SYMBOL.info} missing ${file.harness} ${file.group}/${file.path}`);
  }
  out("");
  const removedLabel = result.kept.length > 0 ? SYMBOL.warn : SYMBOL.ok;
  if (flags["dry-run"]) {
    out(
      `  ${SYMBOL.info} Dry run: ${result.removed.length} file(s) would be removed, ` +
        `${result.kept.length} kept.`,
    );
  } else {
    out(`  ${removedLabel} ${result.removed.length} file(s) removed, ${result.kept.length} kept.`);
  }
  if (result.kept.length > 0) {
    out("    Modified files are never deleted automatically.");
  }
  return 0;
}

function cmdList(flags) {
  const ctx = cliContext(flags);
  const scopes = findInstallations({ home: ctx.home, cwd: ctx.cwd, target: flags.target });
  const selected = flags.harness ? harnessSelectionFromFlags(flags) : null;
  out("");
  const found = scopes.filter((s) => s.registry && !s.registry.corrupt);
  for (const scope of scopes) {
    if (scope.registry?.corrupt) {
      out(
        `  ${SYMBOL.bad} ${scope.kind.padEnd(8)} registry refused: ${scope.registryPath} ` +
          `(${scope.registry.reason ?? "unreadable"})`,
      );
    }
  }
  if (found.length === 0) {
    out(`  ${SYMBOL.warn} No installations found.`);
    out("    Run `bt-triage install --global` or `bt-triage install`.");
    return 0;
  }
  for (const scope of found) {
    const reg = scope.registry;
    out(`  ${SYMBOL.ok} ${scope.kind.padEnd(8)} v${reg.version}  root: ${scope.root}`);
    for (const [harnessId, groups] of Object.entries(reg.harnesses ?? {})) {
      if (selected && !selected.includes(harnessId)) continue;
      const skillCount = groups.skill?.files.length ?? 0;
      const commandCount = groups.commands?.files.length ?? 0;
      const commandText = commandCount > 0 ? `, ${commandCount} command file(s)` : "";
      out(`      ${harnessId.padEnd(8)} ${skillCount} skill file(s)${commandText}`);
      for (const group of Object.keys(groups)) {
        out(`               ${group}: ${groups[group].dest}`);
      }
    }
  }
  return 0;
}

function cmdInfo(flags, positional) {
  const ctx = cliContext(flags);
  const scopeArg = positional?.[0];
  let scope;
  if (scopeArg === "global") {
    scope = resolveScope({ scope: "global", home: ctx.home });
  } else if (scopeArg === "project" || !scopeArg) {
    scope = resolveScope({ scope: "project", home: ctx.home, cwd: ctx.cwd });
  } else {
    scope = resolveScope({ scope: "custom", target: scopeArg, home: ctx.home });
  }
  const selected = flags.harness ? harnessSelectionFromFlags(flags) : null;
  const info = inspectScope(scope);
  out("");
  out(`  Scope: ${scope.kind} (${scope.root})`);
  if (!info.registry) {
    out(`  ${SYMBOL.warn} No installation found at ${scope.registryPath}`);
    return 0;
  }
  if (info.registry.corrupt) {
    out(
      `  ${SYMBOL.bad} Registry is corrupt and was refused: ${scope.registryPath} ` +
        `(${info.registry.reason ?? "unreadable"})`,
    );
    out("    Inspect it and remove it manually before reinstalling.");
    return 1;
  }
  out(`  Package: ${info.registry.package} v${info.registry.version}`);
  out(`  Installed at: ${info.registry.installedAt}`);
  const visible = new Set(selected ?? Object.keys(info.harnesses));
  for (const [harnessId, groups] of Object.entries(info.harnesses)) {
    if (!visible.has(harnessId)) continue;
    out(`  Harness: ${harnessId}`);
    for (const [group, g] of Object.entries(groups)) {
      out(`    ${group}: ${g.present.length}/${g.total} file(s) intact at ${g.dest}`);
      for (const p of g.absent) out(`      ${SYMBOL.bad} missing ${p}`);
      for (const p of g.modified) out(`      ${SYMBOL.warn} modified ${p}`);
      for (const p of g.unverifiable) out(`      ${SYMBOL.warn} unverifiable ${p} (no checksum)`);
    }
  }
  // Only issues of the visible adapters count; a filter must not inherit the
  // problems of an adapter that was excluded.
  const visibleIssues = info.issueDetails.filter((issue) => visible.has(issue.harness));
  return visibleIssues.length > 0 ? 1 : 0;
}

function cmdDoctor(flags) {
  const ctx = cliContext(flags);
  const source = resolveSource(ctx.sourceRoot);
  out("");
  out(`bt-triage doctor`);
  out("");
  out("System:");
  out(`  Node.js:  ${process.version}`);
  out(`  Package:  ${packageName} v${version}`);
  if (packageName !== EXPECTED_PACKAGE_NAME) {
    out(`  ${SYMBOL.warn} package.json still reports "${packageName}"`);
    out(`    Expected "${EXPECTED_PACKAGE_NAME}". Update the package manifest.`);
  }
  out("");
  out("Packaged sources:");
  const skillOk = existsSync(join(source.skillDir, "SKILL.md"));
  out(
    `  ${skillOk ? SYMBOL.ok : SYMBOL.bad} skill source ${source.skillDir}` +
      (skillOk ? "" : " (missing SKILL.md)"),
  );
  const commands = listFilesRecursive(source.commandsDir).filter((f) => f.endsWith(".md"));
  const missingCommands = REQUIRED_COMMANDS.filter((c) => !commands.includes(c));
  const commandLabel = missingCommands.length === 0 ? SYMBOL.ok : SYMBOL.bad;
  out(`  ${commandLabel} command source ${source.commandsDir} (${commands.length} file(s))`);
  for (const c of missingCommands) out(`    ${SYMBOL.bad} missing ${c}`);
  // A document whose frontmatter does not parse is skipped by the harness, so
  // the package would install an asset that no adapter can load.
  const frontmatterDocs = [
    join(source.skillDir, "SKILL.md"),
    ...REQUIRED_COMMANDS.map((c) => join(source.commandsDir, c)),
  ].filter((file) => existsSync(file));
  const packagedProblems = frontmatterDocs
    .map((file) => ({ file, problem: frontmatterProblem(file, { required: true }) }))
    .filter((entry) => entry.problem);
  out(
    `  ${packagedProblems.length === 0 ? SYMBOL.ok : SYMBOL.bad} frontmatter ` +
      `${frontmatterDocs.length} document(s)`,
  );
  for (const { file, problem } of packagedProblems) {
    out(`    ${SYMBOL.bad} invalid frontmatter ${file}: ${problem}`);
  }
  out("");
  out("Installations:");
  const scopes = knownScopes({ home: ctx.home, cwd: ctx.cwd });
  const selected = flags.harness ? harnessSelectionFromFlags(flags) : null;
  let any = false;
  let corruptRegistry = false;
  let integrityIssues = 0;
  let frontmatterIssues = 0;
  for (const scope of scopes) {
    if (!scope.registry) continue;
    any = true;
    if (scope.registry.corrupt) {
      // A corrupt registry is a failure of the installation itself, whatever
      // adapter is selected: the state on disk cannot be trusted.
      corruptRegistry = true;
      out(`  ${SYMBOL.bad} ${scope.kind}: ${scope.root}`);
      out(`    ${SYMBOL.bad} registry refused: ${scope.registry.reason ?? "unreadable"}`);
      continue;
    }
    const info = inspectScope(scope);
    const visibleHarnesses = Object.entries(info.harnesses).filter(
      ([harnessId]) => !selected || selected.includes(harnessId),
    );
    const visibleIssues = info.issueDetails.filter(
      (issue) => !selected || selected.includes(issue.harness),
    );
    integrityIssues += visibleIssues.length;
    out(`  ${visibleIssues.length === 0 ? SYMBOL.ok : SYMBOL.warn} ${scope.kind}: ${scope.root}`);
    for (const [harnessId, groups] of visibleHarnesses) {
      for (const [group, g] of Object.entries(groups)) {
        out(`    ${harnessId} ${group}: ${g.present.length}/${g.total} file(s) at ${g.dest}`);
        for (const rel of g.present) {
          if (!rel.endsWith(".md")) continue;
          const dest = safeJoin(g.dest, rel);
          if (!dest) continue;
          const problem = frontmatterProblem(dest);
          if (!problem) continue;
          frontmatterIssues += 1;
          out(`    ${SYMBOL.bad} invalid frontmatter ${dest}: ${problem}`);
        }
      }
    }
    for (const issue of visibleIssues) out(`    ${SYMBOL.warn} ${issue.message}`);
  }
  if (!any) out("  none found");
  const missingCommandsAny = missingCommands.length > 0;
  out("");
  // A broken package source is a failure: the skill document and all seven
  // commands must be present before the package can be installed. A corrupt
  // registry or a visible installation integrity problem (a missing SKILL.md,
  // a modified or unverifiable file) is a failure too.
  return missingCommandsAny ||
    !skillOk ||
    corruptRegistry ||
    integrityIssues > 0 ||
    frontmatterIssues > 0 ||
    packagedProblems.length > 0
    ? 1
    : 0;
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.flags.help || args._[0] === "help") {
    printHelp();
    return 0;
  }
  if (args.flags.version) {
    out(`bt-triage v${version}`);
    return 0;
  }
  const command = args._[0];
  const positional = args._.slice(1);
  switch (command) {
    case "install":
      return cmdInstall(args.flags, { update: false });
    case "update":
      return cmdInstall(args.flags, { update: true });
    case "uninstall":
      return cmdUninstall(args.flags);
    case "list":
      return cmdList(args.flags);
    case "info":
      return cmdInfo(args.flags, positional);
    case "doctor":
      return cmdDoctor(args.flags);
    default:
      out(`Unknown command "${command ?? ""}"`);
      out('Run "bt-triage --help" for usage.');
      return 1;
  }
}

if (isMainModule()) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    console.error(`${SYMBOL.bad} ${err.message}`);
    process.exitCode = 1;
  }
}
