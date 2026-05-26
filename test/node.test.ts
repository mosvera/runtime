// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createComposition,
  createModifier,
  createTemplate,
} from "../src/index.ts";
import {
  RegistryProjectError,
  deleteProjectDocument,
  loadProject,
  saveProjectDocument,
  writeMergeStrategies,
} from "../src/node.ts";

const dirs: string[] = [];

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "mosvera-runtime-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("@mosvera/runtime/node", () => {
  it("saves deterministic JSON and loads a project registry", () => {
    const dir = tempProject();
    saveProjectDocument(dir, "template", createTemplate("base_t", { z_value: 2, a_value: 1 }), { createDirectory: true });
    saveProjectDocument(dir, "modifier", createModifier("compact", { density: "compact" }));
    saveProjectDocument(dir, "composition", createComposition("executive_editorial", "base_t", { modifiers: ["compact"] }));
    writeMergeStrategies(dir, { tags: { strategy: "append" } });

    const body = readFileSync(join(dir, "template.base_t.json"), "utf8");
    expect(body).toContain('"$schema"');
    expect(body.indexOf('"a_value"')).toBeLessThan(body.indexOf('"z_value"'));

    const project = loadProject(dir);
    expect(Object.keys(project.registry.templates ?? {})).toEqual(["base_t"]);
    expect(Object.keys(project.registry.modifiers ?? {})).toEqual(["compact"]);
    expect(Object.keys(project.registry.compositions ?? {})).toEqual(["executive_editorial"]);
    expect(project.strategies).toEqual({ tags: { strategy: "append" } });
  });

  it("loads YAML registry documents", () => {
    const dir = tempProject();
    writeFileSync(
      join(dir, "template.base_t.yaml"),
      "$schema: https://mosvera.io/schema/0.1/template\nid: base_t\ndensity: comfortable\n",
      "utf8",
    );
    expect(loadProject(dir).registry.templates!.base_t!["density"]).toBe("comfortable");
  });

  it("rejects unsafe ids and dotfile registry documents", () => {
    const dir = tempProject();
    expect(() => saveProjectDocument(dir, "template", { id: "../bad" })).toThrow(RegistryProjectError);

    writeFileSync(join(dir, ".template.bad.json"), JSON.stringify(createTemplate("bad")), "utf8");
    expect(() => loadProject(dir)).toThrow(RegistryProjectError);
  });

  it("deletes project documents by kind and id", () => {
    const dir = tempProject();
    saveProjectDocument(dir, "template", createTemplate("base_t"), { createDirectory: true });
    deleteProjectDocument(dir, "template", "base_t");
    expect(loadProject(dir).registry.templates).toEqual({});
  });
});
