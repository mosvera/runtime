// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  createComposition,
  createModifier,
  createTemplate,
  createValidator,
  exportAestheticPack,
  importAestheticPack,
  previewAestheticPackImport,
  validateAestheticPack,
  type AestheticPack,
  type Registry,
} from "../src/index.ts";

function pack(overrides: Partial<AestheticPack> = {}): AestheticPack {
  return {
    $schema: "https://mosvera.io/schema/0.1/aesthetic-pack",
    kind: "mosvera.aesthetic_pack",
    version: "0.1",
    id: "executive-editorial",
    entrypoint: { kind: "composition", id: "executive-editorial" },
    documents: {
      templates: { base: createTemplate("base", { tone: "neutral" }) },
      modifiers: { warm: createModifier("warm", { tone: "warm" }) },
      compositions: {
        "executive-editorial": createComposition("executive-editorial", "base", { modifiers: ["warm"] }),
      },
    },
    ...overrides,
  };
}

describe("aesthetic packs", () => {
  it("validates a portable aesthetic pack", () => {
    expect(validateAestheticPack(pack(), { validator: createValidator() })).toEqual([]);
  });

  it("rejects bad kind/version, id mismatches, and unknown references", () => {
    const badKind = { ...pack(), kind: "theme" };
    expect(validateAestheticPack(badKind, { validator: createValidator() }).map((d) => d.code)).toContain("schema_failure");

    const mismatch = pack({
      documents: {
        templates: { base: createTemplate("not-base") },
        compositions: { "executive-editorial": createComposition("executive-editorial", "missing") },
      },
    });
    const codes = validateAestheticPack(mismatch, { validator: createValidator() }).map((d) => d.code);
    expect(codes).toContain("invalid_document");
    expect(codes).toContain("unknown_reference");
  });

  it("previews deterministic auto-renames and rewrites internal references on import", () => {
    const registry: Registry = {
      templates: { base: createTemplate("base", { tone: "existing" }) },
      modifiers: {},
      palettes: {},
      compositions: {},
    };
    const preview = previewAestheticPackImport(pack(), registry, { validator: createValidator() });
    expect(preview).toMatchObject({
      valid: true,
      installed_entrypoint: { kind: "composition", id: "executive-editorial" },
      rename_map: { template: { base: "base-imported" } },
    });

    const result = importAestheticPack(registry, pack(), { validator: createValidator() });
    expect(result.plan.valid).toBe(true);
    expect(result.registry.templates!.base!["tone"]).toBe("existing");
    expect(result.registry.templates!["base-imported"]!["tone"]).toBe("neutral");
    expect(result.pack.documents.compositions!["executive-editorial"]!["base"]).toBe("base-imported");
  });

  it("fails strategy conflicts unless replacement is requested", () => {
    const withStrategies = pack({ merge_strategies: { tags: { strategy: "append" } } });
    const preview = previewAestheticPackImport(withStrategies, {}, {
      strategies: { tags: { strategy: "replace" } },
    });
    expect(preview.valid).toBe(false);
    expect(preview.diagnostics.map((d) => d.code)).toContain("strategy_conflict");

    const replace = previewAestheticPackImport(withStrategies, {}, {
      strategies: { tags: { strategy: "replace" } },
      strategyConflict: "replace",
    });
    expect(replace.valid).toBe(true);
    expect(replace.merge_strategies.replace).toEqual(["tags"]);
  });

  it("exports dependencies and can re-import them into a clean registry", () => {
    const registry: Registry = {
      templates: { base: createTemplate("base", { components: [{ name: "card" }] }) },
      modifiers: { warm: createModifier("warm", { tone: "warm" }) },
      palettes: {},
      compositions: { "executive-editorial": createComposition("executive-editorial", "base", { modifiers: ["warm"] }) },
    };
    const exported = exportAestheticPack("executive-editorial", registry, {
      strategies: { components: { strategy: "merge_by", key: "name" } },
    });
    expect(exported.merge_strategies).toEqual({ components: { strategy: "merge_by", key: "name" } });

    const result = importAestheticPack({}, exported, { validator: createValidator() });
    expect(result.plan.valid).toBe(true);
    expect(result.registry.compositions!["executive-editorial"]).toBeDefined();
    expect(validateAestheticPack(result.pack, { validator: createValidator() })).toEqual([]);
  });
});
