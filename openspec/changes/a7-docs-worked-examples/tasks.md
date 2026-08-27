# A7 tasks

Ordered clusters. Each cluster is a clean stopping point sized for one implementer session: land it, run `pnpm check`, commit, push, stop if the session is done. Within a cluster each numbered task is independently committable. Work on branch `a7-docs-worked-examples`; land via PR against `main`.

## Cluster 1 — docs core (map, quickstart, concepts)

- [ ] 1.1 `docs/README.md`: the docs map (list every page with one line each), the docs-vs-SPEC relationship stated plainly (SPEC.md is normative; docs explain and show; on conflict SPEC wins), and the two version axes (package semver `0.1.0-alpha.N` vs `protocol_version` `"0.1"`) explained once with a link to SPEC.md §Protocol version. Commit.
- [ ] 1.2 `docs/quickstart.md`: install `@wboard/{core,server,mcp}@alpha` → `BoardService` create/apply/`getEvents` → `project` fold → the same board through `createWhiteboardMcpServer` + `InMemoryTransport`. Snippets must compile against the real exports (`BoardService`, `project`, `validate`, `createWhiteboardMcpServer` — verify names in `packages/*/src/index.ts`, never from memory). Each page carries the one-line normative-source banner. Commit.
- [ ] 1.3 `docs/concepts.md`: event log as truth / projection; statelessness (`board_id` plain string, `op_id` dedup, replay idempotence); host schemas own meaning, protocol owns storage + typed validation; attribution is data, not auth. Every guarantee links to its SPEC section instead of restating its table. `pnpm check` green (format target covers the repo). Commit.

## Cluster 2 — guides

- [ ] 2.1 `docs/guides/host-schemas.md`: kinds and the five attribute types, `element` refs, `many`, required vs undeclared-passthrough, `defineSchema`/`compileToWire` authoring kit, all-or-nothing rejection with a link to SPEC.md §Error codes (do not reproduce the enum table). Commit.
- [ ] 2.2 `docs/guides/embedding-the-server.md`: in-process `BoardService`, the `BoardStore` interface and pluggable persistence (sketch a custom store's shape, link SPEC.md §Reference server), same-board serialization guarantee, library-API state read vs wire-side `events` folding. Commit.
- [ ] 2.3 `docs/guides/mcp-facade.md`: `wboard-mcp` stdio bin, in-process embedding over a host-supplied service, `verb_noun` binding (link SPEC.md §Tool-name binding for the table), rejections-as-normal-results vs throws-as-`isError`, `get_events` polling vs the WS push channel, `BoardRenderer` plug + schematic SVG default. `pnpm check` green. Commit.

## Cluster 3 — kanban example (library path)

- [ ] 3.1 Add `examples/*` to `pnpm-workspace.yaml`. Scaffold `examples/kanban` (`@wboard-examples/kanban`, `private: true`, `0.0.0`, MIT, ESM) mirroring `packages/server`'s tsconfig/vitest/build shape; deps `@wboard/core` + `@wboard/server` as `workspace:*`. `pnpm nx show projects` lists it; `pnpm nx show project kanban` shows the inferred/declared targets before adding manual config. Commit.
- [ ] 3.2 `examples/kanban/src/main.ts` — `run()` with plain asserts, per the proposal: schema (`column`: `title` string; `card`: `title` string required, `column` element required, `tags` string many) → one batch creating 2 columns + 3 cards (cards referencing column ids minted earlier in the same list) → move a card (`update` the `column` ref) → delete a card → `getEvents` + `project`, assert the exact final elements map → re-apply the identical first batch, assert the log length unchanged (dedup). Runnable via `node dist/main.js`; one vitest test calls `run()`. `pnpm check` green (the new test target runs). Commit.
- [ ] 3.3 `docs/examples/kanban.md`: walkthrough of the flow with short fences, linking `examples/kanban/src/main.ts` as the runnable source; states what the example demonstrates (batch refs, move-as-update, fold, replay idempotence). Commit.

## Cluster 4 — diagramming example (MCP path)

- [ ] 4.1 Scaffold `examples/diagramming` (`@wboard-examples/diagramming`, private, same shape as 3.1); deps `@wboard/core` + `@wboard/mcp` (+ `@modelcontextprotocol/sdk` at the version `packages/mcp` pins) as needed. Commit.
- [ ] 4.2 `examples/diagramming/src/main.ts` — `run()` per the proposal: real MCP client over `InMemoryTransport` → `create_board` (schema `node`: `label` string required; `edge`: `from`/`to` element required, `label` string) → `apply_ops` a 3-node/2-edge graph → a deliberate `bad-ref` batch, assert the tool result is a NORMAL result `{ ok: false, code: "bad-ref" }` and a follow-up `get_events` shows nothing appended → fold and assert the graph → `screenshot`, assert `mime_type === "image/svg+xml"` and non-empty base64 → `describe_board`, assert `protocol_version === "0.1"`. One vitest test calls `run()`. `pnpm check` green. Commit.
- [ ] 4.3 `docs/examples/diagramming.md`: walkthrough (element-ref integrity, rejection-as-data, screenshot read-back) linking the source. Root `README.md`: add the short Docs section (docs map + both examples). Commit.

## Cluster 5 — verification (the a7 flip condition)

- [ ] 5.1 Fresh gate: `pnpm check` green with both example projects present in `pnpm nx show projects`; show the kanban and diagramming test tasks executing (cache-miss run acceptable via a real change earlier in the session — never `--skip-nx-cache` for cosmetics).
- [ ] 5.2 **Positive control**: flip the kanban `run()` final-state assertion to a wrong expectation → `pnpm check` FAILS on the kanban test; revert → green. Show both runs' evidence.
- [ ] 5.3 **Published-package run**: in `$(mktemp -d)` outside the repo, `npm init -y && npm_config_min_release_age=0 npm install @wboard/core@alpha @wboard/server@alpha @wboard/mcp@alpha` (+ the MCP SDK for the client import), copy both examples' built `main.js` (or a tsx-run of `main.ts` with imports resolving to the installed packages — no workspace resolution), run both; exit 0 each. The `min_release_age=0` prefix is required on this machine (`~/.npmrc` sets `min-release-age=7`; `ENOVERSIONS` otherwise; pnpm ignores the key). Evidence shown.
- [ ] 5.4 Link integrity: every relative link in `docs/**/*.md` + root `README.md` resolves to an existing file (shell loop; no new dependency). Positive control: point one link at a nonexistent file, show the check catch it, revert. `git diff --stat main` shows `spec/` and `packages/*/src` untouched.
- [ ] 5.5 Final: `pnpm check` green, all committed and pushed on `a7-docs-worked-examples` (`git rev-parse origin/a7-docs-worked-examples` == local HEAD), PR against `main` opened with the evidence in the body. Output `<promise>A7-COMPLETE</promise>`.

## Notes

- SPEC.md is untouched — A7 ships zero normative changes. Docs link to SPEC sections; they never restate the wire tables or the error enum as their own text.
- No SSG, no GitHub Pages, no link-checker/typedoc/snippet-extraction dependencies. Plain markdown + workspace packages only.
- Examples stay `private: true` and out of `nx.json`'s explicit release projects — nothing about A7 is published; no version bump.
- The examples import the packages; they never patch or re-implement them. If an example cannot pass without a package change, stop and report — that is a package bug or a docs error, not license to edit `packages/*`.
- Wrap `git`/`pnpm`/`nx` in `sh -c '...'` (RTK shell hook mangles them). `openspec/` is globally gitignored — stage packet edits with `git add -f openspec/...`.
