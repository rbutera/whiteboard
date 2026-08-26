import type { ErrorCode } from "./wire/errors.js";
import type { Op } from "./wire/ops.js";
import type { Attribute, AttributeType, Kind, WireSchema } from "./wire/schema.js";

/**
 * The verdict of {@link validate}: accepted, or rejected with exactly one
 * closed-enum code and a precise message. Rejection is all-or-nothing — the
 * caller applies nothing.
 */
export type ValidationResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

const accept: ValidationResult = { ok: true };
const reject = (code: ErrorCode, message: string): ValidationResult => ({
  ok: false,
  code,
  message,
});

/** Check one scalar value against a declared attribute type. Returns the
 * failing code, or null if it matches. `element` values are ids that must be
 * live (already present or minted earlier in the batch). */
function checkScalar(
  value: unknown,
  type: AttributeType,
  liveIds: ReadonlySet<string>,
): ErrorCode | null {
  switch (type) {
    case "string":
      return typeof value === "string" ? null : "wrong-type";
    case "number":
      return typeof value === "number" ? null : "wrong-type";
    case "boolean":
      return typeof value === "boolean" ? null : "wrong-type";
    case "json":
      return null;
    case "element":
      if (typeof value !== "string") return "wrong-type";
      return liveIds.has(value) ? null : "bad-ref";
  }
}

/** Check an attribute's value, honouring `many` (a list of the base type). */
function checkValue(
  value: unknown,
  attr: Attribute,
  liveIds: ReadonlySet<string>,
): ErrorCode | null {
  if (attr.many) {
    if (!Array.isArray(value)) return "wrong-type";
    for (const item of value) {
      const code = checkScalar(item, attr.type, liveIds);
      if (code) return code;
    }
    return null;
  }
  return checkScalar(value, attr.type, liveIds);
}

/** Precise typed-failure message, carrying the attribute's description. */
function typedMessage(attr: Attribute, code: ErrorCode): string {
  const expected = attr.many ? `${attr.type}[]` : attr.type;
  if (code === "bad-ref") {
    return `attribute "${attr.name}" (${attr.description}) references an unknown element`;
  }
  return `attribute "${attr.name}" (${attr.description}) has the wrong type; expected ${expected}`;
}

/**
 * Stateless, typed, all-or-nothing validation of a flat ordered ops list
 * against a host schema. Returns the first failure, or acceptance.
 *
 * @param wireSchema the board's declared host schema.
 * @param ops        the `apply` ops, validated in order.
 * @param existing   the ids already present on the board, each mapped to its
 *   kind (empty for a fresh board). The kind lets updates to pre-existing
 *   elements be type-checked, exactly like updates to elements minted in this
 *   batch. Ops may reference ids minted earlier in the same batch.
 *
 * Within-batch minting and deletion are tracked. Undeclared `data` fields pass
 * through untouched. Updates type-check the supplied `data` against the target
 * element's kind (partial merge — absent attributes are unchanged). A create
 * reusing any id that is live OR was minted earlier in this batch (even if
 * since deleted) is a `duplicate-id`, per SPEC.md's error-codes closure.
 */
export function validate(
  wireSchema: WireSchema,
  ops: readonly Op[],
  existing: ReadonlyMap<string, string>,
): ValidationResult {
  const kinds = new Map<string, Kind>(wireSchema.kinds.map((k) => [k.id, k]));
  const live = new Set(existing.keys());
  const kindOf = new Map(existing);
  const everMinted = new Set<string>();

  for (const op of ops) {
    if (op.op === "create") {
      const { id, kind, data } = op.element;
      const declared = kinds.get(kind);
      if (!declared) return reject("unknown-kind", `unknown kind: ${kind}`);
      if (live.has(id) || everMinted.has(id)) {
        return reject("duplicate-id", `element id already exists: ${id}`);
      }
      for (const attr of declared.attributes) {
        if (!Object.hasOwn(data, attr.name)) {
          if (attr.required) {
            return reject(
              "missing-required",
              `missing required attribute "${attr.name}": ${attr.description}`,
            );
          }
          continue;
        }
        const code = checkValue(data[attr.name], attr, live);
        if (code) return reject(code, typedMessage(attr, code));
      }
      live.add(id);
      everMinted.add(id);
      kindOf.set(id, kind);
    } else if (op.op === "update") {
      if (!live.has(op.id)) return reject("unknown-element", `unknown element: ${op.id}`);
      const kindId = kindOf.get(op.id);
      const declared = kindId === undefined ? undefined : kinds.get(kindId);
      if (declared) {
        for (const attr of declared.attributes) {
          if (!Object.hasOwn(op.data, attr.name)) continue;
          const code = checkValue(op.data[attr.name], attr, live);
          if (code) return reject(code, typedMessage(attr, code));
        }
      }
    } else {
      if (!live.has(op.id)) return reject("unknown-element", `unknown element: ${op.id}`);
      live.delete(op.id);
    }
  }

  return accept;
}
