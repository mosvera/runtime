// SPDX-License-Identifier: Apache-2.0
//
// Core types for the Mosvera reference runtime. The semantic model is plain
// JSON: aesthetic primitives are JSON objects, and the merge/resolve/compose
// logic operates on them as pure data. This keeps the semantic core portable
// (the committed Python port per ADR-0007 is a translation, not a rewrite).

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type JsonObject = { [key: string]: Json };

/**
 * List-merge strategy for a field, per MEP-0001. Declared in a primitive's
 * schema; carried alongside the data here. Index-based merge is never used.
 */
export interface MergeStrategy {
  strategy: "replace" | "append" | "merge_by";
  /** Required when strategy is "merge_by": the field elements are correlated by. */
  key?: string;
}

/** Field name -> its list-merge strategy. Absent fields default to "replace". */
export type MergeStrategies = Record<string, MergeStrategy>;

/** Named primitives available for reference resolution. */
export interface Registry {
  templates?: Record<string, JsonObject>;
  modifiers?: Record<string, JsonObject>;
  palettes?: Record<string, JsonObject>;
}

/** Provider compilation types (MEP-0003). */
export type LoweringAction = "native" | "approximate" | "emulate" | "unsupported";
export type Criticality = "required" | "optional";

export interface CapabilityManifest {
  provider: string;
  adapter_version: string;
  constructs: Record<string, { lowering_action: LoweringAction; note?: string }>;
}

export interface CompileWarning {
  construct: string;
  action: "approximate" | "emulate" | "unsupported";
}

export type CompileResult =
  | { status: "compiled"; warnings: CompileWarning[] }
  | { status: "error"; error: "required_unsupported"; construct: string };

/**
 * Errors raised during resolution. The `kind` mirrors the normative error
 * identifiers in the conformance suite (MEP-0001/0002).
 */
export type ResolutionErrorKind =
  | "inheritance_cycle"
  | "reference_cycle"
  | "multiple_inheritance_unsupported";

export class ResolutionError extends Error {
  readonly kind: ResolutionErrorKind;
  constructor(kind: ResolutionErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ResolutionError";
    this.kind = kind;
  }
}
