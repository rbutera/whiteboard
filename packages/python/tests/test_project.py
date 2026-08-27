"""project() fold: create inserts, update shallow-merges top-level data keys,
delete removes, absent-id update/delete is a no-op (fold stays total)."""

from wboard.core import CreateOp, DeleteOp, Element, Event, UpdateOp
from wboard.server import project


def _ev(seq: int, op: CreateOp | UpdateOp | DeleteOp) -> Event:
    return Event(seq=seq, actor="a", op=op)


def _create(seq: int, eid: str, data: dict[str, object]) -> Event:
    return _ev(
        seq, CreateOp(op="create", op_id=f"c{seq}", element=Element(id=eid, kind="note", data=data))
    )


def test_create_inserts_and_maps_kind() -> None:
    proj = project([_create(1, "x", {"text": "hi"})])
    assert proj.elements["x"].data == {"text": "hi"}
    assert proj.kinds == {"x": "note"}


def test_update_shallow_merges_top_level() -> None:
    events = [
        _create(1, "x", {"text": "hi", "tag": "keep"}),
        _ev(2, UpdateOp(op="update", op_id="u1", id="x", data={"text": "edited"})),
    ]
    assert project(events).elements["x"].data == {"text": "edited", "tag": "keep"}


def test_update_replaces_below_top_level() -> None:
    events = [
        _create(1, "x", {"meta": {"a": 1, "b": 2}}),
        _ev(2, UpdateOp(op="update", op_id="u1", id="x", data={"meta": {"a": 9}})),
    ]
    # Nested object is replaced wholesale, not deep-merged.
    assert project(events).elements["x"].data == {"meta": {"a": 9}}


def test_delete_removes() -> None:
    events = [_create(1, "x", {}), _ev(2, DeleteOp(op="delete", op_id="d1", id="x"))]
    assert project(events).elements == {}


def test_absent_id_update_and_delete_are_noops() -> None:
    events = [
        _ev(1, UpdateOp(op="update", op_id="u1", id="ghost", data={"x": 1})),
        _ev(2, DeleteOp(op="delete", op_id="d1", id="ghost")),
    ]
    assert project(events).elements == {}


def test_create_element_not_mutated_by_later_update() -> None:
    create = _create(1, "x", {"text": "orig"})
    project([create, _ev(2, UpdateOp(op="update", op_id="u1", id="x", data={"text": "new"}))])
    # The fold must not mutate the create event's element in place.
    assert isinstance(create.op, CreateOp)
    assert create.op.element.data == {"text": "orig"}
