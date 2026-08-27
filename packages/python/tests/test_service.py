"""BoardService: replay idempotence, mid-batch reject appends nothing,
attribution, cursor round-trip, describe, and unknown-board raises."""

from typing import Any

import pytest
from pydantic import TypeAdapter

from wboard.core import ApplyAccepted, ApplyRejected, Op, WireSchema
from wboard.server import BoardService

OPS_ADAPTER: TypeAdapter[list[Op]] = TypeAdapter(list[Op])

SCHEMA = WireSchema.model_validate(
    {
        "kinds": [
            {
                "id": "note",
                "description": "a note",
                "attributes": [
                    {"name": "text", "description": "body", "type": "string", "required": False}
                ],
            }
        ]
    }
)


def _create(op_id: str, eid: str, text: str) -> dict[str, Any]:
    return {
        "op": "create",
        "op_id": op_id,
        "element": {"id": eid, "kind": "note", "data": {"text": text}},
    }


def _ops(*raw: dict[str, Any]) -> list[Op]:
    return OPS_ADAPTER.validate_python(list(raw))


def test_apply_accepts_and_appends() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    assert isinstance(svc.apply(board, _ops(_create("o1", "x", "hi")), "alice"), ApplyAccepted)
    events = svc.get_events(board).events
    assert [e.seq for e in events] == [1]
    assert events[0].actor == "alice"


def test_replay_is_idempotent() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    batch = _ops(_create("o1", "x", "hi"))
    assert isinstance(svc.apply(board, batch, "alice"), ApplyAccepted)
    # Same op_id replayed: dedup drops it, appends nothing, still ok.
    assert isinstance(svc.apply(board, batch, "alice"), ApplyAccepted)
    assert len(svc.get_events(board).events) == 1


def test_within_batch_duplicate_op_id_deduped() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    ops = _ops(_create("o1", "x", "one"), _create("o1", "y", "two"))
    assert isinstance(svc.apply(board, ops, "alice"), ApplyAccepted)
    assert len(svc.get_events(board).events) == 1


def test_mid_batch_reject_appends_nothing() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    ops = _ops(
        _create("o1", "x", "kept"),
        {"op": "update", "op_id": "o2", "id": "ghost", "data": {"text": "no"}},
    )
    result = svc.apply(board, ops, "alice")
    assert isinstance(result, ApplyRejected)
    assert result.code == "unknown-element"
    assert svc.get_events(board).events == []


def test_two_actors_attributed() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    svc.apply(board, _ops(_create("o1", "x", "a")), "alice")
    svc.apply(board, _ops(_create("o2", "y", "b")), "bob")
    actors = [e.actor for e in svc.get_events(board).events]
    assert actors == ["alice", "bob"]


def test_cursor_round_trip() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    svc.apply(board, _ops(_create("o1", "x", "a"), _create("o2", "y", "b")), "alice")
    first = svc.get_events(board, 0)
    assert first.cursor == 2
    # Nothing newer: cursor is echoed back.
    empty = svc.get_events(board, 2)
    assert empty.events == []
    assert empty.cursor == 2


def test_describe_reports_protocol_version() -> None:
    svc = BoardService()
    board = svc.create_board(SCHEMA)
    assert svc.describe(board).protocol_version == "0.1"


def test_unknown_board_raises_everywhere() -> None:
    svc = BoardService()
    with pytest.raises(LookupError):
        svc.get_schema("nope")
    with pytest.raises(LookupError):
        svc.describe("nope")
    with pytest.raises(LookupError):
        svc.get_events("nope")
    with pytest.raises(LookupError):
        svc.get_state("nope")
    with pytest.raises(LookupError):
        svc.apply("nope", _ops(_create("o1", "x", "a")), "alice")
