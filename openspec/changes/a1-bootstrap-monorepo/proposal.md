## Why

The whiteboard protocol (rbutera/rennet#453–#456, decision-complete) needs its own MIT nx monorepo before any of it can be built: A2 (tool shapes), A3 (reference server), and A4 (MCP facade) all land as packages here, and A5's npm alpha gates Rennet's Track B4. Nothing exists yet but a LICENSE and README. A1 stands up the workspace, the two TS package skeletons, the `spec/` contract skeleton, and a real gate — so every later change starts on a toolchain that already builds, tests, and fails honestly.

## What Changes

- **Workspace**: pnpm workspace + nx task graph; root `package.json` (private), pinned `packageManager`, `tsconfig.base.json` (strict), Biome for lint + format, Vitest for tests. Cacheable nx targets declare real inputs/outputs.
- **Packages**: `@whiteboard/core` and `@whiteboard/server` (server depends on core via `workspace:*`). Near-empty but real: core exports the declared protocol version constant per #456's separate protocol-version axis; server imports it from core. Each has at least one genuine passing Vitest test, so the gate has a positive control. MIT license field, version `0.0.0`, per-package semver (nx release itself is A5).
- **`spec/`** (not a package): `SPEC.md` skeleton — protocol overview from #455's locked shapes, the protocol-version axis (SPEC.md owns the wire-contract version; libraries declare what they implement), and placeholder sections for wire shape, the closed error-code enum, and projection semantics. `spec/fixtures/` skeleton with a README stating the corpus contract: fixtures are `{schema, input, expect: "accept" | {reject: <error-code>}}` under `accept/` and `reject/`, plus log→projection cases; TS and Python twins both run the same corpus.
- **Gate**: `pnpm check` → `nx run-many -t format,lint,typecheck,test,build` (rennet's gate shape, minus rennet-only targets).
- **CI**: one GitHub Actions workflow running `pnpm check` on push and PR.

No tool implementations, no server logic, no MCP facade, no Python, no release config — those are A2–A7.

## Capabilities

### New Capabilities

- `monorepo-gate`: the workspace layout, toolchain, and the `pnpm check` gate + CI every later change relies on.
- `spec-skeleton`: SPEC.md's structure, the protocol-version axis, and the fixture-corpus contract that A2/A3/A6 populate.

### Modified Capabilities

<!-- None: first change in the repo. -->

## Impact

New files only (repo is empty): root workspace config (`package.json`, `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `biome.json`), `packages/core/**`, `packages/server/**`, `spec/SPEC.md`, `spec/fixtures/README.md`, `.github/workflows/ci.yml`. No dependencies beyond the toolchain itself (nx, typescript, biome, vitest).
