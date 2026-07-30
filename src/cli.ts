#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { evaluateSuite } from "./evaluator.js";
import { parseFile } from "./io.js";
import { writeEvaluationOutput } from "./output.js";
import { resolveRealChild } from "./path-security.js";
import {
  caseSuiteSchema,
  eventTraceSchema,
  patchMetadataSchema,
  type EventTrace,
  type PatchMetadata,
} from "./schemas.js";
import { validatePath } from "./validator.js";
import { verifyTrace } from "./verifier.js";

interface JsonOption {
  json?: boolean;
}

function output(value: unknown, json: boolean): void {
  if (json || typeof value !== "string")
    console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function assertComparableTraces(
  patch: PatchMetadata,
  baseline: EventTrace,
  patched: EventTrace,
): void {
  if (baseline.run.patchId !== patch.id || patched.run.patchId !== patch.id) {
    throw new Error(`Both trace patchId values must match patch ${patch.id}.`);
  }
  if (
    baseline.run.condition !== "baseline" ||
    patched.run.condition !== "patched"
  ) {
    throw new Error(
      "The baseline trace must declare condition=baseline and the patched trace condition=patched.",
    );
  }
}

const program = new Command();
program
  .name("abp")
  .description("Validate and deterministically evaluate Agent Behavior Patches")
  .version("0.1.0")
  .exitOverride()
  .configureOutput({
    writeErr: (message) => {
      if (!process.argv.includes("--json")) process.stderr.write(message);
    },
  });

program
  .command("validate")
  .description(
    "Validate a patch directory or schema-backed fixture/result file",
  )
  .argument("<path>")
  .option("--json", "emit machine-readable JSON")
  .action(async (path: string, options: JsonOption) => {
    const report = await validatePath(path);
    const value = options.json
      ? report
      : report.valid
        ? `valid: ${report.path}`
        : `invalid: ${report.errors.join("; ")}`;
    output(value, Boolean(options.json));
    if (!report.valid) process.exitCode = 1;
  });

program
  .command("test")
  .description("Run deterministic fixture cases for a patch")
  .argument("<patch-directory>")
  .option("--json", "emit machine-readable JSON")
  .option(
    "--output <path>",
    "atomically write JSON to <patch-directory>/results/*.json",
  )
  .action(
    async (
      patchDirectory: string,
      options: JsonOption & { output?: string },
    ) => {
      const root = resolve(patchDirectory);
      const validation = await validatePath(root);
      if (!validation.valid) {
        throw new Error(`Invalid patch: ${validation.errors.join("; ")}`);
      }
      const patchPath = await resolveRealChild(root, "patch.yaml");
      const suitePath = await resolveRealChild(root, "cases.yaml");
      const patch = await parseFile(patchPath, patchMetadataSchema);
      const suite = await parseFile(suitePath, caseSuiteSchema);
      const result = await evaluateSuite(patch, suite, suitePath);
      if (options.output !== undefined) {
        await writeEvaluationOutput(
          root,
          options.output,
          `${JSON.stringify(result, null, 2)}\n`,
        );
      }
      const value = options.json
        ? result
        : `${patch.id}: baseline ${result.summary.baselinePassed}/${result.summary.totalCases}, patched ${result.summary.patchedPassed}/${result.summary.totalCases}, expectations ${result.summary.expectationsMet ? "met" : "failed"}`;
      output(value, Boolean(options.json));
      if (!result.summary.expectationsMet) process.exitCode = 1;
    },
  );

program
  .command("compare")
  .description(
    "Compare one baseline trace with one patched trace under a patch verifier",
  )
  .argument("<baseline-trace>")
  .argument("<patched-trace>")
  .requiredOption(
    "--patch <patch-file>",
    "patch.yaml that declares the verifier",
  )
  .option("--json", "emit machine-readable JSON")
  .action(
    async (
      baselinePath: string,
      patchedPath: string,
      options: JsonOption & { patch: string },
    ) => {
      const patch = await parseFile(
        resolve(options.patch),
        patchMetadataSchema,
      );
      const baselineTrace = await parseFile(
        resolve(baselinePath),
        eventTraceSchema,
      );
      const patchedTrace = await parseFile(
        resolve(patchedPath),
        eventTraceSchema,
      );
      assertComparableTraces(patch, baselineTrace, patchedTrace);
      const baseline = verifyTrace(baselineTrace, patch);
      const patched = verifyTrace(patchedTrace, patch);
      const result = {
        patchId: patch.id,
        baseline: { file: basename(baselinePath), ...baseline },
        patched: { file: basename(patchedPath), ...patched },
        effect:
          !baseline.passed && patched.passed
            ? "improved"
            : baseline.passed && !patched.passed
              ? "regressed"
              : "unchanged",
      };
      output(result, Boolean(options.json));
    },
  );

program.parseAsync().catch((error: unknown) => {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
    return;
  }
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (process.argv.includes("--json")) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: { name: normalized.name, message: normalized.message },
      })}\n`,
    );
  } else {
    console.error(normalized.message);
  }
  process.exitCode = 1;
});
