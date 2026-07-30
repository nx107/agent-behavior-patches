import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ZodType } from "zod";

export const MAX_STRUCTURED_FILE_BYTES = 8 * 1024 * 1024;

export async function readStructuredFile(path: string): Promise<unknown> {
  const metadata = await stat(path);
  if (metadata.size > MAX_STRUCTURED_FILE_BYTES) {
    throw new Error(
      `Structured input exceeds ${MAX_STRUCTURED_FILE_BYTES} bytes: ${path}`,
    );
  }
  const source = await readFile(path, "utf8");
  if (extname(path).toLowerCase() === ".json")
    return JSON.parse(source) as unknown;
  return parseYaml(source) as unknown;
}

export async function parseFile<T>(
  path: string,
  schema: ZodType<T>,
): Promise<T> {
  return schema.parse(await readStructuredFile(path));
}
