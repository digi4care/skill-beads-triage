---
description: Report the best ready issues read-only, never claiming
---

# /bt_triage

Load @bead-triage and follow only `references/triage.md` in triage mode. Resolve `references/triage.md` against the
directory containing the loaded `SKILL.md`, never against a hardcoded home directory.
Arguments: none
Usage: `/bt_triage`
Direct equivalent: `bead-triage triage`.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.
