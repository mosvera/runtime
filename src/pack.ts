// SPDX-License-Identifier: Apache-2.0
//
// Portable aesthetic pack exchange. These helpers are pure: they validate,
// preview, import, and export `.mosvera.json` pack data without touching the
// filesystem. Node persistence lives in `@mosvera/runtime/node`.

import { collectReferences, getRegistryDocument, upsertRegistryDocument, validateRegistry } from "./registry.ts";
import { ResolutionError } from "./types.ts";
import type { Validator } from "./validator.ts";
import type {
  AestheticPack,
  AestheticPackConflictStrategy,
  AestheticPackImportPlan,
  AestheticPackImportResult,
  AestheticPackOperation,
  AestheticPackStrategyConflict,
  Json,
  JsonObject,
  MergeStrategies,
  Registry,
  RegistryDiagnostic,
  RegistryKind,
} from "./types.ts";

const PACK_SCHEMA = "https://mosvera.io/schema/0.1/aesthetic-pack";
const PACK_KIND = "mosvera.aesthetic_pack";
const PACK_VERSION = "0.1";
const KINDS: RegistryKind[] = ["template", "palette", "modifier", "composition"];
const COLLECTION_BY_KIND: Record<RegistryKind, keyof Registry> = {
  template: "templates",
  palette: "palettes",
  modifier: "modifiers",
  composition: "compositions",
};
const STRUCTURAL_KEYS = new Set(["$schema", "$extends", "$unset", "$revert", "id", "base", "modifiers", "overrides"]);

export interface ValidateAestheticPackOptions {
  validator?: Validator;
}

export interface PreviewAestheticPackImportOptions extends ValidateAestheticPackOptions {
  strategies?: MergeStrategies;
  conflictStrategy?: AestheticPackConflictStrategy;
  strategyConflict?: AestheticPackStrategyConflict;
}

export interface ImportAestheticPackOptions extends PreviewAestheticPackImportOptions {}

export interface ExportAestheticPackOptions {
  id?: string;
  name?: string;
  description?: string;
  strategies?: MergeStrategies;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: Json): Json {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      out[key] = stable(child);
    }
    return out;
  }
  return value;
}

function stableStringify(value: Json): string {
  return JSON.stringify(stable(value));
}

function collection(registry: Registry | undefined, kind: RegistryKind): Record<string, JsonObject> {
  return ((registry?.[COLLECTION_BY_KIND[kind]] ?? {}) as Record<string, JsonObject>);
}

function documentEntries(registry: Registry | undefined, kind: RegistryKind): Array<[string, JsonObject]> {
  return Object.entries(collection(registry, kind)).sort(([a], [b]) => a.localeCompare(b));
}

function emptyRegistry(): Registry {
  return { templates: {}, palettes: {}, modifiers: {}, compositions: {} };
}

function emptyRenameMap(): Record<RegistryKind, Record<string, string>> {
  return { template: {}, palette: {}, modifier: {}, composition: {} };
}

function docId(doc: JsonObject): string | undefined {
  const id = doc["id"];
  return typeof id === "string" ? id : undefined;
}

function packId(pack: unknown): string {
  return isObject(pack) && typeof pack["id"] === "string" ? pack["id"] : "<invalid>";
}

function diagnostic(
  code: RegistryDiagnostic["code"],
  message: string,
  options: Omit<RegistryDiagnostic, "code" | "message"> = {},
): RegistryDiagnostic {
  return { code, message, ...options };
}

function validatePackShape(pack: unknown, validator?: Validator): RegistryDiagnostic[] {
  if (validator === undefined) return [];
  const result = validator.validate(pack, "aesthetic-pack");
  if (result.valid) return [];
  return [
    diagnostic("schema_failure", "aesthetic pack failed schema validation", {
      kind: "aesthetic-pack",
      id: packId(pack),
      errors: result.errors.map((e) => ({ path: e.path, message: e.message })),
    }),
  ];
}

function asPack(pack: unknown): AestheticPack | undefined {
  if (!isObject(pack)) return undefined;
  if (pack["kind"] !== PACK_KIND || pack["version"] !== PACK_VERSION) return undefined;
  if (typeof pack["id"] !== "string") return undefined;
  const entrypoint = pack["entrypoint"];
  if (!isObject(entrypoint) || entrypoint["kind"] !== "composition" || typeof entrypoint["id"] !== "string") {
    return undefined;
  }
  if (!isObject(pack["documents"])) return undefined;
  return pack as unknown as AestheticPack;
}

