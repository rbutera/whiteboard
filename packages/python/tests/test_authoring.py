"""Authoring twin: compile_to_wire lowers to a schema the wire models parse, and
validate_authored agrees with validate() on the same inputs (no second
semantics)."""

from typing import Any

from pydantic import TypeAdapter

from wboard.core import Op, WireSchema, compile_to_wire, validate, validate_authored
from wboard.core.authoring import AuthoredAttribute, AuthoredKind

OPS_ADAPTER: TypeAdapter[list[Op]] = TypeAdapter(list[Op])

AUTHORED = {
    "note": AuthoredKind(
        description="a sticky note",
        attributes={
            "text": AuthoredAttribute(description="body", type="string", required=True),
            "tags": AuthoredAttribute(
                description="labels", type="string", required=False, many=True
            ),
            "ref": AuthoredAttribute(description="a link", type="element", required=False),
        },
    )
}


def _ops(*raw: dict[str, Any]) -> list[Op]:
    return OPS_ADAPTER.validate_python(list(raw))


def test_compile_output_parses_under_wire_models() -> None:
    compiled = compile_to_wire(AUTHORED)
    # Round-trip through the wire models proves no drift.
    reparsed = WireSchema.model_validate(compiled.model_dump())
    assert reparsed == compiled
    note = compiled.kinds[0]
    assert note.id == "note"
    tags = next(a for a in note.attributes if a.name == "tags")
    assert tags.many is True
    # Emission parity with TS compileToWire: many appears only when true, never
    # as null/false on the non-many attributes.
    dumped_attrs = {a["name"]: a for a in compiled.model_dump()["kinds"][0]["attributes"]}
    assert "many" not in dumped_attrs["text"]
    assert dumped_attrs["tags"]["many"] is True


def test_validate_authored_agrees_with_validate() -> None:
    wire = compile_to_wire(AUTHORED)
    cases = [
        _ops(
            {
                "op": "create",
                "op_id": "o1",
                "element": {"id": "x", "kind": "note", "data": {"text": "hi"}},
            }
        ),
        _ops({"op": "create", "op_id": "o1", "element": {"id": "x", "kind": "note", "data": {}}}),
        _ops(
            {
                "op": "create",
                "op_id": "o1",
                "element": {"id": "x", "kind": "note", "data": {"text": 5}},
            }
        ),
    ]
    for ops in cases:
        via_authored = validate_authored(AUTHORED, ops, {})
        via_wire = validate(wire, ops, {})
        assert via_authored == via_wire
