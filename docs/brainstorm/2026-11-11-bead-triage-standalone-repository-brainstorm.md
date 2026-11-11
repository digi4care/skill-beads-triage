---
date: 2026-11-11
topic: "Standalone OpenCode bead-triage repository"
status: accepted-for-implementation
---

# Brainstorm: standalone OpenCode bead-triage repository

## Problem and context

The current directory contains a bead-triage skill and a copied installer/package manifest from another Pi Skills project. The user wants an official standalone repository for the complete OpenCode workflow, with correct package/repository metadata, professional documentation and quality checks, Doorstop requirements, beads work planning, and beads_viewer triage.

The directory is not currently a Git worktree. The copied manifest and installer still contain Pi Skills names, paths, repository URLs, version `3.2.14`, and behavior unrelated to this product. Dependencies are not installed locally. The proposed GitHub repository and scoped npm package were not publicly resolvable during research on 2026-11-11.

## Goals

- Publishable source layout for the `bead-triage` skill and all seven `/bt_*` OpenCode commands.
- A safe installer supporting global, project, and custom-target installation without unrelated Pi Skills behavior.
- Correct npm metadata and CLI identity for this repository.
- English repository artifacts, with Dutch retained for interactive communication with the user.
- Semantic Versioning starting at `0.1.0`, a Keep a Changelog changelog, and no automatic release or publish.
- Doorstop-owned requirements/traceability and beads-owned execution state.
- AGENTS.md instructions generated/enriched through beads CLI support after `br init` and bead creation.
- Reproducible linting, tests, package checks, and GitHub Actions CI.
- Dependencies updated before every push, subject to a mandatory seven-day release-age policy.

## Constraints and preferences

### Confirmed constraints

- Target OpenCode `.agents` skills, not Pi `.omp` skills and not a dual-target installer.
- Install the skill and all seven command wrappers: `bt_continue`, `bt_complete`, `bt_add`, `bt_status`, `bt_tests`, `bt_reflect`, and `bt_scaffold`.
- Start public versioning at `0.1.0`.
- Use GitHub Actions for lint, tests, and package verification; tags and publishing remain manual and require an explicit user command.
- Use `npm-check-updates` to keep dependencies current.
- Never treat releases younger than seven days as eligible automatic updates. Project npm configuration must preserve `min-release-age=7`.
- Run dependency freshness checks and full validation before any push. CI repeats the freshness check and fails when an eligible update exists.
- Do not invoke `bv --help` until beads have been created.
- Do not commit, branch, push, tag, publish, or release without explicit permission.
- Repository artifacts are English; conversation with the user remains Dutch.

### Working assumptions

- Repository: `digi4care/skill-beads-triage`.
- npm package: `@digi4care/skill-beads-triage`.
- CLI executable: `bt-triage` from `bin/bt-triage.js`.
- Existing MIT license intent carries over, but a LICENSE file still needs to be added/reviewed.
- Runtime support remains Node.js 20 or newer if the rewritten installer permits it; contributors and CI use a Node version supported by current npm-check-updates, preferably Node 24.15.0 or newer.

## Explored ideas and alternatives

### Source and installation layout

Selected direction:

- `src/.agents/skills/bead-triage/SKILL.md` plus `references/` is the canonical skill. The extra `bead-triage/` directory is required because OpenCode derives the skill ID from the directory containing `SKILL.md`.
- `src/.opencode/commands/` contains seven Markdown command templates. Each loads `@bead-triage` and exactly one mode reference, with no forced agent/model/subagent selection.
- Global installation targets `~/.agents/skills/bead-triage/` and `~/.config/opencode/commands/`.
- Project installation targets `<project>/.agents/skills/bead-triage/` and `<project>/.opencode/commands/`.
- Custom installation targets `<target>/.agents/...` and `<target>/.opencode/...`.
- One installation registry tracks both asset groups. Uninstall removes only registered files, preserves unregistered user files, and never uses broad recursive deletion.

OpenCode documentation does not place commands under `.agents/commands`; using that path was rejected. Pi and simultaneous Pi/OpenCode targets were explicitly rejected by the user.

### Installer behavior

Replace copied Pi branding, source paths, repository URLs, package names, and nonexistent executable mappings. Keep useful install/uninstall/list/info/doctor functionality where it applies. Replace Git-based synchronization and automatic commits with registry-based update/uninstall behavior. The copied `sync` behavior (`br sync --flush-only`, staging `.beads`, and committing) must not survive as installer behavior.

Updates should come from the npm package or a local package source, with dry-run and clear collision handling. Existing modified installations must not be silently overwritten.

### Requirements and execution planning

Doorstop owns requirement text, stable UIDs, parent links, and requirement-to-verification traceability. Beads owns tasks, dependencies, claims, blockers, progress, evidence, and closure. Bead descriptions refer to Doorstop UIDs through `Requirements: <UIDs>`; Doorstop items never link to mutable bead IDs.

Create the requirements hierarchy through Doorstop's CLI using the existing pinned `uv`/`uvx` route, not hand-written Doorstop YAML. The intended structure is an EPIC root, SYS requirements, and VER verification items under `reqs/`, consistent with the skill's scaffold reference. Initialize beads, create linked work items, run `br agents --add`, and add repository-specific agent rules. Only after beads exist may `bv --help` and compact viewer triage be used.

### Package identity and metadata

Replace all copied Pi Skills values. Planned core metadata:

