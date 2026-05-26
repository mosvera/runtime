// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ResolutionError, resolvePalette, type Registry } from "../src/index.ts";

describe("resolvePalette", () => {
  const registry: Registry = {
    palettes: {
      brand: {
        id: "brand",
        roles: { background: "#ffffff", ink: "#111111", accent: "#3366ff" },
      },
      executive: {
        id: "executive",
        $extends: "brand",
        roles: { accent: "#7a4ce0", highlight: "#f4cf58" },
      },
    },
  };

  it("resolves palette inheritance root-first", () => {
    expect(resolvePalette("executive", registry, {})).toEqual({
      roles: { background: "#ffffff", ink: "#111111", accent: "#7a4ce0", highlight: "#f4cf58" },
    });
  });

  it("uses unknown_reference for missing palettes", () => {
    expect(() => resolvePalette("missing", registry, {})).toThrowError(ResolutionError);
    try {
      resolvePalette("missing", registry, {});
    } catch (e) {
      expect((e as ResolutionError).kind).toBe("unknown_reference");
    }
  });
});
