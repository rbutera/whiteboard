"""Stateless, typed, all-or-nothing validation — the twin of ``@wboard/core``'s
``validate()``. Returns the first failure, or acceptance. The verdict must match
the TS side on every corpus fixture.
"""

import math
from collections.abc import Mapping, Sequence

from .errors import ErrorCode
from .wire import (
    ApplyAccepted,
    ApplyRejected,
    ApplyResponse,
    Attribute,
    AttributeType,
    CreateOp,
    DeleteOp,
    Op,
    UpdateOp,
    WireSchema,
)

_ACCEPT = ApplyAccepted(ok=True)


def _reject(code: ErrorCode, message: str) -> ApplyRejected:
    return ApplyRejected(ok=False, code=code, message=message)


def _is_number(value: object) -> bool:
    # A JSON number is finite and never a bool. ``isinstance(True, int)`` is a
    # Python-only trap the TS side never faces, so exclude bool explicitly.
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        # JS turns a huge JSON number into Infinity, which Number.isFinite
        # rejects; a Python int of any magnitude would pass. Match JS: a value
        # that overflows float64 is not a finite number.
        try:
            return math.isfinite(float(value))
        except OverflowError:
            return False
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _check_scalar(
    value: object, attr_type: AttributeType, live_ids: frozenset[str] | set[str]
) -> ErrorCode | None:
    """One scalar value against a declared type. ``element`` values are ids that
    must be live (already present or minted earlier in the batch)."""
    if attr_type == "string":
        return None if isinstance(value, str) else "wrong-type"
    if attr_type == "number":
        return None if _is_number(value) else "wrong-type"
    if attr_type == "boolean":
        return None if isinstance(value, bool) else "wrong-type"
    if attr_type == "json":
        return None
    # element
    if not isinstance(value, str):
        return "wrong-type"
    return None if value in live_ids else "bad-ref"


def _check_value(value: object, attr: Attribute, live_ids: set[str]) -> ErrorCode | None:
    """An attribute's value, honouring ``many`` (a list of the base type)."""
    if attr.many:
        if not isinstance(value, list):
            return "wrong-type"
        for item in value:
            code = _check_scalar(item, attr.type, live_ids)
            if code:
                return code
        return None
    return _check_scalar(value, attr.type, live_ids)


def _typed_message(attr: Attribute, code: ErrorCode) -> str:
    """Precise typed-failure message, carrying the attribute's description."""
    expected = f"{attr.type}[]" if attr.many else attr.type
    if code == "bad-ref":
        return f'attribute "{attr.name}" ({attr.description}) references an unknown element'
    return f'attribute "{attr.name}" ({attr.description}) has the wrong type; expected {expected}'


def validate(
    wire_schema: WireSchema,
    ops: Sequence[Op],
    existing: Mapping[str, str],
) -> ApplyResponse:
    """Validate a flat ordered ops list against a host schema.

    ``existing`` maps each already-present id to its kind (empty for a fresh
    board); the kind lets updates to pre-existing elements be type-checked.
    Within-batch minting and deletion are tracked. Undeclared ``data`` fields
    pass through. A create reusing any id live OR minted earlier in this batch
    (even if since deleted) is a ``duplicate-id``.
    """
    kinds = {k.id: k for k in wire_schema.kinds}
    live: set[str] = set(existing.keys())
    kind_of: dict[str, str] = dict(existing)
    ever_minted: set[str] = set()

    for op in ops:
        if isinstance(op, CreateOp):
            element = op.element
            declared = kinds.get(element.kind)
            if declared is None:
                return _reject("unknown-kind", f"unknown kind: {element.kind}")
            if element.id in live or element.id in ever_minted:
                return _reject("duplicate-id", f"element id already exists: {element.id}")
            for attr in declared.attributes:
                if attr.name not in element.data:
                    if attr.required:
                        return _reject(
                            "missing-required",
                            f'missing required attribute "{attr.name}": {attr.description}',
                        )
                    continue
                code = _check_value(element.data[attr.name], attr, live)
                if code:
                    return _reject(code, _typed_message(attr, code))
            live.add(element.id)
            ever_minted.add(element.id)
            kind_of[element.id] = element.kind
        elif isinstance(op, UpdateOp):
            if op.id not in live:
                return _reject("unknown-element", f"unknown element: {op.id}")
            kind_id = kind_of.get(op.id)
            declared = None if kind_id is None else kinds.get(kind_id)
            # A live id whose kind the schema does not declare cannot be
            # type-checked — fail closed as unknown-kind, never skip the checks.
            if declared is None:
                return _reject("unknown-kind", f"unknown kind: {kind_id or '(unmapped)'}")
            for attr in declared.attributes:
                if attr.name not in op.data:
                    continue
                code = _check_value(op.data[attr.name], attr, live)
                if code:
                    return _reject(code, _typed_message(attr, code))
        elif isinstance(op, DeleteOp):
            if op.id not in live:
                return _reject("unknown-element", f"unknown element: {op.id}")
            live.discard(op.id)

    return _ACCEPT
