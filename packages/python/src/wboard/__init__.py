"""``wboard`` — the Python twin of the whiteboard protocol.

Two modules mirror the TS packages' semantics (not their file structure):
``wboard.core`` (wire models, ``validate``, authoring) and ``wboard.server``
(store, projection fold, ``BoardService``). Conformance is proven by running the
shared ``spec/fixtures/`` corpus, the same files the TS twins run.
"""

from .core import PROTOCOL_VERSION

__all__ = ["PROTOCOL_VERSION"]
