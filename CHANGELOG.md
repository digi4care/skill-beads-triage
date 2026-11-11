# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). During `0.x`, minor releases may contain breaking
changes; patch releases remain backwards compatible.

## [Unreleased]

### Added

- Direct `<mode> [arguments]` routing in the canonical skill for native Agent Skills invocation.
- Declarative adapters for OpenCode, Claude Code, Codex CLI, Pi, and documented `.agents/skills/` consumers, plus `all` selection.
- Registry v2 with per-harness ownership, OpenCode v1 migration, and safe shared-file lifecycle handling.

### Changed

- Compatibility documentation now distinguishes exact harness paths and invocation syntax from generic installation support and unverified runtime behavior.
- OpenCode command wrappers remain available while other adapters reuse the canonical skill without duplicated wrapper skills.

## [0.1.0] - 2026-11-11

### Added

- The `bead-triage` OpenCode skill and seven `/bt_*` command wrappers.
- Project, global, and custom-target installation with tracked uninstall and update lifecycles.
- Installer diagnostics and non-destructive registry-based file management.
- Doorstop requirements and beads_rust execution planning for this repository.
- Biome, Markdown linting, Node.js tests, dependency freshness checks, and GitHub Actions CI.

[Unreleased]: https://github.com/digi4care/skill-beads-triage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/digi4care/skill-beads-triage/releases/tag/v0.1.0
