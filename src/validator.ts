import { access } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ZodError, type ZodType } from "zod";
import {
  caseSuiteSchema,
  evaluationResultSchema,
  eventTraceSchema,
  patchMetadataSchema,
  type CaseSuite,
  type PatchMetadata,
} from "./schemas.js";
import { parseFile, readStructuredFile } from "./io.js";
import { resolveLexicalChild, resolveRealChild } from "./path-security.js";

export interface ValidationReport {
  valid: boolean;
  path: string;
  validated: string[];
  errors: string[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function validateKnownFile(
  path: string,
  validated: string[],
): Promise<void> {
  const name = basename(path);
  let schema: ZodType<unknown>;
  if (name === "patch.yaml" || name === "patch.yml") {
    schema = patchMetadataSchema;
    await parseFile(path, schema);
  } else if (name === "cases.yaml" || name === "cases.yml") {
    schema = caseSuiteSchema;
    await parseFile(path, schema);
  } else {
    const value = await readStructuredFile(path);
    const kind =
      typeof value === "object" && value !== null && "kind" in value
        ? value.kind
        : undefined;
    schema =
      kind === "fixture-evaluation-result"
        ? evaluationResultSchema
        : eventTraceSchema;
    schema.parse(value);
  }
  validated.push(path);
}

export async function validatePath(path: string): Promise<ValidationReport> {
  const absolute = resolve(path);
  const validated: string[] = [];
  const errors: string[] = [];
  try {
    const isDirectory = await fileExists(join(absolute, "patch.yaml"));
    if (!isDirectory) {
      await validateKnownFile(absolute, validated);
      return { valid: true, path: absolute, validated, errors };
    }

    const patchPath = await resolveRealChild(absolute, "patch.yaml");
    const casesPath = await resolveRealChild(absolute, "cases.yaml");
    const patch = await parseFile(patchPath, patchMetadataSchema);
    const suite = await parseFile(casesPath, caseSuiteSchema);
    validated.push(patchPath, casesPath);
    validatePatchLinks(absolute, patch, suite);
    const instructionsPath = await resolveRealChild(
      absolute,
      patch.instructions,
    );
    validated.push(instructionsPath);
    for (const testCase of suite.cases) {
      for (const fixture of [testCase.baseline, testCase.patched]) {
        const fixturePath = await resolveRealChild(absolute, fixture);
        await parseFile(fixturePath, eventTraceSchema);
        validated.push(fixturePath);
      }
    }
    return { valid: true, path: absolute, validated, errors };
  } catch (error: unknown) {
    errors.push(formatError(error));
    return { valid: false, path: absolute, validated, errors };
  }
}

function validatePatchLinks(
  root: string,
  patch: PatchMetadata,
  suite: CaseSuite,
): void {
  if (patch.id !== suite.patchId)
    throw new Error(
      `patch id ${patch.id} does not match suite patchId ${suite.patchId}.`,
    );
  resolveLexicalChild(root, patch.instructions);
  const ids = new Set<string>();
  for (const testCase of suite.cases) {
    if (ids.has(testCase.id))
      throw new Error(`Duplicate case id: ${testCase.id}.`);
    ids.add(testCase.id);
    resolveLexicalChild(root, testCase.baseline);
    resolveLexicalChild(root, testCase.patched);
  }
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
