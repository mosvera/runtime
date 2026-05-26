# Agent Guidance

This repo is the TypeScript/JavaScript Mosvera runtime. It loads registries,
resolves named aesthetics, validates documents and packs, and compiles portable
tokens.

## Safety Rules

- Do not commit secrets, `.env*`, local config, vault references, generated
  media, caches, private notes, or local machine paths.
- Preserve unrelated user changes and keep edits narrow.
- Use DCO-signed commits when committing.
- Do not publish packages, rotate credentials, change repo visibility, or
  trigger releases unless explicitly asked.

## Repo Boundaries

- Keep root runtime APIs portable and browser-safe.
- Keep filesystem persistence under the Node subpath only.
- Do not add artifact generation, provider HTTP calls, MCP tool behavior, or
  hosted-service assumptions to the runtime.
- Preserve parity with the public Mosvera spec and compliance fixtures.

## Verification

- Run `npm run ci` for build, typecheck, and tests.
- Run `git diff --check` before committing.
