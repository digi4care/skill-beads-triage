# Bead Triage — Execution Mode

Mode: `continue` and `complete`. This reference owns scope selection, reconciliation and triage, adaptive execution,
approvals and blockers, reconcile, and stop/pause. Prerequisite, CI and tooling repair is defined once in
`references/tooling.md`; use that file instead of a duplicate section here.

## 1. Select the scope

- `/bt_continue [scope]` — resume the clear active or contextual scope.
- `/bt_complete <bead/epic|all>` — complete the given scope.
- An explicit bead or epic scope is restricted to that issue or its subtree.
- Only an explicit `complete all` makes the entire repository the scope. Any other meaning of "all" stays a question.
- For `continue`, first resume the clear active or contextual scope. If it cannot be determined, ask specifically which
  bead or epic is meant; do not silently start all repository beads.
- Automatically pick up newly unblocked or discovered tasks only when they fall within the selected scope. Record
  separate new work outside the scope as a bead without silently expanding the scope.
- Ask one targeted question only when the desired outcome or scope is genuinely ambiguous. Never ask the user technical
  control questions that you can answer from the repository, tests, CI, tools, or project instructions.

### Answer to a pending decision

If the arguments answer a previously requested approval or choice, process only the answer actually given. Record the
verdict where relevant, then resume the still-open execution cycle. Never register a human approval that was not given.

## 2. Start with reconciliation and triage

Read the applicable project instructions. Consult the installed `br` and `bv` help when syntax or output contracts are
version-sensitive, and use JSON for machine-readable results.

Start compactly and in parallel where possible:

```sh
br coordination status --json
br ready --brief --json
bv --robot-triage --brief --robot-max-results 10 --format json
```

Also use `br show <id> --json` for active or selected issues. Inspect worktree changes and available evidence read-only
to identify forgotten bead updates, unregistered changes, and earlier handoffs.

- Resume your own `in_progress` work, failed verification, returned rework, and documented resume points first.
- Do not simply take over another actor's fresh claim. Investigate stale claims and follow project rules; never steal
  active work.
- Then use `br ready` as authoritative discovery and `bv` for priorities, blockers, and health. An empty
  `bv --robot-next` result does not mean everything is done.
- Use `bv --robot-plan --format json` for dependency plans and `--robot-triage-by-track` for independent parallel tracks.
  Do not routinely use expensive insights/history/graph views.
- In execution mode, repair missing administration from actual artifacts. Record unknown facts as unknown; never guess
  status or evidence.

## 3. Execute each task adaptively

Repeat this cycle while safely actionable work remains within scope.

### A. Determine completion criteria and claim

Read current details, acceptance criteria, dependencies, notes, gates, and existing evidence. Determine which behavior and
relevant verification prove completion for each task; there is no universal test command. Inspect the existing
environment before concluding that something is unavailable.

If a real `.doorstop.yml` exists in the project, load `references/requirements.md` and follow its
continue/complete-mode step: read the linked requirements before implementing, change requirement content
only through the valid route, and record UIDs, progress and evidence in the bead. Before closing
requirement-bearing implementation or bug work, require valid traceability, current relevant evidence and
Doorstop `--no-reformat` validation; purely administrative work records why traceability is not applicable.
If no `.doorstop.yml` exists, skip this entirely: no Doorstop tool, CLI, plugin or file is touched.

Claim atomically before execution with an explicit actor:

```sh
br update <id> --claim --actor <actor> --json
br update <id> --append-notes "Started: <scope, approach, and next verification>." --actor <actor> --json
```

An epic with open children is not an executable leaf task. Work on the relevant actionable children in dependency order.

### B. Work and update beads immediately

Implement the acceptance criteria using the smallest appropriate approach. Use specialists for non-trivial or parallel
work, but separate write scopes and reconcile their results. After every specialist or meaningful state change, the main
loop inspects artifacts and updates the bead; never rely solely on a summary saying "done."

