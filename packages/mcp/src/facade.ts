import {
  ApplyRequestSchema,
  CreateRequestSchema,
  DescribeRequestSchema,
  EventsRequestSchema,
  SchemaRequestSchema,
  ScreenshotRequestSchema,
} from "@wboard/core";
import { BoardService } from "@wboard/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type BoardRenderer, schematicRenderer } from "./render.js";

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

/**
 * Build the stateless MCP facade over a {@link BoardService}. Every tool call is
 * exactly one service call (bar `screenshot`, which pairs schema + state); the
 * facade holds **zero board state and zero per-connection state**. Tools are
 * listed unconditionally (#453). The caller connects the returned `server` over
 * any SDK transport (`InMemoryTransport` in-process, `StdioServerTransport` over
 * stdio).
 *
 * Result mapping (decided in `proposal.md`):
 * - Every tool returns its wire response verbatim as `structuredContent` plus the
 *   same JSON in a text block.
 * - `apply_ops` rejections (`{ok: false, code, message}`) are **normal** results
 *   — the closed enum is protocol data an agent reads, not an exception.
 * - Service throws (unknown board) **propagate**; the pinned `@modelcontextprotocol/sdk`
 *   (`^1.30`) converts an uncaught tool-handler throw into an `isError: true`
 *   result carrying the message. That SDK behavior is the contract — the facade
 *   adds no redundant mapping of its own (a `facade.test.ts` behavior test pins
 *   the observable contract and fails if an SDK upgrade changes the wrapping).
 * - Malformed inputs are rejected by the SDK's own zod validation — the one
 *   standard MCP error path left alone.
 */
export function createWhiteboardMcpServer(options: WhiteboardMcpOptions = {}): WhiteboardMcp {
  const service = options.service ?? new BoardService();
  const defaultActor = options.defaultActor ?? "agent";
  const renderer = options.renderer ?? schematicRenderer;

  const server = new McpServer({ name: "wboard-mcp", version: "0.0.0" });

  server.registerTool(
    "create_board",
    {
      description: "Mint a board, declaring its host schema up front. Returns the board_id.",
      inputSchema: CreateRequestSchema.shape,
    },
    async ({ schema }) => wireResult({ board_id: await service.createBoard(schema) }),
  );

  server.registerTool(
    "get_schema",
    {
      description: "Read back the host schema declared for a board.",
      inputSchema: SchemaRequestSchema.shape,
    },
    async ({ board_id }) => wireResult({ schema: await service.getSchema(board_id) }),
  );

  server.registerTool(
    "apply_ops",
    {
      description:
        "Apply a flat, ordered ops list to a board, all-or-nothing. Returns the accepted or rejected verdict verbatim. Optional actor attributes the ops (default: the facade's defaultActor).",
      inputSchema: { ...ApplyRequestSchema.shape, actor: z.string().optional() },
    },
    async ({ board_id, ops, actor }) =>
      wireResult(await service.apply(board_id, ops, actor ?? defaultActor)),
  );

  server.registerTool(
    "describe_board",
    {
      description: "Board metadata and the protocol version the service implements.",
      inputSchema: DescribeRequestSchema.shape,
    },
    async ({ board_id }) => wireResult(await service.describe(board_id)),
  );

  server.registerTool(
    "get_events",
    {
      description:
        "Read the board's append-only event log. Events with seq > cursor (cursor omitted = from the start), in order. Polling by cursor is the default live-update path.",
      inputSchema: EventsRequestSchema.shape,
    },
    async ({ board_id, cursor }) => wireResult(await service.getEvents(board_id, cursor)),
  );

  server.registerTool(
    "screenshot",
    {
      description:
        "A rendered image of the board's current state (base64 bytes + mime type), plus the same image as an MCP image content block.",
      inputSchema: ScreenshotRequestSchema.shape,
    },
    async ({ board_id }) => {
      const [schema, elements] = await Promise.all([
        service.getSchema(board_id),
        service.getState(board_id),
      ]);
      const shot = await renderer(schema, elements);
      return {
        content: [
          { type: "image", data: shot.base64, mimeType: shot.mime_type },
          { type: "text", text: JSON.stringify(shot) },
        ],
        structuredContent: shot as unknown as Record<string, unknown>,
      };
    },
  );

  return { server, service };
}
