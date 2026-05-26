// SPDX-License-Identifier: Apache-2.0
//
// Neutral design-token compilation. Artifact adapters can consume this output
// for websites, reports, slide themes, or application surfaces.

import type { Json, JsonObject } from "./types.ts";

export interface CompileDesignTokensOptions {
  preserveUnknown?: boolean;
}

export interface ToCssVariablesOptions {
  prefix?: string;
}

export type CssVariableMap = Record<string, string>;

export interface DesignTokens {
  palette?: JsonObject;
  typography?: JsonObject;
  layout?: JsonObject;
  motion?: JsonObject;
  imagery?: JsonObject;
  voice?: JsonObject;
  extensions: JsonObject;
}

const RECOGNIZED = new Set(["palette", "typography", "layout", "motion", "imagery", "voice"]);

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T extends Json>(value: T): T {
  return structuredClone(value);
}

function assignKnown(tokens: DesignTokens, key: string, value: JsonObject): void {
  if (key === "palette") tokens.palette = value;
  else if (key === "typography") tokens.typography = value;
  else if (key === "layout") tokens.layout = value;
  else if (key === "motion") tokens.motion = value;
  else if (key === "imagery") tokens.imagery = value;
  else if (key === "voice") tokens.voice = value;
}

export function compileDesignTokens(
  canonical: JsonObject,
  options: CompileDesignTokensOptions = {},
): DesignTokens {
  const preserveUnknown = options.preserveUnknown ?? true;
  const tokens: DesignTokens = { extensions: {} };

  for (const [key, value] of Object.entries(canonical)) {
    if (RECOGNIZED.has(key) && isObject(value)) {
      assignKnown(tokens, key, clone(value));
    } else if (preserveUnknown) {
      tokens.extensions[key] = clone(value);
    }
  }

  return tokens;
}

function kebab(value: string): string {
  return value.replace(/_/g, "-").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
}

function cssValue(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function flatten(out: CssVariableMap, prefix: string, value: Json): void {
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      flatten(out, `${prefix}-${kebab(key)}`, child);
    }
    return;
  }
  out[`--${prefix}`] = cssValue(value);
}

export function toCssVariables(tokens: DesignTokens, options: ToCssVariablesOptions = {}): CssVariableMap {
  const prefix = kebab(options.prefix ?? "mosvera");
  const out: CssVariableMap = {};
  for (const [key, value] of Object.entries(tokens).sort(([a], [b]) => a.localeCompare(b))) {
    if (value === undefined) continue;
    flatten(out, `${prefix}-${kebab(key)}`, value as Json);
  }
  return out;
}
