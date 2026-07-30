## Scope

Describe the observable failure or repository need and why this is the smallest appropriate change.

## Changes

-

## Evidence

List every command run, its exit code, and relevant output. Do not write "tests pass" without execution evidence.

```text
command:
exit code:
output:
```

## Patch/result provenance

- [ ] New or changed synthetic outputs are labeled `fixture/demo` and `benchmark: false`.
- [ ] No model benchmark is claimed without a documented harness and raw artifacts.
- [ ] Fixtures contain no secrets, personal data, home paths, or environment values.

## Safety

- [ ] Validation/evaluation does not execute fixture commands, Markdown, or contributed scripts.
- [ ] Linked paths remain inside the patch directory.
- [ ] Schema and security implications were reviewed.

## Quality

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Relevant CLI smoke tests
- [ ] Documentation, schemas, fixtures, and changelog are updated where needed.
