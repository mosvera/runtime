// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  collectReferences,
  composeStrategies,
  createComposition,
  createModifier,
  createPalette,
  createTemplate,
  getRegistryDocument,
  listRegistryEntries,
  mergeRegistry,
  removeRegistryDocument,
  upsertRegistryDocument,
  validateRegistry,
  createValidator,
  type Registry,
} from "../src/index.ts";

describe("registry helpers", () => {
  const registry: Registry = {
    templates: { base_t: createTemplate("base_t", { density: "comfortable" }) },
    modifiers: { compact: createModifier("compact", { density: "compact" }) },
    palettes: { brand: createPalette("brand", { accent: "#3366ff" }) },
    compositions: { executive_editorial: createComposition("executive_editorial", "base_t", { modifiers: ["compact"] }) },
  };

  it("lists entries across registry collections", () => {
    expect(listRegistryEntries(registry)).toEqual([
      { kind: "template", id: "base_t" },
      { kind: "modifier", id: "compact" },
      { kind: "palette", id: "brand" },
      { kind: "composition", id: "executive_editorial", base: "base_t" },
    ]);
  });

  it("gets defensive copies", () => {
    const doc = getRegistryDocument(registry, "template", "base_t");
    expect(doc).toEqual(registry.templates!.base_t);
    doc!["density"] = "mutated";
    expect(registry.templates!.base_t!["density"]).toBe("comfortable");
  });

  it("merges registries per collection", () => {
    const merged = mergeRegistry(registry, {
      compositions: { expressive: createComposition("expressive", "base_t") },
    });
    expect(Object.keys(merged.compositions ?? {}).sort()).toEqual(["executive_editorial", "expressive"]);
  });

  it("upserts and removes without mutating the input registry", () => {
    const added = upsertRegistryDocument(registry, "modifier", createModifier("warm", { tone: "warm" }));
    expect(added.modifiers!.warm).toBeDefined();
    expect(registry.modifiers!.warm).toBeUndefined();

    const removed = removeRegistryDocument(added, "modifier", "warm");
    expect(removed.modifiers!.warm).toBeUndefined();
    expect(added.modifiers!.warm).toBeDefined();
  });

  it("collects composition references", () => {
    expect(collectReferences(registry.compositions!.executive_editorial!, "composition")).toEqual([
      { kind: "template", id: "base_t", field: "base" },
      { kind: "modifier", id: "compact", field: "modifiers" },
    ]);
  });

  it("validates missing references and schemas", () => {
    const diagnostics = validateRegistry(
      {
        templates: { base_t: createTemplate("base_t") },
        compositions: { broken: createComposition("broken", "missing_t", { modifiers: ["ghost"] }) },
      },
      { validator: createValidator() },
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["unknown_reference", "unknown_reference"]);
  });

  it("composes merge strategy layers", () => {
    expect(composeStrategies({ tags: { strategy: "replace" } }, { tags: { strategy: "append" } })).toEqual({
      tags: { strategy: "append" },
    });
  });
});
