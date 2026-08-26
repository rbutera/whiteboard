import { z } from "zod";
import { ErrorCodeSchema } from "./errors.js";
import { OpSchema, OpsSchema } from "./ops.js";
import { WireSchema } from "./schema.js";

/**
 * Request/response shapes for the five stateless tools (plus `screenshot`),
 * per #455 (v3). `board_id` is a plain minted string threaded as an argument
 * — there is no session or connection concept anywhere here. See
 * `spec/SPEC.md` (Overview, Wire shape).
 */

// create — mint a board, declaring its host schema up front.
export const CreateRequestSchema = z.object({ schema: WireSchema });
export const CreateResponseSchema = z.object({ board_id: z.string() });
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type CreateResponse = z.infer<typeof CreateResponseSchema>;

// schema — read back the host schema declared for a board.
export const SchemaRequestSchema = z.object({ board_id: z.string() });
export const SchemaResponseSchema = z.object({ schema: WireSchema });
export type SchemaRequest = z.infer<typeof SchemaRequestSchema>;
export type SchemaResponse = z.infer<typeof SchemaResponseSchema>;

// apply — the single mutation verb: a flat ordered ops list, all-or-nothing.
// The response mirrors validation: accepted, or a single rejection carrying
// exactly one enum code.
export const ApplyRequestSchema = z.object({ board_id: z.string(), ops: OpsSchema });
export const ApplyAcceptedSchema = z.object({ ok: z.literal(true) });
export const ApplyRejectedSchema = z.object({
  ok: z.literal(false),
  code: ErrorCodeSchema,
  message: z.string(),
});
export const ApplyResponseSchema = z.discriminatedUnion("ok", [
  ApplyAcceptedSchema,
  ApplyRejectedSchema,
]);
export type ApplyRequest = z.infer<typeof ApplyRequestSchema>;
export type ApplyResponse = z.infer<typeof ApplyResponseSchema>;

// describe — board metadata and the protocol version the service implements.
export const DescribeRequestSchema = z.object({ board_id: z.string() });
export const DescribeResponseSchema = z.object({
  board_id: z.string(),
  protocol_version: z.string(),
});
export type DescribeRequest = z.infer<typeof DescribeRequestSchema>;
export type DescribeResponse = z.infer<typeof DescribeResponseSchema>;

// events — read the board's append-only log. Each event is an op attributed to
// an actor and ordered by `seq`. `cursor` reads events after that seq.
export const EventSchema = z.object({
  seq: z.number(),
  actor: z.string(),
  op: OpSchema,
});
export type Event = z.infer<typeof EventSchema>;
export const EventsRequestSchema = z.object({
  board_id: z.string(),
  cursor: z.number().optional(),
});
export const EventsResponseSchema = z.object({
  events: z.array(EventSchema),
  cursor: z.number(),
});
export type EventsRequest = z.infer<typeof EventsRequestSchema>;
export type EventsResponse = z.infer<typeof EventsResponseSchema>;

// screenshot — a rendered image of the board (base64-encoded bytes + mime).
export const ScreenshotRequestSchema = z.object({ board_id: z.string() });
export const ScreenshotResponseSchema = z.object({
  mime_type: z.string(),
  base64: z.string(),
});
export type ScreenshotRequest = z.infer<typeof ScreenshotRequestSchema>;
export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>;
