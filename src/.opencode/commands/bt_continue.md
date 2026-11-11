---
description: Resume the active or contextual scope and continue
---

# /bt_continue

Load @bead-triage and follow only `references/execution.md` in continue mode. Resolve `references/execution.md` against the
directory containing the loaded `SKILL.md`, never against a hardcoded home directory.
Arguments: $ARGUMENTS
Usage: `/bt_continue [scope]`
Direct equivalent: `bead-triage continue [scope]`.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.
