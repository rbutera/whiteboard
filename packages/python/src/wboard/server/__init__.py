"""``wboard.server`` — the reference board service: store, projection fold, and
the synchronous :class:`BoardService`. Twin of ``@wboard/server``.
"""

from ..core import PROTOCOL_VERSION
from .project import Projection, project
from .service import BoardService
from .store import AppendEntry, BoardStore, InMemoryBoardStore

# The protocol version this server implements, sourced from ``wboard.core``.
IMPLEMENTED_PROTOCOL_VERSION = PROTOCOL_VERSION

__all__ = [
    "IMPLEMENTED_PROTOCOL_VERSION",
    "PROTOCOL_VERSION",
    "AppendEntry",
    "BoardService",
    "BoardStore",
    "InMemoryBoardStore",
    "Projection",
    "project",
]
