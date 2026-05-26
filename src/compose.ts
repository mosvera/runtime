// SPDX-License-Identifier: Apache-2.0
//
// Composition resolution (MEP-0001). Folds the total precedence chain
// (resolved base lineage -> base -> modifiers in declared order -> overrides)
// into a single canonical resolved composition.

import { merge } from "./merge.ts";
import { resolveTemplate } from "./resolve.ts";
import { ResolutionError, type JsonObject, type MergeStrategies, type Registry } from "./types.ts";

/**
 * Resolve a composition document into its canonical aesthetic model.
 *
 * The base template is resolved through its inheritance chain first
 * (MEP-0002), then each modifier is merged in declared order, then the inline
 * `overrides` block at highest precedence. The order you write is the order
 * that wins.
 */
export function resolveComposition(
  composition: JsonObject,
  registry: Registry,
  strategies: MergeStrategies,
): JsonObject {
  const templates = registry.templates ?? {};
  const modifiers = registry.modifiers ?? {};

  const baseName = composition["base"];
  if (typeof baseName !== "string") throw new ResolutionError("unknown_reference");
  const baseDoc = templates[baseName];
  if (baseDoc === undefined) throw new ResolutionError("unknown_reference");

  const baseResolved = resolveTemplate(baseDoc, registry, strategies);
  let acc = merge({}, baseResolved, strategies);

  const modifierRefs = composition["modifiers"];
  if (Array.isArray(modifierRefs)) {
    for (const ref of modifierRefs) {
      if (typeof ref !== "string") throw new ResolutionError("unknown_reference");
      const mod = modifiers[ref];
      if (mod === undefined) throw new ResolutionError("unknown_reference");
      acc = merge(acc, mod, strategies);
    }
  }

  const overrides = composition["overrides"];
  if (overrides !== undefined && typeof overrides === "object" && overrides !== null && !Array.isArray(overrides)) {
    acc = merge(acc, overrides, strategies);
  }

  return acc;
}
