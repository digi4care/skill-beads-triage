---
name: bead-triage
description: Shared core for bead triage in seven modes (continue, complete, add, status, tests, reflect, scaffold). Use when an entry point selects one mode, either through a thin wrapper command or through direct `bead-triage <mode> [arguments]` invocation; it provides the shared execution, triage, verification and stopping rules.
metadata: opencode/autoinvoke: false
---

# Bead Triage

Shared core for the bead triage family. An entry point selects one mode and loads exactly one reference. Load only
the reference the entry point asks for — never load several mode references at once.

Two entry forms are supported and behave identically once a mode is selected:

- **Wrapper invocation.** A thin OpenCode command (for example `/bt_continue`) selects the mode itself and names the
  reference to load.
- **Direct invocation.** The skill is called directly as `bead-triage <mode> [arguments]`.

## Direct invocation

Parse the first token of the invocation arguments as the mode token. Match it against the mode map below, case
sensitively, after trimming surrounding whitespace.

- A known mode token selects that mode. The remaining tokens are the runtime arguments for the selected mode; pass
  them through unchanged and never treat the mode token itself as a runtime argument.
- A missing mode token, or a token that is not one of the seven known modes, stops the run. Reply with a concise
  usage line that lists the seven modes and nothing else. Do not load a reference, do not inspect the environment,
  do not guess a mode, and do not fall back to a default mode.

```text
Usage: bead-triage <continue|complete|add|status|tests|reflect|scaffold> [arguments]
```

Everything else in this document — the mode map, the reference paths, the safety rules, the missing-reference
handling — applies to direct invocation exactly as it applies to wrapper invocation.

## Reference paths

Every `references/...` path in this skill is relative to the directory containing this `SKILL.md`. Resolve it against
that directory, never against the current repository, the current working directory, or a hardcoded home directory.
The installation location differs per harness and per scope, so never assume a fixed home or project path; locate the
directory that holds the loaded `SKILL.md` and resolve against it. Open the exact file that is named; for example
`references/execution.md` means `<directory containing SKILL.md>/references/execution.md`.

## Session and actors

- Work in the current session and preserve the existing agent and model selection.
- The main loop remains responsible for decisions, verification and up-to-date beads administration.
- An agent summary is never evidence. Only artifacts, beads state, test output and read-backs count as evidence.
- Communicate with the user in Dutch; write all artifact text in English.

## Mode map

Each mode maps to exactly one reference. `continue` and `complete` are distinct modes that share the execution
reference; they differ in scope intent, not in the file that is loaded.

| Mode | Reference | Purpose |
| --- | --- | --- |
| `continue` | `references/execution.md` | Scope selection, reconciliation and triage, adaptive execution, approvals, reconcile, stop/pause |
| `complete` | `references/execution.md` | Same reference, with the completion scope as intent |
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
is loaded only in `scaffold` mode.

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
recovery fails, report its exact output and stop; otherwise rerun the original triage entry point once status is
ready.` Never
enable, initialize or recover the bridge automatically, and never bypass its read denial with another tool, shell command
or inline reconstruction. Resume only after readiness is verified and the reference loads successfully.

## Contract for entry points

An entry point provides the mode and the runtime arguments, and this skill resolves and loads the one mapped
reference. A harness wrapper may additionally state the exact relative reference path and how the skill is loaded in
that harness; that mechanism is harness-specific and is not part of this shared contract. This skill does not implement
a command-to-command dispatch; the entry point decides the mode.
