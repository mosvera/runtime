<!--
SPDX-License-Identifier: CC-BY-4.0
-->

# @mosvera/runtime

The Mosvera TypeScript/JavaScript runtime parses Mosvera documents, loads
aesthetic registries, resolves named compositions, compiles neutral design
tokens, validates structures, and applies the provider compilation contract.

```bash
npm install @mosvera/runtime
```

## Which Package Do I Need?

Use `@mosvera/runtime` when your app needs to validate Mosvera documents,
load a user's aesthetic registry, resolve templates/modifiers/palettes/
compositions, or produce the canonical model and portable design tokens that
other integrations consume.

Use `@mosvera/provider-*` packages when you want to turn that resolved model
into provider payloads for OpenAI, FLUX, or SDXL.

Use `@mosvera/mcp` when you want agents, editors, or automation tools to call
Mosvera through MCP tools instead of importing the JavaScript runtime directly.

## Language

This package is the **TypeScript/JavaScript runtime** for the language-neutral
Mosvera spec. It intentionally keeps the npm name `@mosvera/runtime`; it is not
renamed to `@mosvera/ts` because npm already identifies the JS/TS ecosystem.

TypeScript first, per
[ADR-0007](https://github.com/mosvera/spec/blob/main/docs/decisions/0007-reference-runtime-language.md).
The TS pick is grounded in the MCP ecosystem (Anthropic's reference
SDK is TS), mature JSON Schema tooling, and the largest AI-native
dev audience — not because TS is anyone's day-to-day preference.

The Python peer runtime lives at
[`mosvera/python`](https://github.com/mosvera/python) and uses the PyPI package
name `mosvera`. The
[conformance suite](https://github.com/mosvera/spec/tree/main/compliance) is
the cross-language correctness contract; TypeScript is the first runtime, not
the definition of Mosvera.

## Basic Use

Resolve a named aesthetic from a project registry and compile portable tokens:

```ts
import {
  composeStrategies,
  compileDesignTokens,
  deriveStrategies,
  resolveAesthetic,
  toCssVariables,
} from "@mosvera/runtime";
import { loadProject } from "@mosvera/runtime/node";

const project = loadProject("./my-aesthetic-system");
const strategies = composeStrategies(deriveStrategies(), project.strategies);

const canonical = resolveAesthetic("executive-editorial", project.registry, strategies);
const tokens = compileDesignTokens(canonical);
const cssVariables = toCssVariables(tokens);
```

Save a new composition into a registry:

```ts
import { createComposition } from "@mosvera/runtime";
import { saveProjectDocument } from "@mosvera/runtime/node";

const composition = createComposition("executive-editorial", "base_t", {
  modifiers: ["executive", "editorial"],
  overrides: {
    tone: "measured",
    density: "compact",
  },
});

saveProjectDocument("./my-aesthetic-system", "composition", composition);
```

The runtime does **not** generate PowerPoint decks, HTML reports, images, or
provider HTTP calls. It supplies the structured aesthetic truth that MCP
servers, artifact adapters, and application code can apply.

## Modules (v0.1)

The semantic core is **pure functions with no provider SDK dependencies**, so
the Python runtime can mirror the same contract without inheriting JS/TS
implementation details (ADR-0007).

| Module | Responsibility |
|--------|---------------|
| [`src/merge.ts`](./src/merge.ts) | The merge algebra (MEP-0001): deep merge, list strategies (`replace`/`append`/`merge_by`), `$unset`/`$revert`. The single operation the system folds over. |
| [`src/resolve.ts`](./src/resolve.ts) | Inheritance resolution (MEP-0002): single-inheritance `$extends` chain, cycle detection, multiple-inheritance rejection. |
| [`src/compose.ts`](./src/compose.ts) | Composition resolution (MEP-0001): folds the precedence chain (base lineage → base → modifiers → overrides) into the canonical model. |
| [`src/palette.ts`](./src/palette.ts) | Palette inheritance resolution, matching the single-parent `$extends` contract. |
| [`src/aesthetic.ts`](./src/aesthetic.ts) | Named aesthetic resolution from stored registry compositions. |
| [`src/registry.ts`](./src/registry.ts) | Pure registry list/get/merge/authoring/reference/diagnostic helpers. |
| [`src/tokens.ts`](./src/tokens.ts) | Neutral design-token compilation and CSS variable serialization. |
| [`src/compile.ts`](./src/compile.ts) | Provider compilation contract rule engine (MEP-0003): criticality × lowering-action → compile / warn / error. Payload emission lives in adapters (Phase 4). |
| [`src/types.ts`](./src/types.ts) | Shared types and `ResolutionError`. |
| [`src/index.ts`](./src/index.ts) | Public API. |

### Boundary modules

These sit at the system boundary and bind to external libraries; they are
**not** part of the portable semantic core. Each language port replaces these
bindings with that language's native equivalents.

| Module | Responsibility | Binds to |
|--------|---------------|----------|
| [`src/parser.ts`](./src/parser.ts) | Load a document from JSON/YAML source or an object. | `yaml` |
| [`src/validator.ts`](./src/validator.ts) | Validate documents against the canonical schemas in [`schemas/`](./schemas/) (ADR-0005 naming, MEP directives). | `ajv` (JSON Schema 2020-12) |
| [`src/node.ts`](./src/node.ts) | Optional `@mosvera/runtime/node` project-directory load/save helpers. | Node `fs`/`path` |

## Dependencies

- **Semantic core** (`merge`/`resolve`/`compose`/`registry`/`tokens`/`compile`):
  **zero provider SDK dependencies**, mostly pure functions — this is what the
  Python peer runtime mirrors.
- **Boundary modules** (`parser`/`validator`): depend on `yaml` and `ajv`.
  These are per-language bindings, not core logic; the portable artifacts they
  bind to (the YAML/JSON formats and the JSON Schemas) are language-neutral.
- **Node persistence** (`@mosvera/runtime/node`): depends only on Node's
  standard library and is isolated from the root entrypoint.

## Status

Phase 6D/6E. The semantic core **passes all 25 conformance vectors** in
the compliance vectors mirrored from [`mosvera/spec`](https://github.com/mosvera/spec/tree/main/compliance);
the parser, validator, registry, token, and Node-boundary tests bring the
runtime suite to 58 tests, all green under a strict typecheck. Run `npm test`
and `npm run typecheck`.

The Python runtime is checked against the same vector set before publication,
so the public contract is the spec plus conformance suite rather than either
runtime implementation by itself.

## Layout

| Directory | Purpose |
|-----------|---------|
| `src/` | The pure semantic core. |
| `test/` | The conformance runner and local compliance fixtures. |
| `schemas/` | Local copy of the canonical Mosvera schemas used by the build script. |

## License

Apache-2.0 per
[ADR-0001](https://github.com/mosvera/spec/blob/main/docs/decisions/0001-license-choice.md).
