"""The host-schema authoring surface (#455: "Zod/Pydantic author → wire schema").

One honest layer: **authoring is convenience, the wire is truth.** The kit
invents no validation of its own — :func:`validate_authored` compiles to wire
and defers to :func:`validate`. The drift test proves the compiler always emits
output the wire models parse.
"""

from collections.abc import Mapping, Sequence

from .validate import validate
from .wire import ApplyResponse, Attribute, AttributeType, Kind, Op, WireSchema, _Strict


class AuthoredAttribute(_Strict):
    """An authored attribute: the wire attribute minus its ``name`` (the name is
    the key in its kind's ``attributes`` map)."""

    description: str
    type: AttributeType
    required: bool
    many: bool | None = None


class AuthoredKind(_Strict):
    """An authored kind: a description and its attributes, keyed by name."""

    description: str
    attributes: dict[str, AuthoredAttribute]


# An authored host schema: kinds keyed by kind id.
AuthoredSchema = dict[str, AuthoredKind]


def compile_to_wire(authored: AuthoredSchema) -> WireSchema:
    """Lower an authored schema to the canonical wire schema. Kind ids and
    attribute names come from the map keys; ``many`` is emitted only when set."""
    return WireSchema(
        kinds=[
            Kind(
                id=kind_id,
                description=kind.description,
                attributes=[
                    Attribute(
                        name=name,
                        description=attr.description,
                        type=attr.type,
                        required=attr.required,
                        many=True if attr.many else None,
                    )
                    for name, attr in kind.attributes.items()
                ],
            )
            for kind_id, kind in authored.items()
        ]
    )


def validate_authored(
    authored: AuthoredSchema,
    ops: Sequence[Op],
    existing: Mapping[str, str],
) -> ApplyResponse:
    """Validate ops against an authored schema: compile to wire, then defer to
    :func:`validate`. The kit adds no second validation semantics of its own."""
    return validate(compile_to_wire(authored), ops, existing)