Prefer append-only notes and use `--if-unchanged <updated_at>` for updates based on a read revision. Record:

- actual progress and scope changes;
- tools, versions, and installation routes used;
- executed commands, exit statuses, and relevant evidence;
- skips, verification gaps, and their assessment;
- concrete blockers, dependencies, and the exact next step;
- approvals and the answers actually given.

For a failing test, keep the same bead open/in_progress. Record the failure and next step, diagnose, repair, and rerun.
Reopen an incorrectly closed bead when new evidence requires it.

New work required for the current acceptance criteria belongs to the active bead. Create a new bead with the relevant
dependency for a separately discovered issue; do not leave work existing only in a session response. Do not delete
issues or use force/bypass to evade policy, dependencies, or gates.

### C. Repair prerequisites and tooling yourself

A missing tool or broken CI route is investigation and repair work, not an automatic stopping condition. Follow
`references/tooling.md` for the full procedure, including the existing-route-first rule, isolated pinned installs,
checksums, CI state retrieval, and the prohibited-installation rules.

### D. Close only with evidence and verify persisted state

Before closing, check acceptance criteria, dependencies, current verification, and `br gate list <id> --json`. Request
required human review from the user; never provide it yourself.

Close with concrete evidence, not a generic assertion:

```sh
br close <id> --reason "Completed: <specific tests, checks, and results>" --actor <actor> --json
br show <id> --json
```

Do not close a parent/epic while relevant children or acceptance criteria remain open. "Partial," "standalone works," or
"waiting for stabilization" does not mean done. A technical dependency is not a passive stop: work on the prerequisite or
on safely independent work within scope.

Say "beads updated" only after `br show` or another relevant read-back confirms the persisted state. Re-triage after
closes, reopens, and dependency changes, then immediately start the next cycle. Do not ask "should I continue?" after
every bead.

Do not commit, branch, push, release, delete, or run `br sync` without the explicit request and permission required for
that action. A close is not a commit.

## 4. Approvals and genuine blockers

An optional confirmation or a check already covered by acceptance criteria is no reason to request approval repeatedly.
Batch genuine decisions where possible, give a concrete recommendation with consequences, and work on safely independent
tasks meanwhile.

Request human intervention only for matters such as:

- explicitly required human review/sign-off;
- a genuine scope or product decision that cannot be derived from sources;
- a forbidden, destructive, or unauthorized action;
- required credentials, payment, system privileges, or forbidden external access.

Record a genuine external blocker with a concrete reason and dependency. "No runner," "tool missing," "waiting for
stabilization," or "tests are failing" is not a valid conclusion without the investigation and repair in
`references/tooling.md`.

## 5. Reconcile before every final response

Recheck current beads and artifacts using relevant `br show`, `br coordination status`, `br ready`, and, when needed,
compact `bv --robot-triage` output.

- no closed bead without concrete evidence;
- no blocked bead without a concrete reason/dependency;
- no active claim of yours without recent progress and an exact next step;
- no requested test result without an evidence-based assessment;
- no code change without a linked bead;
- no outdated assertion contradicted by new evidence.

In execution mode, repair missing administration immediately and read the change back. When pausing or approaching a
context limit, record the active bead, actual state, evidence, open problem, and exact resume point. This is not
completion.

## 6. Stop or pause only when

Stop the execution loop only when:

1. all non-closed beads within scope are demonstrably complete; or
2. only genuine external blockers remain and no safely independent work within scope exists; or
3. a genuine human decision or unauthorized action is required; or
4. a concrete technical/tool failure prevents further progress after investigation and reasonable repair attempts; or
5. the user explicitly asks to stop.

Do not finish with only a summary while safely actionable work remains within scope. At a permitted stop, provide a
compact status with evidence, remaining blockers/gaps, and the next concrete action. This mode is not a daemon and cannot
guarantee continuity across crashes, context limits, or permission prompts; always leave a resumable state.
