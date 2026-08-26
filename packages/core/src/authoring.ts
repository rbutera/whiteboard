import { z } from "zod";
import { type ValidationResult, validate } from "./validate.js";
import type { Op } from "./wire/ops.js";
import type { AttributeType, WireSchema } from "./wire/schema.js";

/**
 * The host-schema authoring kit: a typed TS surface a host declares its kinds
 * in, plus {@link compileToWire} that lowers it to the canonical wire schema.
 *
 * This is one honest layer: **authoring is convenience, the wire is truth.**
 * The kit invents no validation of its own — {@link validateAuthored} compiles
 * to wire and defers to {@link validate}. The drift test proves the compiler
 * always emits output the wire-schema Zod schema accepts.
 */

/** An authored attribute. Same fields as the wire attribute, but keyed by name
 * in its kind's `attributes` map rather than carrying its own `name`. */
export interface AuthoredAttribute {
  description: string;
  type: AttributeType;
  required: boolean;
  many?: boolean;
}

/** An authored kind: a description and its attributes, keyed by attribute name. */
export interface AuthoredKind {
  description: string;
  attributes: Record<string, AuthoredAttribute>;
}

/** An authored host schema: kinds keyed by kind id. */
export type AuthoredSchema = Record<string, AuthoredKind>;

/**
 * Declare a host schema in TS. This is a typed identity: it constrains the
 * shape and preserves the literal types (`const` inference) so downstream
 * {@link ElementData} and {@link dataValidator} can read each attribute's type,
 * `required`, and `many`. An `element` attribute's value is another element's
 * id (a plain string) — referencing by kind is host convention, not wire.
 */
export function defineSchema<const S extends AuthoredSchema>(schema: S): S {
  return schema;
}

/**
 * Lower an authored schema to the canonical wire schema. Kind ids and attribute
 * names come from the map keys; `many` is emitted only when set. The output is
 * the truth the protocol carries; the authored form is discarded after this.
 */
export function compileToWire(authored: AuthoredSchema): WireSchema {
  return {
    kinds: Object.entries(authored).map(([id, kind]) => ({
      id,
      description: kind.description,
      attributes: Object.entries(kind.attributes).map(([name, attr]) => ({
        name,
        description: attr.description,
        type: attr.type,
        required: attr.required,
        ...(attr.many ? { many: true } : {}),
      })),
    })),
  };
}

// — Per-kind data typing ————————————————————————————————————————————————

/** The TS type of one attribute-type's scalar value. `element` is an id string;
 * `json` is an opaque value the protocol does not shape. */
type ScalarTsType<T extends AttributeType> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : T extends "element"
        ? string
        : T extends "json"
          ? unknown
          : never;

type AttrTsType<A extends AuthoredAttribute> = A["many"] extends true
  ? ScalarTsType<A["type"]>[]
  : ScalarTsType<A["type"]>;

type RequiredNames<A extends Record<string, AuthoredAttribute>> = {
  [N in keyof A]: A[N]["required"] extends true ? N : never;
}[keyof A];

/**
 * The inferred TS type of a kind's `data`: required attributes are required
 * keys, optional attributes optional, each mapped to its attribute type (with
 * `many` becoming an array). Undeclared fields pass through at validation, so
 * this types the declared surface a host writes against, not the whole bag.
 */
export type ElementData<S extends AuthoredSchema, K extends keyof S> = {
  [N in RequiredNames<S[K]["attributes"]>]: AttrTsType<S[K]["attributes"][N]>;
} & {
  [N in Exclude<keyof S[K]["attributes"], RequiredNames<S[K]["attributes"]>>]?: AttrTsType<
    S[K]["attributes"][N]
  >;
};

function scalarZod(type: AttributeType): z.ZodTypeAny {
  switch (type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "element":
      return z.string();
    case "json":
      return z.unknown();
  }
}

/**
 * A Zod validator for a kind's `data`. Extras pass through (`looseObject`),
 * matching wire validation. This checks types and required-ness only; it cannot
 * check `element`-ref liveness (that needs the id set), so it never rejects a
 * well-typed ref — {@link validate} owns `bad-ref`. Throws on an unknown kind.
 */
export function dataValidator(schema: AuthoredSchema, kindId: string): z.ZodType {
  const kind = schema[kindId];
  if (!kind) throw new Error(`unknown kind: ${kindId}`);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, attr] of Object.entries(kind.attributes)) {
    const base = attr.many ? z.array(scalarZod(attr.type)) : scalarZod(attr.type);
    shape[name] = attr.required ? base : base.optional();
  }
  return z.looseObject(shape);
}

/**
 * Validate ops against an authored schema. This is the kit's validation path:
 * compile to wire, then defer to {@link validate}. It exists so hosts validate
 * against the same truth the protocol enforces — the kit adds no second
 * validation semantics of its own.
 */
export function validateAuthored(
  authored: AuthoredSchema,
  ops: readonly Op[],
  existingIds: ReadonlySet<string>,
): ValidationResult {
  return validate(compileToWire(authored), ops, existingIds);
}
