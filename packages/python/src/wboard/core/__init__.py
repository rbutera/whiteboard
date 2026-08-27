"""``wboard.core`` — the wire contract, validation, and authoring surface.

The Python twin of ``@wboard/core``: derived surfaces of the canonical wire
JSON, whose semantics are proven by the shared ``spec/fixtures/`` corpus.
"""

from .authoring import (
    AuthoredAttribute,
    AuthoredKind,
    AuthoredSchema,
    compile_to_wire,
    validate_authored,
)
from .errors import ERROR_CODES, ErrorCode
from .validate import validate
from .wire import (
    ApplyAccepted,
    ApplyRejected,
    ApplyRequest,
    ApplyResponse,
    Attribute,
    AttributeType,
    CreateOp,
    CreateRequest,
    CreateResponse,
    DeleteOp,
    DescribeRequest,
    DescribeResponse,
    Element,
    Event,
    EventsRequest,
    EventsResponse,
    Kind,
    Op,
    SchemaRequest,
    SchemaResponse,
    ScreenshotRequest,
    ScreenshotResponse,
    UpdateOp,
    WireSchema,
)

# The protocol version this twin implements. SPEC.md owns the value; the twin
# claiming ``0.1`` matches every fixture the TS side does (#456).
PROTOCOL_VERSION = "0.1"

__all__ = [
    "ERROR_CODES",
    "PROTOCOL_VERSION",
    "ApplyAccepted",
    "ApplyRejected",
    "ApplyRequest",
    "ApplyResponse",
    "Attribute",
    "AttributeType",
    "AuthoredAttribute",
    "AuthoredKind",
    "AuthoredSchema",
    "CreateOp",
    "CreateRequest",
    "CreateResponse",
    "DeleteOp",
    "DescribeRequest",
    "DescribeResponse",
    "Element",
    "ErrorCode",
    "Event",
    "EventsRequest",
    "EventsResponse",
    "Kind",
    "Op",
    "SchemaRequest",
    "SchemaResponse",
    "ScreenshotRequest",
    "ScreenshotResponse",
    "UpdateOp",
    "WireSchema",
    "compile_to_wire",
    "validate",
    "validate_authored",
]
