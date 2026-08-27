"""The embeddable reference board service — an in-process library over a
:class:`BoardStore`, no transport, no sessions, no auth. Truth is the store's
append-only attributed event log; state is the :func:`project` fold of it,
rebuilt per call. Synchronous: single-threaded execution is the whole
concurrency story for the in-memory reference (a durable store owns its own).

Unknown ``board_id`` raises a plain exception everywhere — the closed error enum
belongs to ``apply`` validation only.
"""

from collections.abc import Sequence
from uuid import uuid4

from ..core import (
    PROTOCOL_VERSION,
    ApplyAccepted,
    ApplyRejected,
    ApplyResponse,
    DescribeResponse,
    Element,
    EventsResponse,
    Op,
    WireSchema,
    validate,
)
from .project import project
from .store import AppendEntry, BoardStore, InMemoryBoardStore


class BoardService:
    def __init__(self, store: BoardStore | None = None) -> None:
        self._store: BoardStore = store if store is not None else InMemoryBoardStore()

    def create_board(self, schema: WireSchema) -> str:
        """Mint a board id, store its declared schema, return the id."""
        board_id = str(uuid4())
        self._store.create_board(board_id, schema)
        return board_id

    def get_schema(self, board_id: str) -> WireSchema:
        """The board's declared schema. Raises if the board is unknown."""
        return self._require_schema(board_id)

    def describe(self, board_id: str) -> DescribeResponse:
        """Board metadata + the implemented protocol version. Raises if unknown."""
        self._require_schema(board_id)
        return DescribeResponse(board_id=board_id, protocol_version=PROTOCOL_VERSION)

    def get_events(self, board_id: str, cursor: int = 0) -> EventsResponse:
        """Events with ``seq > cursor`` (default 0), in order. The returned
        ``cursor`` is the last served event's seq, or the request's cursor when
        nothing is new. Raises if the board is unknown."""
        self._require_schema(board_id)
        events = self._store.get_events(board_id, cursor)
        last = events[-1].seq if events else cursor
        return EventsResponse(events=events, cursor=last)

    def get_state(self, board_id: str) -> dict[str, Element]:
        """The projected board state — a library API for embedders, not a wire
        tool. Raises if the board is unknown."""
        self._require_schema(board_id)
        log = self._store.get_events(board_id, 0)
        return project(log).elements

    def apply(self, board_id: str, ops: Sequence[Op], actor: str) -> ApplyResponse:
        """Apply a flat ordered ops list, all-or-nothing, attributing each
        accepted op to ``actor``. In order:

        1. **dedup** — drop any op whose ``op_id`` already appears in the log or
           earlier in this same batch (before validation). An all-duplicate
           batch returns accepted and appends nothing: replay is idempotent.
        2. **validate** — against the projection's id→kind map, all-or-nothing;
           a rejection is returned verbatim and appends nothing.
        3. **append** — one event per surviving op, atomically, actor recorded.

        Raises if the board is unknown."""
        schema = self._require_schema(board_id)
        log = self._store.get_events(board_id, 0)

        seen = {event.op.op_id for event in log}
        survivors: list[Op] = []
        for op in ops:
            if op.op_id in seen:
                continue
            seen.add(op.op_id)
            survivors.append(op)
        if not survivors:
            return ApplyAccepted()

        result = validate(schema, survivors, project(log).kinds)
        if isinstance(result, ApplyRejected):
            return result

        self._store.append(board_id, [AppendEntry(actor=actor, op=op) for op in survivors])
        return ApplyAccepted()

    def _require_schema(self, board_id: str) -> WireSchema:
        schema = self._store.get_schema(board_id)
        if schema is None:
            raise LookupError(f"unknown board: {board_id}")
        return schema
