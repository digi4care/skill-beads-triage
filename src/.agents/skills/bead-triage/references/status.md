# Bead Triage — Status and Questions (read-only)

Mode: `status` and free-form questions. Entry forms: `/bt_status [scope]` and `bead-triage status [scope]`; in the
direct form the leading `status` token is consumed and the remaining tokens are the runtime arguments. This reference is
read-only. It never claims, mutates, installs, or repairs anything.

## Procedure

For a question, analysis, `status`, an explanation request, or an assessment only:

- Investigate read-only and answer directly with evidence.
- Read relevant beads, code, tests, CI, and logs.
- Do not claim or change anything, install anything, or repair administration.
- Only report any administrative discrepancies found.

## Scope

- An explicit bead or epic scope is restricted to that issue or its subtree.
- Without an explicit scope, use the clear active bead; if there is none, report repository-level status derived from
  beads and the available evidence. Ask a targeted question only when multiple active scopes make the intended target
  genuinely unclear.
- Repository-level status is a read-only synthesis of beads and available evidence. It never means selecting or running
  a test route, and it never triggers test execution.
- Read-only status means: no `br update`, no `br close`, no claim, no install, no repair, no test mutation.

## Requirements (conditional)

If a real `.doorstop.yml` exists in the project, load `references/requirements.md` and follow its
status-mode step: report the detected mode, linked UIDs, traceability gaps and suspect/unreviewed state
read-only. Never execute tests and never repair anything. If no `.doorstop.yml` exists, skip this
entirely: no Doorstop tool, CLI, plugin or file is touched.

## Evidence

- Evidence comes from beads, code, tests, CI, and logs in the repository. An agent summary or a recollection is not
  evidence.
- Prefer JSON output from `br` and `bv` when the output contract is machine-readable. Consult the installed `br` and `bv`
  help when syntax or output contracts are version-sensitive.
- Unknown facts are reported as unknown; never guess status or evidence.
- Report discrepancies between beads, code, tests, CI, and logs explicitly and separately from the answer itself.

## Answering

- Answer the question that was asked, in plain language, with concrete evidence and the exact commands or files used.
- Report administrative discrepancies found; do not fix them in this mode.
- Ask only genuine decision questions that cannot be answered from available sources.
