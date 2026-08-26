import { z } from "zod";

/**
 * An element is the sole unit on the wire: `{ id, kind, data }`.
 *
 * - `id` — caller-assigned stable identifier (id-first binding).
 * - `kind` — one of the kinds declared by the board's host schema.
 * - `data` — the element's attributes; typed per the host schema at
 *   validation time, but structurally just a bag of JSON values here.
 *
 * The protocol carries no presentation, relations, or attention — those are
 * host-schema data. See `spec/SPEC.md` (Elements).
 */
export const ElementSchema = z.strictObject({
  id: z.string(),
  kind: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export type Element = z.infer<typeof ElementSchema>;
