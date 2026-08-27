"""The projection of an event log: current elements and their kinds. State is
never stored — it is always this pure fold, so the same events always yield the
same projection. Twin of ``@wboard/server``'s ``project()``.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from ..core import CreateOp, DeleteOp, Element, Event, UpdateOp


@dataclass(frozen=True)
class Projection:
    #: Current elements by id — the board state embedders read.
    elements: dict[str, Element]
    #: id → kind, the shape :func:`validate` takes as its ``existing`` arg.
    kinds: dict[str, str]


def project(events: Iterable[Event]) -> Projection:
    """Fold an ordered event list into board state. In seq order: ``create``
    inserts, ``update`` **shallow-merges** the op's top-level ``data`` keys
    (untouched survive, supplied overwrite, passthrough survives; below top
    level is replaced), ``delete`` removes. Updates/deletes of an absent id are
    no-ops — a validated log never contains them, but the fold stays total for a
    raw-log rebuild."""
    elements: dict[str, Element] = {}
    for event in events:
        op = event.op
        if isinstance(op, CreateOp):
            elements[op.element.id] = op.element
        elif isinstance(op, UpdateOp):
            current = elements.get(op.id)
            if current is not None:
                elements[op.id] = current.model_copy(update={"data": {**current.data, **op.data}})
        elif isinstance(op, DeleteOp):
            elements.pop(op.id, None)
    kinds = {element_id: element.kind for element_id, element in elements.items()}
    return Projection(elements=elements, kinds=kinds)
