# Data specification (schema version 1)

The Zod definitions in `src/schemas.ts` are the runtime source of truth. `pnpm schemas` generates the Draft 2020-12 JSON Schema documents in `schemas/`. Generated files are committed so other tools can validate ABP data without importing TypeScript.

## Patch metadata (`patch.yaml`)

Required fields include:

| Field                                           | Meaning                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `schemaVersion`, `kind`                         | Contract discriminator; currently `1` and `behavior-patch`. |
| `id`, `version`, `title`, `summary`, `category` | Stable identity and semantic version metadata.              |
| `instructions`                                  | Relative path to the normative Markdown instructions.       |
| `languages`, `supportedAdapters`, `requires`    | Compatibility declarations.                                 |
| `expectedContextCost`                           | Numeric estimate, unit, and measurement method.             |
| `risks`, `incompatibilities`                    | Operational boundaries.                                     |
| `provenance`                                    | Authors and public problem references; no secrets.          |
| `verifier`                                      | Declarative rule type and required evidence conditions.     |
| `metrics`, `lastVerified`                       | Intended measurements and verification date.                |

Objects are strict: unknown fields fail validation. Versions use semantic-version syntax (including no leading-zero numeric identifiers and no empty prerelease/build identifiers), IDs are lowercase hyphenated slugs, and linked paths must be relative. Directory validation resolves instructions and fixtures with `realpath` and rejects a symbolic link whose target is outside the patch directory. Structured JSON and YAML inputs are limited to 8 MiB per file before parsing.

The `verify-before-claim` status contract is trusted code, not configurable metadata: both `success` and `verified` are always checked. Metadata cannot remove, duplicate, or replace either status.

## Cases (`cases.yaml`)

A suite binds one `patchId` to one or more cases. Every case has a unique stable ID, description, baseline trace path, patched trace path, and expected pass booleans. Duplicate IDs are rejected by both directory validation and the evaluator itself. `fixtureMetadata.classification` is fixed to `demo-fixture`; the timestamp is an input to deterministic result generation. It must not be interpreted as a real run timestamp unless a future trusted harness declares a different result kind.

## Event traces

A trace is explicitly marked `fixture: true` in v0.1 and identifies its condition, patch, fixture harness, non-model identity, and local uncommitted provenance. Events have a monotonic integer `seq`, RFC 3339 timestamp, and a discriminated `type`:

- `task_snapshot`: identifies the task revision.
- `command_started`: records command text as data, purpose, ID, and revision.
- `command_result`: records the command ID, integer exit code, output summary, and revision.
- `completion_claim`: records status, text, revision, and optional evidence command ID.

The verifier never executes the `command` field. A success-bearing claim is valid only when its unique evidence result precedes it, references exactly one preceding start, exits `0`, shares the claim revision, and follows a prior `task_snapshot` for that revision. A `commandId` represents one execution: duplicate starts or duplicate results invalidate the trace. `implemented` and `blocked` are not success claims. An absent completion claim is not a violation.

## Results

`fixture-evaluation-result` stores:

- patch ID/version;
- provenance fixed to `demo-fixture`, `benchmark: false`, generator, timestamp, and warning note;
- baseline/patched counts and improved/regressed/unchanged counts;
- each verifier issue and expectation match.

Runtime result validation recomputes every summary counter, case effect, per-case `expectationMet`, aggregate `expectationsMet`, trace pass/issue consistency, claim-counter consistency, and case-result ID uniqueness. Semantically inconsistent JSON is rejected even when every field has the right primitive type.

Given unchanged patch metadata, cases, and traces, `abp test` emits byte-identical JSON because it uses the suite's fixed `generatedAt` value and does not inject wall-clock time, host paths, or environment data. Output files are limited to `<patch-dir>/results/*.json`; the directory is containment-checked and created when absent, symbolic-link and hard-linked output files are rejected, and writes use a temporary file plus rename.

For CLI JSON mode, normal results and validation reports are stdout JSON. Fatal parse, I/O, policy, and comparison errors are a single machine-readable JSON envelope on stderr and exit `1`.

## Compatibility

Schema version changes require a documented migration. Adding a field to a strict object is a schema change even when a TypeScript consumer could ignore it. v0.1 provides no plugin verifier interface; new verifier types must be implemented and reviewed in the trusted codebase rather than loaded from patch content.
