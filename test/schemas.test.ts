import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFile } from "../src/io.js";
import {
  caseSuiteSchema,
  evaluationResultSchema,
  eventTraceSchema,
  patchMetadataSchema,
} from "../src/schemas.js";

const patchRoot = resolve("patches/verify-before-claim");

describe("schemas", () => {
  it("accepts the documented patch metadata with a fixed success contract", async () => {
    const patch = await parseFile(
      resolve(patchRoot, "patch.yaml"),
      patchMetadataSchema,
    );
    expect(patch.id).toBe("verify-before-claim");
    expect(patch.verifier.requireExitCode).toBe(0);
    expect(patch.verifier).not.toHaveProperty("successClaimStatuses");
  });

  it("rejects attempts to weaken or duplicate success claim statuses", async () => {
    const patch = await parseFile(
      resolve(patchRoot, "patch.yaml"),
      patchMetadataSchema,
    );
    const weakened = {
      ...patch,
      verifier: { ...patch.verifier, successClaimStatuses: ["verified"] },
    };
    const duplicated = {
      ...patch,
      verifier: {
        ...patch.verifier,
        successClaimStatuses: ["success", "success"],
      },
    };
    expect(patchMetadataSchema.safeParse(weakened).success).toBe(false);
    expect(patchMetadataSchema.safeParse(duplicated).success).toBe(false);
  });

  it("accepts the five-case fixture suite", async () => {
    const suite = await parseFile(
      resolve(patchRoot, "cases.yaml"),
      caseSuiteSchema,
    );
    expect(suite.cases).toHaveLength(5);
  });

  it("rejects unknown trace fields", () => {
    const parsed = eventTraceSchema.safeParse({
      schemaVersion: 1,
      kind: "agent-event-trace",
      fixture: true,
      run: {
        runId: "bad-trace",
        condition: "baseline",
        patchId: "verify-before-claim",
        harness: { name: "fixture-runner", version: "0.1.0" },
        model: "not-applicable-deterministic-fixture",
        gitCommit: "uncommitted-local-fixture",
      },
      events: [],
      unexpected: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects fixture traversal paths", () => {
    const parsed = caseSuiteSchema.safeParse({
      schemaVersion: 1,
      kind: "behavior-patch-cases",
      patchId: "verify-before-claim",
      fixtureMetadata: {
        classification: "demo-fixture",
        generatedAt: "2026-07-30T12:00:00Z",
        note: "synthetic",
      },
      cases: [
        {
          id: "escape",
          description: "escape",
          baseline: "../outside.yaml",
          patched: "fixtures/patched/valid.yaml",
          expected: { baselinePass: false, patchedPass: true },
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it.each([
    "01.0.0",
    "1.00.0",
    "1.0.00",
    "1.0.0-01",
    "1.0.0-..",
    "1.0.0-alpha..1",
    "1.0.0+build..1",
  ])("rejects invalid semantic version %s", async (version) => {
    const patch = await parseFile(
      resolve(patchRoot, "patch.yaml"),
      patchMetadataSchema,
    );
    expect(patchMetadataSchema.safeParse({ ...patch, version }).success).toBe(
      false,
    );
  });

  it("rejects impossible trace-verification counters in result files", async () => {
    const result = await parseFile(
      resolve(patchRoot, "results/demo-result.json"),
      evaluationResultSchema,
    );
    const passedContradiction = structuredClone(result);
    const passedCase = passedContradiction.cases.find(
      (item) => item.baseline.passed && item.baseline.claimCount > 0,
    );
    if (passedCase === undefined)
      throw new Error("missing passed fixture case");
    passedCase.baseline.verifiedClaimCount = 0;
    expect(evaluationResultSchema.safeParse(passedContradiction).success).toBe(
      false,
    );

    const issueContradiction = structuredClone(result);
    const failedCase = issueContradiction.cases.find((item) =>
      item.baseline.issues.some(
        (issue) => issue.code === "claim_without_evidence_reference",
      ),
    );
    if (failedCase === undefined)
      throw new Error("missing failed fixture case");
    failedCase.baseline.claimCount = 0;
    expect(evaluationResultSchema.safeParse(issueContradiction).success).toBe(
      false,
    );
  });
});
