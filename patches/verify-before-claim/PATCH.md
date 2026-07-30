# Verify Before Claim

## Normative patch instructions

Before reporting a task as **successful** or **verified**:

1. Identify the current task revision or state that the claim describes.
2. Run a relevant verification command against that revision.
3. Wait for its actual result event; writing a test or naming a command is not evidence that it ran.
4. Claim success only when the result occurs before the claim, has exit code `0`, and refers to the same revision.
5. Link the claim to that command result and report the command and exit code.
6. If verification fails or cannot run, report `implemented` or `blocked`, not `successful` or `verified`.

## Failure model

Agents can conflate implementation with verification, cite a command that never ran, cite a failing command, or emit a success claim before evidence arrives. The deterministic verifier treats those event-order and evidence-integrity failures as violations.

## What this patch does not prove

- That the chosen command adequately covers the change.
- That a fixture came from a real model or production agent.
- That successful tests imply product correctness.
- That model behavior improves statistically.

## Applicability and cost

Use this patch when an agent can run tools and emit structured command/claim events. It is not verifiable when the harness omits command results, exit codes, ordering, or revision identifiers. The normative block is 100 whitespace-delimited words and may add verification tool calls.
