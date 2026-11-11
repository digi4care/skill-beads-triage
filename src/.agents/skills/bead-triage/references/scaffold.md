# Scaffold: initialize beads and Doorstop structures

Procedure for `/bt_scaffold [project-directory]`.

Explicit invocation of `/bt_scaffold` is the **only** authorization to initialize beads or Doorstop
structures. No other `/bt_*` command may create these structures.

Scope: inspect and create only what is missing. Do not restructure, reformat or overwrite what already
exists. Do not commit, branch, push, sync, or initialize git.

## 1. Resolve the target and preflight

- Target: the directory given in the arguments, otherwise the current repository root. Resolve it to an
  absolute path and run every project-scoped command with that target as its working directory; never rely
  on the caller's current directory.
- The target must be an existing git worktree. Verify with a read-only check (for example
  `git -C <dir> rev-parse --is-inside-work-tree`). If it is not a git worktree, stop with a concrete
  error. Never run `git init`.
- Preflight the tools and inspect their versions and help before use:

```sh
br --version
bv --version
uv --version
br init --help
```

- Doorstop is **always** invoked through `uv` — either `uv run doorstop ...` or `uvx doorstop@3.2 ...`.
  Never use a global `doorstop` executable.
- Record every version and command with its exit status.

## 2. Beads (`.beads`)

- If a `.beads` workspace already exists: inspect and reuse it. Do not re-initialize. Never use
  `br init --force`.
- If no `.beads` workspace exists: initialize it.

```sh
br init --json
```

Use an explicit supported prefix (`br init --prefix <prefix> --json`) only when the user or the project
supplies one; otherwise use the default.

- Verify afterwards with `br` and a compact `bv` JSON/triage read, e.g. `br ready --brief --json` and
  `bv --robot-triage --brief --robot-max-results 10 --format json`.

## 3. Doorstop route selection

- If a native Doorstop bridge/tool is available, discover its documented status interface and read status
  before any Doorstop mutation. `blocked`, enabled-but-not-ready, or inconsistent status stops the affected
  mutation. Never bypass it through uv, shell or file writes, and never auto-enable, recover or init the bridge.
- If the project already has a Doorstop tree (any existing `.doorstop.yml`): preserve the existing
  layout, prefixes, separators and item format. Validate only; never restructure it.
- If the project already has a uv-locked Doorstop dependency, use `uv run doorstop ...`.
- Otherwise use the isolated pinned runner: `uvx doorstop@3.2 ...` (3.2 help verified locally).
- Never add a `pyproject.toml`, lockfile or dependency to an arbitrary existing project.

## 4. Create the standard tree (only when no `.doorstop.yml` exists anywhere)

Only when no `.doorstop.yml` exists anywhere in the project, create the standard tree with the Doorstop
CLI — never by hand-writing `.doorstop.yml` or item YAML:

```sh
uvx doorstop@3.2 create -s - -i yaml EPIC reqs/epic
uvx doorstop@3.2 create -s - -i yaml -p EPIC SYS reqs/sys
uvx doorstop@3.2 create -s - -i yaml -p SYS VER reqs/ver
```

This yields `reqs/epic` as root `EPIC`, `reqs/sys` with parent `EPIC`, and `reqs/ver` with parent `SYS`,
using the `-` separator so UIDs read `EPIC-001`, `SYS-001`, `VER-001`. Use `uv run doorstop ...` instead
when the project has a uv-locked Doorstop dependency.

Do not create sample requirements. An empty document tree is a valid starting point.

## 5. Requirements README

When this run created the standard tree, create a concise `reqs/README.md` that describes:

- the `EPIC → SYS → VER` hierarchy;
- that beads own claims/work/progress/evidence and Doorstop owns requirement text, UIDs and traceability,
  and that beads reference requirement UIDs;
- that early candidate requirements are normal, while formal approval and baselining are later decisions;
- the uv commands used to run Doorstop in this project.

Never overwrite an existing `reqs/README.md`; report that it already exists instead.

## 6. Validate

```sh
uv run doorstop --no-reformat
# or, in a project without a uv-locked Doorstop:
uvx doorstop@3.2 --no-reformat
```

- Inspect `git status` afterwards: Doorstop may stage files. Report the exact state.
- Do not commit anything.

## 7. Idempotency and conflicts

- Re-running inspects and creates only what is missing.
- A conflict with existing state stops the scaffold with a concrete error (what exists, what differs,
  which command was refused). Never continue past a conflict and never report partial success as success.
- Report the created paths, every command with its exit status, and the validation evidence.

## 8. doorstop-edit compatibility (structural only)

The official `ownbee/doorstop-edit` project depends on Doorstop API `>=3.0.2,<4`, accepts an optional
project directory, and its sample tree uses `.doorstop.yml` YAML items with `sep: '-'`. The structure
created here is compatible with that shape. This is a statement about source-level compatibility only,
not proof that the GUI works against this tree.
