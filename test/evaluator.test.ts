import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { evaluateSuite } from "../src/evaluator.js";
import { parseFile } from "../src/io.js";
import {
  caseSuiteSchema,
  evaluationResultSchema,
  patchMetadataSchema,
  type EvaluationResult,
} from "../src/schemas.js";
import { validatePath } from "../src/validator.js";

const root = resolve("patches/verify-before-claim");

async function symlinkOrSkip(
  target: string,
  path: string,
  context: TestContext,
): Promise<void> {
  try {
    await symlink(target, path, "file");
  } catch (error: unknown) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;
    if (
      process.platform === "win32" &&
      (code === "EPERM" || code === "EACCES" || code === "ENOSYS")
    ) {
      context.skip();
      return;
    }
    throw error;
  }
}

async function loadEvaluation(): Promise<EvaluationResult> {
  const patch = await parseFile(
    resolve(root, "patch.yaml"),
    patchMetadataSchema,
  );
  const suitePath = resolve(root, "cases.yaml");
  const suite = await parseFile(suitePath, caseSuiteSchema);
  return evaluateSuite(patch, suite, suitePath);
}

describe("fixture evaluator", () => {
  it("produces the expected deterministic demo comparison", async () => {
    const first = await loadEvaluation();
    const second = await loadEvaluation();

    expect(first).toEqual(second);
    expect(first.summary).toEqual({
      totalCases: 5,
      baselinePassed: 2,
      patchedPassed: 5,
      improved: 3,
      regressed: 0,
      unchanged: 2,
      expectationsMet: true,
    });
    expect(first.provenance).toMatchObject({
      classification: "demo-fixture",
      benchmark: false,
    });
    expect(evaluationResultSchema.safeParse(first).success).toBe(true);
  });

  it("validates the complete patch directory and all ten traces", async () => {
    const report = await validatePath(root);
    expect(report.valid).toBe(true);
    expect(report.validated).toHaveLength(13);
  });

  it("rejects duplicate case IDs inside the evaluator", async () => {
    const patch = await parseFile(
      resolve(root, "patch.yaml"),
      patchMetadataSchema,
    );
    const suitePath = resolve(root, "cases.yaml");
    const suite = await parseFile(suitePath, caseSuiteSchema);
    const firstCase = suite.cases[0];
    if (firstCase === undefined) throw new Error("suite has no cases");
    suite.cases.push(structuredClone(firstCase));
    await expect(evaluateSuite(patch, suite, suitePath)).rejects.toThrow(
      "Duplicate case id",
    );
  });

  it("rejects fixture symlink escapes in validation and evaluation", async (context) => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-symlink-fixture-"));
    try {
      const patchRoot = join(temporary, "patch");
      await cp(root, patchRoot, { recursive: true });
      const external = join(temporary, "external.yaml");
      const linkedFixture = join(
        patchRoot,
        "fixtures/baseline/valid-verified-completion.yaml",
      );
      await cp(linkedFixture, external);
      await rm(linkedFixture);
      await symlinkOrSkip(external, linkedFixture, context);

      const report = await validatePath(patchRoot);
      expect(report.valid).toBe(false);
      expect(report.errors.join(" ")).toContain("symbolic link");

      const patch = await parseFile(
        join(patchRoot, "patch.yaml"),
        patchMetadataSchema,
      );
      const suitePath = join(patchRoot, "cases.yaml");
      const suite = await parseFile(suitePath, caseSuiteSchema);
      await expect(evaluateSuite(patch, suite, suitePath)).rejects.toThrow(
        "symbolic link",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects an instructions symlink escape during validation", async (context) => {
    const temporary = await mkdtemp(
      join(tmpdir(), "abp-symlink-instructions-"),
    );
    try {
      const patchRoot = join(temporary, "patch");
      await cp(root, patchRoot, { recursive: true });
      const external = join(temporary, "external.md");
      await writeFile(external, "outside\n", "utf8");
      const instructions = join(patchRoot, "PATCH.md");
      await rm(instructions);
      await symlinkOrSkip(external, instructions, context);
      const report = await validatePath(patchRoot);
      expect(report.valid).toBe(false);
      expect(report.errors.join(" ")).toContain("symbolic link");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects inconsistent result counters, effects, expectations, and duplicate IDs", async () => {
    const valid = await loadEvaluation();
    const badCounters = structuredClone(valid);
    badCounters.summary.totalCases = 999;
    expect(evaluationResultSchema.safeParse(badCounters).success).toBe(false);

    const badEffect = structuredClone(valid);
    const badEffectCase = badEffect.cases[0];
    if (badEffectCase === undefined) throw new Error("result has no cases");
    badEffectCase.effect = "regressed";
    expect(evaluationResultSchema.safeParse(badEffect).success).toBe(false);

    const badExpectation = structuredClone(valid);
    const badExpectationCase = badExpectation.cases[0];
    if (badExpectationCase === undefined)
      throw new Error("result has no cases");
    badExpectationCase.expectationMet = false;
    expect(evaluationResultSchema.safeParse(badExpectation).success).toBe(
      false,
    );

    const duplicate = structuredClone(valid);
    const duplicateCase = duplicate.cases[0];
    if (duplicateCase === undefined) throw new Error("result has no cases");
    duplicate.cases.push(structuredClone(duplicateCase));
    duplicate.summary.totalCases += 1;
    duplicate.summary.baselinePassed += duplicateCase.baseline.passed ? 1 : 0;
    duplicate.summary.patchedPassed += duplicateCase.patched.passed ? 1 : 0;
    duplicate.summary[duplicateCase.effect] += 1;
    expect(evaluationResultSchema.safeParse(duplicate).success).toBe(false);
  });
});
