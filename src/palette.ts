// SPDX-License-Identifier: Apache-2.0
//
// Palette inheritance resolution. Palette-to-palette `$extends` follows the
// same single-inheritance contract as templates.

import { merge } from "./merge.ts";
import { ResolutionError, type Json, type JsonObject, type MergeStrategies, type Registry } from "./types.ts";

export function resolvePalette(
  paletteOrId: JsonObject | string,
  registry: Registry,
  strategies: MergeStrategies,
): JsonObject {
  const palettes = registry.palettes ?? {};
  const first = typeof paletteOrId === "string" ? palettes[paletteOrId] : paletteOrId;
  if (first === undefined) throw new ResolutionError("unknown_reference");

  const chain: JsonObject[] = [];
  const seen = new Set<string>();

  let current: JsonObject | undefined = first;
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

    const next: JsonObject | undefined = palettes[parent];
    if (next === undefined) throw new ResolutionError("unknown_reference");
    current = next;
  }

  let acc: JsonObject = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    acc = merge(acc, chain[i]!, strategies);
  }
  return acc;
}
