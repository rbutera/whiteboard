# Context packet — A4 mcp-facade

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT. Rule Zero governs: no consent gates, no auth, no rate limiting, no ceremony, no speculative hardening. The decision tickets below are CLOSED — implement them, never re-open or contradict them.

A1–A3 landed: the nx monorepo with the `pnpm check` gate (`format,lint,typecheck,test,build`); `@wboard/core` — the full wire contract as Zod schemas (`CreateRequestSchema`…`ScreenshotResponseSchema` in `src/wire/tools.ts`, element/op/schema/error shapes, stateless `validate`, the closed six-code enum, the fixture corpus + core runner); `@wboard/server` — the real reference board service. **Build on what exists — do not re-scaffold, do not touch core or server.** The npm scope is `@wboard/*` (renamed from `@whtbrd` — never use the old scope).

## Loop rules

The loop rules from `openspec/changes/a1-bootstrap-monorepo/context.md` apply verbatim. In brief:

- Fresh context per session; state lives on disk (this packet, `tasks.md`, git history). Assume interruption at any moment.
- Session start: read this packet + `tasks.md`, `git log --oneline -15`, run `pnpm check`, pick the highest unfinished task. Search before assuming something is unimplemented.
- Commit per completed task with a descriptive message; push freely (pushing is not publishing). No AI attribution or co-author trailers.
- **No placeholder or stub implementations.** If a task cannot be completed fully, leave it unchecked with a note.
- Verification closes the loop, not self-report: evidence shown, never asserted.

## Objective

Ship `@wboard/mcp`: a **stateless MCP facade** over `@wboard/server`'s `BoardService`. Each MCP tool call translates to one service call (bar `screenshot`, which pairs `getSchema` + `getState`); the facade holds **zero board state** and zero per-connection state. It exposes the five protocol tools plus `screenshot`, is **embeddable in-process** (Rennet's B4 consumes it that way) as well as runnable over **stdio**, and ships the **WebSocket push channel** #453 blessed (scoped to this workstream by the A2 review rewording of SPEC.md's Overview). Finish by writing SPEC.md's **MCP facade** section as normative text that reads true against the shipped code.

## What A3 already provides (the surface you wrap)

`@wboard/server` exports (see `packages/server/src/index.ts`, `service.ts`, `store.ts`, `project.ts`):

- `BoardService` — `createBoard(schema) → board_id`; `getSchema(board_id) → WireSchema`; `describe(board_id) → DescribeResponse`; `getEvents(board_id, cursor?) → EventsResponse`; `getState(board_id) → ReadonlyMap<string, Element>` (library API, not a wire tool); `apply(board_id, ops, actor) → ApplyResponse` (dedup → validate → atomic append, all-or-nothing, per-board serialized). All Promise-returning.
- Unknown `board_id` **throws a plain `Error`** everywhere — the closed enum belongs to apply validation only. A4 maps that throw to a transport error (see decisions).
- `BoardStore` + `InMemoryBoardStore`, `project`, `IMPLEMENTED_PROTOCOL_VERSION` / `PROTOCOL_VERSION`.

`@wboard/core` exports every wire request/response Zod schema the tools need — reuse them; do not restate wire shapes in `@wboard/mcp`.

## Decision tickets (the spec — closed, permalinked)

- https://github.com/rbutera/rennet/issues/453 — **primary authority for A4**: the facade is a thin stateless layer; `board_id` is a plain minted string threaded as a tool argument; tools are **listed unconditionally**; dedup is client op-ids + the event log (already in the server — the facade adds nothing); live updates via `get_events` polling by cursor **or a direct WebSocket**; the facade is designed to host an MCP Apps widget render target later but does **not** build one now.
- https://github.com/rbutera/rennet/issues/454 — structured-text-first read-back, id-first binding, headless-first. Tool results lead with structured data an agent can parse, never prose-only.
- https://github.com/rbutera/rennet/issues/455 — the validated v3 tool surface: five tools + screenshot. The wire shapes shipped in `@wboard/core` are not renegotiated here.
- https://github.com/rbutera/rennet/issues/456 — layout: `@wboard/*` scope, per-package semver, and the **separate protocol-version axis surfaced in the MCP handshake** (the `describe` tool carries `protocol_version`).
- https://github.com/rbutera/rennet/issues/463 — Track A packet. B4 (Rennet) embeds this facade in-process; embeddability is load-bearing, exactly as it was for the server in A3.

## Decisions baked in (decided in `proposal.md`, not re-litigated by the implementer)

Read `proposal.md` for rationale. In brief: MCP SDK `@modelcontextprotocol/sdk` `^1.30.0`; tool names `create_board` / `get_schema` / `apply_ops` / `describe_board` / `get_events` / `screenshot`; wire responses returned verbatim as `structuredContent` plus a JSON text block; apply rejections are **normal tool results** (the closed enum surfaces through results, not exceptions); unknown-board throws map to `isError: true` tool results; `apply_ops` takes an optional `actor` input defaulting to the facade's `defaultActor` (default `"agent"`); screenshot renders via a pluggable `BoardRenderer` with a shipped schematic SVG fallback; the WS push channel is a thin per-connection poller over `getEvents` — no observer hook is added to `@wboard/server`.

## Out of scope (later workstreams — do NOT start these)

- **A5**: nx release / npm publish.
- **A6**: all Python.
- **A7**: docs site and worked examples.
- MCP Apps widget / render target (#453: designed-for, built when Rennet needs it).
- HTTP transport (SSE/streamable-HTTP). Stdio + in-process + the WS push channel are the A4 transports; add HTTP when a consumer exists.
- Auth, sessions, rate limiting, consent prompts of any kind (Rule Zero; #453 statelessness).
- Any change to `@wboard/core` or `@wboard/server` semantics. New code lives in `packages/mcp`.
- Any concept #453–#456 excluded: presentation, relations, attention, spans/anchors, containment.

## Verification (end-to-end, positive controls that can fail)

1. From a clean checkout: `pnpm install && pnpm check` — green, all targets across all three packages.
2. **Tool loop**: in-process MCP client ↔ facade tests cover every tool; deliberately break the `apply_ops` → `service.apply` mapping (e.g. drop the actor, or return `{ok: true}` unconditionally) → tests FAIL; revert. Evidence shown.
3. **Error mapping**: an unknown `board_id` reaches the client as an `isError: true` tool result, never a thrown MCP protocol error. The throw propagates and the pinned `@modelcontextprotocol/sdk ^1.30` does the wrapping (`server/mcp.js` `createToolError`); the facade adds no catch of its own. A behavior test pins this observable contract and fails if an SDK upgrade changes the wrapping.
4. **Corpus through MCP**: the whole corpus (A2 accept/reject + A3 project fixtures) runs end-to-end through the MCP client; flip one fixture's expectation → the MCP corpus runner FAILS `pnpm check`; revert. Evidence shown.
5. **WS push**: an `apply` during an open subscription delivers the new event frames; disable the poller → the test FAILS; revert.
6. **Stdio smoke**: spawn the `wboard-mcp` bin, drive create→apply→get_events over stdio with a real MCP client, assert the round-trip.
7. SPEC.md's **MCP facade** section reads true against the shipped code — normative, no draft marker.

## Completion sigil

`<promise>A4-COMPLETE</promise>`
