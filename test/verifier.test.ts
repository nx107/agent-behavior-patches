import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseFile } from "../src/io.js";
import {
  caseSuiteSchema,
  eventTraceSchema,
  patchMetadataSchema,
  type CaseSuite,
  type EventTrace,
  type PatchMetadata,
  type TraceEvent,
} from "../src/schemas.js";
import { verifyTrace } from "../src/verifier.js";

const root = resolve("patches/verify-before-claim");
let patch: PatchMetadata;
let suite: CaseSuite;
let validTrace: EventTrace;

type CommandStarted = Extract<TraceEvent, { type: "command_started" }>;
type CommandResult = Extract<TraceEvent, { type: "command_result" }>;
type CompletionClaim = Extract<TraceEvent, { type: "completion_claim" }>;

beforeAll(async () => {
  patch = await parseFile(resolve(root, "patch.yaml"), patchMetadataSchema);
  suite = await parseFile(resolve(root, "cases.yaml"), caseSuiteSchema);
  validTrace = await parseFile(
    resolve(root, "fixtures/patched/valid-verified-completion.yaml"),
    eventTraceSchema,
  );
});

function issueCodes(trace: EventTrace): string[] {
  return verifyTrace(trace, patch).issues.map((issue) => issue.code);
}

describe("verify-before-claim verifier", () => {
  it("matches every declared baseline and patched expectation", async () => {
    for (const testCase of suite.cases) {
      const baseline = await parseFile(
        resolve(root, testCase.baseline),
        eventTraceSchema,
      );
      const patched = await parseFile(
        resolve(root, testCase.patched),
        eventTraceSchema,
      );
      expect(
        verifyTrace(baseline, patch).passed,
        `${testCase.id} baseline`,
      ).toBe(testCase.expected.baselinePass);
      expect(verifyTrace(patched, patch).passed, `${testCase.id} patched`).toBe(
        testCase.expected.patchedPass,
      );
    }
  });

  it("rejects a success claim with no command reference", async () => {
    const trace = await parseFile(
      resolve(root, "fixtures/baseline/claim-without-command.yaml"),
      eventTraceSchema,
    );
    expect(issueCodes(trace)).toContain("claim_without_evidence_reference");
  });

  it("rejects a success claim backed by a nonzero exit", async () => {
    const trace = await parseFile(
      resolve(root, "fixtures/baseline/failed-command-then-success-claim.yaml"),
      eventTraceSchema,
    );
    expect(issueCodes(trace)).toContain("evidence_exit_nonzero");
  });

  it("rejects success evidence that arrives after the claim", async () => {
    const trace = await parseFile(
      resolve(root, "fixtures/baseline/success-evidence-after-claim.yaml"),
      eventTraceSchema,
    );
    expect(issueCodes(trace)).toContain("evidence_not_before_claim");
  });

  it("does not reject a trace with no completion claim", async () => {
    const trace = await parseFile(
      resolve(root, "fixtures/baseline/no-completion-claim.yaml"),
      eventTraceSchema,
    );
    expect(verifyTrace(trace, patch)).toMatchObject({
      passed: true,
      claimCount: 0,
      issues: [],
    });
  });

  it("rejects duplicate command starts", () => {
    const trace = structuredClone(validTrace);
    const start = trace.events.find(
      (event): event is CommandStarted => event.type === "command_started",
    );
    const result = trace.events.find(
      (event): event is CommandResult => event.type === "command_result",
    );
    const claim = trace.events.find(
      (event): event is CompletionClaim => event.type === "completion_claim",
    );
    if (start === undefined || result === undefined || claim === undefined)
      throw new Error("valid fixture is missing expected events");
    result.seq = 3;
    claim.seq = 4;
    trace.events.splice(2, 0, { ...start, seq: 2 });
    expect(issueCodes(trace)).toContain("duplicate_command_start");
    expect(verifyTrace(trace, patch).passed).toBe(false);
  });

  it("rejects duplicate fail-then-pass command results", () => {
    const trace = structuredClone(validTrace);
    const result = trace.events.find(
      (event): event is CommandResult => event.type === "command_result",
    );
    const claim = trace.events.find(
      (event): event is CompletionClaim => event.type === "completion_claim",
    );
    if (result === undefined || claim === undefined)
      throw new Error("valid fixture is missing expected events");
    result.exitCode = 1;
    claim.seq = 4;
    trace.events.splice(3, 0, { ...result, seq: 3, exitCode: 0 });
    const verification = verifyTrace(trace, patch);
    expect(verification.passed).toBe(false);
    expect(verification.verifiedClaimCount).toBe(0);
    expect(verification.issues.map((issue) => issue.code)).toContain(
      "duplicate_command_result",
    );
  });

  it("requires a preceding task snapshot", () => {
    const trace = structuredClone(validTrace);
    trace.events = trace.events.filter(
      (event) => event.type !== "task_snapshot",
    );
    expect(issueCodes(trace)).toContain("task_snapshot_missing_or_mismatch");
  });

  it("requires a task snapshot matching the claimed revision", () => {
    const trace = structuredClone(validTrace);
    const snapshot = trace.events.find(
      (event) => event.type === "task_snapshot",
    );
    if (snapshot === undefined)
      throw new Error("valid fixture has no snapshot");
    snapshot.revision = "different-revision";
    expect(issueCodes(trace)).toContain("task_snapshot_missing_or_mismatch");
  });
});
