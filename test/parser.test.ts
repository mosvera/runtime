// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { parse } from "../src/index.ts";

describe("parser", () => {
  it("parses a JSON string", () => {
    expect(parse('{"base":"x","modifiers":["m"]}')).toEqual({ base: "x", modifiers: ["m"] });
  });

  it("parses a YAML string", () => {
    const yaml = "base: cinematic-editorial\nmodifiers:\n  - magic-hour\n  - rain-slick\n";
    expect(parse(yaml)).toEqual({ base: "cinematic-editorial", modifiers: ["magic-hour", "rain-slick"] });
  });

  it("passes an already-parsed object through", () => {
    const obj = { base: "x" };
    expect(parse(obj)).toBe(obj);
  });

  it("rejects a non-mapping top level (array)", () => {
    expect(() => parse("[1, 2, 3]")).toThrow(/mapping\/object/);
  });

  it("rejects a non-mapping top level (scalar)", () => {
    expect(() => parse("42")).toThrow(/mapping\/object/);
  });
});
