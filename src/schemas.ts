import { z } from "zod";

const semver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const relativePath = /^(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/;

export const contextCostSchema = z
  .object({
    unit: z.enum(["words", "tokens"]),
    value: z.number().int().nonnegative(),
    method: z.string().min(1),
  })
  .strict();

export const patchMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("behavior-patch"),
    id: z.string().regex(slug),
    version: z.string().regex(semver),
    title: z.string().min(1),
    summary: z.string().min(1),
    category: z.string().regex(slug),
    instructions: z.string().regex(relativePath),
    languages: z.array(z.string().min(2)).min(1),
    supportedAdapters: z.array(z.string().regex(slug)),
    requires: z
      .object({ capabilities: z.array(z.string().regex(slug)) })
      .strict(),
    expectedContextCost: contextCostSchema,
    risks: z.array(z.string().min(1)),
    incompatibilities: z.array(z.string().min(1)),
    provenance: z
      .object({
        authors: z.array(z.string().min(1)).min(1),
        problemReferences: z.array(z.string().url()),
      })
      .strict(),
    verifier: z
      .object({
        type: z.literal("verify-before-claim"),
        version: z.literal(1),
        requireCommandStart: z.literal(true),
        requireExitCode: z.literal(0),
        requireSameRevision: z.literal(true),
        requireEvidenceBeforeClaim: z.literal(true),
      })
      .strict(),
    metrics: z
      .object({
        primary: z.string().regex(slug),
        secondary: z.array(z.string().regex(slug)),
      })
      .strict(),
    lastVerified: z.string().date(),
  })
  .strict();

const baseEvent = {
  seq: z.number().int().nonnegative(),
  at: z.string().datetime({ offset: true }),
};

export const taskSnapshotEventSchema = z
  .object({
    ...baseEvent,
    type: z.literal("task_snapshot"),
    revision: z.string().min(1),
  })
  .strict();
export const commandStartedEventSchema = z
  .object({
    ...baseEvent,
    type: z.literal("command_started"),
    commandId: z.string().min(1),
    command: z.string().min(1),
    purpose: z.string().min(1),
    revision: z.string().min(1),
  })
  .strict();
export const commandResultEventSchema = z
  .object({
    ...baseEvent,
    type: z.literal("command_result"),
    commandId: z.string().min(1),
    exitCode: z.number().int(),
    outputSummary: z.string(),
    revision: z.string().min(1),
  })
  .strict();
export const completionClaimEventSchema = z
  .object({
    ...baseEvent,
    type: z.literal("completion_claim"),
    status: z.enum(["implemented", "success", "verified", "blocked"]),
    text: z.string().min(1),
    revision: z.string().min(1),
    evidenceCommandId: z.string().min(1).optional(),
  })
  .strict();

export const traceEventSchema = z.discriminatedUnion("type", [
  taskSnapshotEventSchema,
  commandStartedEventSchema,
  commandResultEventSchema,
  completionClaimEventSchema,
]);

export const eventTraceSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("agent-event-trace"),
    fixture: z.literal(true),
    run: z
      .object({
        runId: z.string().regex(slug),
        condition: z.enum(["baseline", "patched"]),
        patchId: z.string().regex(slug),
        harness: z
          .object({
            name: z.literal("fixture-runner"),
            version: z.string().regex(semver),
          })
          .strict(),
        model: z.literal("not-applicable-deterministic-fixture"),
        gitCommit: z.literal("uncommitted-local-fixture"),
      })
      .strict(),
    events: z.array(traceEventSchema),
  })
  .strict();

export const caseDefinitionSchema = z
  .object({
    id: z.string().regex(slug),
    description: z.string().min(1),
    baseline: z.string().regex(relativePath),
    patched: z.string().regex(relativePath),
    expected: z
      .object({ baselinePass: z.boolean(), patchedPass: z.boolean() })
      .strict(),
  })
  .strict();

export const caseSuiteSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("behavior-patch-cases"),
    patchId: z.string().regex(slug),
    fixtureMetadata: z
      .object({
        classification: z.literal("demo-fixture"),
        generatedAt: z.string().datetime({ offset: true }),
        note: z.string().min(1),
      })
      .strict(),
    cases: z.array(caseDefinitionSchema).min(1),
  })
  .strict();

export const verificationIssueSchema = z
  .object({
    code: z.enum([
      "non_monotonic_sequence",
      "duplicate_command_start",
      "duplicate_command_result",
      "claim_without_evidence_reference",
      "evidence_result_missing",
      "evidence_not_before_claim",
      "evidence_command_not_started",
      "evidence_exit_nonzero",
      "evidence_revision_mismatch",
      "task_snapshot_missing_or_mismatch",
    ]),
    eventSeq: z.number().int().nonnegative(),
    message: z.string().min(1),
  })
  .strict();

