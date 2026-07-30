# Changelog

All notable project changes are documented here. The format follows Keep a Changelog, and versions follow Semantic Versioning.

## [Unreleased]

### Added

- Local v0.1.0 implementation with strict TypeScript, Zod schemas, and generated JSON Schema.
- Safe declarative verifier for `verify-before-claim` event traces.
- Deterministic baseline/patched evaluator and `validate`, `test`, and `compare` CLI commands.
- Five paired synthetic fixture cases and reproducible demo result provenance.
- Vitest coverage for schemas, validation, evaluation, ordering, missing evidence, failed evidence, and no-claim behavior.
- CI, repository governance, security policy, contribution process, and roadmap.

### Security

- Added resolved-path containment for instructions and fixtures in validation and evaluation, including symbolic-link escape regression tests.
- Fixed the verifier contract so both `success` and `verified` are always checked; duplicate command starts/results, reused command executions, and missing or mismatched task snapshots now invalidate traces with stable issue codes.
- Restricted `test --output` to patch-local `results/*.json`, added safe parent creation and temporary-file replacement, and prevented input overwrite.
- Added semantic result validation, duplicate case/result ID rejection, strict trace identity/condition checks in `compare`, hardened SemVer parsing, and machine-readable fatal JSON errors.
- Expanded multi-OS CI with SHA-pinned actions, schema drift checks, audit, complete quality gates, CLI positive/negative smoke tests, and package dry-run.
- Closed final-review defense-in-depth findings: consistent trace-verification counters, exit `0` for help/version, hardlink output rejection, and an 8 MiB structured-input limit.
- Pinned pnpm 10.34.5 so the declared Node.js 20 minimum remains valid in local and CI environments.

[Unreleased]: https://github.com/nx107/agent-behavior-patches/commits/main
