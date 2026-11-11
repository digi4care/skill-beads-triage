# Bead Triage — Tooling, Prerequisites and CI

Shared reference for execution mode and tests mode. A missing tool or broken CI route is investigation and repair work,
not an automatic stopping condition.

## Repair procedure

1. Inspect existing CI workflows, runners, repository documentation, lockfiles, package scripts, Docker/devcontainer,
   Nix, uv/venv/tox, and other project routes. Never conclude from the local OS alone that a platform runner does not
   exist.
2. Use an existing project route first. Otherwise, install the required tool from an official source, using a
   project-specified or pinned version, in an isolated and permitted project, cache, or `/tmp/opencode` environment.
3. Check checksums/signatures where available and appropriate. Then run a version/smoke check and continue the original
   task.
4. Record the tool, version, location, verification, and result in the bead. Do not unnecessarily expand production
   dependencies or remove or weaken tests to avoid a dependency.
5. Do not silently perform global/system installs, use `sudo`, paid services, credentials, or forbidden network access.
   Request genuine approval only when required by applicable permissions and project rules.

## Prohibited actions

- No silent global or system installs, and no `sudo`.
- No paid services and no use of credentials without explicit permission.
- No forbidden network access.
- No removal or weakening of tests, and no expanding production dependencies to dodge a tooling problem.
- No force or bypass of policy, dependencies, or gates.

## CI

- For CI, retrieve run metadata and logs yourself using available authenticated tooling.
- Distinguish `passed`, `skipped`, `not run`, and `failed before tests`. An existing runner is not test evidence.
- Fix pre-test failures and then reuse the existing route.
- Pushes, remote reruns, and other external mutations remain subject to explicit user and repository permissions. Never
  commit, branch, push, release, delete, or run `br sync` without the explicit request and permission required for that
  action.

## Evidence in the bead

Record in the bead:

- the tool, version, and installation route used;
- the verification performed (version/smoke check, checksums) and its result;
- CI run metadata and log locations, with the distinction between `passed`, `skipped`, `not run`, and
  `failed before tests`;
- any remaining verification gap, blocker, dependency, or exact next step.

Read the bead back after the update before claiming the state changed.
