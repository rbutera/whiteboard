import type { Element, Event } from "@whtbrd/core";

/**
 * The projection of an event log: the current elements and their kinds. State
 * is never stored — it is always this pure fold of the log, so the same events
 * always yield the same projection.
 */
export interface Projection {
  /** Current elements by id — the board state embedders read. */
  elements: ReadonlyMap<string, Element>;
  /** id → kind, the shape core's `validate()` takes as its `existing` arg. */
  kinds: ReadonlyMap<string, string>;
}

/**
 * Fold an ordered event list into board state. In seq order: `create` inserts
 * the element, `update` shallow-merges the op's `data` keys into the element's
 * `data` (untouched keys survive, supplied keys overwrite, undeclared keys pass
 * through), `delete` removes it. Deterministic and I/O-free — a function of the
 * events alone. Updates/deletes of an absent id are no-ops; a validated log
 * never contains them, but the fold stays total for a raw log rebuild.
 */
export function project(events: Iterable<Event>): Projection {
  const elements = new Map<string, Element>();
  for (const { op } of events) {
    switch (op.op) {
      case "create":
        elements.set(op.element.id, op.element);
        break;
      case "update": {
        const current = elements.get(op.id);
        if (current) {
          elements.set(op.id, { ...current, data: { ...current.data, ...op.data } });
        }
        break;
      }
      case "delete":
        elements.delete(op.id);
        break;
      default: {
        // Exhaustiveness: a new op verb must be handled here, not silently
        // treated as a delete. `op` narrows to `never` when all cases are covered.
        const unreachable: never = op;
        throw new Error(`unknown op verb: ${JSON.stringify(unreachable)}`);
      }
    }
  }
  const kinds = new Map<string, string>();
  for (const [id, element] of elements) kinds.set(id, element.kind);
  return { elements, kinds };
}
