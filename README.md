# bead-triage for agent harnesses

A portable [Agent Skills](https://agentskills.io/specification) package for repeatable, traceable issue triage with
[beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`). Harness adapters install one canonical skill;
OpenCode additionally receives seven `/bt_*` commands. Optional Doorstop integration connects implementation work to
stable requirements and verification items.

## Why this skill exists

beads_rust provides the tracker, but an agent still needs a consistent procedure for selecting work, checking
claims, recording evidence, and deciding when to stop. This package moves that procedure into a focused skill so
the main agent does not have to reconstruct tool-specific triage rules in every session.

The workflow uses `br`, not the original Beads `bd` CLI. [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)
(`bv`) adds read-only, graph-aware triage after beads exist. Doorstop remains optional except when explicitly using
scaffold mode or working in a project that already has Doorstop configuration.

## Compatibility and invocation

The skill instructions and references are shared. Discovery paths and invocation syntax are harness-specific; the
Agent Skills specification does not standardize slash commands or prompt arguments.

| Adapter | Harness | Primary invocation | Installed assets |
| --- | --- | --- | --- |
| `opencode` | OpenCode | `/bt_<mode> [args]` | Canonical skill plus seven command wrappers |
| `claude` | Claude Code | `/bead-triage <mode> [args]` | Canonical skill in `.claude/skills/` |
| `codex` | Codex CLI | `$bead-triage <mode> [args]` | Canonical skill in `.agents/skills/` |
| `pi` | Pi | `/skill:bead-triage <mode> [args]` | Canonical skill in `.agents/skills/` |
| `agents` | Documented Agent Skills consumers | Native skill invocation with `<mode> [args]` | Canonical skill in `.agents/skills/` |

The `agents` adapter uses paths documented by consumers including Codex, Cursor, Gemini CLI, Pi, OpenCode, and the
VS Code Local harness. It is a generic **skill installation route**, not a claim of universal runtime compatibility
or universal `/bt_*` support. Claude Code requires its own adapter, and GitHub Copilot uses different paths that are
not currently installed by this package.

Claude Code invokes the canonical skill directly; no legacy `.claude/commands/` files or extra wrapper skills are
installed. Current Codex CLI releases no longer support the former custom-prompt mechanism, so the Codex adapter
also uses direct skill invocation rather than prompt files.

Every adapter installs the same canonical skill file. Its frontmatter sets `disable-model-invocation: true`, the
portable field that OpenCode, Claude Code, and Pi all honour, so the skill loads only through an explicit command
or a direct invocation. The field is not part of the Agent Skills specification; a harness that ignores it, such as
the Codex CLI, may still load the skill automatically.

## Modes and OpenCode commands

| Mode | OpenCode command | Purpose |
| --- | --- | --- |
| `continue` | `/bt_continue [scope]` | Resume the active or contextual scope and continue safely actionable work. |
| `complete` | `/bt_complete <bead/epic\|all>` | Complete a bead or epic; only literal `all` selects the repository. |
| `add` | `/bt_add <description>` | Add one work item with the required traceability and validation. |
| `status` | `/bt_status [scope]` | Inspect and explain current state without changing it. |
| `tests` | `/bt_tests [scope]` | Run the dedicated test verification and audit workflow. |
| `reflect` | `/bt_reflect [scope]` | Analyze a session and propose reusable improvements without editing assets. |
| `scaffold` | `/bt_scaffold [project-directory]` | Explicitly initialize beads and Doorstop structures in an existing Git worktree. |

Every OpenCode command loads the shared skill and exactly one mode reference while preserving the current agent and
model selection. Direct skill invocation routes `<mode>` through the same reference mapping. Missing or unknown
modes stop with usage instead of guessing.

Interactive communication follows the skill's Dutch-language convention; repository artifacts and tracking records
are written in English. Harness-specific tool and session capabilities remain subject to the skill's safety gates;
for example, reflect mode does not assume OpenCode session environment variables in another harness.

## Requirements

For installing the assets:

- Node.js 20 or newer.
- A supported harness with the documented skill or command discovery support.

For using the workflow:

- `br` available on `PATH`.
- `bv` recommended for graph-aware triage.
- `uv` or `uvx` when Doorstop scaffolding or requirements management is needed.

## Installation

This package is distributed through GitHub releases; it is not published to the npm registry. Download the release
artifact and unpack it:

```sh
gh release download v0.1.0 --repo digi4care/skill-beads-triage --pattern "*.tgz"
tar -xzf digi4care-skill-beads-triage-0.1.0.tgz
```

The unpacked `package/` directory holds the CLI and every packaged asset. The CLI has no runtime dependencies, so it
runs straight from the unpacked directory:

```sh
node package/bin/bt-triage.js install --global --harness all
```

Select an adapter with `--harness`. The default remains `opencode` for backwards compatibility. Use `all` to install
every explicit adapter; shared skill files are registered to each owner without being copied from separate sources.

### Global installation

```sh
bt-triage install --global --harness opencode
bt-triage install --global --harness claude
bt-triage install --global --harness codex
bt-triage install --global --harness pi
bt-triage install --global --harness agents
```

Or install all supported adapters:

```sh
bt-triage install --global --harness all
```

Global destinations are:

| Adapter | Destination |
| --- | --- |
| `opencode` | `~/.agents/skills/bead-triage/` and `~/.config/opencode/commands/bt_*.md` |
| `claude` | `~/.claude/skills/bead-triage/` |
| `codex`, `pi`, `agents` | `~/.agents/skills/bead-triage/` |

### One project

Run from the project root:

```sh
bt-triage install --project --harness opencode
bt-triage install --project --harness claude
bt-triage install --project --harness codex
```

Or invoke the package without installing its CLI globally:

```sh
node package/bin/bt-triage.js install --project --harness all
```

Project destinations are `.agents/skills/bead-triage/` for every adapter except Claude Code, which uses
`.claude/skills/bead-triage/`. OpenCode additionally installs `.opencode/commands/bt_*.md`.

### Custom target

```sh
bt-triage install --target /path/to/project --harness all
```

A custom target uses the same relative layout as a project installation. Preview any installation without writing
files:

```sh
bt-triage install --project --harness all --dry-run
```

## Updates, diagnostics, and removal

After updating to a newer release artifact, refresh already installed assets:

```sh
bt-triage update --global --harness all
bt-triage update --project --harness claude
bt-triage update --target /path/to/project --harness opencode
```

Useful inspection commands:

```sh
bt-triage list
bt-triage info project
bt-triage info global
bt-triage info /path/to/custom-target
bt-triage doctor
bt-triage --help
```

Remove one adapter or every adapter managed by the installer:

```sh
bt-triage uninstall --project --harness claude --dry-run
bt-triage uninstall --project --harness all
```

Each scope has a `.bt-triage-registry.json` containing registered paths and SHA-256 checksums per harness. Adapters
that share `.agents/skills/bead-triage/` share ownership records: uninstalling one adapter keeps files required by
another, and only the last owner can remove an unchanged shared file. Existing OpenCode registries are migrated
transparently.

Uninstall preserves locally modified and unregistered files and removes only empty managed directories. Install and
update report collisions instead of silently overwriting them. Use `--force` only after inspecting the reported
files; it permits overwriting modified or unregistered targets.

The installer never runs `br sync`, stages or commits Git changes, pushes, publishes, or creates releases.

`bt-triage doctor` also verifies that every packaged document and every installed copy carries frontmatter that
parses as YAML. Harnesses skip a document with broken frontmatter without reporting it, so the check names the
offending file instead.

## Requirements and execution planning

This repository uses Doorstop for requirement text, stable UIDs, links, and verification traceability. It uses
beads_rust for tasks, dependencies, claims, evidence, and closure. See [docs/planning.md](docs/planning.md) for the
ownership boundary and inspection commands. Planning artifacts are repository-only and are not included in the release
artifact.

## Development

Use a Node.js version supported by the current development tools: `^22.22.2`, `^24.15.0`, or `>=26.0.0`. The
installed CLI itself supports Node.js 20 and newer.

```sh
npm ci
npm run check          # Biome, Markdown lint, and Node.js tests
npm run verify:package # inspects the packed tarball, not only the working tree
npm run validate       # check + dependency freshness + audit + package dry run + packed-tarball check
npm run prepush        # required successful check before any authorized push
```

GitHub Actions runs `npm run validate` on pushes, pull requests, and manual workflow dispatch. CI contains no tag,
release, or publication step.

Filesystem installation tests and packed-CLI lifecycle checks verify the adapters shipped by this repository. They
do not replace runtime smoke tests in each harness CLI, and compatibility documentation distinguishes documented
support from behavior exercised locally.

### Dependency policy

Project `.npmrc` sets `min-release-age=7`. npm-check-updates uses the equivalent explicit `--cooldown 7d` policy:

```sh
npm run deps:check     # read-only; fails when an eligible update exists
npm run deps:update    # doctor mode tests upgrades and reverts breaking updates
npm run validate
```

Only dependency releases at least seven days old are eligible. A security exception requires a separate explicit
decision; it is never applied silently. The manifest temporarily overrides transitive `katex` and `re2js` versions
to patched releases because the latest markdownlint dependency ranges otherwise select vulnerable versions. Remove
those overrides only when the normal dependency tree passes `npm audit` without them.

The release artifact itself has no runtime dependencies. `yaml` stays a development dependency, used by the test
suite and the release validation, so the published CLI runs from an unpacked tarball without an install step.

## Versioning and releases

This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/). The initial public version is `0.1.0`. During `0.x`, minor versions
may contain breaking changes; patch versions remain backwards compatible. See [CHANGELOG.md](CHANGELOG.md).

Releases are manual and require explicit authorization. Distribution runs through GitHub releases, not the npm
registry. A maintainer performs a release by running the full validation, choosing the appropriate SemVer bump,
reviewing the changelog and the packed tarball, and only then creating the version tag and publishing the release:

```sh
npm run validate
npm run release:tarball
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 release/digi4care-skill-beads-triage-0.1.0.tgz --title "v0.1.0" --notes-file release/release-notes.md
```

The tarball is attached to the release as a download, so every consumer installs the same artifact the maintainer
validated. The validation inspects that tarball itself, so a release cannot ship a document that no harness can load.

## Creator

Created and maintained by **Chris Engelhard**.

- Email: [chris@chrisengelhard.nl](mailto:chris@chrisengelhard.nl)
- GitHub: [digi4care](https://github.com/digi4care)
- Project: [digi4care/skill-beads-triage](https://github.com/digi4care/skill-beads-triage)

## License

[MIT](LICENSE) © 2026 Chris Engelhard.
