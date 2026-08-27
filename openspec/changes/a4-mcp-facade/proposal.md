## Why

A3 shipped a real board service, but only an embedder can reach it — no agent can. The protocol's whole point is agents and humans authoring the same board through stateless tools (#453, #455), and the MCP facade is the seam Rennet's B4 consumes. SPEC.md's Overview also points the WebSocket live-update channel at "a facade-level transport for a later workstream" — that workstream is this one. A4 ships `@wboard/mcp`: the stateless MCP surface over `BoardService`, embeddable in-process and runnable over stdio, plus the WS push channel, and makes SPEC.md's facade story normative.

## What Changes

- **New package `@wboard/mcp`** (`packages/mcp`), MIT, same toolchain (nx 23.1.1, TS 5.9.3, Vitest, zod `^4.4.3`). New dependencies: `@modelcontextprotocol/sdk` **`^1.30.0`** (the official SDK; its zod peer range `^3.25 || ^4.0` matches the workspace's zod 4) and `ws` **`^8.21.3`** for the push channel. Depends on `@wboard/core` + `@wboard/server` (workspace).
- **`createWhiteboardMcpServer(options?)`** — the embeddable entry point. Returns `{ server: McpServer, service: BoardService }`. Options: `service?: BoardService` (default: a fresh in-memory one — B4 passes its own, persistence-wrapped), `renderer?: BoardRenderer`, `defaultActor?: string` (default `"agent"`). The facade holds **zero board state and zero per-connection state**: every tool call is one direct `BoardService` call (bar `screenshot`, which pairs `getSchema` + `getState`); tools are listed unconditionally (#453). A host connects the returned server over any SDK transport — in-process via `InMemoryTransport` (how B4 and the tests drive it) or stdio.
- **Six tools**, input shapes reused from `@wboard/core`'s Zod schemas (never restated), each mapping to one service call (`screenshot` excepted — it pairs `getSchema` + `getState`):

  | MCP tool | input | service call | result (`structuredContent`) |
  | -------- | ----- | ------------ | ---------------------------- |
  | `create_board` | `CreateRequest` | `createBoard(schema)` | `CreateResponse` |
  | `get_schema` | `SchemaRequest` | `getSchema(board_id)` | `SchemaResponse` |
  | `apply_ops` | `ApplyRequest` + optional `actor` | `apply(board_id, ops, actor ?? defaultActor)` | `ApplyResponse` — accepted **or rejected**, verbatim |
  | `describe_board` | `DescribeRequest` | `describe(board_id)` | `DescribeResponse` (carries `protocol_version` — the MCP handshake surface #456 requires) |
  | `get_events` | `EventsRequest` (`cursor` optional) | `getEvents(board_id, cursor)` | `EventsResponse` (polling by cursor is the default live-update path) |
  | `screenshot` | `ScreenshotRequest` | `getSchema` + `getState` → renderer | `ScreenshotResponse`, plus an MCP image content block |

- **Result encoding (decided)**: every tool returns the wire response verbatim as `structuredContent`, with the same JSON serialized in a text content block (structured-text-first read-back, #454). `screenshot` additionally returns an image content block.
- **Error mapping (decided)**: the closed six-code enum surfaces **through tool results, not exceptions** — an `apply_ops` rejection is a *normal* (non-error) tool result carrying `{ok: false, code, message}` verbatim, because rejection is protocol data the agent must read. The service's plain `Error` throws (unknown `board_id`) map to `isError: true` tool results carrying the message. Nothing facade-level ever raises an MCP protocol error for a protocol-semantics failure; malformed tool inputs are rejected by the SDK's own zod validation, which is the one standard MCP error path left alone.
- **`actor` (decided)**: `apply_ops` extends the wire `ApplyRequest` with an optional `actor` string — a facade-level input field, not a wire-shape change (`ApplyRequestSchema` is untouched). Absent, the facade's `defaultActor` is attributed. Attribution stays data, not authentication (SPEC Attribution; Rule Zero — no identity ceremony).
- **Tool naming (decided)**: `create_board`, `get_schema`, `apply_ops`, `describe_board`, `get_events`, `screenshot`. Rationale: MCP tools land in a flat list next to every other server's tools, so bare `create`/`schema`/`apply`/`describe` are ambiguous verbs; verb_noun snake_case is self-describing, `get_events` is the name #453 and SPEC.md already use, and `screenshot` is unambiguous as-is. The SPEC tool table's short names remain the transport-neutral protocol names; the facade section records this MCP binding.
- **Screenshot contract (decided)**: the protocol carries no presentation, so no generic renderer can draw a host's true visual. Rendering is therefore **pluggable**: `type BoardRenderer = (schema: WireSchema, elements: ReadonlyMap<string, Element>) => Promise<{mime_type: string, base64: string}>`. Hosts with real presentation semantics (Rennet) inject their own. The facade ships `schematicRenderer` as the default so the tool always answers: a deterministic, dependency-free SVG (`image/svg+xml`) laying out one card per element — id, kind, `data` key/values — grouped by kind. A renderer needs only schema + projection, exactly what A3 exposed for this purpose.
- **`wboard-mcp` stdio bin**: wires `createWhiteboardMcpServer()` (fresh in-memory service) to the SDK's `StdioServerTransport`. No flags, no config.
- **WebSocket push channel (decided)**: `attachWebSocketPush(service, options)` (`port` or an existing `http.Server`; `pollMs`, default 250) using `ws`. A client connects with `board_id` (required) and `cursor` (optional, default 0) as URL query parameters; the channel streams each event `{seq, actor, op}` as its own JSON frame — the backlog after `cursor` first, then new events as they append. Implementation is a **thin per-connection poller over `getEvents`**: per-connection cursor is transport state, not facade board state, and **no observer/subscription hook is added to `@wboard/server`** — its A3 surface is closed, and the poller keeps the push channel exactly as stateless as the polling it wraps (`ponytail:` poll-backed push; add a service-level append hook only if poll latency ever measurably matters). Unknown `board_id` sends one JSON error frame and closes. This channel is a transport convenience, not a wire shape: frames are the SPEC event shape, and polling `get_events` remains the default (#453).

Out of scope: HTTP transport (SSE/streamable-HTTP — add when a consumer exists), the MCP Apps widget render target (#453: build when Rennet needs it), release (A5), Python (A6), docs site (A7), auth/sessions/rate limiting (Rule Zero), and any change to `@wboard/core` or `@wboard/server`.

## Testing strategy

All tool-level tests drive a real MCP `Client` against the facade over the SDK's `InMemoryTransport` — the same in-process seam B4 uses, so embeddability is what the suite exercises. Per-tool tests cover the happy path, the apply rejection surfacing (enum code in the result, `isError` absent), and the unknown-board `isError` mapping. **Corpus reuse**: the whole `spec/fixtures/` corpus runs end-to-end through the MCP client — accept/reject fixtures via `create_board` + `apply_ops` (verdicts match, rejects leave `get_events` empty); project fixtures via their batches through `apply_ops`, then `get_events` folded client-side with `@wboard/server`'s `project` and deep-equalled against `expect.state`, and the raw events against `expect.events` — exactly the client-side fold SPEC.md prescribes for wire clients. The WS test opens a real socket on an ephemeral port, applies mid-subscription, and asserts backlog + live frames. A stdio smoke test spawns the built bin and round-trips create→apply→get_events.

## Capabilities

### New Capabilities

- `mcp-facade`: the stateless MCP tool surface — six tools, one service call each (`screenshot` pairs `getSchema` + `getState`), wire responses as structured results, closed-enum errors through results.
- `facade-embedding`: `createWhiteboardMcpServer` over a host-supplied `BoardService` — the in-process seam Rennet B4 consumes — plus the `wboard-mcp` stdio bin.
- `screenshot-rendering`: the pluggable `BoardRenderer` seam and the shipped schematic SVG fallback.
- `ws-push`: the WebSocket live-update channel — poll-backed event streaming by cursor.

### Modified Capabilities

- `conformance-corpus`: the corpus additionally runs end-to-end through the MCP facade.
- `spec-skeleton`: SPEC.md gains a normative **MCP facade** section; the Overview's "later workstream" WS pointer is resolved to it.

## Impact

- `packages/mcp/**` — new: package + project config mirroring `packages/server`, `src/` (facade, renderer, ws, bin), tests including the MCP corpus runner.
- Root workspace: `pnpm-lock.yaml` gains `@modelcontextprotocol/sdk` and `ws`; nothing else at root changes (the `check` gate picks the new project up via nx).
- `spec/SPEC.md` — new normative **MCP facade** section (tool-name binding, actor input, result/error mapping, screenshot pluggability, WS channel semantics); Overview and Status updated to stop deferring the WS channel.
- `@wboard/core` and `@wboard/server` untouched except as consumed dependencies.