function validateDocumentKeys(pack: AestheticPack): RegistryDiagnostic[] {
  const diagnostics: RegistryDiagnostic[] = [];
  for (const kind of KINDS) {
    const seen = new Set<string>();
    for (const [key, doc] of documentEntries(pack.documents, kind)) {
      const actual = docId(doc);
      if (actual !== key) {
        diagnostics.push(diagnostic("invalid_document", `${kind} pack key "${key}" does not match document id "${actual ?? "<missing>"}"`, {
          kind,
          id: key,
          path: `/documents/${COLLECTION_BY_KIND[kind]}/${key}`,
        }));
      }
      if (actual !== undefined) {
        if (seen.has(actual)) {
          diagnostics.push(diagnostic("duplicate_id", `duplicate ${kind} id "${actual}" in aesthetic pack`, {
            kind,
            id: actual,
            path: `/documents/${COLLECTION_BY_KIND[kind]}/${key}`,
          }));
        }
        seen.add(actual);
      }
    }
  }
  return diagnostics;
}

function mergedForReferenceChecks(pack: AestheticPack): Registry {
  return {
    templates: { ...(pack.documents.templates ?? {}) },
    palettes: { ...(pack.documents.palettes ?? {}) },
    modifiers: { ...(pack.documents.modifiers ?? {}) },
    compositions: { ...(pack.documents.compositions ?? {}) },
  };
}

export function validateAestheticPack(pack: unknown, options: ValidateAestheticPackOptions = {}): RegistryDiagnostic[] {
  const diagnostics = validatePackShape(pack, options.validator);
  const typed = asPack(pack);
  if (typed === undefined) return diagnostics;

  diagnostics.push(...validateDocumentKeys(typed));
  const entrypoint = collection(typed.documents, "composition")[typed.entrypoint.id];
  if (entrypoint === undefined) {
    diagnostics.push(diagnostic("unknown_reference", `aesthetic pack entrypoint composition "${typed.entrypoint.id}" was not found`, {
      kind: "aesthetic-pack",
      id: typed.id,
      reference: { kind: "composition", id: typed.entrypoint.id, field: "entrypoint" },
    }));
  }

  diagnostics.push(...validateRegistry(typed.documents, options));
  const merged = mergedForReferenceChecks(typed);
  for (const kind of KINDS) {
    for (const [id, doc] of documentEntries(typed.documents, kind)) {
      for (const ref of collectReferences(doc, kind)) {
        if (collection(merged, ref.kind)[ref.id] === undefined) {
          diagnostics.push(diagnostic("unknown_reference", `${kind} "${id}" references missing ${ref.kind} "${ref.id}" via ${ref.field}`, {
            kind,
            id,
            reference: ref,
          }));
        }
      }
    }
  }

  const unique = new Map<string, RegistryDiagnostic>();
  for (const item of diagnostics) {
    unique.set(stableStringify(item as unknown as Json), item);
  }
  return [...unique.values()];
}

function nextAvailableId(kind: RegistryKind, id: string, registry: Registry, reserved: Record<RegistryKind, Set<string>>): string {
  if (collection(registry, kind)[id] === undefined && !reserved[kind].has(id)) return id;
  let candidate = `${id}-imported`;
  let index = 2;
  while (collection(registry, kind)[candidate] !== undefined || reserved[kind].has(candidate)) {
    candidate = `${id}-imported-${index}`;
    index += 1;
  }
  return candidate;
}

