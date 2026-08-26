## 1. Workspace root

- [ ] 1.1 Root `package.json` (private, `"license": "MIT"`, pinned `packageManager: pnpm@<current>`), `pnpm-workspace.yaml` covering `packages/*`, and `pnpm install` producing a lockfile. Commit.
- [ ] 1.2 nx: add `nx` + `@nx/js` (same version), `nx.json` with `targetDefaults` for `format,lint,typecheck,test,build` — each cacheable target declares deterministic inputs (source globs + shared config in `sharedGlobals`) and every output directory. `pnpm nx show projects` runs clean.
- [ ] 1.3 `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, ES2022+, NodeNext module resolution. Per-package tsconfigs extend it.

## 2. Lint + format

- [ ] 2.1 Biome at root (`biome.json`: formatter + linter, boring defaults), wired as the `format` and `lint` nx targets with inputs keyed on the exact globs Biome checks. Both targets pass and are cache-correct (edit a covered file → cache miss).

## 3. Package skeletons

- [ ] 3.1 `packages/core` → `@whiteboard/core`: `package.json` (MIT, `0.0.0`), `src/index.ts` exporting `PROTOCOL_VERSION` (the version SPEC.md declares — see 4.1) as a typed constant, `build` (tsc), `typecheck`, and `test` targets. One real Vitest test asserting the export. All three targets green through nx.
- [ ] 3.2 `packages/server` → `@whiteboard/server`: same shape, depends on `@whiteboard/core` via `workspace:*`; `src/index.ts` re-exports or consumes `PROTOCOL_VERSION` from core. Its Vitest test imports from `@whiteboard/core` — the cross-package resolution proof. Green through nx.
- [ ] 3.3 Vitest wiring: use the official `@nx/vite` plugin at the same version as `nx` (inspect inference with `pnpm nx show project core` before adding manual config); plain per-package vitest config if inference fights.

## 4. spec/ skeleton

- [ ] 4.1 `spec/SPEC.md`: protocol overview from #455's locked shapes (five tools; element `{id, kind, data}`; flat ordered ops with `op_id` dedup; host schema at creation; typed attributes; no presentation in the protocol; append-only event log as truth, state as projection); a **Protocol version** section — SPEC.md owns the wire-contract version (start it at `0.1`), separate from package semver, every library declares the version it implements and surfaces it in `describe`; placeholder sections (heading + one-line stub each) for **Wire shape**, **Error codes** (state the enum is closed; seed `unknown-kind`, `missing-required`, `wrong-type`, `bad-ref` as draft entries for A2 to finalize), and **Projection semantics**.
- [ ] 4.2 `spec/fixtures/README.md` + empty `accept/` and `reject/` dirs: the corpus contract verbatim — fixture shape `{schema, input, expect: "accept" | {reject: <error-code>}}`; error codes only from SPEC.md's closed enum; corpus extends to log→projection cases; TS and Python twins both run the whole corpus in CI. Note A2 populates it.

## 5. Gate + CI

- [ ] 5.1 Root `pnpm check` script: `nx run-many -t format,lint,typecheck,test,build`. Green from a clean `pnpm install`.
- [ ] 5.2 `.github/workflows/ci.yml`: on push + PR — checkout, pnpm via corepack/action, node LTS, `pnpm install --frozen-lockfile`, `pnpm check`. Push and show the green run URL.

## 6. Verification (the packet's end-to-end proof)

- [ ] 6.1 Positive control: break one core test assertion → `pnpm check` fails; revert. Break one server type → `pnpm check` fails; revert. Evidence shown.
- [ ] 6.2 Fresh-clone proof: clone to a temp dir, `pnpm install && pnpm check` green. Output `<promise>A1-COMPLETE</promise>`.
