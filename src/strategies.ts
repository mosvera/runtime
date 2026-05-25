// SPDX-License-Identifier: Apache-2.0
//
// Merge-strategy derivation (boundary module). Walks the canonical JSON
// Schemas in this repo's local schemas/ copy for `x-mosvera-merge` annotations and produces a
// MergeStrategies map keyed by field name. At v0.1 only structural fields are
// annotated (the aesthetic vocabulary is open, MEP-0001); this helper becomes
// the primary strategy source once the aesthetic vocabulary is schema-encoded.
//
// BOUNDARY module: it reads schema files, like the validator. Each language
// port reimplements it over the same portable schemas.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MergeStrategies, MergeStrategy } from "./types.ts";

const SCHEMA_FILES = [
  "common.schema.json",
  "composition.schema.json",
  "template.schema.json",
  "modifier.schema.json",
  "palette.schema.json",
  "capability-manifest.schema.json",
];

function defaultSchemaDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packaged = join(here, "schemas");
  if (existsSync(packaged)) return packaged;
  return join(here, "..", "schemas");
}

function collect(node: unknown, out: MergeStrategies): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) collect(x, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const props = obj["properties"];
  if (props !== null && typeof props === "object" && !Array.isArray(props)) {
    for (const [name, sub] of Object.entries(props as Record<string, unknown>)) {
      if (sub !== null && typeof sub === "object" && !Array.isArray(sub)) {
        const ann = (sub as Record<string, unknown>)["x-mosvera-merge"];
        if (ann !== null && typeof ann === "object" && !Array.isArray(ann)) {
          out[name] = ann as MergeStrategy;
        }
      }
    }
  }
  for (const v of Object.values(obj)) collect(v, out);
}

/**
 * Derive list-merge strategies from the canonical schemas' `x-mosvera-merge`
 * annotations. Defaults to bundled package schemas when available, falling
 * back to this repo's local `schemas/`; pass `schemaDir` to override.
 */
export function deriveStrategies(schemaDir: string = defaultSchemaDir()): MergeStrategies {
  const out: MergeStrategies = {};
  for (const file of SCHEMA_FILES) {
    const schema = JSON.parse(readFileSync(join(schemaDir, file), "utf8")) as unknown;
    collect(schema, out);
  }
  return out;
}
