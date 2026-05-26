// SPDX-License-Identifier: Apache-2.0
//
// Named aesthetic resolution. This is the runtime-facing bridge from a user's
// registry entry such as "executive-editorial" to the canonical model.

import { resolveComposition } from "./compose.ts";
import { ResolutionError, type JsonObject, type MergeStrategies, type Registry } from "./types.ts";

export function resolveNamedComposition(
  id: string,
  registry: Registry,
  strategies: MergeStrategies,
): JsonObject {
  const composition = registry.compositions?.[id];
  if (composition === undefined) throw new ResolutionError("unknown_reference");
  return resolveComposition(composition, registry, strategies);
}

export function resolveAesthetic(
  compositionOrId: JsonObject | string,
  registry: Registry,
  strategies: MergeStrategies,
): JsonObject {
  if (typeof compositionOrId === "string") {
    return resolveNamedComposition(compositionOrId, registry, strategies);
  }
  return resolveComposition(compositionOrId, registry, strategies);
}
