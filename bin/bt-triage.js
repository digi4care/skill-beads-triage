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
 * Install targets:
 *   global:  <home>/.agents/skills/bead-triage/  +  <home>/.config/opencode/commands/
 *   project: <cwd>/.agents/skills/bead-triage/   +  <cwd>/.opencode/commands/
 *   custom:  <target>/.agents/skills/bead-triage/ + <target>/.opencode/commands/
 *
 * Safety model:
 *   - One registry per scope root (.bt-triage-registry.json) tracks every file
 *     this installer wrote, together with its sha256 checksum.
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

/** Skill id; OpenCode derives the skill id from the directory name. */
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

const GROUPS = ["skill", "commands"];

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
    return {
      kind: "global",
      label: "global",
      root: homeDir,
      skillDir: join(homeDir, ".agents", "skills", SKILL_ID),
      commandsDir: join(homeDir, ".config", "opencode", "commands"),
      registryPath: join(homeDir, REGISTRY_FILENAME),
    };
  }
  if (scope === "custom") {
    if (!target) throw new Error("Custom scope requires a target directory");
    const root = resolve(target);
    return {
      kind: "custom",
      label: `custom (${root})`,
      root,
      skillDir: join(root, ".agents", "skills", SKILL_ID),
      commandsDir: join(root, ".opencode", "commands"),
      registryPath: join(root, REGISTRY_FILENAME),
    };
  }
  return {
    kind: "project",
    label: "project",
    root: cwdDir,
    skillDir: join(cwdDir, ".agents", "skills", SKILL_ID),
    commandsDir: join(cwdDir, ".opencode", "commands"),
    registryPath: join(cwdDir, REGISTRY_FILENAME),
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

function scopeDestDir(scope, group) {
  return group === "skill" ? scope.skillDir : scope.commandsDir;
}

function sourceDestDir(source, group) {
  return group === "skill" ? source.skillDir : source.commandsDir;
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

export function loadRegistry(registryPath) {
  if (!existsSync(registryPath)) return null;
  try {
    const data = JSON.parse(readFileSync(registryPath, "utf8"));
    if (!data || typeof data !== "object" || !data.groups) {
      return { corrupt: true, reason: "missing groups section" };
    }
    for (const group of GROUPS) {
      if (!data.groups[group] || !Array.isArray(data.groups[group].files)) {
        data.groups[group] = { dest: "", files: [] };
      }
      for (const entry of data.groups[group].files) {
        if (!entry || typeof entry !== "object" || !isSafeRelativePath(entry.path)) {
          // Fail closed: a registry that points outside its scope is never used.
          return {
            corrupt: true,
            reason:
              `unsafe or malformed file path in group "${group}"` +
              (entry && typeof entry.path === "string" ? `: ${JSON.stringify(entry.path)}` : ""),
          };
        }
      }
    }
    return data;
  } catch {
    return { corrupt: true, reason: "not valid JSON" };
  }
}

function writeRegistry(registryPath, data) {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function registryEntry(registry, group, rel) {
  const files = registry?.groups?.[group]?.files;
  if (!Array.isArray(files)) return undefined;
  return files.find((f) => f && f.path === rel);
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

// ─── Plan ────────────────────────────────────────────────────────────────────

/**
 * Build a full plan for one scope. Pure: does not touch the filesystem.
 *
 * @returns {{files: Array, stale: Array, problems: Array}}
 */
export function buildPlan({ scope, source, registry, force = false }) {
  const assets = collectSourceAssets(source, { requireAll: false });
  const files = [];

  for (const group of GROUPS) {
    const destDir = scopeDestDir(scope, group);
    const srcDir = sourceDestDir(source, group);
    for (const rel of assets[group]) {
      const src = join(srcDir, ...rel.split("/"));
      const dest = join(destDir, ...rel.split("/"));
      const srcHash = sha256(src);
      const entry = registryEntry(registry, group, rel);

      let action;
      let reason;
      if (!existsSync(dest)) {
        action = "create";
        reason = "not installed yet";
      } else if (!entry) {
        action = force ? "overwrite" : "conflict";
        reason = force
          ? "existing unregistered file, overwritten because --force was given"
          : "existing unregistered file (not installed by this tool)";
      } else {
        const currentHash = sha256(dest);
        if (currentHash !== entry.sha256) {
          action = force ? "overwrite" : "modified";
          reason = force
            ? "locally modified file, overwritten because --force was given"
            : "locally modified file, kept as is";
        } else if (currentHash === srcHash) {
          action = "unchanged";
          reason = "identical to the packaged version";
        } else {
          action = "update";
          reason = "newer packaged version available";
        }
      }
      files.push({ group, rel, src, dest, srcHash, action, reason });
    }
  }

  // Files registered previously that are no longer part of the package.
  const stale = [];
  for (const group of GROUPS) {
    const destDir = scopeDestDir(scope, group);
    const known = registry?.groups?.[group]?.files ?? [];
    for (const entry of known) {
      if (!entry?.path) continue;
      if (files.some((f) => f.group === group && f.rel === entry.path)) continue;
      const dest = safeJoin(destDir, entry.path);
      if (!dest) {
        // Unreachable for a registry that passed loadRegistry, but the planner
        // may be called with a hand-made registry.
        stale.push({
          group,
          rel: entry.path,
          dest: null,
          action: "unsafe",
          reason: "registry path escapes the destination directory, kept as is",
        });
        continue;
      }
      let action = "stale";
      let reason = "no longer shipped by this package";
      if (existsSync(dest)) {
        if (!isValidSha256(entry.sha256)) {
          action = "modified";
          reason = "no valid checksum in the registry, kept as is";
        } else if (sha256(dest) !== entry.sha256) {
          action = "modified";
          reason = "locally modified stale file, kept as is";
        }
      }
      stale.push({ group, rel: entry.path, dest, action, reason });
    }
  }

  const problems = [
    ...files.filter((f) => f.action === "conflict" || f.action === "modified"),
    ...stale.filter((f) => f.action === "modified" || f.action === "unsafe"),
  ];

  return { files, stale, problems };
}

// ─── Install / update ────────────────────────────────────────────────────────

/**
 * Install or update the assets for one scope.
 *
 * @param {object} options
 * @param {object} options.scope resolved scope
 * @param {object} options.source resolved source
 * @param {boolean} [options.dryRun] compute the plan without writing anything
 * @param {boolean} [options.force] overwrite modified / unregistered files
 */
export function installAssets({ scope, source, dryRun = false, force = false }) {
  const registry = loadRegistry(scope.registryPath);
  if (registry?.corrupt) {
    throw new Error(
      `Registry file is corrupt and cannot be trusted: ${scope.registryPath} ` +
        `(${registry.reason ?? "unreadable"}). Fix or remove it, then retry.`,
    );
  }

  // A first install requires the complete package: the skill document and all
  // seven command templates. Later updates tolerate a source where a command was
  // dropped; that file is then retired from the installation.
  const isFirstInstall = !registry;
  collectSourceAssets(source, { requireAll: isFirstInstall });

  const plan = buildPlan({ scope, source, registry, force });
  const written = [];
  const removed = [];
  const skipped = [];

  if (!dryRun) {
    const nextRegistry = {
      package: packageName,
      version,
      installedAt: new Date().toISOString(),
      scope: scope.kind,
      root: scope.root,
      groups: {
        skill: { dest: scope.skillDir, files: [] },
        commands: { dest: scope.commandsDir, files: [] },
      },
    };

    for (const file of plan.files) {
      if (file.action === "conflict") {
        // Not ours: never register it, never touch it.
        skipped.push(file);
        continue;
      }
      if (file.action === "modified") {
        // Ours but locally edited: keep the file and keep its original checksum so
        // uninstall still recognises it as user-modified and preserves it.
        skipped.push(file);
        const entry = registryEntry(registry, file.group, file.rel);
        if (entry) nextRegistry.groups[file.group].files.push(entry);
        continue;
      }
      if (file.action !== "unchanged") {
        mkdirSync(dirname(file.dest), { recursive: true });
        copyFileSync(file.src, file.dest);
        written.push(file);
      }
      nextRegistry.groups[file.group].files.push({ path: file.rel, sha256: file.srcHash });
    }

    for (const file of plan.stale) {
      const entry = registryEntry(registry, file.group, file.rel);
      if (file.action === "unsafe") {
        // Never touch a path that leaves the destination directory.
        skipped.push(file);
        continue;
      }
      if (file.action === "modified") {
        skipped.push(file);
        if (entry) nextRegistry.groups[file.group].files.push(entry);
        continue;
      }
      if (file.dest && existsSync(file.dest)) {
        rmSync(file.dest, { force: true });
        removed.push(file);
      }
    }

    writeRegistry(scope.registryPath, nextRegistry);
  } else {
    for (const file of plan.files) {
      if (file.action === "conflict" || file.action === "modified") {
        skipped.push(file);
        continue;
      }
      if (file.action !== "unchanged") written.push(file);
    }
    for (const file of plan.stale) {
      if (file.action === "modified") skipped.push(file);
      else removed.push(file);
    }
  }

  return { scope, plan, written, removed, skipped, dryRun };
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

/**
 * Uninstall the assets of one scope. Only registered, unmodified files are removed.
 */
export function uninstallAssets({ scope, dryRun = false }) {
  const registry = loadRegistry(scope.registryPath);
  if (!registry) {
    return { scope, registry: null, removed: [], kept: [], missing: [], dryRun, nothing: true };
  }
  if (registry.corrupt) {
    throw new Error(
      `Registry file is corrupt, refusing to uninstall: ${scope.registryPath}. ` +
        "Remove it manually after inspection.",
    );
  }

  const removed = [];
  const kept = [];
  const missing = [];

  for (const group of GROUPS) {
    const destDir = scopeDestDir(scope, group);
    for (const entry of registry.groups[group].files ?? []) {
      if (!entry?.path) continue;
      const dest = safeJoin(destDir, entry.path);
      if (!dest) {
        kept.push({
          group,
          path: entry.path,
          dest: null,
          reason: "registry path escapes the destination directory, kept as is",
        });
        continue;
      }
      if (!existsSync(dest)) {
        missing.push({ group, path: entry.path, dest });
        continue;
      }
      if (!isValidSha256(entry.sha256)) {
        // Without a trustworthy checksum the file cannot be proven to be ours.
        kept.push({
          group,
          path: entry.path,
          dest,
          reason: "no valid checksum in the registry, kept as is",
        });
        continue;
      }
      if (sha256(dest) !== entry.sha256) {
        kept.push({ group, path: entry.path, dest, reason: "modified since installation" });
        continue;
      }
      if (!dryRun) rmSync(dest, { force: true });
      removed.push({ group, path: entry.path, dest });
    }
  }

  if (!dryRun) {
    // Prune empty directories only. rmdirSync refuses to remove a directory
    // that still holds files, so unrelated user content always survives.
    pruneEmptyDirs(scope.skillDir, { removeRoot: true });
    // The commands directory may be shared with other OpenCode commands, so its
    // root is kept; only empty subdirectories are pruned.
    pruneEmptyDirs(scope.commandsDir, { removeRoot: false });
    if (kept.length === 0) {
      // Nothing was preserved, so the registry is obsolete.
      if (existsSync(scope.registryPath)) rmSync(scope.registryPath, { force: true });
    } else {
      // Keep the registry with only the preserved files, so a later uninstall can
      // still recognise them as user-owned.
      const next = {
        package: registry.package ?? packageName,
        version: registry.version ?? version,
        installedAt: registry.installedAt ?? new Date().toISOString(),
        scope: scope.kind,
        root: scope.root,
        groups: {
          skill: { dest: scope.skillDir, files: [] },
          commands: { dest: scope.commandsDir, files: [] },
        },
      };
      for (const file of kept) {
        const entry = registryEntry(registry, file.group, file.path);
        if (entry) next.groups[file.group].files.push(entry);
      }
      writeRegistry(scope.registryPath, next);
    }
  }

  return { scope, registry, removed, kept, missing, dryRun, nothing: false };
}

// ─── Introspection ───────────────────────────────────────────────────────────

/** Known scopes that may hold an installation. */
export function knownScopes({ home, cwd } = {}) {
  const scopes = [resolveScope({ scope: "global", home }), resolveScope({ scope: "project", cwd })];
  for (const scope of scopes) {
    scope.registry = loadRegistry(scope.registryPath);
  }
  return scopes;
}

/** Every scope that holds a registry, including refused (corrupt) ones. */
export function findInstallations({ home, cwd, target } = {}) {
  const scopes = knownScopes({ home, cwd });
  if (target) {
    const custom = resolveScope({ scope: "custom", target });
    custom.registry = loadRegistry(custom.registryPath);
    scopes.push(custom);
  }
  return scopes.filter((s) => s.registry);
}

/** Diagnostics for a single scope. */
export function inspectScope(scope) {
  const registry = loadRegistry(scope.registryPath);
  const issues = [];
  const groups = {};
  for (const group of GROUPS) {
    const destDir = scopeDestDir(scope, group);
    const entries = registry?.groups?.[group]?.files ?? [];
    const present = [];
    const absent = [];
    const modified = [];
    const unverifiable = [];
    for (const entry of entries) {
      const dest = safeJoin(destDir, entry.path);
      if (!dest) {
        issues.push(`unsafe ${group} path in registry: ${entry.path}`);
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
    groups[group] = {
      dest: destDir,
      present,
      absent,
      modified,
      unverifiable,
      total: entries.length,
    };
    for (const p of absent) issues.push(`missing ${group} file: ${p}`);
    for (const p of modified) issues.push(`modified ${group} file: ${p}`);
    for (const p of unverifiable) issues.push(`unverifiable ${group} file (no checksum): ${p}`);
  }
  return { scope, registry, groups, issues };
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

function printPlan(result) {
  const { plan, written, removed, skipped, dryRun } = result;
  const prefix = dryRun ? "[dry-run] " : "";
  for (const file of plan.files) {
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
    out(`  ${SYMBOL.warn} stale    ${file.group}/${file.rel} -> ${file.dest} (${file.reason})`);
  }
  out("");
  out(
    `  ${prefix}${written.length} file(s) written, ${removed.length} removed, ` +
      `${skipped.length} skipped`,
  );
}

function printHelp() {
  out(`bt-triage v${version} - installer for the bead-triage skill and /bt_* OpenCode commands`);
  out("");
  out("Usage:");
  out("  bt-triage <command> [options]");
  out("");
  out("Commands:");
  out("  install      Install the skill and the seven bt_* commands into a scope");
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
  out("Common options:");
  out("  --dry-run            Report what would change, without touching any file");
  out("  --force              Overwrite modified or unregistered files");
  out("  --source <path>      Read the assets from <path> instead of the packaged sources");
  out("  --home <path>        Override the home directory (default: $HOME)");
  out("  --cwd <path>         Override the project directory (default: current directory)");
  out("");
  out("Global scope:");
  out("  <home>/.agents/skills/bead-triage/");
  out("  <home>/.config/opencode/commands/");
  out("");
  out("Project and custom scopes:");
  out("  <root>/.agents/skills/bead-triage/");
  out("  <root>/.opencode/commands/");
  out("");
  out("Exit code 1 means the command reported unresolved collisions or modified files.");
}

function cmdInstall(flags, { update = false } = {}) {
  const ctx = cliContext(flags);
  const scope = resolveScope({ ...scopeFromFlags(flags), home: ctx.home, cwd: ctx.cwd });
  const source = resolveSource(ctx.sourceRoot);

  out("");
  out(`${update ? "Update" : "Install"} -> ${scope.kind} scope`);
  out(`  root:    ${scope.root}`);
  out(`  skill:   ${scope.skillDir}`);
  out(`  commands: ${scope.commandsDir}`);
  out("");

  const result = installAssets({
    scope,
    source,
    dryRun: !!flags["dry-run"],
    force: !!flags.force,
  });
  printPlan(result);

  if (result.skipped.length > 0) {
    out("");
    out(
      `  ${SYMBOL.warn} ${result.skipped.length} file(s) need attention: ` +
        "modified or unregistered files were kept.",
    );
    out(`    Re-run with --force to overwrite them, or inspect them first.`);
    return 1;
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

  out("");
  out(`Uninstall <- ${scope.kind} scope`);
  out(`  root: ${scope.root}`);
  out("");

  const result = uninstallAssets({ scope, dryRun: !!flags["dry-run"] });
  if (result.nothing) {
    out(`  ${SYMBOL.warn} No installation found at ${scope.registryPath}`);
    return 0;
  }
  for (const file of result.removed) {
    const verb = flags["dry-run"] ? "would remove" : "removed";
    out(`  ${SYMBOL.ok} ${verb}  ${file.group}/${file.path}`);
  }
  for (const file of result.kept) {
    out(`  ${SYMBOL.warn} kept    ${file.group}/${file.path} (${file.reason})`);
  }
  for (const file of result.missing) {
    out(`  ${SYMBOL.info} missing ${file.group}/${file.path}`);
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
    const skillCount = reg.groups.skill.files.length;
    const commandCount = reg.groups.commands.files.length;
    out(
      `  ${SYMBOL.ok} ${scope.kind.padEnd(8)} v${reg.version}  ` +
        `${skillCount} skill file(s), ${commandCount} command file(s)`,
    );
    out(`      root:     ${scope.root}`);
    out(`      skill:    ${scope.skillDir}`);
    out(`      commands: ${scope.commandsDir}`);
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
    out(`    Inspect it and remove it manually before reinstalling.`);
    return 1;
  }
  out(`  Package: ${info.registry.package} v${info.registry.version}`);
  out(`  Installed at: ${info.registry.installedAt}`);
  for (const group of GROUPS) {
    const g = info.groups[group];
    out(`  ${group}: ${g.present.length}/${g.total} file(s) intact at ${g.dest}`);
    for (const p of g.absent) out(`    ${SYMBOL.bad} missing ${p}`);
    for (const p of g.modified) out(`    ${SYMBOL.warn} modified ${p}`);
    for (const p of g.unverifiable) out(`    ${SYMBOL.warn} unverifiable ${p} (no checksum)`);
  }
  return info.issues.length > 0 ? 1 : 0;
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
  out("");
  out("Installations:");
  const scopes = knownScopes({ home: ctx.home, cwd: ctx.cwd });
  let any = false;
  for (const scope of scopes) {
    if (!scope.registry) continue;
    any = true;
    if (scope.registry.corrupt) {
      out(`  ${SYMBOL.bad} ${scope.kind}: ${scope.root}`);
      out(`    ${SYMBOL.bad} registry refused: ${scope.registry.reason ?? "unreadable"}`);
      continue;
    }
    const info = inspectScope(scope);
    out(`  ${info.issues.length === 0 ? SYMBOL.ok : SYMBOL.warn} ${scope.kind}: ${scope.root}`);
    for (const issue of info.issues) out(`    ${SYMBOL.warn} ${issue}`);
  }
  if (!any) out("  none found");
  const missingCommandsAny = missingCommands.length > 0;
  out("");
  // A broken package source is a failure: the skill document and all seven
  // commands must be present before the package can be installed.
  return missingCommandsAny || !skillOk ? 1 : 0;
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
