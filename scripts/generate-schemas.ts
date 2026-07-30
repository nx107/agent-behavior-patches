import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  caseSuiteSchema,
  evaluationResultSchema,
  eventTraceSchema,
  patchMetadataSchema,
} from "../src/schemas.js";

const outputDirectory = resolve("schemas");
await mkdir(outputDirectory, { recursive: true });

const schemas = [
  ["patch.schema.json", patchMetadataSchema],
  ["case.schema.json", caseSuiteSchema],
  ["trace.schema.json", eventTraceSchema],
  ["result.schema.json", evaluationResultSchema],
] as const;

for (const [name, schema] of schemas) {
  const document = z.toJSONSchema(schema, { target: "draft-2020-12" });
  await writeFile(
    resolve(outputDirectory, name),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8",
  );
}
