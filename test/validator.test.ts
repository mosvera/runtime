// SPDX-License-Identifier: Apache-2.0
//
// Validates that the runtime's schema binding agrees with the canonical
// schemas — in particular that ADR-0005 naming rules are enforced. These
// mirror the checks run during schema authoring with Python jsonschema, now
// cross-checked through ajv.

import { describe, it, expect, beforeAll } from "vitest";
import { createValidator, type Validator } from "../src/index.ts";

let v: Validator;
beforeAll(() => {
  v = createValidator();
});

describe("validator: composition", () => {
  it("accepts a well-formed composition", () => {
    const r = v.validate(
      { $schema: "mosvera/composition/v0.1", base: "cinematic-editorial", modifiers: ["magic-hour"], overrides: { palette: { accent: "#c0563a" }, $unset: ["grain"] } },
      "composition",
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a composition missing the required base", () => {
    expect(v.validate({ modifiers: ["m"] }, "composition").valid).toBe(false);
  });

  it("rejects a hyphenated override field (ADR-0005)", () => {
    expect(v.validate({ base: "t", overrides: { "bad-name": 1 } }, "composition").valid).toBe(false);
  });

  it("rejects an uppercase override field (ADR-0005)", () => {
    expect(v.validate({ base: "t", overrides: { BadName: 1 } }, "composition").valid).toBe(false);
  });

  it("rejects an unknown $-directive (ADR-0005)", () => {
    expect(v.validate({ base: "t", overrides: { $bogus: [] } }, "composition").valid).toBe(false);
  });

  it("rejects an extra top-level field", () => {
    expect(v.validate({ base: "t", nope: 1 }, "composition").valid).toBe(false);
  });
});

describe("validator: capability-manifest", () => {
  it("rejects an approximate mapping with no documenting note (MEP-0003)", () => {
    const r = v.validate(
      { provider: "flux", adapter_version: "1", constructs: { quality: { lowering_action: "approximate" } } },
      "capability-manifest",
    );
    expect(r.valid).toBe(false);
  });

  it("accepts an approximate mapping that documents its note", () => {
    const r = v.validate(
      { provider: "flux", adapter_version: "1", constructs: { quality: { lowering_action: "approximate", note: "high -> steps=50, guidance=3.5" } } },
      "capability-manifest",
    );
    expect(r.valid).toBe(true);
  });
});

describe("validator: template", () => {
  it("accepts a template with a single $extends parent", () => {
    expect(v.validate({ id: "child", $extends: "parent", mood: "tense" }, "template").valid).toBe(true);
  });

  it("rejects a template without an id", () => {
    expect(v.validate({ mood: "tense" }, "template").valid).toBe(false);
  });
});
