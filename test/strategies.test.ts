// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { deriveStrategies } from "../src/index.ts";

describe("deriveStrategies", () => {
  it("extracts x-mosvera-merge annotations from the canonical schemas", () => {
    // At v0.1 only composition.schema.json carries an annotation: modifiers -> replace.
    expect(deriveStrategies()).toEqual({
      modifiers: { strategy: "replace" },
    });
  });

  it("returns the same map regardless of how many times it is called (pure)", () => {
    expect(deriveStrategies()).toEqual(deriveStrategies());
  });
});
