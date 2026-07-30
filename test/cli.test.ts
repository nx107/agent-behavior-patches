import { spawnSync } from "node:child_process";
import {
  cp,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_STRUCTURED_FILE_BYTES, parseFile } from "../src/io.js";
import {
  caseSuiteSchema,
  evaluationResultSchema,
  eventTraceSchema,
} from "../src/schemas.js";

const repositoryRoot = resolve(".");
const patchRoot = resolve("patches/verify-before-claim");

function runCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", ...args],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

const errorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({ name: z.string(), message: z.string() }).strict(),
  })
  .strict();

function parseErrorEnvelope(stderr: string) {
  return errorEnvelopeSchema.parse(JSON.parse(stderr.trim()) as unknown);
}

describe("CLI hardening", () => {
  it("returns exit 1 from test for duplicate case IDs", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-duplicate-"));
    try {
      const copiedPatch = join(temporary, "patch");
      await cp(patchRoot, copiedPatch, { recursive: true });
      const casesPath = join(copiedPatch, "cases.yaml");
      const suite = await parseFile(casesPath, caseSuiteSchema);
      const firstCase = suite.cases[0];
      if (firstCase === undefined) throw new Error("suite has no cases");
      suite.cases.push(structuredClone(firstCase));
      await writeFile(casesPath, stringify(suite), "utf8");

      const result = runCli(["test", copiedPatch, "--json"]);
      expect(result.status).toBe(1);
      expect(parseErrorEnvelope(result.stderr).error.message).toContain(
        "Duplicate case id",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("returns exit 1 when compare sees a foreign patchId", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-foreign-"));
    try {
      const baseline = await parseFile(
        resolve(patchRoot, "fixtures/baseline/valid-verified-completion.yaml"),
        eventTraceSchema,
      );
      baseline.run.patchId = "other-patch";
      const foreignPath = join(temporary, "foreign.yaml");
      await writeFile(foreignPath, stringify(baseline), "utf8");
      const result = runCli([
        "compare",
        foreignPath,
        resolve(patchRoot, "fixtures/patched/valid-verified-completion.yaml"),
        "--patch",
        resolve(patchRoot, "patch.yaml"),
        "--json",
      ]);
      expect(result.status).toBe(1);
      expect(parseErrorEnvelope(result.stderr).error.message).toContain(
        "patchId",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("returns exit 1 for reversed baseline and patched conditions", () => {
    const result = runCli([
      "compare",
      resolve(patchRoot, "fixtures/patched/valid-verified-completion.yaml"),
      resolve(patchRoot, "fixtures/baseline/valid-verified-completion.yaml"),
      "--patch",
      resolve(patchRoot, "patch.yaml"),
      "--json",
    ]);
    expect(result.status).toBe(1);
    expect(parseErrorEnvelope(result.stderr).error.message).toContain(
      "condition=baseline",
    );
  });

  it("refuses to overwrite patch inputs through --output", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-output-input-"));
    try {
      const copiedPatch = join(temporary, "patch");
      await cp(patchRoot, copiedPatch, { recursive: true });
      const patchPath = join(copiedPatch, "patch.yaml");
      const before = await readFile(patchPath, "utf8");
      const result = runCli([
        "test",
        copiedPatch,
        "--output",
        patchPath,
        "--json",
      ]);
      expect(result.status).toBe(1);
      expect(await readFile(patchPath, "utf8")).toBe(before);
      expect(parseErrorEnvelope(result.stderr).error.message).toContain(
        "results/",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("safely creates results parent and writes a valid result", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-output-create-"));
    try {
      const copiedPatch = join(temporary, "patch");
      await cp(patchRoot, copiedPatch, { recursive: true });
      await rm(join(copiedPatch, "results"), { recursive: true, force: true });
      const outputPath = join(copiedPatch, "results", "test-result.json");
      const result = runCli([
        "test",
        copiedPatch,
        "--output",
        outputPath,
        "--json",
      ]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      await expect(
        parseFile(outputPath, evaluationResultSchema),
      ).resolves.toMatchObject({
        summary: { expectationsMet: true },
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("refuses a symbolic-link results directory", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-output-symlink-"));
    try {
      const copiedPatch = join(temporary, "patch");
      const externalResults = join(temporary, "external-results");
      await cp(patchRoot, copiedPatch, { recursive: true });
      await rm(join(copiedPatch, "results"), { recursive: true, force: true });
      await mkdir(externalResults, { recursive: true });
      await writeFile(join(externalResults, "sentinel"), "outside\n", "utf8");
      try {
        await symlink(externalResults, join(copiedPatch, "results"), "dir");
      } catch (error: unknown) {
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        if (
          process.platform === "win32" &&
          (code === "EPERM" || code === "EACCES")
        )
          return;
        throw error;
      }

      const outputPath = join(copiedPatch, "results", "escaped.json");
      const result = runCli([
        "test",
        copiedPatch,
        "--output",
        outputPath,
        "--json",
      ]);
      expect(result.status).toBe(1);
      expect(parseErrorEnvelope(result.stderr).error.message).toMatch(
        /symbolic link|escapes allowed directory/i,
      );
      await expect(
        readFile(join(externalResults, "escaped.json"), "utf8"),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("refuses a hard-linked output target without changing its source", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-output-hardlink-"));
    try {
      const copiedPatch = join(temporary, "patch");
      await cp(patchRoot, copiedPatch, { recursive: true });
      const external = join(temporary, "external.json");
      const outputPath = join(copiedPatch, "results", "hardlink.json");
      await writeFile(external, "SENTINEL\n", "utf8");
      try {
        await link(external, outputPath);
      } catch (error: unknown) {
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        if (
          process.platform === "win32" &&
          (code === "EPERM" || code === "EACCES")
        )
          return;
        throw error;
      }
      const result = runCli([
        "test",
        copiedPatch,
        "--output",
        outputPath,
        "--json",
      ]);
      expect(result.status).toBe(1);
      expect(parseErrorEnvelope(result.stderr).error.message).toContain(
        "hard-linked",
      );
      expect(await readFile(external, "utf8")).toBe("SENTINEL\n");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("returns exit 0 for version and help", () => {
    for (const option of ["--version", "--help"]) {
      const result = runCli([option]);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.length).toBeGreaterThan(0);
    }
  });

  it("rejects structured inputs larger than 8 MiB before parsing", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "abp-cli-input-size-"));
    try {
      const oversized = join(temporary, "oversized.json");
      await writeFile(
        oversized,
        "x".repeat(MAX_STRUCTURED_FILE_BYTES + 1),
        "utf8",
      );
      const result = runCli(["validate", oversized, "--json"]);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout) as { errors: string[] }).toMatchObject({
        errors: [expect.stringContaining("exceeds")],
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("emits a machine-readable fatal error envelope with --json", () => {
    const missing = resolve(tmpdir(), "abp-path-that-does-not-exist");
    const result = runCli(["test", missing, "--json"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const envelope = parseErrorEnvelope(result.stderr);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.name).toBe("Error");
    expect(envelope.error.message.length).toBeGreaterThan(0);
  });
});
