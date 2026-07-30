import {
  lstat,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { assertContainedPath } from "./path-security.js";

async function assertSafeExistingTarget(path: string): Promise<void> {
  try {
    const target = await lstat(path);
    if (target.isSymbolicLink())
      throw new Error("--output must not be a symbolic link.");
    if (target.nlink > 1)
      throw new Error("--output must not be a hard-linked file.");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return;
    }
    throw error;
  }
}

export async function writeEvaluationOutput(
  patchRoot: string,
  requestedPath: string,
  contents: string,
): Promise<string> {
  const root = resolve(patchRoot);
  const target = resolve(requestedPath);
  const fromRoot = relative(root, target);
  if (
    dirname(fromRoot) !== "results" ||
    extname(target).toLowerCase() !== ".json" ||
    basename(target) === ".json"
  ) {
    throw new Error(
      "--output must be a JSON file directly under the patch results/ directory.",
    );
  }

  const resultsDirectory = join(root, "results");
  await mkdir(resultsDirectory, { recursive: true });
  const [realRoot, realResults] = await Promise.all([
    realpath(root),
    realpath(resultsDirectory),
  ]);
  assertContainedPath(realRoot, realResults);
  if (realResults !== join(realRoot, "results")) {
    throw new Error(
      "The patch results/ directory must not be a symbolic link.",
    );
  }
  await assertSafeExistingTarget(target);

  const temporary = join(
    resultsDirectory,
    `.${basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporary, target);
    } catch (error: unknown) {
      const code =
        error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "EEXIST" && code !== "EPERM") throw error;
      await assertSafeExistingTarget(target);
      await rm(target, { force: true });
      await rename(temporary, target);
    }
  } finally {
    await rm(temporary, { force: true });
  }
  return target;
}
