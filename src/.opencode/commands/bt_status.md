---
description: Report the status of a scope read-only
---

# /bt_status

Load @bead-triage and follow only `references/status.md` in status mode. Resolve `references/status.md` against the
directory containing the loaded `SKILL.md`, never against a hardcoded home directory.
Arguments: $ARGUMENTS
Usage: `/bt_status [scope]`
Direct equivalent: `bead-triage status [scope]`.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.
