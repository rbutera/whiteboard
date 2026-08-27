"""Pydantic v2 models for every wire shape.

These are *derived surfaces* of the canonical JSON, not the normative form — the
wire JSON in ``spec/`` is truth (see #456). Element ``data`` is an open bag of
JSON values; every other object is closed (``extra="forbid"``) so a stray field
is a parse error, mirroring the TS ``z.strictObject`` schemas.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .errors import ErrorCode


class _Strict(BaseModel):
    """Closed object: unknown fields are a parse error, and ``strict`` mode forbids
    the primitive coercions Zod's parser rejects — no int→bool (``required: 1``),
    bool→int (``seq: true``), or str→int (``cursor: "1"``). JSON number semantics
    are preserved: a JSON integer still satisfies an ``int`` field, and element
    ``data`` values are ``Any`` (untouched by strictness — ``validate`` types them).
    ``populate_by_name`` lets aliased fields (e.g. ``schema``) also be set by name."""

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


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
    many: bool | None = None


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
    seq: int
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
    ok: Literal[True] = True


class ApplyRejected(_Strict):
    ok: Literal[False] = False
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
    cursor: int | None = None


class EventsResponse(_Strict):
    events: list[Event]
    cursor: int


class ScreenshotRequest(_Strict):
    board_id: str


class ScreenshotResponse(_Strict):
    mime_type: str
    base64: str
