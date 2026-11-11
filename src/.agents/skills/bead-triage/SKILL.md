---
name: bead-triage
description: Shared core for the thin /bt_* bead triage commands (continue, complete, add, status, tests, reflect, scaffold). Use when an entry point explicitly loads @bead-triage and selects one mode; it provides the shared execution, triage, verification and stopping rules.
metadata: opencode/autoinvoke: false
---

# Bead Triage

Shared core for the `/bt_*` command family. The entry point command selects the mode and loads exactly one
reference. Load only the reference the entry point asks for — never load several mode references at once.

## Reference paths

Every `references/...` path in this skill is relative to the directory containing this `SKILL.md`
(`~/.agents/skills/bead-triage/`). Resolve it against that directory, never against the current repository or
the current working directory. Open the exact file that is named; for example
`references/execution.md` means `~/.agents/skills/bead-triage/references/execution.md`.

## Session and actors

- Work in the current session and preserve the existing agent and model selection.
- The main loop remains responsible for decisions, verification and up-to-date beads administration.
- An agent summary is never evidence. Only artifacts, beads state, test output and read-backs count as evidence.
- Communicate with the user in Dutch; write all artifact text in English.

## Mode map

| Mode | Reference | Purpose |
| --- | --- | --- |
| `continue` / `complete` | `references/execution.md` | Scope selection, reconciliation and triage, adaptive execution, approvals, reconcile, stop/pause |
| `status` / question | `references/status.md` | Read-only investigation and answer |
| `tests` | `references/tests.md` | Dedicated test verification and audit |
| `add` | `references/add.md` | Create one bead from a description |
| `reflect` | `references/reflect.md` | Session analysis and proposal, never asset changes |
| `scaffold` | `references/scaffold.md` | Explicit initialization of beads and Doorstop structures |

Shared prerequisite, CI and tooling repair rules live in `references/tooling.md`. `references/execution.md` and
`references/tests.md` point to it; the rules themselves are stated once, only there.

## Conditional requirements reference

`references/requirements.md` is a conditional addendum, not a mode. Load it **only** in `add`,
`continue`/`complete`, `status` and `tests` modes, and **only** when a real `.doorstop.yml` exists in the
project. Before deciding it is absent, recursively search the project for `**/.doorstop.yml` with hidden
files enabled, excluding `.git`, build output and vendored trees; never rely on a root-only read or directory
listing. If a configuration is found, load the addendum before any bead/requirement mutation. If none is found,
do not load it, touch no Doorstop tool, CLI, plugin or file, and continue the beads flow unchanged. If the
search itself fails, report the concrete detection error instead of assuming absence. `references/scaffold.md`
is loaded only by `/bt_scaffold`.

## Non-negotiable safety rules

These hold in every mode that touches beads, code or tools.

- Never commit, branch, push, release, delete, or run `br sync` without the explicit request and permission for that
  action. A close is not a commit.
- Never weaken, remove, skip or exclude tests to become green. Never add a convenience skip.
- Never grant a human approval yourself, and never register an approval that was not given.
- Never steal an active claim of another actor. Investigate stale claims and follow project rules.
- Never close a parent or epic while relevant children or acceptance criteria remain open.
- Always read back beads after updates (`br show <id> --json`) before claiming the state changed.
- Keep working through safely actionable work instead of asking for continuation after every bead.
- Use `br` and `bv` help as the authority on version-sensitive syntax and output contracts; prefer JSON output.
- Record unknown facts as unknown. Never guess status, evidence, or a completion claim.

## Missing skill or reference

If the requested skill or reference file cannot be loaded, stop and report the concrete error: the exact path that was
requested and the failure. Do not reconstruct a reduced workflow from memory, do not copy inline the missing procedure,
and do not continue with a partially known procedure.

If the failure says `project initialization or adapter handshake is not verified`, classify it as a project
Doorstop-bridge readiness blocker, not as a missing reference. Keep the exact path and error in the report and add:
`Run /doorstop_init recover, then /doorstop_init status. Recover performs the project checks and adapter handshake. If
recovery fails, report its exact output and stop; otherwise rerun the original /bt_* command once status is ready.` Never
enable, initialize or recover the bridge automatically, and never bypass its read denial with another tool, shell command
or inline reconstruction. Resume only after readiness is verified and the reference loads successfully.

## Contract for entry points

A wrapper command provides: the explicit skill load `@bead-triage`, the exact relative reference path, the mode, and
`$ARGUMENTS`. This skill does not implement a command-to-command dispatch; the entry point decides the mode.
