"""Unit tests for ``validate`` — at least one accept + one reject per code, plus
the semantic traps (extras pass-through, within-batch mint, partial-merge typing,
create-delete-create, and the ``bool``-is-not-a-``number`` Python trap)."""

import json
from typing import Any

from pydantic import TypeAdapter

from wboard.core import ApplyAccepted, ApplyRejected, ErrorCode, Op, WireSchema, validate

OPS_ADAPTER: TypeAdapter[list[Op]] = TypeAdapter(list[Op])


def _schema(*attrs: dict[str, Any]) -> WireSchema:
    return WireSchema.model_validate(
        {"kinds": [{"id": "note", "description": "a note", "attributes": list(attrs)}]}
    )


def _attr(name: str, type_: str, required: bool = False, many: bool = False) -> dict[str, Any]:
    a: dict[str, Any] = {"name": name, "description": name, "type": type_, "required": required}
    if many:
        a["many"] = True
    return a


def _ops(*raw: dict[str, Any]) -> list[Op]:
    return OPS_ADAPTER.validate_python(list(raw))


def _create(op_id: str, eid: str, data: dict[str, Any], kind: str = "note") -> dict[str, Any]:
    return {"op": "create", "op_id": op_id, "element": {"id": eid, "kind": kind, "data": data}}


def _expect_code(schema: WireSchema, ops: list[Op], code: ErrorCode) -> None:
    result = validate(schema, ops, {})
    assert isinstance(result, ApplyRejected)
    assert result.code == code


def test_accept_minimal() -> None:
    assert isinstance(validate(_schema(), _ops(_create("o1", "x", {})), {}), ApplyAccepted)


def test_extras_pass_through() -> None:
    schema = _schema(_attr("text", "string"))
    ops = _ops(_create("o1", "x", {"text": "hi", "undeclared": {"anything": 1}}))
    assert isinstance(validate(schema, ops, {}), ApplyAccepted)


def test_unknown_kind() -> None:
    _expect_code(_schema(), _ops(_create("o1", "x", {}, kind="ghost")), "unknown-kind")


def test_missing_required() -> None:
    _expect_code(
        _schema(_attr("text", "string", required=True)),
        _ops(_create("o1", "x", {})),
        "missing-required",
    )


def test_wrong_type() -> None:
    schema = _schema(_attr("text", "string"))
    _expect_code(schema, _ops(_create("o1", "x", {"text": 5})), "wrong-type")


def test_bad_ref() -> None:
    schema = _schema(_attr("ref", "element"))
    _expect_code(schema, _ops(_create("o1", "x", {"ref": "nope"})), "bad-ref")


def test_unknown_element_on_update() -> None:
    _expect_code(
        _schema(),
        _ops({"op": "update", "op_id": "o1", "id": "ghost", "data": {}}),
        "unknown-element",
    )


def test_duplicate_id_live() -> None:
    schema = _schema()
    _expect_code(schema, _ops(_create("o1", "x", {}), _create("o2", "x", {})), "duplicate-id")


def test_within_batch_mint_then_reference() -> None:
    schema = _schema(_attr("ref", "element"))
    ops = _ops(_create("o1", "a", {}), _create("o2", "b", {"ref": "a"}))
    assert isinstance(validate(schema, ops, {}), ApplyAccepted)


def test_create_delete_create_is_duplicate_id() -> None:
    # ever-minted: re-using an id minted earlier in the batch, even if since
    # deleted, is a duplicate-id.
    schema = _schema()
    ops = _ops(
        _create("o1", "x", {}),
        {"op": "delete", "op_id": "o2", "id": "x"},
        _create("o3", "x", {}),
    )
    _expect_code(schema, ops, "duplicate-id")


def test_update_partial_merge_typing() -> None:
    schema = _schema(_attr("text", "string"), _attr("tag", "string"))
    # update supplies only `tag`; a wrong type there is caught, `text` untouched.
    ops = _ops(
        _create("o1", "x", {"text": "hi"}),
        {"op": "update", "op_id": "o2", "id": "x", "data": {"tag": 9}},
    )
    _expect_code(schema, ops, "wrong-type")


def test_update_preexisting_typechecks_against_kind() -> None:
    schema = _schema(_attr("text", "string"))
    ops = _ops({"op": "update", "op_id": "o1", "id": "x", "data": {"text": 1}})
    result = validate(schema, ops, {"x": "note"})
    assert isinstance(result, ApplyRejected)
    assert result.code == "wrong-type"


def test_true_is_not_a_number() -> None:
    # Python-only trap: isinstance(True, int) is True. A bool must fail number.
    schema = _schema(_attr("count", "number"))
    _expect_code(schema, _ops(_create("o1", "x", {"count": True})), "wrong-type")


def test_overflowing_int_is_not_a_number() -> None:
    # JS JSON.parse turns a 400-digit number into Infinity → Number.isFinite
    # rejects. A Python int of any size must match: it overflows float64 → not a
    # finite number → wrong-type. The value arrives exactly as JSON parses it.
    schema = _schema(_attr("count", "number"))
    huge = json.loads("1" + "0" * 400)  # a 401-digit int
    ops = _ops(_create("o1", "x", {"count": huge}))
    _expect_code(schema, ops, "wrong-type")


def test_number_accepts_int_and_float() -> None:
    schema = _schema(_attr("count", "number"))
    ops = _ops(_create("o1", "x", {"count": 3}), _create("o2", "y", {"count": 2.5}))
    assert isinstance(validate(schema, ops, {}), ApplyAccepted)


def test_many_is_list_of_base_type() -> None:
    schema = _schema(_attr("tags", "string", many=True))
    assert isinstance(validate(schema, _ops(_create("o1", "x", {"tags": []})), {}), ApplyAccepted)
    assert isinstance(
        validate(schema, _ops(_create("o2", "y", {"tags": ["a", "b"]})), {}), ApplyAccepted
    )
    _expect_code(schema, _ops(_create("o3", "z", {"tags": "notalist"})), "wrong-type")
    _expect_code(schema, _ops(_create("o4", "w", {"tags": ["ok", 5]})), "wrong-type")


def test_message_carries_description() -> None:
    schema = _schema(_attr("text", "string"))
    result = validate(schema, _ops(_create("o1", "x", {"text": 1})), {})
    assert isinstance(result, ApplyRejected)
    assert "text" in result.message
