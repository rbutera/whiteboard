import {
  ApplyRequestSchema,
  CreateRequestSchema,
  DescribeRequestSchema,
  EventsRequestSchema,
  SchemaRequestSchema,
} from "@wboard/core";
import { BoardService } from "@wboard/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * The pluggable screenshot renderer seam (see `render.ts`). Declared here so the
 * facade options type can name it without importing the renderer implementation.
 */
export type BoardRenderer = (
  schema: import("@wboard/core").WireSchema,
  elements: ReadonlyMap<string, import("@wboard/core").Element>,
) => Promise<{ mime_type: string; base64: string }>;

export interface WhiteboardMcpOptions {
  /** The board service the tools call. Default: a fresh in-memory `BoardService`.
   * Rennet's B4 passes its own persistence-wrapped service (the embedding seam). */
  service?: BoardService;
  /** Renderer for the `screenshot` tool. Default: the shipped `schematicRenderer`. */
  renderer?: BoardRenderer;
  /** Actor attributed to `apply_ops` calls that omit `actor`. Default `"agent"`. */
  defaultActor?: string;
}

export interface WhiteboardMcp {
  server: McpServer;
  service: BoardService;
}

/** A tool result carrying a wire response verbatim: structured-text-first (#454)
 * — the same JSON in both `structuredContent` and a text block. */
function wireResult(response: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(response) }],
    structuredContent: response as Record<string, unknown>,
  };
}

/** The service's plain `Error` throws (unknown `board_id`) map to a transport
 * `isError: true` result — never a thrown MCP protocol error (#453 / decisions). */
function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Build the stateless MCP facade over a {@link BoardService}. Every tool call is
 * exactly one service call; the facade holds **zero board state and zero
 * per-connection state**. Tools are listed unconditionally (#453). The caller
 * connects the returned `server` over any SDK transport (`InMemoryTransport`
 * in-process, `StdioServerTransport` over stdio).
 *
 * Result mapping (decided in `proposal.md`):
 * - Every tool returns its wire response verbatim as `structuredContent` plus the
 *   same JSON in a text block.
 * - `apply_ops` rejections (`{ok: false, code, message}`) are **normal** results
 *   — the closed enum is protocol data an agent reads, not an exception.
 * - Service throws (unknown board) are caught and returned as `isError: true`.
 * - Malformed inputs are rejected by the SDK's own zod validation — the one
 *   standard MCP error path left alone.
 */
export function createWhiteboardMcpServer(options: WhiteboardMcpOptions = {}): WhiteboardMcp {
  const service = options.service ?? new BoardService();
  const defaultActor = options.defaultActor ?? "agent";

  const server = new McpServer({ name: "wboard-mcp", version: "0.0.0" });

  server.registerTool(
    "create_board",
    {
      description: "Mint a board, declaring its host schema up front. Returns the board_id.",
      inputSchema: CreateRequestSchema.shape,
    },
    async ({ schema }) => {
      try {
        const board_id = await service.createBoard(schema);
        return wireResult({ board_id });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_schema",
    {
      description: "Read back the host schema declared for a board.",
      inputSchema: SchemaRequestSchema.shape,
    },
    async ({ board_id }) => {
      try {
        return wireResult({ schema: await service.getSchema(board_id) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "apply_ops",
    {
      description:
        "Apply a flat, ordered ops list to a board, all-or-nothing. Returns the accepted or rejected verdict verbatim. Optional actor attributes the ops (default: the facade's defaultActor).",
      inputSchema: { ...ApplyRequestSchema.shape, actor: z.string().optional() },
    },
    async ({ board_id, ops, actor }) => {
      try {
        return wireResult(await service.apply(board_id, ops, actor ?? defaultActor));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "describe_board",
    {
      description: "Board metadata and the protocol version the service implements.",
      inputSchema: DescribeRequestSchema.shape,
    },
    async ({ board_id }) => {
      try {
        return wireResult(await service.describe(board_id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_events",
    {
      description:
        "Read the board's append-only event log. Events with seq > cursor (cursor omitted = from the start), in order. Polling by cursor is the default live-update path.",
      inputSchema: EventsRequestSchema.shape,
    },
    async ({ board_id, cursor }) => {
      try {
        return wireResult(await service.getEvents(board_id, cursor));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return { server, service };
}
