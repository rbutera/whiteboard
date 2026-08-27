"""InMemoryBoardStore: contiguity, no-aliasing (deepcopy at every boundary), and
unknown-board reads return empty."""

from wboard.core import CreateOp, Element, WireSchema
from wboard.server import AppendEntry, InMemoryBoardStore

SCHEMA = WireSchema(kinds=[])


def _create(op_id: str, eid: str) -> CreateOp:
    return CreateOp(op="create", op_id=op_id, element=Element(id=eid, kind="note", data={}))


def test_seqs_contiguous_from_one_across_batches() -> None:
    store = InMemoryBoardStore()
    store.create_board("b", SCHEMA)
    first = store.append("b", [AppendEntry("a", _create("o1", "x"))])
    second = store.append(
        "b", [AppendEntry("a", _create("o2", "y")), AppendEntry("a", _create("o3", "z"))]
    )
    assert [e.seq for e in first] == [1]
    assert [e.seq for e in second] == [2, 3]


def test_no_aliasing_of_appended_op() -> None:
    store = InMemoryBoardStore()
    store.create_board("b", SCHEMA)
    op = _create("o1", "x")
    store.append("b", [AppendEntry("a", op)])
    # Mutate what we passed in — stored state must be unmoved.
    op.element.data["injected"] = True
    stored = store.get_events("b", 0)[0]
    assert isinstance(stored.op, CreateOp)
    assert stored.op.element.data == {}


def test_no_aliasing_of_read_events() -> None:
    store = InMemoryBoardStore()
    store.create_board("b", SCHEMA)
    store.append("b", [AppendEntry("a", _create("o1", "x"))])
    read = store.get_events("b", 0)
    assert isinstance(read[0].op, CreateOp)
    read[0].op.element.data["mutated"] = 1
    # Re-read: the store's copy is untouched.
    again = store.get_events("b", 0)
    assert isinstance(again[0].op, CreateOp)
    assert again[0].op.element.data == {}


def test_no_aliasing_of_stored_schema() -> None:
    store = InMemoryBoardStore()
    schema = WireSchema(kinds=[])
    store.create_board("b", schema)
    got = store.get_schema("b")
    assert got is not None and got is not schema


def test_unknown_board_reads_empty() -> None:
    store = InMemoryBoardStore()
    assert store.get_events("nope", 0) == []
    assert store.get_schema("nope") is None


def test_get_events_respects_after_seq() -> None:
    store = InMemoryBoardStore()
    store.create_board("b", SCHEMA)
    store.append("b", [AppendEntry("a", _create("o1", "x")), AppendEntry("a", _create("o2", "y"))])
    assert [e.seq for e in store.get_events("b", 1)] == [2]
