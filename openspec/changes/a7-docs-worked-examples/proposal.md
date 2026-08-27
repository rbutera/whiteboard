# A7 — docs-worked-examples

## Why

A1–A5 shipped a working, published protocol stack, but the only reader-facing material is a 355-line normative SPEC and four one-snippet READMEs. There is nothing that teaches the protocol (why event-log-as-truth, how to design a host schema, when to embed vs. speak MCP) and nothing that shows it end to end. The plan (Track A row A7) closes that: a docs library plus two worked examples — kanban and diagramming — that actually run, so the documentation cannot silently drift from the packages.

## What Changes

- **`docs/` library** (plain markdown at the repo root, GitHub-rendered):
  - *No static-site generator* — GitHub renders markdown (and mermaid fences) natively; at three packages and ~8 pages an SSG is toolchain with zero reader gain, and a site can be layered later without rewriting a page.
  - *SPEC.md stays the single normative source* — docs pages explain and show; wherever a shape, code, or guarantee is stated, the page links to the SPEC section that defines it and never restates a normative table wholesale. A one-line banner on each page ("Normative source: spec/SPEC.md §…") keeps the hierarchy visible without ceremony.
  - Pages (8, fixed):
    - `docs/README.md` — map of the docs, the docs-vs-SPEC relationship, the two version axes (package semver vs `protocol_version`) stated once.
    - `docs/quickstart.md` — install `@alpha` → embed `BoardService` → apply ops → fold with `project` → same board via the MCP facade, in one sitting.
    - `docs/concepts.md` — one page, not four: event log as truth / state as projection; statelessness (`board_id` a plain minted string, `op_id` dedup, replay idempotence); host schemas own meaning, the protocol owns storage + typed validation; attribution is data, not auth.
    - `docs/guides/host-schemas.md` — designing a schema: kinds, the five attribute types, `element` refs and `many`, required vs passthrough, `defineSchema`/`compileToWire` authoring kit, all-or-nothing rejection with the closed error codes (linked, not restated).
    - `docs/guides/embedding-the-server.md` — `BoardService` in-process, the `BoardStore` seam and pluggable persistence, the same-board serialization guarantee, reading state as a library API vs folding `events` on the wire.
    - `docs/guides/mcp-facade.md` — `wboard-mcp` stdio bin, in-process embedding over a host-supplied service, `verb_noun` tool names, rejections as normal results / throws as `isError`, `get_events` polling vs the WS push channel, pluggable `BoardRenderer` + the schematic SVG default.
    - `docs/examples/kanban.md` and `docs/examples/diagramming.md` — walkthroughs of the two example packages; fences stay short, each page links to the example source as the runnable truth (no snippet-extraction machinery — the in-gate examples are the drift alarm, the fences follow them).
- **Two worked examples as private workspace packages** under `examples/` (workspace glob gains `examples/*`; both `private: true`, version `0.0.0`, MIT, excluded from release by construction since `nx.json` lists release projects explicitly):
  - *Why workspace packages in the gate, not standalone scripts*: `workspace:*` deps + a vitest test invoking the example's `run()` means every `pnpm check` executes the exact code the docs walk through — the "docs drifted from the packages" failure becomes a red gate, for free, with the toolchain already in the repo.
  - **`examples/kanban`** — the **library path**. Host schema: `column` (`title: string`) and `card` (`title: string, required`; `column: element, required`; `tags: string many`). Script: create board → batch-create columns + cards (later ops referencing column ids minted earlier in the same list) → move a card (`update` overwriting the `column` ref) → delete a card → fold `getEvents` with `project` and assert the exact final state → re-apply the same batch verbatim and assert the log length is unchanged (dedup/replay idempotence shown, not asserted).
  - **`examples/diagramming`** — the **MCP path**. Host schema: `node` (`label: string, required`) and `edge` (`from`/`to: element, required`; `label: string`). Script: real MCP client over `InMemoryTransport` against `createWhiteboardMcpServer()` → `create_board` → `apply_ops` a small graph → assert a `bad-ref` batch (edge to a nonexistent node) comes back `{ ok: false, code: "bad-ref" }` as a **normal** result and changes nothing → `get_events` + fold, assert the graph → `screenshot`, assert `image/svg+xml` and non-empty base64. `describe_board` asserted to report `protocol_version === "0.1"`.
  - Each example is an ESM `src/main.ts` exporting `run()` with plain `assert`s plus a `node dist/main.js`-runnable entry; one small vitest test per package calls `run()`. Same build/typecheck/lint/test targets as the shipped packages so nx infers nothing exotic.
- **Root `README.md`**: a short "Docs" section (map link + the two examples) — a few lines, not a rewrite.

## Verification strategy

The gate is the proof: both example projects run inside `pnpm check`, so CI executes the documented flows on every push. The verification cluster additionally (a) flips a kanban assertion to show the gate FAIL and reverts (positive control), (b) runs both example scripts against the **published** `@wboard/*@alpha` packages in a temp dir outside the repo (`npm_config_min_release_age=0` required on this machine — `~/.npmrc` pins `min-release-age=7`; pnpm ignores the key), and (c) checks every relative docs link resolves. No SPEC.md diff ships (`git diff --stat` shows spec/ untouched).

## Capabilities

### New Capabilities

- `docs-library`: reader-facing explanation of the protocol — quickstart, concepts, three guides — subordinate to SPEC.md as the normative source.
- `worked-examples`: kanban (library path) and diagramming (MCP path) as gate-run workspace packages whose assertions fail when docs and packages drift.

### Modified Capabilities

- (none — no runtime behavior of core/server/mcp changes; no SPEC.md change.)

## Impact

- `docs/` — 8 new markdown pages (`README`, `quickstart`, `concepts`, `guides/{host-schemas,embedding-the-server,mcp-facade}`, `examples/{kanban,diagramming}`).
- `examples/kanban/`, `examples/diagramming/` — new private workspace packages (package.json, tsconfig, vitest config, `src/main.ts`, one test each).
- `pnpm-workspace.yaml` — `examples/*` glob added.
- Root `README.md` — short docs section.
- No changes to `spec/`, `packages/*` source, `nx.json` release block, or CI workflow (the existing gate picks the new projects up via `run-many`).