function planStrategies(
  pack: AestheticPack,
  existing: MergeStrategies | undefined,
  strategyConflict: AestheticPackStrategyConflict,
  diagnostics: RegistryDiagnostic[],
): AestheticPackImportPlan["merge_strategies"] {
  const out: AestheticPackImportPlan["merge_strategies"] = { add: [], replace: [], conflicts: [] };
  for (const [key, strategy] of Object.entries(pack.merge_strategies ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const current = existing?.[key];
    if (current === undefined) {
      out.add.push(key);
    } else if (stableStringify(current as unknown as Json) !== stableStringify(strategy as unknown as Json)) {
      if (strategyConflict === "replace") out.replace.push(key);
      else {
        out.conflicts.push(key);
        diagnostics.push(diagnostic("strategy_conflict", `merge strategy "${key}" conflicts with the active registry`, {
          kind: "aesthetic-pack",
          id: pack.id,
          path: `/merge_strategies/${key}`,
        }));
      }
    }
  }
  return out;
}

export function previewAestheticPackImport(
  pack: AestheticPack,
  registry: Registry,
  options: PreviewAestheticPackImportOptions = {},
): AestheticPackImportPlan {
  const conflictStrategy = options.conflictStrategy ?? "auto_rename";
  const strategyConflict = options.strategyConflict ?? "fail";
  const validateOptions: ValidateAestheticPackOptions = {};
  if (options.validator !== undefined) validateOptions.validator = options.validator;
  const diagnostics = validateAestheticPack(pack, validateOptions);
  const typed = asPack(pack);
  const rename_map = emptyRenameMap();
  const operations: AestheticPackOperation[] = [];

  if (typed !== undefined) {
    const reserved: Record<RegistryKind, Set<string>> = {
      template: new Set(),
      palette: new Set(),
      modifier: new Set(),
      composition: new Set(),
    };
    for (const kind of KINDS) {
      for (const [id] of documentEntries(typed.documents, kind)) {
        const target =
          conflictStrategy === "auto_rename" ? nextAvailableId(kind, id, registry, reserved) :
          id;
        rename_map[kind][id] = target;
        reserved[kind].add(target);
        const exists = collection(registry, kind)[id] !== undefined;
        if (exists && conflictStrategy === "fail") {
          diagnostics.push(diagnostic("duplicate_id", `${kind} "${id}" already exists in the active registry`, { kind, id }));
        }
        operations.push({
          kind,
          original_id: id,
          id: target,
          action: target !== id ? "rename" : exists ? "replace" : "add",
        });
      }
    }
  }

  const merge_strategies =
    typed === undefined ? { add: [], replace: [], conflicts: [] } :
    planStrategies(typed, options.strategies, strategyConflict, diagnostics);
  const entrypoint = typed?.entrypoint ?? { kind: "composition" as const, id: "<invalid>" };
  const installed_entrypoint = { kind: "composition" as const, id: rename_map.composition[entrypoint.id] ?? entrypoint.id };
  return {
    valid: diagnostics.length === 0,
    pack_id: typed?.id ?? packId(pack),
    entrypoint,
    installed_entrypoint,
    operations,
    rename_map,
    merge_strategies,
    diagnostics,
  };
}

function rewriteDocument(kind: RegistryKind, doc: JsonObject, id: string, renameMap: Record<RegistryKind, Record<string, string>>): JsonObject {
  const out = clone(doc);
  out["id"] = id;
  if ((kind === "template" || kind === "palette") && typeof out["$extends"] === "string") {
    out["$extends"] = renameMap[kind][out["$extends"]] ?? out["$extends"];
  }
  if (kind === "composition") {
    if (typeof out["base"] === "string") out["base"] = renameMap.template[out["base"]] ?? out["base"];
    if (Array.isArray(out["modifiers"])) {
      out["modifiers"] = out["modifiers"].map((ref) => typeof ref === "string" ? renameMap.modifier[ref] ?? ref : ref) as Json;
    }
  }
  return out;
}

function rewrittenPack(pack: AestheticPack, plan: AestheticPackImportPlan): AestheticPack {
  const documents = emptyRegistry();
  for (const kind of KINDS) {
    const key = COLLECTION_BY_KIND[kind];
    const out: Record<string, JsonObject> = {};
    for (const [id, doc] of documentEntries(pack.documents, kind)) {
      const nextId = plan.rename_map[kind][id] ?? id;
      out[nextId] = rewriteDocument(kind, doc, nextId, plan.rename_map);
    }
    documents[key] = out;
  }
  const next: AestheticPack = {
    $schema: pack.$schema ?? PACK_SCHEMA,
    kind: PACK_KIND,
    version: PACK_VERSION,
    id: pack.id,
    entrypoint: plan.installed_entrypoint,
    documents,
  };
  if (pack.name !== undefined) next.name = pack.name;
  if (pack.description !== undefined) next.description = pack.description;
  if (pack.merge_strategies !== undefined) next.merge_strategies = clone(pack.merge_strategies);
  return next;
}

export function importAestheticPack(
  registry: Registry,
  pack: AestheticPack,
  options: ImportAestheticPackOptions = {},
): AestheticPackImportResult {
  const plan = previewAestheticPackImport(pack, registry, options);
  const baseStrategies = clone(options.strategies ?? {});
  if (!plan.valid) {
    return { registry: clone(registry), strategies: baseStrategies, pack: clone(pack), plan };
  }

  const installed = rewrittenPack(pack, plan);
  let nextRegistry = clone(registry);
  for (const kind of KINDS) {
    for (const [, doc] of documentEntries(installed.documents, kind)) {
      nextRegistry = upsertRegistryDocument(nextRegistry, kind, doc);
    }
  }

  const nextStrategies = clone(baseStrategies);
  for (const key of [...plan.merge_strategies.add, ...plan.merge_strategies.replace]) {
    const strategy = pack.merge_strategies?.[key];
    if (strategy !== undefined) nextStrategies[key] = clone(strategy);
  }

  return { registry: nextRegistry, strategies: nextStrategies, pack: installed, plan };
}

function addDependency(out: Registry, registry: Registry, kind: RegistryKind, id: string): JsonObject {
  const existing = collection(out, kind)[id];
  if (existing !== undefined) return existing;
  const doc = getRegistryDocument(registry, kind, id);
  if (doc === undefined) throw new ResolutionError("unknown_reference");
  const key = COLLECTION_BY_KIND[kind];
  out[key] = { ...(out[key] as Record<string, JsonObject> | undefined), [id]: doc };
  return doc;
}

function collectTemplateDependencies(out: Registry, registry: Registry, id: string, seen: Set<string>): void {
  if (seen.has(id)) return;
  seen.add(id);
  const doc = addDependency(out, registry, "template", id);
  const parent = doc["$extends"];
  if (typeof parent === "string") collectTemplateDependencies(out, registry, parent, seen);
}

export function collectAestheticPackDependencies(id: string, registry: Registry): Registry {
  const out = emptyRegistry();
  const composition = addDependency(out, registry, "composition", id);
  const base = composition["base"];
  if (typeof base !== "string") throw new ResolutionError("unknown_reference");
  collectTemplateDependencies(out, registry, base, new Set());
  const modifiers = composition["modifiers"];
  if (Array.isArray(modifiers)) {
    for (const modifier of modifiers) {
      if (typeof modifier !== "string") throw new ResolutionError("unknown_reference");
      addDependency(out, registry, "modifier", modifier);
    }
  }
  return out;
}

function sortedRegistry(registry: Registry): Registry {
  const out = emptyRegistry();
  for (const kind of KINDS) {
    const key = COLLECTION_BY_KIND[kind];
    out[key] = Object.fromEntries(documentEntries(registry, kind));
  }
  return out;
}

function collectStrategyFields(value: Json, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) collectStrategyFields(child, out);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (!STRUCTURAL_KEYS.has(key) && Array.isArray(child)) out.add(key);
    if (!key.startsWith("$")) collectStrategyFields(child, out);
  }
}

