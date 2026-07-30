# Agent Behavior Patches

Tested behavior patches for AI coding agents.

## Problem

Agent instructions are often shared as prompt collections. A convincing instruction is not evidence that behavior changed, and a model's self-report is not evidence that a task was verified. Without structured cases, event traces, and explicit verifier rules, regressions are difficult to reproduce or review.

## Solution

Agent Behavior Patches (ABP) packages a small behavior instruction with:

- versioned metadata and provenance;
- baseline and patched cases;
- schema-validated event traces;
- a declarative verifier policy;
- deterministic comparison results with explicit provenance.

The verifier reads data. It does **not** execute fixture commands, shell text, Markdown, plugins, or contributed code. ABP v0.1 is a local implementation and is marked `private: true`; nothing in this repository has been published.

## Quickstart

Requirements: Node.js 20 or newer and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm check
node dist/cli.js validate patches/verify-before-claim
node dist/cli.js test patches/verify-before-claim
node dist/cli.js compare \
  patches/verify-before-claim/fixtures/baseline/claim-without-command.yaml \
  patches/verify-before-claim/fixtures/patched/claim-without-command.yaml \
  --patch patches/verify-before-claim/patch.yaml --json
```

Generate the committed demo result reproducibly:

```sh
node dist/cli.js test patches/verify-before-claim \
  --output patches/verify-before-claim/results/demo-result.json --json
```

The included output is a **synthetic fixture/demo result**, not a model benchmark. It reports baseline `2/5`, patched `5/5`, three improved cases, zero regressions, and two unchanged cases because those outcomes are encoded in deterministic event fixtures.

## CLI

| Command                                                        | Purpose                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `abp validate <path> [--json]`                                 | Validate a patch directory or one schema-backed file.                |
| `abp test <patch-dir> [--output file] [--json]`                | Evaluate every baseline/patched fixture pair and check expectations. |
| `abp compare <baseline> <patched> --patch patch.yaml [--json]` | Compare two traces under a declared verifier.                        |

All commands return exit code `0` on a successful operation. `validate` returns `1` for invalid input; `test` returns `1` for invalid suites (including duplicate case IDs) or unmet expectations; `compare` returns `1` when trace patch IDs or baseline/patched conditions do not match. Parsing and I/O failures also return `1`.

With `--json`, successful data and `validate` reports go to stdout. Fatal errors use one JSON object on stderr: `{"ok":false,"error":{"name":"Error","message":"..."}}`. `test --output` is intentionally restricted to a direct `.json` child of `<patch-dir>/results/`; it safely creates that directory and uses a temporary-file rename instead of writing inputs in place.

## First patch: `verify-before-claim`

A `success` or `verified` claim is always success-bearing; patch metadata cannot remove either status. It is accepted only when it references exactly one preceding `command_result` for a uniquely started command that:

1. has exactly one matching preceding `command_started` event;
2. has exit code `0`;
3. verifies the same revision as the claim;
4. follows a `task_snapshot` for that same revision; and
5. occurs before the claim.

Duplicate command starts or results invalidate the trace, so a fail-then-pass result cannot reuse one `commandId` to bypass the verifier.

A trace with no success claim passes because the verifier must not force a completion claim. The five included cases cover valid verification, no command, a failed command, late evidence, and no completion claim.

## Architecture

```text
src/schemas.ts     Zod source of truth for patch, case, trace, and result data
src/validator.ts   schema/link/path validation; rejects traversal and symlink escape
src/verifier.ts    pure, declarative event-trace verification
src/evaluator.ts   deterministic baseline/patched case comparison
src/cli.ts         thin Commander interface and JSON output
schemas/           generated JSON Schema (Draft 2020-12)
patches/           instructions, metadata, cases, fixtures, demo results
test/              schema, verifier, validator, and evaluator tests
```

This is intentionally a single TypeScript package. A monorepo would add coordination overhead without an independent package boundary in v0.1. See [`docs/specification.md`](docs/specification.md) for the data contract.

## Security model

Patch Markdown, YAML, JSON, commands, and command output are untrusted data. The built-in verifier does not call `child_process`, a shell, `eval`, dynamic imports, network APIs, or extension hooks. Instructions and fixture paths must pass both lexical checks and `realpath` containment beneath the patch directory, preventing symbolic-link escape. Zod objects are strict so undeclared keys are rejected, and result validation recomputes effects, expectations, counters, and unique case IDs.

ABP does not prove that a verification command was relevant or comprehensive; it proves only the declared event relationship. Harnesses that produce real traces remain responsible for process isolation, redaction, timeouts, revision integrity, and truthful event capture. See [`SECURITY.md`](SECURITY.md).

## What ABP does not do

- It is not a prompt marketplace or agent runtime.
- It does not run arbitrary patch-supplied scripts.
- It does not claim statistical model improvement from synthetic fixtures.
- It does not collect user traces or secrets.
- It does not publish or install patches into agent configuration directories.

## Roadmap

v0.1 establishes the schemas, fixture runner, verifier, CLI, and `verify-before-claim`. Next work is to harden trace provenance, add negative semantic tests and exporter design, then implement `scope-lock` and `handoff-contract` before any public `v0.1.0` release claim. See [`ROADMAP.md`](ROADMAP.md).

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing a patch. Contributions need a documented failure model, deterministic cases where possible, explicit limitations, safe declarative verification, and tests. By participating, you agree to the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
