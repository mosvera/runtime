// SPDX-License-Identifier: Apache-2.0
//
// Document parser (boundary module). Loads a Mosvera document from JSON or
// YAML source (or accepts an already-parsed object) into a JsonObject.
//
// This is a BOUNDARY module, not part of the pure semantic core: it binds to
// the `yaml` package. Each language port replaces this binding with its
// native YAML/JSON parser; the portable artifact is the semantic core, not
// the parser.

import { parse as parseYaml } from "yaml";
import type { JsonObject } from "./types.ts";

/**
 * Parse a Mosvera document. Accepts a JSON or YAML string (YAML is a JSON
 * superset, so both are handled by one path) or an already-parsed object.
 * Throws if the result is not a mapping/object.
 */
export function parse(source: string | object): JsonObject {
  const doc: unknown = typeof source === "string" ? parseYaml(source) : source;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TypeError("Mosvera document must be a mapping/object at the top level");
  }
  return doc as JsonObject;
}
