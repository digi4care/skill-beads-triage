# Add: create exactly one bead

Procedure for `/bt_add [epic|issue|bug] <description>`.

Scope of this procedure: capture one piece of work as exactly one bead. It does **not** implement, claim, close, sync, or create child beads.

## 1. Parse the arguments

- `epic`, `issue`, or `bug` as the first word selects the type explicitly.
- Everything after the type is the description.
- Without an explicit type, infer the type from the description (section 2).
- Without any description at all: create nothing and ask one focused question about what must be captured. Never create an empty or invented bead.

## 2. Determine the beads type

`br create --help` documents the supported types and flags (`--title`, `--type`, `--description`, `--acceptance-criteria`, `--parent`, `--deps`, `--dry-run`, `--json`). Confirm the exact type names with the installed `br` help before use.

| User term | Meaning | beads type |
| --- | --- | --- |
| `epic` | coherent multi-step outcome | `epic` |
| `bug` | demonstrably incorrect behaviour | `bug` |
| `issue` | normally bounded work | `task` (the user term `issue` is translated to the correct technical type `task`) |

Without an explicit type word, infer from the description:

- coherent multi-step outcome → `epic`
- demonstrably incorrect behaviour → `bug`
- normally bounded work → `task`

State the inferred type in the report so the user can correct it. If the description fits more than one type equally and the choice changes the structure of the work, ask one targeted question; otherwise pick the best match and say so.

## 3. Inspect for duplicates and context

Before creating anything:

- Read the applicable project instructions.
- Inspect existing beads and the repository for the same work: use `br ready --brief --json`, `br coordination status --json`, and targeted `br show <id> --json` reads.
- Search for the same symptom, file, or requirement already tracked.

If the same work already exists as a bead, report that existing bead (ID, type, title, state) instead of creating a duplicate. Only when the match is genuinely ambiguous, ask one focused question about whether the new item is separate.

## 4. Requirements (conditional)

If a real `.doorstop.yml` exists in the project, load `references/requirements.md` and follow its add-mode
step: link existing UIDs, and when requirement-bearing new work has no linked requirement, capture an early
candidate requirement through the valid route before creating the bead. Record the UIDs as
`Requirements: <UIDs>` in the bead description or notes.

If no `.doorstop.yml` exists, skip this section entirely: no Doorstop tool, CLI, plugin or file is touched
and the normal beads flow continues.

## 5. Create the bead

The user's request to add an item is the authorization to create one bead. Do not ask for a separate approval.

Only set fields that are supported by evidence:

- `--title`: clear, specific.
- `--type`: from section 2.
- `--description`: what is observed, what is expected, and where it lives. No secrets or sensitive detail.
- `--acceptance-criteria`: observable and checkable, e.g. a named command and its expected result.
- `--priority`, `--parent`, `--deps`: only when the project state or the request supports them. Do not invent a parent or dependency.

```sh
br create --json --title "<title>" --type <type> --description "<description>" --acceptance-criteria "<criteria>"
```

Use `--dry-run` first when the field set is unusual or a shell-quoting risk is plausible.

Do not create child beads, do not claim, do not close, do not start implementation, and do not run `br sync`.

## 6. Read back and report

```sh
br show <id> --json
```

Confirm the persisted ID, type, title, and state. Report:

- ID, type, title
- persisted state (e.g. open/unclaimed)
- acceptance criteria as recorded
- any duplicate check result that is worth knowing

Only report the bead as created after the read-back confirms it. If the read-back fails, report the failure instead of claiming success.

## Output shape

```text
Created: <id> — <type> — <title>
State: <persisted state>
Acceptance criteria: <recorded criteria>
Notes: <duplicate check / type inference / omitted fields>
```
