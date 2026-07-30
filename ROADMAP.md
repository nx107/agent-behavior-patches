# Roadmap

This roadmap describes intended work, not shipped capability.

## ABP-1 — Local v0.1 foundation

- Single-package strict TypeScript implementation.
- Zod and generated JSON Schema contracts.
- Declarative `verify-before-claim` verifier.
- Five paired deterministic fixture cases.
- `validate`, `test`, and `compare` CLI commands with JSON output.
- Tests, CI definition, governance, and security documentation.

## ABP-2 — Provenance and further adversarial hardening

- Define content hashes for patch instructions, traces, and evaluated revision.
- Add bounded input-size policies and broader malformed YAML/JSON coverage.
- Add orphan-result and conflicting-claim cases beyond ABP-1's duplicate command and revision checks.
- Add stable top-level CLI error codes beyond the machine-readable fatal error envelope.
- Design export manifests without writing to agent home directories.
- Exercise CI on Linux, macOS, and Windows and document platform findings.

## ABP-3 — Complete initial patch set

- Implement and test `scope-lock`.
- Implement and test `handoff-contract`.
- Add length-matched placebo conditions where appropriate.
- Add English and Arabic evaluation lanes with separate reporting.

## Release gate

A public `v0.1.0` release requires all three initial patches, reproducible reports, clean-install evidence, stable CI, reviewed schemas, and explicit maintainer approval. Fixture results will never be relabeled as model benchmarks.
