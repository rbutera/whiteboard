"""Wire models: round-trip parse from raw JSON dicts, and a bad discriminator
fails."""

from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from wboard.core import (
    ApplyRequest,
    CreateRequest,
    CreateResponse,
    DescribeResponse,
    Element,
    Event,
    EventsResponse,
    Op,
    WireSchema,
)

OPS_ADAPTER: TypeAdapter[list[Op]] = TypeAdapter(list[Op])


def test_element_roundtrip() -> None:
    raw = {"id": "x", "kind": "note", "data": {"text": "hi", "n": 3}}
    assert Element.model_validate(raw).model_dump() == raw


def test_element_rejects_extra_top_level_field() -> None:
    with pytest.raises(ValidationError):
        Element.model_validate({"id": "x", "kind": "note", "data": {}, "stray": 1})


def test_schema_roundtrip_with_many_and_optional() -> None:
    raw: dict[str, Any] = {
        "kinds": [
            {
                "id": "note",
                "description": "a note",
                "attributes": [
                    {"name": "text", "description": "body", "type": "string", "required": True},
                    {
                        "name": "tags",
                        "description": "labels",
                        "type": "string",
                        "required": False,
                        "many": True,
                    },
                ],
            }
        ]
    }
    assert WireSchema.model_validate(raw).kinds[0].attributes[1].many is True


def test_ops_discriminated_union_roundtrip() -> None:
    raw: list[Any] = [
        {"op": "create", "op_id": "o1", "element": {"id": "x", "kind": "note", "data": {}}},
        {"op": "update", "op_id": "o2", "id": "x", "data": {"text": "e"}},
        {"op": "delete", "op_id": "o3", "id": "x"},
    ]
    ops = OPS_ADAPTER.validate_python(raw)
    assert [o.op for o in ops] == ["create", "update", "delete"]


def test_unknown_op_verb_fails() -> None:
    with pytest.raises(ValidationError):
        OPS_ADAPTER.validate_python([{"op": "frobnicate", "op_id": "o1"}])


def test_event_roundtrip() -> None:
    raw: dict[str, Any] = {
        "seq": 1,
        "actor": "alice",
        "op": {"op": "delete", "op_id": "o1", "id": "x"},
    }
    assert Event.model_validate(raw).seq == 1


def test_tool_shapes_roundtrip() -> None:
    assert CreateResponse.model_validate({"board_id": "b1"}).board_id == "b1"
    assert (
        DescribeResponse.model_validate(
            {"board_id": "b1", "protocol_version": "0.1"}
        ).protocol_version
        == "0.1"
    )
    apply_req = ApplyRequest.model_validate(
        {"board_id": "b1", "ops": [{"op": "delete", "op_id": "o1", "id": "x"}]}
    )
    assert len(apply_req.ops) == 1
    ev = EventsResponse.model_validate({"events": [], "cursor": 0})
    assert ev.cursor == 0


def test_create_request_schema_alias_roundtrips() -> None:
    raw: dict[str, Any] = {"schema": {"kinds": []}}
    req = CreateRequest.model_validate(raw)
    assert req.schema_.kinds == []
    assert req.model_dump(by_alias=True) == raw
