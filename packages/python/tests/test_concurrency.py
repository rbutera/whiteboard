"""Per-board serialization (SPEC.md §Concurrency MUST). Two threads apply the
SAME create op at once. To make the read/dedup/validate/append race deterministic
(a bare Barrier doesn't reliably widen the window under the GIL), the store sleeps
at the START of append — the log stays empty while both threads finish reading.

- Without the per-board lock: both read the empty log, both dedup clean, both
  validate against the empty projection, both append the same op_id → 2 events.
  This test fails on that code.
- With the lock: the second thread cannot read until the first has appended and
  released, so it dedups to a no-op → exactly 1 event.
"""

import threading
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor

from pydantic import TypeAdapter

from wboard.core import ApplyAccepted, Event, Op, WireSchema
from wboard.server import BoardService, InMemoryBoardStore
from wboard.server.store import AppendEntry

OPS_ADAPTER: TypeAdapter[list[Op]] = TypeAdapter(list[Op])
SCHEMA = WireSchema.model_validate(
    {"kinds": [{"id": "note", "description": "a note", "attributes": []}]}
)


class _SlowAppendStore(InMemoryBoardStore):
    """Delays the start of append so the log stays empty while both threads read —
    makes the read→append race deterministic, not luck."""

    def append(self, board_id: str, entries: Sequence[AppendEntry]) -> list[Event]:
        time.sleep(0.05)
        return super().append(board_id, entries)


def _same_create() -> list[Op]:
    return OPS_ADAPTER.validate_python(
        [{"op": "create", "op_id": "dup", "element": {"id": "x", "kind": "note", "data": {}}}]
    )


def test_concurrent_apply_of_same_op_appends_once() -> None:
    svc = BoardService(_SlowAppendStore())
    board = svc.create_board(SCHEMA)
    barrier = threading.Barrier(2)

    def worker() -> object:
        ops = _same_create()
        barrier.wait()  # release both into apply() together
        return svc.apply(board, ops, "actor")

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [f.result() for f in [pool.submit(worker), pool.submit(worker)]]

    assert all(isinstance(r, ApplyAccepted) for r in results)
    events = svc.get_events(board).events
    assert len(events) == 1
    assert events[0].op.op_id == "dup"