- `name`: `@digi4care/skill-beads-triage`
- `version`: `0.1.0`
- `description`: an accurate statement that the package installs the bead-triage skill and `/bt_*` commands for OpenCode.
- `bin.bt-triage`: `./bin/bt-triage.js`
- `repository.url`: `git+https://github.com/digi4care/skill-beads-triage.git`
- matching `homepage` and `bugs.url`
- `type`: `module`, `license`: `MIT`, relevant keywords, explicit package `files`, and public scoped-package publish configuration.

The package must include only runtime installer files, canonical OpenCode assets, and essential documentation—not Doorstop planning, beads state, tests, research, or CI configuration.

### Dependency freshness and seven-day security delay

Use both layers documented by the tools:

- Project `.npmrc`: `min-release-age=7` so npm itself will not install releases younger than seven days.
- npm-check-updates scripts with explicit `--cooldown 7d` so update discovery uses the same policy even when run outside npm's configuration inheritance.

Provide a read-only dependency check using `--errorLevel 2`, a tested update workflow, full validation, and a pre-push script combining freshness and validation. A doctor-based update can run `npm run validate` for each upgrade and revert broken upgrades. CI fails rather than silently modifying dependencies. Any exception for a fresh security fix is a separate explicit user decision.

A read-only check on 2026-11-11 found eligible updates for Biome, Inquirer, YAML, Chalk, and markdownlint-cli2. Chalk 6 and markdownlint-cli2 0.24 require regression testing because they cross major or major-version-zero boundaries.

### Documentation, quality, and releases

- Rewrite README.md for this product: purpose and rationale, creator information for Chris Engelhard, <chris@chrisengelhard.nl>, with a link to <https://github.com/digi4care>, requirements, install scopes, commands, update/uninstall behavior, development, dependency policy, and manual release process. Explain specifically that the skill makes beads_rust (`br`) triage repeatable and traceable without overloading the main agent with tool-specific process details; do not describe it as targeting the original Beads tool with `bd`.
- Start CHANGELOG.md using Keep a Changelog and SemVer, with `0.1.0` as the initial release and no invented earlier history.
- Add AGENTS.md with beads-generated guidance plus repository-specific validation, safety, artifact-language, Doorstop/beads ownership, and pre-push rules.
- Use Biome for JavaScript/JSON formatting and linting, markdownlint-cli2 for Markdown, and Node's built-in test runner for installer unit/integration tests.
- Test the actual packed tarball in a temporary target, including global/project/custom path mapping, command loading references, collisions, upgrades, and safe uninstall.
- GitHub Actions runs on pushes and pull requests. Release tags and npm publication remain manual.

## Evaluation

### Supported by evidence

- Official OpenCode V2 documentation establishes skill and command locations and path-derived skill IDs.
- `br --help`, `br agents --help`, and `br create --help` confirm the required initialization, creation, and AGENTS.md workflows.
- Official npm-check-updates documentation confirms cooldown, update, doctor, and CI exit-code behavior.
- Official npm v11 documentation confirms that `min-release-age=7` means seven days.
- Local npm already has `min-release-age=7`; Node `24.15.0`, npm `12.2.1`, and ncu `22.2.1` satisfy current tool requirements.

### Counterarguments and risks

- A seven-day age gate can delay a security fix; exceptions must never be silent.
- Making CI fail on every eligible update adds maintenance work but directly enforces the user's push policy.
- Global skills and global commands live in different parent directories, so registry and uninstall tests are safety-critical.
- Supporting Node 20 for consumers while current npm-check-updates requires newer Node for contributors must be documented clearly and tested separately.
- The copied installer is large and product-specific behavior must be removed rather than renamed superficially.

### Confidence and uncertainty

High confidence in installation paths and dependency-policy mechanics. Exact CLI ergonomics and test boundaries remain implementation choices within the stated direction. GitHub/npm 404 results do not prove that the signed-in account has permission to create or publish those identities.

## Unresolved questions

- Local Git initialization and MIT licensing were approved after this brainstorm. Development now uses a Node.js
  version supported by npm-check-updates 22 (`^22.22.2 || ^24.15.0 || >=26.0.0`).
- Should the GitHub repository itself later be created as public, private, or left for the user to create manually?
  Remote creation and any push remain separate permissions.

## Evidence and next inquiries

- OpenCode installation research: `/home/digi4care/projects/opencode-agents/research/2026-11-11-opencode-skill-command-install-paths.md`.
- Dependency policy research: `/home/digi4care/projects/opencode-agents/research/2026-11-11-npm-dependency-update-policy.md`.
- Official OpenCode docs: <https://opencode.ai/v2/docs/skills>, <https://opencode.ai/v2/docs/commands>, and <https://opencode.ai/v2/docs/config>.
- npm-check-updates: <https://github.com/raineorshine/npm-check-updates>.
- npm release-age configuration: <https://docs.npmjs.com/cli/v11/using-npm/config#min-release-age>.
- Recheck dependencies with the seven-day cooldown immediately before implementation and before every push.

## Handoff notes

Proceed as a standalone OpenCode package, not as a rename of Pi Skills. Preserve the skill's safety boundaries and Doorstop/beads ownership split. Do not invent prior releases, remote repository state, publish permissions, or license approval. Build a working vertical slice first (canonical assets plus safe project/custom installer), then complete global installation, documentation, planning artifacts, CI, and full tarball verification. No push or publication is authorized by this brainstorm.
