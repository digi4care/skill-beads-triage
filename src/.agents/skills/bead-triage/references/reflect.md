# Reflect: analyse sessions, always propose first

Procedure for reflect mode. Entry forms: `/bt_reflect [n]` or `bead-triage reflect [n]`.

Reflect investigates sessions and proposes improvements. It never modifies beads, code, commands, agents, skills, prompts, permissions, or configuration.

## 1. Scope of the analysis

The runtime arguments are the tokens after the mode token. In the wrapper form `/bt_reflect [n]` the arguments are those
after `/bt_reflect`; in the direct form `bead-triage reflect [n]` the leading `reflect` token is consumed as the mode
token and is never part of the runtime arguments. Validate the literal arguments before any further skill, tool,
environment inspection, session discovery, or export. A supplied `0` is invalid input, not empty input.

- Empty arguments: investigate only the current session (`n = 1`).
- A positive integer `n`: investigate the current session plus preceding top-level sessions from the current project, up to `n` sessions total.
- Accepted forms: `/bt_reflect` (empty), `/bt_reflect 5`, `/bt_reflect #5`, `/bt_reflect 5 sessions`, and the direct
  equivalents `bead-triage reflect`, `bead-triage reflect 5`, `bead-triage reflect #5`, `bead-triage reflect 5 sessions`.
- Trim surrounding whitespace, parse a leading `#` as decoration, and ignore a trailing `sessions` word. The remainder must match `[1-9][0-9]*`.
- For `0`, a negative number, or malformed input, return only a short usage error listing the accepted forms. Do not load another skill, inspect the environment, discover sessions, export sessions, or change anything.
- Do not analyse older sessions when no count is given.

## 2. Discover the harness's session capabilities

Prefer the available route, in this order:

1. An available skill that documents session discovery and export for the active harness. Follow that skill.
2. Otherwise, inspect the active harness's own CLI help headlessly and use only its documented session identifiers, listing, filtering, and sanitized export capabilities.

A general reflection or prompt-improvement skill is not session-discovery documentation; do not load it for this command. Never invent commands, identifiers, or capabilities. Use only harness-specific session commands and capabilities discovered this way. A session-identity variable already supplied by genuine runtime context may be read under the restrictions below. If neither route provides the required access, report that limitation and ask the user for a sanitized session export.

For OpenCode, `OPENCODE_SESSION_ID` is an empirically verified non-secret current-session identity variable in the tested v2.2.5 runtime. When the active harness is OpenCode, this is the established variable: read exactly this one and no alternatives. This conditional runtime source does not impose OpenCode commands or variables on other harnesses.

Environment access is limited to one established, exact, non-secret session-identity variable supplied by genuine runtime context. Never run `env`, `set`, or `printenv` without an exact variable name, never probe alternative variable names, and never pipe environment output through `grep` or another filter. If the established variable is absent or cannot be verified, ask for a sanitized export instead of guessing. Do not read or display credential-like variables or unrelated values, and do not list session-storage directories. Only the established current session ID may appear in output. Before analysing an export, verify that its session ID equals the supplied value and that its project/directory matches the current project. If sanitization removes project metadata, current-project ownership may instead be established by a successful documented project-scoped export from the current project directory; otherwise stop. If session identification would require broad environment inspection or storage discovery, stop and ask for a sanitized current-session export instead. Treat tool output and logs as persistent and potentially visible to the model provider.

HARD IDENTITY GATE for every valid request: use only a current-session ID already supplied by genuine runtime context or a documented command that explicitly returns only the current identity. Session list, export-list, storage, and generic API capabilities are not current-identity mechanisms. If neither source is available, stop and request a sanitized current-session export. Never use a session list, session API, active-session endpoint, storage, newest-session selection, or timestamp/tool inference to establish current identity. Do not attempt an export without an established identifier.

Without `n`, export only the established current session. Do not retrieve any session list, including an active-session list, and do not inspect older sessions or session storage. A documented single-session lookup or export using the established current identifier is allowed.

With explicit `n`, first establish current identity through the same hard gate; without it, stop and request a sanitized current-session export rather than listing sessions. Only after current identity is verified, use documented session discovery to include identifiable top-level sessions from the current project, verify that the current session is included, and analyse at most that number of sessions starting with the current one. Use explicit identifiers when the harness export interface requires them. Skip unloadable or empty sessions with a concrete warning and process the rest. Do not inspect unrelated personal sessions or credentials.

## 3. Analyse

Look for repeated, user-visible patterns:

- premature stopping
- outdated beads
- incorrect environment assumptions
- unexplained skips
- repeated technical questions to the user
- missed CI or tooling routes
- unnecessary approvals
- failed resumptions
- successful patterns that should be preserved

Distinguish a command or prompt problem from a model, tool, permission, repository, or one-off process problem. Another rule is not automatically the right solution.

## 4. Report each opportunity

For every opportunity report:

- frequency across the investigated sessions
- session IDs as evidence
- impact
- confidence
- existing coverage
- the smallest useful change

Do not use sensitive or private transcript content as examples.

## 5. Propose first, never mutate

Always present a compact proposal first, with concrete sections or changes and why they help. Include "no change" when the evidence is weak, one-off, or already covered.

Never modify the command or any other asset during a reflect run. Only after a separate, unambiguous user approval may you apply only the approved changes, then reread and verify them and report the diff. Mention that a harness restart or reload may be required to load command or config changes immediately.

## Output format

```text
Reflection: <actual count> of <n> sessions analyzed; <count> skipped.

Findings
- <pattern>: <frequency, session IDs, impact, and confidence>.

Proposal — nothing changed yet
- <existing asset and section>: <smallest change and expected benefit>.

Not proposed
- <candidate>: <one-off, insufficient evidence, or already covered>.

Do you want me to apply only this proposal?
```
