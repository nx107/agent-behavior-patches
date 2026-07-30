import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

function isContained(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
}

export function resolveLexicalChild(root: string, child: string): string {
  const rootPath = resolve(root);
  const childPath = resolve(rootPath, child);
  if (isContained(rootPath, childPath)) return childPath;
  throw new Error(`Path escapes patch directory: ${child}`);
}

export async function resolveRealChild(
  root: string,
  child: string,
): Promise<string> {
  const lexicalTarget = resolveLexicalChild(root, child);
  const [realRoot, realTarget] = await Promise.all([
    realpath(resolve(root)),
    realpath(lexicalTarget),
  ]);
  if (isContained(realRoot, realTarget)) return realTarget;
  throw new Error(
    `Path escapes patch directory through a symbolic link: ${child}`,
  );
}

export function assertContainedPath(root: string, target: string): void {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!isContained(rootPath, targetPath)) {
    throw new Error(`Path escapes allowed directory: ${target}`);
  }
}
