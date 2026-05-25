<!--
SPDX-License-Identifier: CC-BY-4.0
-->

# @mosvera/runtime

The Mosvera reference runtime parses Mosvera documents, resolves inheritance,
merges modifiers, composes primitives, validates structures, and applies the
provider compilation contract.

```bash
npm install @mosvera/runtime
```

## Language

TypeScript first, per
[ADR-0007](https://github.com/mosvera/spec/blob/main/docs/decisions/0007-reference-runtime-language.md).
The TS pick is grounded in the MCP ecosystem (Anthropic's reference
SDK is TS), mature JSON Schema tooling, and the largest AI-native
dev audience — not because TS is anyone's day-to-day preference.

A Python port is **committed-to** as a binding follow-on. The
runtime architecture must keep semantic logic separable from
TS-idiomatic glue so the Python port is a translation rather than
a rewrite. The
[conformance suite](https://github.com/mosvera/spec/tree/main/compliance) is the cross-language
correctness contract.

## Modules (v0.1)

The semantic core is **pure functions with zero runtime dependencies**, so the
committed Python port is a translation rather than a rewrite (ADR-0007).

| Module | Responsibility |
|--------|---------------|
| [`src/merge.ts`](./src/merge.ts) | The merge algebra (MEP-0001): deep merge, list strategies (`replace`/`append`/`merge_by`), `$unset`/`$revert`. The single operation the system folds over. |
| [`src/resolve.ts`](./src/resolve.ts) | Inheritance resolution (MEP-0002): single-inheritance `$extends` chain, cycle detection, multiple-inheritance rejection. |
| [`src/compose.ts`](./src/compose.ts) | Composition resolution (MEP-0001): folds the precedence chain (base lineage → base → modifiers → overrides) into the canonical model. |
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

## Dependencies

- **Semantic core** (`merge`/`resolve`/`compose`/`compile`): **zero runtime
  dependencies**, pure functions — this is what the committed Python port
  translates.
- **Boundary modules** (`parser`/`validator`): depend on `yaml` and `ajv`.
  These are per-language bindings, not core logic; the portable artifacts they
  bind to (the YAML/JSON formats and the JSON Schemas) are language-neutral.

## Status

Phase 2. The semantic core **passes all 21 conformance vectors** in
the compliance vectors mirrored from [`mosvera/spec`](https://github.com/mosvera/spec/tree/main/compliance); the parser and validator add 15
unit tests (36 total), all green under a strict typecheck. Run `npm test`
and `npm run typecheck`.

This is independent cross-implementation agreement: the conformance vectors
were authored and verified against a separate reference oracle, and this TS
runtime now reproduces the same canonical models and compilation outcomes for
every vector — the ADR-0007 contract in action.

## Layout

| Directory | Purpose |
|-----------|---------|
| `src/` | The pure semantic core. |
| `test/` | The conformance runner and local compliance fixtures. |
| `schemas/` | Local copy of the canonical Mosvera schemas used by the build script. |

## License

Apache-2.0 per
[ADR-0001](https://github.com/mosvera/spec/blob/main/docs/decisions/0001-license-choice.md).
