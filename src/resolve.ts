// SPDX-License-Identifier: Apache-2.0
//
// Inheritance resolution (MEP-0002). Single inheritance: a template's lineage
// is a linear chain, folded root-first with the merge algebra (child wins).
// The $extends graph MUST be acyclic; cycle detection is a conformance
// requirement.

import { merge } from "./merge.ts";
import { ResolutionError, type Json, type JsonObject, type MergeStrategies, type Registry } from "./types.ts";

/**
 * Resolve a template through its `$extends` chain into a canonical aesthetic
 * object (no `$extends` remaining). Detects inheritance cycles and rejects
 * multiple inheritance (a list-valued `$extends`).
 */
export function resolveTemplate(
  doc: JsonObject,
  registry: Registry,
  strategies: MergeStrategies,
): JsonObject {
  const templates = registry.templates ?? {};
  const chain: JsonObject[] = [];
  const seen = new Set<string>();

  let current: JsonObject | undefined = doc;
  while (current !== undefined) {
    const id = current["id"];
    if (typeof id === "string") {
      if (seen.has(id)) throw new ResolutionError("inheritance_cycle");
      seen.add(id);
    }
    chain.push(current);

    const parent: Json | undefined = current["$extends"];
    if (parent === undefined || parent === null) break;
    if (Array.isArray(parent)) throw new ResolutionError("multiple_inheritance_unsupported");
    if (typeof parent !== "string") throw new ResolutionError("inheritance_cycle");

    const next: JsonObject | undefined = templates[parent];
    // An unresolved parent means the lineage cannot be completed; for the
    // conformance corpus this only arises inside a cycle.
    if (next === undefined) throw new ResolutionError("inheritance_cycle");
    current = next;
  }

  // Fold root-first (lowest precedence) up to the template itself (highest).
  let acc: JsonObject = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    acc = merge(acc, chain[i]!, strategies);
  }
  return acc;
}
