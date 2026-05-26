// SPDX-License-Identifier: Apache-2.0
//
// Conformance runner. Loads every language-agnostic vector from
// the mirrored mosvera/spec compliance fixtures and runs them through the runtime, asserting the result
// matches the vector's expected output. This is the ADR-0007 cross-language
// correctness contract: the runtime is correct iff it passes every vector.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveTemplate,
  resolveComposition,
  resolvePalette,
  resolveNamedComposition,
  compile,
  ResolutionError,
  type JsonObject,
  type Registry,
  type MergeStrategies,
  type CapabilityManifest,
  type Criticality,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const complianceDir = join(here, "fixtures", "compliance");

interface Vector {
  id: string;
  mep: string;
  rule: string;
  kind: "resolution" | "compilation";
  registry?: Registry;
  merge_strategies?: MergeStrategies;
  input_kind?: "composition" | "template" | "palette" | "composition_ref";
  input?: JsonObject | string;
  manifest?: CapabilityManifest;
  canonical?: JsonObject;
  criticality?: Record<string, Criticality>;
  expect: unknown;
}

function loadVectors(sub: "resolution" | "compilation"): Vector[] {
  const dir = join(complianceDir, sub);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Vector);
}

function runResolution(v: Vector): unknown {
  const registry = v.registry ?? {};
  const strategies = v.merge_strategies ?? {};
  try {
    let canonical: JsonObject;
    if (v.input_kind === "template") {
      canonical = resolveTemplate(v.input as JsonObject, registry, strategies);
    } else if (v.input_kind === "palette") {
      canonical = resolvePalette(v.input as JsonObject, registry, strategies);
    } else if (v.input_kind === "composition_ref") {
      canonical = resolveNamedComposition(v.input as string, registry, strategies);
    } else {
      canonical = resolveComposition(v.input as JsonObject, registry, strategies);
    }
    return { canonical };
  } catch (e) {
    if (e instanceof ResolutionError) return { status: "error", error: e.kind };
    throw e;
  }
}

function runCompilation(v: Vector): unknown {
  return compile(v.canonical!, v.manifest!, v.criticality ?? {});
}

describe("conformance: resolution (MEP-0001 / MEP-0002)", () => {
  for (const v of loadVectors("resolution")) {
    it(`${v.id} [${v.mep} ${v.rule}]`, () => {
      expect(runResolution(v)).toEqual(v.expect);
    });
  }
});

describe("conformance: compilation (MEP-0003)", () => {
  for (const v of loadVectors("compilation")) {
    it(`${v.id} [${v.mep} ${v.rule}]`, () => {
      expect(runCompilation(v)).toEqual(v.expect);
    });
  }
});
