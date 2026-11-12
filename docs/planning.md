# Requirements and Execution Planning

This repository separates requirement traceability from execution state.

## Doorstop

Doorstop owns requirement text, stable UIDs, parent links, and requirement-to-verification traceability. The
hierarchy lives under `reqs/`:

- `EPIC001` defines the repository-level objective.
- `SYS001` through `SYS008` define product and delivery requirements linked to `EPIC001`.
- `VER001` through `VER008` define the corresponding verification items linked to their SYS requirements.

Requirement files are managed through Doorstop, not edited as hand-written YAML. Validate the tree with:

```sh
uvx doorstop@3.2
```

A Doorstop `reviewed` fingerprint detects content changes; it is not a record of human approval.

## Harness compatibility planning

The repository keeps one canonical skill and routes harness differences through installer adapters. `SYS001` and
`VER001` cover direct mode routing and wrapper equivalence. `SYS002` and `VER002` cover adapter paths, registry v1
migration, shared ownership, and lifecycle safety. `SYS007` and `VER007` cover frontmatter validity of the packaged
skill and command files and the portable invocation-control field. `SYS008` and `VER008` cover validation of the
published artifact: the packed tarball is inspected during release validation, and `bt-triage doctor` reports
invalid frontmatter in packaged documents and in installed copies. Documentation may describe generic
`.agents/skills/` installation support, but must not turn that path compatibility into a claim of runtime
certification for every harness.

## beads_rust and beads_viewer

The `br` tracker owns implementation tasks, dependencies, claims, progress, evidence, and closure. Relevant bead
descriptions use `Requirements: <UIDs>` to reference Doorstop items. Doorstop links never contain mutable bead IDs.
Only `br` is used for tracker mutations in this repository; `bd` is not a supported alternative here.

After beads exist, `bv` provides read-only graph-aware triage. Use noninteractive robot output rather than launching
the terminal UI:

```sh
br ready --json
bv --robot-triage --brief
br dep cycles --json
```

Tracker commands do not authorize Git staging, commits, pushes, `br sync`, tags, releases, or publication. Those
actions each require explicit user authorization.
