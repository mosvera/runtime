// SPDX-License-Identifier: Apache-2.0
//
// Node-only project persistence helpers. Import from `@mosvera/runtime/node`;
// the root runtime entrypoint intentionally has no filesystem dependency.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  createValidator,
  validateAestheticPack,
  parse,
  type AestheticPack,
  type CapabilityManifest,
  type DocumentKind,
  type Json,
  type JsonObject,
  type LoadedProject,
  type MergeStrategies,
  type Registry,
  type RegistryDiagnostic,
  type RegistryKind,
  type Validator,
} from "./index.ts";

export interface LoadProjectOptions {
  validator?: Validator;
}

export interface SaveProjectDocumentOptions {
  validator?: Validator;
}

export interface WriteProjectOptions {
  createDirectory?: boolean;
}

export class RegistryProjectError extends Error {
  readonly diagnostics: RegistryDiagnostic[];

  constructor(message: string, diagnostics: RegistryDiagnostic[]) {
    super(message);
    this.name = "RegistryProjectError";
    this.diagnostics = diagnostics;
  }
}

const DOC_EXT = /\.(json|ya?ml)$/i;
const PACK_EXT = /\.mosvera\.json$/i;
const SAFE_ID = /^[a-z][a-z0-9_-]*$/;

const ID_TO_KIND: Record<string, DocumentKind> = {
  "https://mosvera.io/schema/0.1/template": "template",
  "https://mosvera.io/schema/0.1/modifier": "modifier",
  "https://mosvera.io/schema/0.1/palette": "palette",
  "https://mosvera.io/schema/0.1/composition": "composition",
  "https://mosvera.io/schema/0.1/capability-manifest": "capability-manifest",
};

function readDoc(path: string): JsonObject {
  return parse(readFileSync(path, "utf8"));
}

function classify(doc: JsonObject, file: string): DocumentKind {
  const schemaId = doc["$schema"];
  if (typeof schemaId === "string" && schemaId in ID_TO_KIND) return ID_TO_KIND[schemaId]!;
  if (/(^|\/)template\./.test(file)) return "template";
  if (/(^|\/)modifier\./.test(file)) return "modifier";
  if (/(^|\/)palette\./.test(file)) return "palette";
  if (/(^|\/)composition\./.test(file)) return "composition";
  if (/\.manifest\.(json|ya?ml)$/i.test(file)) return "capability-manifest";
  throw new Error(`cannot classify document "${file}"`);
}

function ensureSafeFile(file: string, pathForMessage: string): void {
  if (file.startsWith(".") || file.includes("/") || file.includes("\\") || isAbsolute(file)) {
    throw new RegistryProjectError(`unsafe registry filename "${pathForMessage}"`, [
      {
        code: "unsafe_filename",
        path: pathForMessage,
        message: `unsafe registry filename "${pathForMessage}"`,
      },
    ]);
  }
}

function ensureSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new RegistryProjectError(`unsafe registry id "${id}"`, [
      {
        code: "unsafe_filename",
        id,
        message: `registry id "${id}" is not a valid Mosvera reference id`,
      },
    ]);
  }
}

function requireId(doc: JsonObject, kind: RegistryKind, pathForMessage: string): string {
  const id = doc["id"];
  if (typeof id !== "string") {
    throw new RegistryProjectError(`${kind} document "${pathForMessage}" is missing a string id`, [
      {
        code: "invalid_document",
        kind,
        path: pathForMessage,
        message: `${kind} document "${pathForMessage}" is missing a string id`,
      },
    ]);
  }
  ensureSafeId(id);
  return id;
}

function providerId(doc: JsonObject, pathForMessage: string): string {
  const provider = doc["provider"];
  if (typeof provider !== "string") {
    throw new RegistryProjectError(`manifest "${pathForMessage}" is missing provider`, [
      {
        code: "invalid_document",
        kind: "capability-manifest",
        path: pathForMessage,
        message: `manifest "${pathForMessage}" is missing provider`,
      },
    ]);
  }
  ensureSafeId(provider);
  return provider;
}

function validateOrThrow(validator: Validator, doc: JsonObject, kind: DocumentKind, file: string): void {
  const res = validator.validate(doc, kind);
  if (res.valid) return;
  throw new RegistryProjectError(`invalid ${kind} document "${file}"`, [
    {
      code: "schema_failure",
      kind,
      path: file,
      message: `invalid ${kind} document "${file}"`,
      errors: res.errors.map((e) => ({ path: e.path, message: e.message })),
    },
  ]);
}

function addRegistryDoc(
  registry: Registry,
  diagnostics: RegistryDiagnostic[],
  kind: RegistryKind,
  id: string,
  doc: JsonObject,
  file: string,
): void {
  const key =
    kind === "template" ? "templates" :
    kind === "modifier" ? "modifiers" :
    kind === "palette" ? "palettes" :
    "compositions";
  const docs = registry[key] ?? {};
  if (docs[id] !== undefined) {
    diagnostics.push({
      code: "duplicate_id",
      kind,
      id,
      path: file,
      message: `duplicate ${kind} id "${id}" while loading "${file}"`,
    });
  }
  docs[id] = doc;
  registry[key] = docs;
}