function exportedStrategies(registry: Registry, strategies: MergeStrategies | undefined): MergeStrategies | undefined {
  if (strategies === undefined) return undefined;
  const fields = new Set<string>();
  for (const kind of KINDS) {
    for (const [, doc] of documentEntries(registry, kind)) collectStrategyFields(doc as unknown as Json, fields);
  }
  const out: MergeStrategies = {};
  for (const field of [...fields].sort((a, b) => a.localeCompare(b))) {
    const strategy = strategies[field];
    if (strategy !== undefined) out[field] = clone(strategy);
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

export function exportAestheticPack(
  entrypointId: string,
  registry: Registry,
  options: ExportAestheticPackOptions = {},
): AestheticPack {
  const documents = sortedRegistry(collectAestheticPackDependencies(entrypointId, registry));
  const pack: AestheticPack = {
    $schema: PACK_SCHEMA,
    kind: PACK_KIND,
    version: PACK_VERSION,
    id: options.id ?? entrypointId,
    entrypoint: { kind: "composition", id: entrypointId },
    documents,
  };
  if (options.name !== undefined) pack.name = options.name;
  if (options.description !== undefined) pack.description = options.description;
  const merge_strategies = exportedStrategies(documents, options.strategies);
  if (merge_strategies !== undefined) pack.merge_strategies = merge_strategies;
  return pack;
}
