---
description: Run and audit the relevant tests for a scope
---

# /bt_tests

Load @bead-triage and follow only `references/tests.md` in tests mode. Resolve `references/tests.md` against the directory
containing the loaded `SKILL.md`, never against a hardcoded home directory.
Arguments: $ARGUMENTS
Usage: `/bt_tests [scope]`
Direct equivalent: `bead-triage tests [scope]`.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.