function loadDocFile(
  root: string,
  relFile: string,
  validator: Validator,
  project: LoadedProject,
  diagnostics: RegistryDiagnostic[],
): void {
  ensureSafeFile(basename(relFile), relFile);
  const doc = readDoc(join(root, relFile));
  const kind = classify(doc, relFile);
  validateOrThrow(validator, doc, kind, relFile);
  if (kind === "capability-manifest") {
    const provider = providerId(doc, relFile);
    if (project.manifests[provider] !== undefined) {
      diagnostics.push({
        code: "duplicate_id",
        kind: "capability-manifest",
        id: provider,
        path: relFile,
        message: `duplicate capability manifest provider "${provider}" while loading "${relFile}"`,
      });
    }
    project.manifests[provider] = doc as unknown as CapabilityManifest;
    return;
  }
  if (kind === "aesthetic-pack") {
    throw new Error(`aesthetic pack files are not registry documents: "${relFile}"`);
  }
  addRegistryDoc(project.registry, diagnostics, kind, requireId(doc, kind, relFile), doc, relFile);
}

export function loadProject(directory: string, options: LoadProjectOptions = {}): LoadedProject {
  const validator = options.validator ?? createValidator();
  const root = resolve(directory);
  const project: LoadedProject = {
    registry: { templates: {}, modifiers: {}, palettes: {}, compositions: {} },
    manifests: {},
    strategies: {},
  };
  const diagnostics: RegistryDiagnostic[] = [];

  const strategyPath = join(root, "merge-strategies.json");
  if (existsSync(strategyPath)) {
    project.strategies = readDoc(strategyPath) as unknown as MergeStrategies;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && DOC_EXT.test(entry.name) && !PACK_EXT.test(entry.name) && entry.name !== "merge-strategies.json") {
      loadDocFile(root, entry.name, validator, project, diagnostics);
    }
  }

  const manifestsDir = join(root, "manifests");
  if (existsSync(manifestsDir)) {
    for (const entry of readdirSync(manifestsDir, { withFileTypes: true })) {
      if (entry.isFile() && DOC_EXT.test(entry.name)) {
        loadDocFile(root, join("manifests", entry.name), validator, project, diagnostics);
      }
    }
  }

  if (diagnostics.length > 0) {
    throw new RegistryProjectError("registry project contains duplicate ids", diagnostics);
  }
  return project;
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
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function fileName(kind: RegistryKind, id: string): string {
  return `${kind}.${id}.json`;
}

function assertWithin(root: string, target: string): void {
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new RegistryProjectError(`path escapes registry root: ${target}`, [
      { code: "unsafe_filename", path: target, message: `path escapes registry root: ${target}` },
    ]);
  }
}

function atomicWrite(path: string, body: string): void {
  const temp = join(dirname(path), `${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temp, body, "utf8");
  renameSync(temp, path);
}

function ensureSafePackPath(filePath: string): void {
  const file = basename(filePath);
  if (file.startsWith(".") || !PACK_EXT.test(file)) {
    throw new RegistryProjectError(`unsafe aesthetic pack filename "${filePath}"`, [
      {
        code: "unsafe_filename",
        path: filePath,
        message: `aesthetic pack path must end with .mosvera.json and must not be a dotfile: ${filePath}`,
      },
    ]);
  }
}

export function saveProjectDocument(
  directory: string,
  kind: RegistryKind,
  document: JsonObject,
  options: SaveProjectDocumentOptions & WriteProjectOptions = {},
): void {
  const validator = options.validator ?? createValidator();
  const id = requireId(document, kind, `${kind}.${String(document["id"] ?? "<missing>")}.json`);
  const root = resolve(directory);
  if (options.createDirectory === true) mkdirSync(root, { recursive: true });
  const path = join(root, fileName(kind, id));
  assertWithin(root, path);
  validateOrThrow(validator, document, kind, fileName(kind, id));
  atomicWrite(path, stableStringify(document));
}

export function deleteProjectDocument(directory: string, kind: RegistryKind, id: string): void {
  ensureSafeId(id);
  const root = resolve(directory);
  const path = join(root, fileName(kind, id));
  assertWithin(root, path);
  if (existsSync(path)) rmSync(path);
}

export function writeMergeStrategies(
  directory: string,
  strategies: MergeStrategies,
  options: WriteProjectOptions = {},
): void {
  const root = resolve(directory);
  if (options.createDirectory === true) mkdirSync(root, { recursive: true });
  const path = join(root, "merge-strategies.json");
  assertWithin(root, path);
  atomicWrite(path, stableStringify(strategies as unknown as Json));
}

export function loadAestheticPack(path: string, options: LoadProjectOptions = {}): AestheticPack {
  ensureSafePackPath(path);
  const validator = options.validator ?? createValidator();
  const pack = readDoc(path) as unknown as AestheticPack;
  const diagnostics = validateAestheticPack(pack, { validator });
  if (diagnostics.length > 0) {
    throw new RegistryProjectError(`invalid aesthetic pack "${path}"`, diagnostics);
  }
  return pack;
}

export function writeAestheticPack(
  path: string,
  pack: AestheticPack,
  options: SaveProjectDocumentOptions = {},
): void {
  ensureSafePackPath(path);
  const validator = options.validator ?? createValidator();
  const diagnostics = validateAestheticPack(pack, { validator });
  if (diagnostics.length > 0) {
    throw new RegistryProjectError(`invalid aesthetic pack "${path}"`, diagnostics);
  }
  atomicWrite(path, stableStringify(pack as unknown as Json));
}
