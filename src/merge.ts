// SPDX-License-Identifier: Apache-2.0
//
// The merge algebra (MEP-0001). `merge(acc, layer)` is the single operation
// the whole system folds over: composition, inheritance, and modifier
// application are all left-folds of this function. Pure and deterministic.

import type { Json, JsonObject, MergeStrategies, MergeStrategy } from "./types.ts";

/**
 * Document-structural / identity keys. These are not aesthetic content and
 * are never merged into the canonical model.
 */
const STRUCTURAL = new Set(["id", "$schema", "$extends", "base", "modifiers", "overrides"]);

function isObject(v: Json | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clone<T extends Json>(v: T): T {
  return structuredClone(v);
}

function asStringArray(v: Json | undefined): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

function mergeList(base: Json[], overlay: Json[], strat: MergeStrategy | undefined): Json[] {
  if (!strat || strat.strategy === "replace") return clone(overlay);
  if (strat.strategy === "append") return [...clone(base), ...clone(overlay)];

  // merge_by: identity-based, never positional (MEP-0001).
  const key = strat.key;
  if (key === undefined) return clone(overlay);
  const result: Json[] = base.map(clone);
  const index = new Map<Json, number>();
  result.forEach((el, i) => {
    if (isObject(el) && key in el) index.set(el[key]!, i);
  });
  for (const oel of overlay) {
    if (isObject(oel) && key in oel && index.has(oel[key]!)) {
      const i = index.get(oel[key]!)!;
      const target = result[i];
      if (isObject(target)) result[i] = merge(target, oel, {});
    } else {
      result.push(clone(oel));
    }
  }
  return result;
}

/**
 * Merge `layer` onto `acc`, returning a new object. Later (the `layer`) wins.
 *
 * - Objects deep-merge; untouched keys are preserved.
 * - Lists merge per their declared strategy (default replace); never by index.
 * - Scalars and type mismatches: the layer value replaces.
 * - `$unset` removes named fields; `$revert` rolls a field back to its
 *   pre-layer value (discarding this layer's own contribution to it).
 */
export function merge(acc: JsonObject, layer: JsonObject, strategies: MergeStrategies): JsonObject {
  const result: JsonObject = clone(acc);

  // Capture pre-layer values for $revert before applying this layer.
  const revert = asStringArray(layer["$revert"]);
  const pre = new Map<string, { present: boolean; value: Json }>();
  for (const f of revert) {
    pre.set(f, f in result ? { present: true, value: clone(result[f]!) } : { present: false, value: null });
  }

  for (const [k, v] of Object.entries(layer)) {
    if (STRUCTURAL.has(k) || k.startsWith("$")) continue;
    const cur = result[k];
    if (!(k in result)) {
      result[k] = clone(v);
    } else if (isObject(cur) && isObject(v)) {
      result[k] = merge(cur, v, strategies);
    } else if (Array.isArray(cur) && Array.isArray(v)) {
      result[k] = mergeList(cur, v, strategies[k]);
    } else {
      result[k] = clone(v);
    }
  }

  for (const f of asStringArray(layer["$unset"])) {
    delete result[f];
  }

  for (const f of revert) {
    const p = pre.get(f)!;
    if (p.present) result[f] = p.value;
    else delete result[f];
  }

  return result;
}
