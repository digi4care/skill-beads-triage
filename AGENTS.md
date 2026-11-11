# Repository Instructions

## Project Policy

- Communicate with the user in Dutch and write repository artifacts in English.
- Use beads_rust (`br`) exclusively for tracker mutations; do not use `bd` in this workspace.
- Never branch, commit, stage, push, tag, release, publish, delete, or run `br sync` without an explicit user
  request for that action.
- Run `bv` only after beads exist and only with noninteractive robot or agent-file flags; never launch its TUI.
- Treat agent summaries as claims. Verify produced artifacts and command output before recording completion.

## Development and Validation

- Run `npm run validate` before handoff and before any authorized publication.
- Maintain direct dependencies with `npm run deps:update`; both update and CI checks use a seven-day cooldown.
- Keep the transitive `katex` and `re2js` overrides until their parent dependency ranges include the patched
  versions and `npm audit` remains clean without the overrides.
- Create and edit Doorstop items through pinned `uvx doorstop@3.2` commands, not hand-written requirement YAML.

<!-- br-agent-instructions-v1 -->

## beads_rust Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking. Issues
are stored in `.beads/`.

### Essential Commands

```bash
# View ready issues (open, unblocked, not deferred)
br ready --json

# List, inspect, and search
br list --status=open --json
br show <id> --json
br search "keyword" --json

# Create and update
br create --title="..." --description="..." --type=task --priority=2 --json
br update <id> --claim --actor assistant --json
br close <id> --reason="Completed" --actor assistant --json

# Dependencies and integrity
br dep add <issue> <depends-on>
br dep cycles --json
```

### Workflow Pattern

1. **Start**: Run `br ready --json` to find actionable work.
2. **Verify**: Inspect the selected bead with `br show <id> --json` before claiming it.
3. **Claim**: Use `br update <id> --claim --actor assistant --json`.
4. **Work**: Implement the task and record verification evidence.
5. **Complete**: Use `br close <id> --reason="..." --actor assistant --json` only after verification.
6. **Read back**: Confirm the final state with `br show <id> --json`.

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only open, unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog; use numbers 0–4, not words.
- **Types**: task, bug, feature, epic, chore, docs, question.
- **Blocking**: `br dep add <issue> <depends-on>` adds a dependency.

<!-- end-br-agent-instructions -->

## beads_viewer Triage

Use [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for read-only, graph-aware
recommendations; `br` remains the only tracker mutation CLI.

**Use only noninteractive robot or agent-file flags. Bare `bv` launches an interactive TUI.**

```bash
bv --robot-triage --brief   # Ranked recommendations, blockers, and project health
bv --robot-next             # Single next recommendation; verify before claiming
bv --robot-plan             # Parallel execution tracks
bv --robot-graph            # Dependency graph export
bv --robot-help             # Detailed AI/robot command documentation
```

Recommendations do not reserve work. Always inspect current `br` state before executing a suggested claim or close
command, and preserve the recommendation's tracker route and working directory.

## Doorstop Traceability

Requirement UIDs and parent links live under `reqs/`. Add the applicable `Requirements: <UIDs>` field to beads, but
never add bead IDs to Doorstop links. See `docs/planning.md` for the ownership boundary and validation commands.
