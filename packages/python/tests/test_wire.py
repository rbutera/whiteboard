"""Wire models: round-trip parse from raw JSON dicts, and a bad discriminator
fails."""

import json
from typing import Any

import pytest
from pydantic import BaseModel, TypeAdapter, ValidationError

from wboard.core import (
    ApplyRequest,
    ApplyResponse,
    Attribute,
    CreateRequest,
    CreateResponse,
    DescribeResponse,
    Element,
    Event,
    EventsRequest,
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


def test_strict_rejects_coercions_zod_rejects() -> None:
    # Zod rejects all three; pydantic without strict would coerce them.
    with pytest.raises(ValidationError):  # int → bool
        Attribute.model_validate({"name": "n", "description": "d", "type": "string", "required": 1})
    with pytest.raises(ValidationError):  # bool → int
        Event.model_validate(
            {"seq": True, "actor": "a", "op": {"op": "delete", "op_id": "o", "id": "x"}}
        )
    with pytest.raises(ValidationError):  # str → int
        EventsResponse.model_validate({"events": [], "cursor": "1"})


def test_strict_preserves_json_number_semantics() -> None:
    # A JSON integer still satisfies an int field (seq/cursor).
    assert (
        Event.model_validate(
            {"seq": 3, "actor": "a", "op": {"op": "delete", "op_id": "o", "id": "x"}}
        ).seq
        == 3
    )
    assert EventsResponse.model_validate({"events": [], "cursor": 7}).cursor == 7


def test_integer_fields_accept_integral_float_like_js() -> None:
    # JS has no int/float split: JSON 1.0 parses to 1 and z.number() accepts it.
    # A wire integer field must match — 1.0 is 1 — while still rejecting a
    # non-integral float, a bool, and a string. Probe via JSON (1.0 specifically).
    assert EventsResponse.model_validate_json('{"events": [], "cursor": 1.0}').cursor == 1
    assert (
        Event.model_validate_json(
            '{"seq": 2.0, "actor": "a", "op": {"op": "delete", "op_id": "o", "id": "x"}}'
        ).seq
        == 2
    )
    with pytest.raises(ValidationError):  # non-integral float
        EventsResponse.model_validate_json('{"events": [], "cursor": 1.5}')
    with pytest.raises(ValidationError):  # bool
        EventsResponse.model_validate({"events": [], "cursor": True})
    with pytest.raises(ValidationError):  # string
        EventsResponse.model_validate_json('{"events": [], "cursor": "1"}')


def test_apply_response_requires_ok_discriminator() -> None:
    adapter: TypeAdapter[Any] = TypeAdapter(ApplyResponse)
    with pytest.raises(ValidationError):  # {} must not parse as ok:true
        adapter.validate_python({})
    assert adapter.validate_python({"ok": True}).ok is True
    rej = adapter.validate_python({"ok": False, "code": "wrong-type", "message": "m"})
    assert rej.ok is False and rej.code == "wrong-type"


def test_events_request_cursor_optional_not_nullable() -> None:
    assert EventsRequest.model_validate({"board_id": "b"}).cursor == 0  # omitted OK
    assert EventsRequest.model_validate({"board_id": "b", "cursor": 5}).cursor == 5
    with pytest.raises(ValidationError):  # explicit null rejected
        EventsRequest.model_validate({"board_id": "b", "cursor": None})


def test_attribute_many_emission_omits_when_not_true() -> None:
    base = {"name": "n", "description": "d", "type": "string", "required": False}
    assert Attribute.model_validate({**base, "many": False}).model_dump() == base
    assert Attribute.model_validate({**base, "many": True}).model_dump() == {**base, "many": True}
    assert Attribute.model_validate(base).model_dump() == base  # omitted stays omitted
    with pytest.raises(ValidationError):  # null rejected
        Attribute.model_validate({**base, "many": None})


def test_create_request_schema_alias_roundtrips() -> None:
    raw: dict[str, Any] = {"schema": {"kinds": []}}
    req = CreateRequest.model_validate(raw)
    assert req.schema_.kinds == []
    # Default dump emits the wire key "schema", never the Python name "schema_".
    assert req.model_dump() == raw
    # And "schema_" is not an accepted external key (extra=forbid, no alias match).
    with pytest.raises(ValidationError):
        CreateRequest.model_validate({"schema_": {"kinds": []}})


def _all_dump_paths(model: BaseModel) -> list[dict[str, Any]]:
    """The four serialization paths, each as a dict: model_dump, model_dump_json,
    TypeAdapter.dump_python, TypeAdapter.dump_json. They must all agree."""
    ta: TypeAdapter[Any] = TypeAdapter(type(model))
    return [
        model.model_dump(),
        json.loads(model.model_dump_json()),
        ta.dump_python(model),
        json.loads(ta.dump_json(model)),
    ]


def test_every_serialization_path_agrees() -> None:
    # All four dump calls must emit the same wire JSON: unset optionals omitted
    # (never null/false/0), aliases used. serialize_by_alias needs pydantic 2.11+.
    attr_base = {"name": "n", "description": "d", "type": "string", "required": False}
    for dumped in _all_dump_paths(Attribute.model_validate(attr_base)):  # many unset
        assert dumped == attr_base  # no "many": false anywhere

    for dumped in _all_dump_paths(EventsRequest.model_validate({"board_id": "b"})):  # cursor unset
        assert "cursor" not in dumped  # no "cursor": 0 anywhere

    for dumped in _all_dump_paths(CreateRequest.model_validate({"schema": {"kinds": []}})):
        assert "schema" in dumped and "schema_" not in dumped  # aliased on every path
