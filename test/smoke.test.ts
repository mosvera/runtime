// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileDesignTokens,
  createComposition,
  createTemplate,
  createValidator,
  exportAestheticPack,
  getRegistryDocument,
  importAestheticPack,
  listRegistryEntries,
  resolveAesthetic,
  resolveNamedComposition,
  toCssVariables,
  validateAestheticPack,
  validateRegistry,
  type JsonObject,
  type LoadedProject,
} from "../src/index.ts";
import { loadProject, saveProjectDocument } from "../src/node.ts";

interface DemoAesthetic {
  id: string;
  base: string;
  accent: string;
  background: string;
  density: string;
  duration: string;
  treatment: string;
  headline: string;
}

const DEMO_AESTHETICS: DemoAesthetic[] = [
  {
    id: "quiet-editorial",
    base: "quiet-editorial-base",
    accent: "#bd5838",
    background: "#f7f2e7",
    density: "comfortable",
    duration: "220ms",
    treatment: "paper_field",
    headline: "Aesthetic infrastructure you can inspect.",
  },
  {
    id: "technical-manual",
    base: "technical-manual-base",
    accent: "#17745f",
    background: "#f2f5f1",
    density: "compact",
    duration: "120ms",
    treatment: "schematic",
    headline: "Same site, compiled as a technical surface.",
  },
  {
    id: "cinematic-lab",
    base: "cinematic-lab-base",
    accent: "#e05b45",
    background: "#12100f",
    density: "spacious",
    duration: "320ms",
    treatment: "spotlit",
    headline: "The standard can carry drama without losing structure.",
  },
  {
    id: "claymation-playful-builder",
    base: "claymation-playful-builder-base",
    accent: "#d45f3f",
    background: "#f6e7cc",
    density: "roomy",
    duration: "260ms",
    treatment: "tabletop_model",
    headline: "Same architecture, built out of warm clay and shop light.",
  },
];

const dirs: string[] = [];

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "mosvera-runtime-smoke-"));
  dirs.push(dir);
  return dir;
}

function demoTemplate(aesthetic: DemoAesthetic): JsonObject {
  return createTemplate(aesthetic.base, {
    imagery: {
      src: `/assets/aesthetics/hero-${aesthetic.id}.webp`,
      treatment: aesthetic.treatment,
    },
    layout: {
      density: aesthetic.density,
      radius: "8px",
    },
    motion: {
      duration: aesthetic.duration,
    },
    palette: {
      accent: aesthetic.accent,
      background: aesthetic.background,
    },
    typography: {
      body: "Hanken Grotesk",
      display: aesthetic.id === "technical-manual" ? "IBM Plex Mono" : "Fraunces",
    },
    voice: {
      headline: aesthetic.headline,
    },
  });
}

function seedDemoProject(dir: string): LoadedProject {
  for (const aesthetic of DEMO_AESTHETICS) {
    saveProjectDocument(dir, "template", demoTemplate(aesthetic));
    saveProjectDocument(dir, "composition", createComposition(aesthetic.id, aesthetic.base));
  }
  return loadProject(dir);
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("agent-facing runtime smoke path", () => {
  it("loads, validates, and lists the four public demo aesthetics", () => {
    const project = seedDemoProject(tempProject());
    const entries = listRegistryEntries(project.registry, "composition");

    expect(validateRegistry(project.registry, { validator: createValidator() })).toEqual([]);
    expect(entries.map(({ id, base }) => ({ id, base }))).toEqual(
      [...DEMO_AESTHETICS]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, base }) => ({ id, base })),
    );
    expect(getRegistryDocument(project.registry, "composition", "quiet-editorial")).toMatchObject({
      base: "quiet-editorial-base",
    });
  });

  it("resolves a named aesthetic and compiles portable CSS variables", () => {
    const project = seedDemoProject(tempProject());
    const canonical = resolveNamedComposition(
      "claymation-playful-builder",
      project.registry,
      project.strategies,
    );
    const composition = project.registry.compositions?.["claymation-playful-builder"];

    if (composition === undefined) throw new Error("seeded composition was not loaded");
    expect(resolveAesthetic(composition, project.registry, project.strategies)).toEqual(canonical);

    const cssVariables = toCssVariables(compileDesignTokens(canonical));
    expect(cssVariables["--mosvera-palette-accent"]).toBe("#d45f3f");
    expect(cssVariables["--mosvera-imagery-treatment"]).toBe("tabletop_model");
    expect(cssVariables["--mosvera-voice-headline"]).toBe(
      "Same architecture, built out of warm clay and shop light.",
    );
  });

  it("saves, reloads, exports, and re-imports a user-created aesthetic", () => {
    const dir = tempProject();
    seedDemoProject(dir);
    const smoke = createComposition("smoke-test-editorial", "quiet-editorial-base", {
      overrides: {
        palette: { accent: "#475569" },
        voice: { headline: "Executive smoke test." },
      },
    });

    saveProjectDocument(dir, "composition", smoke);
    const reloaded = loadProject(dir);
    expect(listRegistryEntries(reloaded.registry, "composition").map((entry) => entry.id)).toContain(
      "smoke-test-editorial",
    );

    const resolved = resolveAesthetic("smoke-test-editorial", reloaded.registry, reloaded.strategies);
    const cssVariables = toCssVariables(compileDesignTokens(resolved));
    expect(cssVariables["--mosvera-palette-accent"]).toBe("#475569");
    expect(cssVariables["--mosvera-voice-headline"]).toBe("Executive smoke test.");

    const pack = exportAestheticPack("smoke-test-editorial", reloaded.registry, {
      name: "Smoke Test Editorial",
    });
    expect(validateAestheticPack(pack, { validator: createValidator() })).toEqual([]);

    const imported = importAestheticPack(
      { templates: {}, modifiers: {}, palettes: {}, compositions: {} },
      pack,
      { validator: createValidator() },
    );
    expect(imported.plan.valid).toBe(true);
    expect(resolveAesthetic("smoke-test-editorial", imported.registry, imported.strategies)).toEqual(
      resolved,
    );
  });
});
