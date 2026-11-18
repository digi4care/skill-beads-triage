# Bead Triage — Triage (read-only)

Mode: `triage`. Entry forms: `/bt_triage` and `bead-triage triage`; in the direct form the leading `triage` token is
consumed and no runtime arguments are defined. This reference is read-only. It never claims, mutates, installs, repairs,
executes tests, or touches Doorstop tools/files/bridges. It adds no bridge-specific policy.

## Procedure

Gather current project context read-only, compactly and in parallel where possible:

```sh
br coordination status --json
br ready --json
bv --robot-triage --brief --robot-max-results 10 --format json
```

Note:

- `br ready` is the authoritative discovery of actionable issues (open, unblocked, not deferred).
- `bv --robot-triage` adds priorities, blockers, and health context.
- Consult the installed `br` and `bv` help for version-sensitive contracts.
- Prefer JSON output when the output contract is machine-readable.
- An empty result from `br ready` means no actionable ready work to report — not that everything is done.

For each reported issue from `br ready`, run `br show <id> --json` to confirm id, title, priority, dependencies, and
blockers from the persisted state before reporting.

## Report

Report the best ready issues, by default at most five, one compact entry per issue with exactly:

- issue id
- title
- priority
- reason (why this issue ranks here: priority, dependencies, staleness, evidence)
- blocker (concrete blocking dependency/reason, or explicitly `none`)
- exact next action (one concrete step, usually `/bt_continue <issue-id>` to claim and start it)

## Hard boundaries

- Never run `br update`, `br claim`, `br close`, `br dep`, or any other mutating tracker command.
- Never claim automatically — claiming stays explicit via `/bt_continue <issue-id>`.
- Report unknown facts as unknown.
- After reporting, stop — follow-up work starts only through `/bt_continue <issue-id>` at the user's explicit request.
