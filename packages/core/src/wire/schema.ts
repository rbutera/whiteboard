import { z } from "zod";

/**
 * The host schema is declared at board creation and is the authority typed
 * validation checks against. It is a set of kinds; each kind names its
 * attributes. See `spec/SPEC.md` (Host schema).
 */

/** The five attribute value types. `element` is a reference to another element
 * (id-first); `json` is an opaque JSON value the protocol does not shape. */
export const AttributeTypeSchema = z.enum(["string", "number", "boolean", "element", "json"]);
export type AttributeType = z.infer<typeof AttributeTypeSchema>;

/**
 * An attribute of a kind. `many: true` makes the value a list of that type.
 * `description` is agent-facing and is echoed into typed validation errors.
 */
export const AttributeSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  type: AttributeTypeSchema,
  required: z.boolean(),
  many: z.boolean().optional(),
});
export type Attribute = z.infer<typeof AttributeSchema>;

/** A kind: an id, an agent-facing description, and its declared attributes. */
export const KindSchema = z.strictObject({
  id: z.string(),
  description: z.string(),
  attributes: z.array(AttributeSchema),
});
export type Kind = z.infer<typeof KindSchema>;

/** The wire host schema: just its kinds. */
export const WireSchema = z.strictObject({
  kinds: z.array(KindSchema),
});
export type WireSchema = z.infer<typeof WireSchema>;
