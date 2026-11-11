---
description: Analyze recent sessions and propose improvements
---

# /bt_reflect

Arguments: $ARGUMENTS
Usage: `/bt_reflect`, `/bt_reflect 5`, `/bt_reflect #5`, `/bt_reflect 5 sessions`

FIRST validate the literal Arguments before any skill, tool, environment inspection, or session access. Trim surrounding whitespace. Valid input is empty or `#?[1-9][0-9]*` with an optional trailing `sessions`. The supplied value `0` is invalid, never empty. The same applies to negative and malformed values.

For invalid input, return only a short usage error listing the four forms above. Do not load a skill, inspect the environment, discover sessions, or export anything.

Only for valid input, load @bead-triage and follow only `references/reflect.md` in reflect mode. Do not load a general reflection skill; a later harness-specific session-discovery skill is allowed only when that reference requires it.
If the skill or reference cannot load, report the exact error and stop; never reconstruct from memory.

HARD IDENTITY GATE: use only a current-session ID already supplied by genuine runtime context or a documented command that explicitly returns only the current identity. If neither is available, stop and request a sanitized current-session export. Never use a session list, session API, active-session endpoint, storage, newest-session selection, or timestamp/tool inference to establish current identity.
