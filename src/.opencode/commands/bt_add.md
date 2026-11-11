---
description: Create a new bead from a description
---

# /bt_add

Load @bead-triage and follow only `references/add.md` in add mode. Resolve `references/add.md` against the directory
containing the loaded `SKILL.md`, never against a hardcoded home directory.
Arguments: $ARGUMENTS
Usage: `/bt_add [epic|issue|bug] <description>`
Direct equivalent: `bead-triage add [epic|issue|bug] <description>`.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.
