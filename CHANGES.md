# Changes

Chronological per-phase log for `@mosvera/runtime`. Newest entries on top.
The rich "why/how" for family-wide work lives in `docs/narrative/` in the
`niclydon/mosvera` repository; entries here are the scannable index.

---

## 2026-10-27 — 0.1.3 published; dependency majors current

- `@mosvera/runtime` 0.1.3 published to npm from a staged, content-verified
  tarball (npm is deprecating token-based publishing; the workflow stages
  and verifies, the final publish runs from a maintainer shell). Verified
  live on the registry API.
- Dependabot config and a within-range dependency refresh landed as PR #3
  (TypeScript 5.9.3, vitest 4.1.12, ajv 8.20.0, yaml 2.9.1); CodeQL
  scanning added as PR #9.
- The accumulated majors landed as one combined, CI-verified PR #10
  (commit `32e7662`): TypeScript 7.0.2, vitest 5.0.5, @types/node 26.6.5,
  GitHub Actions 7. 68 tests green. The five individual Dependabot PRs were
  closed as superseded by it.

Family record:
`docs/narrative/2026-10-27-public-face-and-the-0-1-3-release-train.md` in
`niclydon/mosvera`.

---

## 2026-10-20 — 0.1.3 release prep

PR #2 (commit `245c030`) bumped the version to 0.1.3. No code change: the
release publishes the OB-59048 registry-loader fix that had been on `main`
since September 7, 2026, so that a registry document whose file name
matches its kind pattern is no longer skipped during load.

---
