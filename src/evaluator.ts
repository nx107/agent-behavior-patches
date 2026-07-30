import { dirname, resolve } from "node:path";
import type { CaseSuite, EvaluationResult, PatchMetadata } from "./schemas.js";
import { eventTraceSchema } from "./schemas.js";
import { parseFile } from "./io.js";
import { resolveRealChild } from "./path-security.js";
import { verifyTrace } from "./verifier.js";

async function resolveFixture(
  suitePath: string,
  fixturePath: string,
): Promise<string> {
  return resolveRealChild(dirname(resolve(suitePath)), fixturePath);
}

export async function evaluateSuite(
  patch: PatchMetadata,
  suite: CaseSuite,
  suitePath: string,
): Promise<EvaluationResult> {
  if (suite.patchId !== patch.id) {
    throw new Error(
      `Case suite patchId ${suite.patchId} does not match patch ${patch.id}.`,
    );
  }

  const caseIds = new Set<string>();
  for (const testCase of suite.cases) {
    if (caseIds.has(testCase.id)) {
      throw new Error(`Duplicate case id: ${testCase.id}.`);
    }
    caseIds.add(testCase.id);
  }

  const caseResults: EvaluationResult["cases"] = [];
  for (const testCase of suite.cases) {
    const baselineTrace = await parseFile(
      await resolveFixture(suitePath, testCase.baseline),
      eventTraceSchema,
    );
    const patchedTrace = await parseFile(
      await resolveFixture(suitePath, testCase.patched),
      eventTraceSchema,
    );
    if (
      baselineTrace.run.patchId !== patch.id ||
      patchedTrace.run.patchId !== patch.id
    ) {
      throw new Error(
        `Trace patchId does not match ${patch.id} for case ${testCase.id}.`,
      );
    }
    if (
      baselineTrace.run.condition !== "baseline" ||
      patchedTrace.run.condition !== "patched"
    ) {
      throw new Error(
        `Trace conditions are incorrect for case ${testCase.id}.`,
      );
    }

    const baseline = verifyTrace(baselineTrace, patch);
    const patched = verifyTrace(patchedTrace, patch);
    const effect =
      !baseline.passed && patched.passed
        ? "improved"
        : baseline.passed && !patched.passed
          ? "regressed"
          : "unchanged";
    const expectationMet =
      baseline.passed === testCase.expected.baselinePass &&
      patched.passed === testCase.expected.patchedPass;
    caseResults.push({
      id: testCase.id,
      expected: testCase.expected,
      baseline,
      patched,
      effect,
      expectationMet,
    });
  }

  return {
    schemaVersion: 1,
    kind: "fixture-evaluation-result",
    patch: { id: patch.id, version: patch.version },
    provenance: {
      classification: "demo-fixture",
      generatedBy: "abp fixture runner",
      generatedAt: suite.fixtureMetadata.generatedAt,
      benchmark: false,
      note: "Deterministic synthetic fixtures; this is not a model benchmark.",
    },
    summary: {
      totalCases: caseResults.length,
      baselinePassed: caseResults.filter((item) => item.baseline.passed).length,
      patchedPassed: caseResults.filter((item) => item.patched.passed).length,
      improved: caseResults.filter((item) => item.effect === "improved").length,
      regressed: caseResults.filter((item) => item.effect === "regressed")
        .length,
      unchanged: caseResults.filter((item) => item.effect === "unchanged")
        .length,
      expectationsMet: caseResults.every((item) => item.expectationMet),
    },
    cases: caseResults,
  };
}
