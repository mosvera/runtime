// SPDX-License-Identifier: Apache-2.0
//
// Pure registry helpers. These keep registry manipulation deterministic and
// host-independent so MCP, Node persistence, and the Python port can share the
// same contract.

import type { DocumentKind, Validator } from "./validator.ts";
import type {
  JsonObject,
  MergeStrategies,
  Registry,
  RegistryDiagnostic,
  RegistryDocument,
  RegistryEntrySummary,
  RegistryKind,
  RegistryReference,
} from "./types.ts";

const SCHEMA_BY_KIND: Record<RegistryKind, string> = {
  template: "https://mosvera.io/schema/0.1/template",
  modifier: "https://mosvera.io/schema/0.1/modifier",
  palette: "https://mosvera.io/schema/0.1/palette",
  composition: "https://mosvera.io/schema/0.1/composition",
};

const COLLECTION_BY_KIND: Record<RegistryKind, keyof Registry> = {
  template: "templates",
  modifier: "modifiers",
  palette: "palettes",
  composition: "compositions",
};

const KINDS: RegistryKind[] = ["template", "modifier", "palette", "composition"];
const REFERENCE_RE = /^[a-z][a-z0-9_-]*$/;

export interface ValidateRegistryOptions {
  validator?: Validator;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function collection(registry: Registry, kind: RegistryKind): Record<string, JsonObject> {
  return (registry[COLLECTION_BY_KIND[kind]] ?? {}) as Record<string, JsonObject>;
}

function docId(doc: JsonObject): string | undefined {
  const id = doc["id"];
  return typeof id === "string" ? id : undefined;
}

function assertReference(id: string): void {
  if (!REFERENCE_RE.test(id)) {
    throw new Error(`invalid Mosvera reference id "${id}"`);
  }
}

function schemaDoc(kind: RegistryKind, id: string, values: JsonObject): JsonObject {
  assertReference(id);
  return { $schema: SCHEMA_BY_KIND[kind], id, ...clone(values) };
}

export function createTemplate(id: string, values: JsonObject = {}): JsonObject {
  return schemaDoc("template", id, values);
}

export function createModifier(id: string, values: JsonObject = {}): JsonObject {
  return schemaDoc("modifier", id, values);
}

export function createPalette(
  id: string,
  roles: Record<string, string> = {},
  values: JsonObject = {},
): JsonObject {
  return schemaDoc("palette", id, { ...clone(values), roles: clone(roles) });
}

export function createComposition(
  id: string,
  base: string,
  options: { modifiers?: string[]; overrides?: JsonObject } = {},
): JsonObject {
  assertReference(id);
  assertReference(base);
  const out: JsonObject = { $schema: SCHEMA_BY_KIND.composition, id, base };
  if (options.modifiers !== undefined) out["modifiers"] = clone(options.modifiers);
  if (options.overrides !== undefined) out["overrides"] = clone(options.overrides);
  return out;
}

export function listRegistryEntries(registry: Registry, kind?: RegistryKind): RegistryEntrySummary[] {
  const kinds = kind === undefined ? KINDS : [kind];
  const out: RegistryEntrySummary[] = [];
  for (const k of kinds) {
    for (const [id, doc] of Object.entries(collection(registry, k)).sort(([a], [b]) => a.localeCompare(b))) {
      const summary: RegistryEntrySummary = { kind: k, id };
      const parent = doc["$extends"];
      if (typeof parent === "string") summary.extends = parent;
      const base = doc["base"];
      if (k === "composition" && typeof base === "string") summary.base = base;
      out.push(summary);
    }
  }
  return out;
}

export function getRegistryDocument(
  registry: Registry,
  kind: RegistryKind,
  id: string,
): RegistryDocument | undefined {
  const doc = collection(registry, kind)[id];
  return doc === undefined ? undefined : clone(doc);
}

export function mergeRegistry(base: Registry, overlay: Registry | undefined): Registry {
  return {
    templates: { ...(base.templates ?? {}), ...(overlay?.templates ?? {}) },
    modifiers: { ...(base.modifiers ?? {}), ...(overlay?.modifiers ?? {}) },
    palettes: { ...(base.palettes ?? {}), ...(overlay?.palettes ?? {}) },
    compositions: { ...(base.compositions ?? {}), ...(overlay?.compositions ?? {}) },
  };
}

export function composeStrategies(...layers: Array<MergeStrategies | undefined>): MergeStrategies {
  const out: MergeStrategies = {};
  for (const layer of layers) {
    if (layer === undefined) continue;
    for (const [name, strategy] of Object.entries(layer)) out[name] = strategy;
  }
  return out;
}

export function upsertRegistryDocument(
  registry: Registry,
  kind: RegistryKind,
  document: RegistryDocument,
): Registry {
  const id = docId(document);
  if (id === undefined) throw new Error(`${kind} document is missing a string id`);
  assertReference(id);
  const key = COLLECTION_BY_KIND[kind];
  const next = mergeRegistry(registry, undefined);
  next[key] = { ...(next[key] as Record<string, JsonObject>), [id]: clone(document) };
  return next;
}

export function removeRegistryDocument(registry: Registry, kind: RegistryKind, id: string): Registry {
  assertReference(id);
  const key = COLLECTION_BY_KIND[kind];
  const next = mergeRegistry(registry, undefined);
  const docs = { ...(next[key] as Record<string, JsonObject>) };
  delete docs[id];
  next[key] = docs;
  return next;
}

export function collectReferences(doc: JsonObject, kind: RegistryKind): RegistryReference[] {
  const refs: RegistryReference[] = [];
  if (kind === "template" || kind === "palette") {
    const parent = doc["$extends"];
    if (typeof parent === "string") refs.push({ kind, id: parent, field: "$extends" });
  }
  if (kind === "composition") {
    const base = doc["base"];
    if (typeof base === "string") refs.push({ kind: "template", id: base, field: "base" });
    const mods = doc["modifiers"];
    if (Array.isArray(mods)) {
      for (const mod of mods) {
        if (typeof mod === "string") refs.push({ kind: "modifier", id: mod, field: "modifiers" });
      }
    }
  }
  return refs;
}

function validationKind(kind: RegistryKind): DocumentKind {
  return kind;
}

export function validateRegistry(registry: Registry, options: ValidateRegistryOptions = {}): RegistryDiagnostic[] {
  const diagnostics: RegistryDiagnostic[] = [];
  for (const kind of KINDS) {
    const docs = collection(registry, kind);
    for (const [id, doc] of Object.entries(docs)) {
      const actual = docId(doc);
      if (actual !== id) {
        diagnostics.push({
          code: "invalid_document",
          kind,
          id,
          message: `${kind} registry key "${id}" does not match document id "${actual ?? "<missing>"}"`,
        });
      }
      if (options.validator !== undefined) {
        const result = options.validator.validate(doc, validationKind(kind));
        if (!result.valid) {
          diagnostics.push({
            code: "schema_failure",
            kind,
            id,
            message: `${kind} "${id}" failed schema validation`,
            errors: result.errors.map((e) => ({ path: e.path, message: e.message })),
          });
        }
      }
      for (const ref of collectReferences(doc, kind)) {
        if (collection(registry, ref.kind)[ref.id] === undefined) {
          diagnostics.push({
            code: "unknown_reference",
            kind,
            id,
            reference: ref,
            message: `${kind} "${id}" references missing ${ref.kind} "${ref.id}" via ${ref.field}`,
          });
        }
      }
    }
  }
  return diagnostics;
}
