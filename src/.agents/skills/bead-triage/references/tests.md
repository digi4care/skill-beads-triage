# Tests: dedicated verification mode

Procedure for tests mode. Entry forms: `/bt_tests [scope]` and `bead-triage tests [scope]`. In the direct form the
leading `tests` token is consumed and the remaining tokens are the runtime arguments. Run and audit relevant tests for a
scope; do not change production code, claim or close beads, or continue into the general work loop unless the user
separately requests that work.

## 1. Select the scope

- With an explicit bead, epic, or repository scope, use that scope.
- Without a scope, use the clear active bead.
- If there is no clear active bead, use the current repository's standard test route.
- Ask a targeted question only when multiple active scopes make the intended target genuinely unclear.

Determine the relevant acceptance criteria and the test route for the selected scope. There is no universal test command: read the project instructions, CI workflows, package scripts, and existing test layout.

## 2. Repair prerequisites when needed

A missing tool or broken test route is repair work, not a stopping condition. Read `references/tooling.md` **only when** a prerequisite is actually missing or broken, and follow it. Do not copy tooling steps into this file and do not run the tooling route when the existing route works.

## 3. Run focused checks, then broader checks

- Run focused checks first, then the relevant broader checks.
- Never select only favorable suites.
- Preserve exact commands, exit statuses, and relevant error lines.

## 4. Audit every result

For every test result, automatically check for `failed`, `skipped`, `xfail`, `todo`, `ignored`, `disabled`, deselected, and relevant unexecuted tests. Do not wait for the user to ask.

For each anomaly, determine yourself:

- test name or ID
- location
- technical reason
- cause
- pre-existing or new status
- relevance to the change under test

Classification rules:

- A legitimate platform or environment skip may remain when its reason is correct and the missing coverage does not leave the changed behaviour unproven.
- If a skipped test must prove the changed behaviour, run it in the correct environment or keep an explicit verification gap open.
- For a claim such as "passed earlier", check the command, run, date, commit/worktree, and currency. A historical pass does not automatically prove the current change.
- A CI failure before the test step means those tests did not run.
- Never add a convenience skip and never remove, weaken, or exclude tests to become green.

## 5. Record evidence

Record concrete test evidence in an explicitly linked active bead. Keep that bead open when its required verification fails or remains incomplete; do not close it on a partial or failed run.

If a real `.doorstop.yml` exists in the project, load `references/requirements.md` and follow its
tests-mode step: link the exact evidence to the requirement UIDs in the explicitly linked active bead, and
update or create `VER` items through the valid route only when the evidence warrants it. No production code
change, no claim, no close. If no `.doorstop.yml` exists, skip this entirely.

- Read the bead back after the update to confirm the persisted state.
- Use append-only notes where the tool supports it.
- Keep evidence linked to the bead that was explicitly connected to this scope; do not create unrelated beads.
- No claim, no close, no general work loop without a separate request.

## 6. Report

Report the verdict in plain language:

- what is proven
- which skips are expected and relevant, and which are genuine verification gaps
- which evidence is current and which is historical
- which concrete follow-up remains

Ask only genuine decision questions that cannot be answered from available sources.
