# Requirements: Doorstop traceability (conditional reference)

Conditional reference for the `add`, `continue`/`complete`, `status` and `tests` modes.

Load this file **only** when the selected mode is one of those four **and** a real Doorstop document
configuration (`.doorstop.yml`) exists in the project. When no `.doorstop.yml` exists anywhere in the
project, this file is not loaded at all and the beads flow continues unchanged.

## 1. Detection and mode selection

- Search the project root (recursively, excluding `.git`, build output and vendored trees) for a real
  `.doorstop.yml` document configuration.
- **No `.doorstop.yml` anywhere** → Doorstop is *absent*. Do not call any Doorstop tool, CLI or plugin
  route, do not create any requirement file, directory or configuration, and do not mention a missing
  requirements process as a blocker. Continue the normal beads flow. Zero Doorstop interaction is the
  correct behaviour, not a gap.
- **`.doorstop.yml` present** → determine the available route before acting:
  1. If a native Doorstop bridge/tool is available in this project, use it first and read its documented
     schema and status. Discover the commands and fields from the bridge's own documentation or help;
     never invent bridge commands, flags or payloads.
  2. Otherwise use the documented project route through uv: `uv run doorstop ...` for an existing
     uv-locked Doorstop dependency, or isolated `uvx doorstop@3.2 ...`. Never invoke a global `doorstop`,
     `python -m doorstop`, or another non-uv executable route.
  3. If neither exists, record a concrete blocker (what was searched, what was expected) instead of
     hand-writing requirement files.
- Record the detected mode (bridge / CLI / absent) in the report.

## 2. Safety and blocking states

- A bridge status of `blocked`, enabled-but-not-ready, or an inconsistent status blocks the affected
  mutations. Report the blocked state and stop that mutation.
- Never bypass a blocked or unavailable route with raw YAML editing, shell tricks, direct file writes, or
  an alternate route.
- Never auto-enable, auto-recover, auto-init or auto-repair the bridge.
- All requirement mutations go through the valid route, followed by a read-back or validation. Do not
  assume the plugin intercepts every mutation; the command does not rely on perfect hook coverage.

## 3. Ownership split

- **Doorstop owns**: requirement text, stable item UIDs, parent links, review and traceability state.
- **Beads owns**: claims, work, blockers, progress, evidence and closing.
- A bead refers to requirements by UID, in the bead description or notes, as `Requirements: <UIDs>`.
- Doorstop parent links never contain bead IDs. There is no `bead_id` Doorstop schema; do not invent one.
- Early candidate and derived requirements are normal and expected. Formal approval and baselining are
  later, separate decisions. A Doorstop `reviewed` value is a change fingerprint, not evidence of human
  approval or a baseline; never report it as formal acceptance.
- Never trigger an automatic Doorstop review, never clear suspect links, and never approve or baseline
  from `add`, `tests` or `complete`. Closing a bead closes execution work only; it never implies formal
  requirement acceptance.

## 4. Mode-specific steps

### add

- Link existing UIDs when the new work already maps to existing requirements.
- If requirement-bearing new work has no linked requirement, capture an **early candidate requirement**
  through the valid route *before* creating the bead, then reference the resulting UID from exactly one
  bead. Typical mapping: `EPIC` for an outcome or epic, `SYS` as child for a task or bug, and `VER` only
  when verification evidence warrants it — not automatically for every add. When creating a `SYS` child,
  link it to a suitable existing `EPIC`; if none exists, create an early `EPIC` outcome candidate and link
  the `SYS` to it through the valid route. Do not leave a new `SYS` without its required parent.
- Still create exactly one bead. No claim, no implementation, no child beads, no `br sync`.

### continue / complete

- Before implementation, read the requirements linked to the bead. If requirement-bearing work has no UID
  or its required parent trace is missing, capture or link the early candidate through the valid route and
  persist the UID in the bead before implementing; this is trace rework, not formal approval.
- Update requirement content only through the valid route; never edit item YAML directly.
- Record requirement UIDs, progress and evidence in the bead (description/notes), not in Doorstop.
- Before closing requirement-bearing implementation or bug work, require all three:
  1. valid traceability (the bead links a real requirement UID, and the requirement's parent links are valid);
  2. current, relevant evidence for the work;
  3. Doorstop validation with `--no-reformat`.
- Purely administrative work may instead record why traceability is not applicable.
- A missing trace is rework, not an automatic formal approval.

### tests

- Link the exact test evidence to the requirement UIDs in the explicitly linked active bead.
- Update or create `VER` items through the valid route only when the evidence warrants it.
- No production code changes, no claim, no close, no general work loop.

### status

- Read-only. Report the detected mode, the linked UIDs, traceability gaps, and suspect/unreviewed state.
- Never execute tests and never repair anything in this mode.

## 5. Output additions

In the mode's normal report, add a short requirements section: detected mode (or `absent`), linked UIDs,
trace gaps, validation result, and any blocked state. When Doorstop is absent, omit the section entirely.
