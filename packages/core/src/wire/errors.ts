import { z } from "zod";

/**
 * The closed error-code enum. Typed validation rejects a batch with exactly
 * one of these codes; no library invents codes outside this list, and no
 * fixture may reject with a code not defined here. Adding a code is a
 * protocol-version change (see `spec/SPEC.md`, Error codes).
 *
 * Each code names one failure family that stateless validation can detect from
 * the host schema plus the set of known element ids:
 *
 * - `unknown-kind`     — an element's `kind` is not declared by the schema.
 * - `missing-required` — a required attribute is absent on a created element.
 * - `wrong-type`       — an attribute value does not match its declared type.
 * - `bad-ref`          — an `element`-typed attribute references an id that is
 *                        neither already present nor minted earlier in the batch.
 * - `unknown-element`  — an update/delete targets an id that does not exist.
 * - `duplicate-id`     — a create reuses an id already live or minted earlier.
 */
export const ERROR_CODES = [
  "unknown-kind",
  "missing-required",
  "wrong-type",
  "bad-ref",
  "unknown-element",
  "duplicate-id",
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
