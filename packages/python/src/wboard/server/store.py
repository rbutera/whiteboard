"""The pluggable persistence contract — log + schema only. State is never
stored: it is always a projection of the log (see :mod:`wboard.server.project`).

Twin of ``@wboard/server``'s store. **Ownership**: an implementation MUST NOT
alias caller-supplied memory — ``copy.deepcopy`` at every boundary (stored on
write, copied on every read) is the twin of the TS ``structuredClone`` rule.
Sync, not async: the in-memory store does no I/O and CPython makes append atomic
the same way single-threaded JS does.
"""

import copy
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

from ..core import Event, Op, WireSchema


@dataclass(frozen=True)
class AppendEntry:
    """One log entry to append: an op attributed to an actor. The store assigns
    the seq — the caller supplies only the op and who acted."""

    actor: str
    op: Op


class BoardStore(Protocol):
    """Log + schema persistence. A conforming store need only honour this."""

    def create_board(self, board_id: str, schema: WireSchema) -> None:
        """Register a board under ``board_id`` with its declared wire schema."""
        ...

    def get_schema(self, board_id: str) -> WireSchema | None:
        """The board's declared schema, or ``None`` for an unknown board."""
        ...

    def append(self, board_id: str, entries: Sequence[AppendEntry]) -> list[Event]:
        """Atomically append ``entries``, assigning each a contiguous ``seq``
        (the log starts at 1). A batch lands contiguously or not at all."""
        ...

    def get_events(self, board_id: str, after_seq: int) -> list[Event]:
        """Events with ``seq > after_seq``, in seq order. An unknown board yields
        an empty list — reads never throw on absence."""
        ...


@dataclass
class _Board:
    schema: WireSchema
    events: list[Event] = field(default_factory=list)


class InMemoryBoardStore:
    """The reference :class:`BoardStore`: an in-process append-only log per
    board. Single-threaded execution makes append trivially atomic. No
    persistence beyond the process."""

    def __init__(self) -> None:
        self._boards: dict[str, _Board] = {}

    def create_board(self, board_id: str, schema: WireSchema) -> None:
        if board_id in self._boards:
            raise ValueError(f"board already exists: {board_id}")
        self._boards[board_id] = _Board(schema=copy.deepcopy(schema))

    def get_schema(self, board_id: str) -> WireSchema | None:
        board = self._boards.get(board_id)
        return None if board is None else copy.deepcopy(board.schema)

    def append(self, board_id: str, entries: Sequence[AppendEntry]) -> list[Event]:
        board = self._boards.get(board_id)
        if board is None:
            raise ValueError(f"unknown board: {board_id}")
        base = len(board.events)
        appended = [
            Event(seq=base + i + 1, actor=entry.actor, op=copy.deepcopy(entry.op))
            for i, entry in enumerate(entries)
        ]
        board.events.extend(appended)
        return copy.deepcopy(appended)

    def get_events(self, board_id: str, after_seq: int) -> list[Event]:
        board = self._boards.get(board_id)
        if board is None:
            return []
        return copy.deepcopy([e for e in board.events if e.seq > after_seq])
