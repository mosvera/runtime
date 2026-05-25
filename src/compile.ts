// SPDX-License-Identifier: Apache-2.0
//
// Provider compilation contract (MEP-0003). Crosses each canonical
// construct's criticality with the adapter's declared lowering action.
// Loss is never silent: a required+unsupported construct is a hard error
// before any provider call; every lossy mapping emits a structured warning.
//
// This implements the contract RULE ENGINE only — actual provider payload
// emission lives in provider adapters (Phase 4). The determinism boundary is
// here: compilation is a deterministic pure function of its inputs.

import type {
  CapabilityManifest,
  CompileResult,
  CompileWarning,
  Criticality,
  JsonObject,
} from "./types.ts";

/**
 * Decide the compilation outcome for a canonical resolved composition against
 * a provider's capability manifest.
 *
 * Constructs are evaluated in sorted order for deterministic warning ordering
 * and stable error reporting. A construct absent from the manifest is treated
 * as `unsupported`. A construct's criticality defaults to `optional`.
 */
export function compile(
  canonical: JsonObject,
  manifest: CapabilityManifest,
  criticality: Record<string, Criticality> = {},
): CompileResult {
  const constructs = manifest.constructs ?? {};
  const warnings: CompileWarning[] = [];

  for (const name of Object.keys(canonical).sort()) {
    const action = constructs[name]?.lowering_action ?? "unsupported";
    const crit: Criticality = criticality[name] ?? "optional";

    if (action === "native") continue;

    if (action === "unsupported") {
      if (crit === "required") {
        return { status: "error", error: "required_unsupported", construct: name };
      }
      warnings.push({ construct: name, action: "unsupported" });
    } else {
      // approximate | emulate
      warnings.push({ construct: name, action });
    }
  }

  return { status: "compiled", warnings };
}
