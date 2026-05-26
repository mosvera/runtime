// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compileDesignTokens, toCssVariables, type JsonObject } from "../src/index.ts";

const siteAesthetics: Array<{ id: string; canonical: JsonObject }> = [
  {
    id: "quiet-editorial",
    canonical: {
      palette: { background: "#f7f2e7", accent: "#bd5838" },
      typography: { display: "Fraunces", body: "Hanken Grotesk" },
      layout: { density: "comfortable", radius: "6px" },
      motion: { duration: "220ms" },
      imagery: { treatment: "paper_field" },
      voice: { headline: "Aesthetic infrastructure you can inspect." },
    },
  },
  {
    id: "technical-manual",
    canonical: {
      palette: { background: "#f2f5f1", accent: "#17745f" },
      typography: { display: "IBM Plex Mono", body: "Hanken Grotesk" },
      layout: { density: "compact", radius: "2px" },
      motion: { duration: "120ms" },
      imagery: { treatment: "schematic" },
      voice: { headline: "Same site, compiled as a technical surface." },
    },
  },
  {
    id: "cinematic-lab",
    canonical: {
      palette: { background: "#12100f", accent: "#e05b45" },
      typography: { display: "Fraunces", body: "Hanken Grotesk" },
      layout: { density: "spacious", radius: "8px" },
      motion: { duration: "320ms" },
      imagery: { treatment: "spotlit" },
      voice: { headline: "The standard can carry drama without losing structure." },
    },
  },
  {
    id: "claymation-playful-builder",
    canonical: {
      palette: { background: "#f6e7cc", accent: "#d45f3f" },
      typography: { display: "Fraunces", body: "Hanken Grotesk" },
      layout: { density: "roomy", radius: "8px" },
      motion: { duration: "260ms" },
      imagery: { treatment: "tabletop_model" },
      voice: { headline: "Same architecture, built out of warm clay and shop light." },
    },
  },
];

describe("compileDesignTokens", () => {
  it("compiles the four mosvera.io v1 demo aesthetics into neutral token groups", () => {
    for (const aesthetic of siteAesthetics) {
      const tokens = compileDesignTokens(aesthetic.canonical);
      expect(tokens.palette).toBeDefined();
      expect(tokens.typography).toBeDefined();
      expect(tokens.layout).toBeDefined();
      expect(tokens.motion).toBeDefined();
      expect(tokens.imagery).toBeDefined();
      expect(tokens.voice).toBeDefined();
      const palette = aesthetic.canonical["palette"] as JsonObject;
      expect(toCssVariables(tokens)["--mosvera-palette-accent"]).toBe(palette["accent"]);
    }
  });

  it("preserves custom canonical fields under extensions", () => {
    const tokens = compileDesignTokens({ palette: { accent: "#fff" }, provider_hint: "strict" });
    expect(tokens.extensions).toEqual({ provider_hint: "strict" });
  });

  it("serializes stable CSS variables with a custom prefix", () => {
    const tokens = compileDesignTokens({ layout: { radius: "8px" }, palette: { accent_color: "#abc" } });
    expect(toCssVariables(tokens, { prefix: "brand" })).toEqual({
      "--brand-layout-radius": "8px",
      "--brand-palette-accent-color": "#abc",
    });
  });
});
