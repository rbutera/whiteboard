"""Pydantic v2 models for every wire shape.

These are *derived surfaces* of the canonical JSON, not the normative form — the
wire JSON in ``spec/`` is truth (see #456). Element ``data`` is an open bag of
JSON values; every other object is closed (``extra="forbid"``) so a stray field
is a parse error, mirroring the TS ``z.strictObject`` schemas.
"""

import math
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from .errors import ErrorCode


def _wire_int(value: object) -> int:
    """Coerce a JSON number to an int the way JS does. JSON has no int/float
    distinction, so ``1.0`` is the integer 1 and TS's ``z.number()`` accepts it;
    strict pydantic would reject the float. Accept an int, or a finite float with
    an integral value (``1.0`` → 1); reject a non-integral float (``1.5``), a bool
    (the ``isinstance(True, int)`` trap), a string, and NaN/Infinity."""
    if isinstance(value, bool):
        raise ValueError("expected an integer, got a bool")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isfinite(value) and value.is_integer():
            return int(value)
        raise ValueError("expected an integral number")
    raise ValueError("expected an integer")


# A wire integer field: strict about type but JSON-number-honest about ``1.0``.
WireInt = Annotated[int, BeforeValidator(_wire_int)]


class _Strict(BaseModel):
    """Closed object: unknown fields are a parse error, and ``strict`` mode forbids
    the primitive coercions Zod's parser rejects — no int→bool (``required: 1``) or
    str→int (``cursor: "1"``). Integer wire fields use :data:`WireInt`, which keeps
    JS's JSON-number semantics (``1.0`` is the integer 1) while still rejecting a
    non-integral float, a bool, or a string. Element ``data`` values are ``Any``
    (untouched by strictness — ``validate`` types them). An aliased field (e.g.
    ``schema``) is addressed by its wire alias only — the Python attribute name
    (``schema_``) is NOT an accepted input key.

    Serialization mirrors Zod ``.optional()`` = *undefined* (never *null*): dumps go
    by alias, and a field left at its default (an omitted optional like ``many`` or
    ``cursor``) is omitted rather than emitted as ``null``/``false``."""

    model_config = ConfigDict(extra="forbid", strict=True)

    def model_dump(self, **kwargs: Any) -> dict[str, Any]:
        kwargs.setdefault("by_alias", True)
        kwargs.setdefault("exclude_defaults", True)
        return super().model_dump(**kwargs)


# — Elements & host schema ————————————————————————————————————————————————

AttributeType = Literal["string", "number", "boolean", "element", "json"]


class Element(_Strict):
    """The sole unit on the wire: ``{id, kind, data}``. ``data`` is open."""

    id: str
    kind: str
    data: dict[str, Any]


class Attribute(_Strict):
    """An attribute of a kind. ``many`` makes the value a list of the type."""

    name: str
    description: str
    type: AttributeType
    required: bool
    # Zod ``z.boolean().optional()``: omit or true/false, never null. Default False
    # (= omitted); strict mode rejects an explicit null.
    many: bool = False


class Kind(_Strict):
    id: str
    description: str
    attributes: list[Attribute]


class WireSchema(_Strict):
    kinds: list[Kind]


# — Op envelope (discriminated union on ``op``) ————————————————————————————


class CreateOp(_Strict):
    op: Literal["create"]
    op_id: str
    element: Element


class UpdateOp(_Strict):
    op: Literal["update"]
    op_id: str
    id: str
    data: dict[str, Any]


class DeleteOp(_Strict):
    op: Literal["delete"]
    op_id: str
    id: str


Op = Annotated[CreateOp | UpdateOp | DeleteOp, Field(discriminator="op")]


class Event(_Strict):
    seq: WireInt
    actor: str
    op: Op


# — Tool request/response shapes (SPEC.md §Wire shape) ————————————————————


class CreateRequest(_Strict):
    # ``schema`` shadows a deprecated BaseModel method; carry the wire key as an
    # alias and name the attribute ``schema_``.
    schema_: WireSchema = Field(alias="schema")


class CreateResponse(_Strict):
    board_id: str


class SchemaRequest(_Strict):
    board_id: str


class SchemaResponse(_Strict):
    schema_: WireSchema = Field(alias="schema")


class ApplyRequest(_Strict):
    board_id: str
    ops: list[Op]


class ApplyAccepted(_Strict):
    # ``ok`` is the discriminator and is REQUIRED (no default) — ``{}`` must not
    # parse as an accepted verdict, and a rejection must not be invented.
    ok: Literal[True]


class ApplyRejected(_Strict):
    ok: Literal[False]
    code: ErrorCode
    message: str


# The single-rejection verdict shape, discriminated on ``ok``. Doubles as the
# internal validation result (see ``validate``): one shape, one truth.
ApplyResponse = Annotated[ApplyAccepted | ApplyRejected, Field(discriminator="ok")]


class DescribeRequest(_Strict):
    board_id: str


class DescribeResponse(_Strict):
    board_id: str
    protocol_version: str


class EventsRequest(_Strict):
    board_id: str
    # Zod ``z.number().optional()``: omit (→ from the start) or a number, never
    # null. Default 0 (= omitted); WireInt rejects null/string, accepts 1.0.
    cursor: WireInt = 0


class EventsResponse(_Strict):
    events: list[Event]
    cursor: WireInt


class ScreenshotRequest(_Strict):
    board_id: str


class ScreenshotResponse(_Strict):
    mime_type: str
    base64: str
