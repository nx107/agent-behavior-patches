# Contributing

Thank you for improving Agent Behavior Patches. Contributions should make a behavior claim more testable, not merely add prose.

## Development setup

Use Node.js 20 or newer and the pnpm version declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs formatting verification, ESLint, strict TypeScript, Vitest, and the production build. Run `pnpm schemas` after changing `src/schemas.ts`, then run `pnpm format` and `pnpm check` again.

## Patch requirements

A patch proposal must include:

1. a narrow, observable failure model;
2. normative instructions and explicit non-goals;
3. metadata that validates against `schemas/patch.schema.json`;
4. baseline and patched cases with stated expectations;
5. deterministic verification where possible;
6. synthetic fixtures free of user data and secrets;
7. result provenance that distinguishes fixtures from model runs;
8. tests for valid behavior, false claims, ordering failures, and verifier false positives.

Do not add executable fixture scripts. A new verifier type changes trusted code and requires security-focused review. Model-based evidence must include its harness and raw data and must never be presented as deterministic fixture evidence.

## Workflow

1. Open one focused issue using the patch proposal or bug template.
2. Keep changes within the agreed scope.
3. Add or update tests and documentation with code.
4. Run `pnpm check` and relevant CLI smoke tests.
5. Fill in the pull request template with exact commands and exit codes.

Do not include generated activity, unrelated formatting, secrets, paid API requirements, fabricated benchmarks, or false badges. Commits should be reviewable and describe the reason for the change.

## Reporting results

Use precise labels: `fixture/demo`, `exploratory model run`, or `benchmark` only when the corresponding methodology and raw artifacts exist. Include failures and missing metrics. A self-report from an agent is not verification evidence.

## Conduct and licensing

Follow `CODE_OF_CONDUCT.md`. By contributing, you agree that your contribution is licensed under Apache-2.0.
