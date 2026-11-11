# bead-triage for OpenCode

An OpenCode skill and seven `/bt_*` commands for repeatable, traceable issue triage with
[beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`). Optional Doorstop integration connects
implementation work to stable requirements and verification items.

## Why this skill exists

beads_rust provides the tracker, but an agent still needs a consistent procedure for selecting work, checking
claims, recording evidence, and deciding when to stop. This package moves that procedure into a focused skill so
the main agent does not have to reconstruct tool-specific triage rules in every session.

The commands use `br`, not the original Beads `bd` CLI. [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)
(`bv`) adds read-only, graph-aware triage after beads exist. Doorstop remains optional except when explicitly using
`/bt_scaffold` or working in a project that already has Doorstop configuration.

## Included commands

| Command | Purpose |
| --- | --- |
| `/bt_continue [scope]` | Resume the active or contextual scope and continue safely actionable work. |
| `/bt_complete <bead/epic\|all>` | Complete a bead or epic; only literal `all` selects the repository. |
| `/bt_add <description>` | Add one work item with the required traceability and validation. |
| `/bt_status [scope]` | Inspect and explain current state without changing it. |
| `/bt_tests [scope]` | Run the dedicated test verification and audit workflow. |
| `/bt_reflect [scope]` | Analyze a session and propose reusable improvements without editing assets. |
| `/bt_scaffold [project-directory]` | Explicitly initialize beads and Doorstop structures in an existing Git worktree. |

Every command loads the shared `bead-triage` skill and exactly one mode reference. Commands preserve the current
OpenCode agent and model selection. Interactive communication follows the skill's Dutch-language convention;
repository artifacts and tracking records are written in English.

## Requirements

For installing the assets:

- Node.js 20 or newer.
- OpenCode with support for `.agents` skills and `.opencode` commands.

For using the workflow:

- `br` available on `PATH`.
- `bv` recommended for graph-aware triage.
- `uv` or `uvx` when Doorstop scaffolding or requirements management is needed.

## Installation

Install the npm package globally, then choose where the OpenCode assets should live:

```sh
npm install --global @digi4care/skill-beads-triage
```

### Global OpenCode installation

```sh
bt-triage install --global
```

This installs:

- `~/.agents/skills/bead-triage/`
- `~/.config/opencode/commands/bt_*.md`

### One project

Run from the project root:

```sh
bt-triage install --project
```

Or invoke the package without installing its CLI globally:

```sh
npx --package @digi4care/skill-beads-triage bt-triage install --project
```

This installs `.agents/skills/bead-triage/` and `.opencode/commands/bt_*.md` below the project root.

### Custom target

```sh
bt-triage install --target /path/to/project
```

A custom target uses the same layout as a project installation. Preview any installation without writing files:

```sh
bt-triage install --project --dry-run
```

## Updates, diagnostics, and removal

After updating the npm package, refresh already installed assets:

```sh
bt-triage update --global
bt-triage update --project
bt-triage update --target /path/to/project
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

Remove only the files managed by the installer:

```sh
bt-triage uninstall --project --dry-run
bt-triage uninstall --project
```

Each scope has a `.bt-triage-registry.json` containing registered paths and SHA-256 checksums. Uninstall preserves
locally modified and unregistered files, and removes only empty managed directories. Install and update report
collisions instead of silently overwriting them. Use `--force` only after inspecting the reported files; it permits
overwriting modified or unregistered targets.

The installer never runs `br sync`, stages or commits Git changes, pushes, publishes, or creates releases.

## Requirements and execution planning

This repository uses Doorstop for requirement text, stable UIDs, links, and verification traceability. It uses
beads_rust for tasks, dependencies, claims, evidence, and closure. See [docs/planning.md](docs/planning.md) for the
ownership boundary and inspection commands. Planning artifacts are repository-only and are not included in the npm
package.

## Development

Use a Node.js version supported by the current development tools: `^22.22.2`, `^24.15.0`, or `>=26.0.0`. The
installed CLI itself supports Node.js 20 and newer.

```sh
npm ci
npm run check          # Biome, Markdown lint, and Node.js tests
npm run validate       # check + dependency freshness + audit + package dry run
npm run prepush        # required successful check before any authorized push
```

GitHub Actions runs `npm run validate` on pushes, pull requests, and manual workflow dispatch. CI contains no tag,
release, or npm publication step.

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

## Versioning and releases

This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/). The initial public version is `0.1.0`. During `0.x`, minor versions
may contain breaking changes; patch versions remain backwards compatible. See [CHANGELOG.md](CHANGELOG.md).

Tags and publication are manual and require explicit authorization. A maintainer performs a release by running the
full validation, choosing the appropriate SemVer bump, reviewing the changelog and packed tarball, and only then
creating the version tag and running `npm publish`. `prepublishOnly` runs validation again as a final safeguard.

## Creator

Created and maintained by **Chris Engelhard**.

- Email: [chris@chrisengelhard.nl](mailto:chris@chrisengelhard.nl)
- GitHub: [digi4care](https://github.com/digi4care)
- Project: [digi4care/skill-beads-triage](https://github.com/digi4care/skill-beads-triage)

## License

[MIT](LICENSE) © 2026 Chris Engelhard.