export const traceVerificationSchema = z
  .object({
    passed: z.boolean(),
    claimCount: z.number().int().nonnegative(),
    verifiedClaimCount: z.number().int().nonnegative(),
    issues: z.array(verificationIssueSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.verifiedClaimCount > value.claimCount) {
      context.addIssue({
        code: "custom",
        path: ["verifiedClaimCount"],
        message: "verifiedClaimCount cannot exceed claimCount.",
      });
    }
    if (value.passed !== (value.issues.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["passed"],
        message: "passed must be true exactly when issues is empty.",
      });
    }
    if (value.passed && value.verifiedClaimCount !== value.claimCount) {
      context.addIssue({
        code: "custom",
        path: ["verifiedClaimCount"],
        message:
          "A passed verification must verify every counted completion claim.",
      });
    }
    const claimIssueCodes = new Set([
      "claim_without_evidence_reference",
      "evidence_result_missing",
      "evidence_not_before_claim",
      "evidence_command_not_started",
      "evidence_exit_nonzero",
      "evidence_revision_mismatch",
      "task_snapshot_missing_or_mismatch",
    ]);
    if (
      value.claimCount === 0 &&
      value.issues.some((issue) => claimIssueCodes.has(issue.code))
    ) {
      context.addIssue({
        code: "custom",
        path: ["claimCount"],
        message: "Claim-specific issues require claimCount to be positive.",
      });
    }
  });

export const evaluationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("fixture-evaluation-result"),
    patch: z
      .object({ id: z.string().regex(slug), version: z.string().regex(semver) })
      .strict(),
    provenance: z
      .object({
        classification: z.literal("demo-fixture"),
        generatedBy: z.literal("abp fixture runner"),
        generatedAt: z.string().datetime({ offset: true }),
        benchmark: z.literal(false),
        note: z.string().min(1),
      })
      .strict(),
    summary: z
      .object({
        totalCases: z.number().int().nonnegative(),
        baselinePassed: z.number().int().nonnegative(),
        patchedPassed: z.number().int().nonnegative(),
        improved: z.number().int().nonnegative(),
        regressed: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
        expectationsMet: z.boolean(),
      })
      .strict(),
    cases: z.array(
      z
        .object({
          id: z.string().regex(slug),
          expected: z
            .object({ baselinePass: z.boolean(), patchedPass: z.boolean() })
            .strict(),
          baseline: traceVerificationSchema,
          patched: traceVerificationSchema,
          effect: z.enum(["improved", "regressed", "unchanged"]),
          expectationMet: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, result] of value.cases.entries()) {
      if (ids.has(result.id)) {
        context.addIssue({
          code: "custom",
          path: ["cases", index, "id"],
          message: `Duplicate case result id: ${result.id}.`,
        });
      }
      ids.add(result.id);

      const expectedEffect =
        !result.baseline.passed && result.patched.passed
          ? "improved"
          : result.baseline.passed && !result.patched.passed
            ? "regressed"
            : "unchanged";
      if (result.effect !== expectedEffect) {
        context.addIssue({
          code: "custom",
          path: ["cases", index, "effect"],
          message: `effect must be ${expectedEffect} for the case pass states.`,
        });
      }

      const expectedMet =
        result.baseline.passed === result.expected.baselinePass &&
        result.patched.passed === result.expected.patchedPass;
      if (result.expectationMet !== expectedMet) {
        context.addIssue({
          code: "custom",
          path: ["cases", index, "expectationMet"],
          message: `expectationMet must be ${String(expectedMet)}.`,
        });
      }
    }

    const expectedSummary = {
      totalCases: value.cases.length,
      baselinePassed: value.cases.filter((item) => item.baseline.passed).length,
      patchedPassed: value.cases.filter((item) => item.patched.passed).length,
      improved: value.cases.filter(
        (item) => !item.baseline.passed && item.patched.passed,
      ).length,
      regressed: value.cases.filter(
        (item) => item.baseline.passed && !item.patched.passed,
      ).length,
      unchanged: value.cases.filter(
        (item) => item.baseline.passed === item.patched.passed,
      ).length,
      expectationsMet: value.cases.every((item) => {
        return (
          item.baseline.passed === item.expected.baselinePass &&
          item.patched.passed === item.expected.patchedPass
        );
      }),
    };
    for (const key of Object.keys(expectedSummary) as Array<
      keyof typeof expectedSummary
    >) {
      if (value.summary[key] !== expectedSummary[key]) {
        context.addIssue({
          code: "custom",
          path: ["summary", key],
          message: `${key} is inconsistent with case results.`,
        });
      }
    }
  });

export type PatchMetadata = z.infer<typeof patchMetadataSchema>;
export type EventTrace = z.infer<typeof eventTraceSchema>;
export type TraceEvent = z.infer<typeof traceEventSchema>;
export type CaseSuite = z.infer<typeof caseSuiteSchema>;
export type TraceVerification = z.infer<typeof traceVerificationSchema>;
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
