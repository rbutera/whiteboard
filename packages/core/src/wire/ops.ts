import { z } from "zod";
import { ElementSchema } from "./element.js";

/**
 * `apply` carries a flat, ordered list of ops. Each op is one of three verbs
 * and carries an `op_id` for dedup against the event log. Later ops may
 * reference ids minted by earlier ops in the same list. See #455 (v3) and
 * `spec/SPEC.md` (Wire shape).
 */

/** Create a new element. */
export const CreateOpSchema = z.strictObject({
  op: z.literal("create"),
  op_id: z.string(),
  element: ElementSchema,
});

/** Merge `data` into an existing element (partial update). */
export const UpdateOpSchema = z.strictObject({
  op: z.literal("update"),
  op_id: z.string(),
  id: z.string(),
  data: z.record(z.string(), z.unknown()),
});

/** Delete an existing element by id. */
export const DeleteOpSchema = z.strictObject({
  op: z.literal("delete"),
  op_id: z.string(),
  id: z.string(),
});

/** One op, discriminated on the `op` verb. */
export const OpSchema = z.discriminatedUnion("op", [
  CreateOpSchema,
  UpdateOpSchema,
  DeleteOpSchema,
]);
export type Op = z.infer<typeof OpSchema>;
export type CreateOp = z.infer<typeof CreateOpSchema>;
export type UpdateOp = z.infer<typeof UpdateOpSchema>;
export type DeleteOp = z.infer<typeof DeleteOpSchema>;

/** The flat ordered ops list an `apply` call carries. */
export const OpsSchema = z.array(OpSchema);
export type Ops = z.infer<typeof OpsSchema>;
