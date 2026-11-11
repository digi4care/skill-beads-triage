---
description: Initialize beads and Doorstop structures in a project
---

# /bt_scaffold

Load @bead-triage and follow only `references/scaffold.md` in scaffold mode. Resolve `references/scaffold.md` against the
directory containing the loaded `SKILL.md`, never against a hardcoded home directory.
Arguments: $ARGUMENTS
Usage: `/bt_scaffold [project-directory]`
Direct equivalent: `bead-triage scaffold [project-directory]`.
Explicit invocation of scaffold mode is the only authorization to initialize beads or Doorstop structures; this covers
both `/bt_scaffold` and `bead-triage scaffold`.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.
