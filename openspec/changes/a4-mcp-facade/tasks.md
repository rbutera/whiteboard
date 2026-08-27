Ordered clusters. Each cluster is a clean stopping point sized for one implementer session: land it, run `pnpm check`, commit, push, stop if the session is done. Within a cluster each numbered task is independently committable.

## Cluster 1 — package scaffold

- [x] 1.1 `packages/mcp`: `package.json` (`@wboard/mcp`, `0.0.0`, MIT, ESM, `dist` exports mirroring `packages/server`, `"bin": {"wboard-mcp": "./dist/bin.js"}`; deps `@wboard/core` + `@wboard/server` `workspace:*`, `@modelcontextprotocol/sdk` `^1.30.0`, `ws` `^8.21.3`; devDeps `zod` `^4.4.3`, `@types/ws`), plus `project.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` copied from `packages/server` and adjusted. One real placeholder-free test (e.g. re-export of `PROTOCOL_VERSION`) so the gate has a positive control. `pnpm check` green across all three packages. Commit.

## Cluster 2 — the facade: five tools over BoardService

- [x] 2.1 `src/facade.ts`: `createWhiteboardMcpServer(options?: {service?: BoardService; renderer?: BoardRenderer; defaultActor?: string})` → `{server: McpServer, service}`. Register `create_board`, `get_schema`, `apply_ops`, `describe_board`, `get_events` with input shapes derived from core's request schemas (`apply_ops` adds optional `actor`, defaulted to `options.defaultActor ?? "agent"`). Each handler is exactly one service call; the wire response goes out verbatim as `structuredContent` plus the same JSON in a text content block. `apply_ops` rejections (`{ok: false, code, message}`) are **normal** results; service throws (unknown board) are caught and returned as `isError: true` results carrying the message — never propagated. Tools listed unconditionally; zero facade state.
- [x] 2.2 Tests (`src/facade.test.ts`): real MCP `Client` ↔ facade over `InMemoryTransport`. Cover: create→schema→describe (`protocol_version` = core's) round-trip; apply→get_events with cursor paging; actor attribution (explicit `actor` and the default) visible in events; a rejected batch surfaces the exact enum code in a non-error result and appends nothing; unknown `board_id` on every tool → `isError: true`; a host-supplied `BoardService` is the one the tools hit (the B4 seam). Export the facade from `src/index.ts`. Commit.

## Cluster 3 — screenshot

- [x] 3.1 `src/render.ts`: `BoardRenderer` type (`(schema, elements) => Promise<{mime_type, base64}>`) and `schematicRenderer` — deterministic, dependency-free SVG (`image/svg+xml`): one card per element (id, kind, `data` key/values, XML-escaped), grouped by kind; stable output for a given projection.
- [x] 3.2 Register the `screenshot` tool: `getSchema` + `getState`, render via `options.renderer ?? schematicRenderer`, return an MCP image content block plus the wire `ScreenshotResponse` as `structuredContent`. Tests: fallback renderer determinism + escaping; the tool returns valid base64 SVG for a populated board; an injected renderer is used verbatim; unknown board → `isError`. Export from `src/index.ts`. Commit.

## Cluster 4 — transports: stdio bin + WebSocket push

- [x] 4.1 `src/bin.ts`: `wboard-mcp` — `createWhiteboardMcpServer()` on a fresh in-memory service, connected to `StdioServerTransport`. No flags. Stdio smoke test: spawn the built bin, drive create→apply→get_events with a real MCP client over stdio, assert the round-trip.
- [x] 4.2 `src/ws.ts`: `attachWebSocketPush(service, options: {port?: number; server?: http.Server; pollMs?: number})` → handle with `close()`. Client connects with `board_id` (required) + `cursor` (optional, default 0) as URL query params; stream each event as its own JSON frame — backlog after `cursor` first, then new events via a per-connection `getEvents` poller (default 250ms). Unknown board: one JSON error frame, then close. Poller stops on disconnect; `close()` tears everything down (tests must not leak handles). No changes to `@wboard/server`.
- [x] 4.3 WS tests: real socket on an ephemeral port — backlog delivery from a cursor; an `apply` during an open subscription delivers the new frames; two subscribers both receive; unknown board gets the error frame and a close. Export from `src/index.ts`. Commit.

## Cluster 5 — corpus through the MCP facade

- [ ] 5.1 `src/corpus.test.ts`: run the **whole** `spec/fixtures/` corpus end-to-end through an MCP client over `InMemoryTransport`. Accept/reject fixtures: `create_board` with the fixture schema, `apply_ops` the input, assert the verdict from `structuredContent` (exact code on reject) and that a reject leaves `get_events` empty. Project fixtures: run each batch through `apply_ops` asserting its verdict, then fetch `get_events` and deep-equal the raw events against `expect.events` and the client-side `project()` fold of them against `expect.state`. Fail on an unreadable or shape-invalid fixture, never skip; enforce the same fixture-root closure the other runners do. Commit.

## Cluster 6 — SPEC.md facade section + verification

- [ ] 6.1 SPEC.md: add a normative **MCP facade** section reading true against the shipped code — the protocol-name → MCP-tool-name binding and its rationale; results as verbatim wire responses in `structuredContent` (+ text JSON; + image for screenshot); the closed enum through results, not exceptions; unknown-board as transport-level `isError`; the optional `actor` input and default; screenshot's pluggable renderer with the schematic fallback; the WS push channel (query-param subscription, event-shaped frames, poll-backed, transport convenience — `get_events` polling stays the default); embeddability (`createWhiteboardMcpServer` over a host-supplied service; stdio bin). Update the Overview's "facade-level transport for a later workstream" pointer and the Status note to reflect A4. No draft markers.
- [ ] 6.2 Run the packet's verification: clean `pnpm check`; positive controls (break the `apply_ops` mapping → facade tests fail; let the unknown-board throw propagate → error-mapping test fails; flip one fixture expectation → MCP corpus runner fails; disable the WS poller → WS test fails; revert each). Show evidence, commit, push, output `<promise>A4-COMPLETE</promise>`.

## Notes

- The facade is a translator, not a second service: no caching, no board state, no per-connection state beyond a WS poller's cursor. If a handler is more than one service call plus encoding (screenshot's schema+state pair excepted), it is doing too much.
- Core and server are frozen surfaces — no new exports, no observer hooks, no wire-schema edits. `ApplyRequestSchema` stays untouched; `actor` is facade input only.
- No HTTP transport, no MCP Apps widget, no auth/sessions/rate limiting (Rule Zero), no Python (A6), no release wiring (A5).
