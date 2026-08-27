"""Shared corpus loader — the twin of the TS ``loadFixtures`` / ``assertRootLayout``.

The corpus is read **in place** from ``spec/fixtures/`` (repo-root-relative, the
same files the TS runners load); it is never copied into the package. A stray
file, a nested directory, or a non-``.gitkeep`` hidden entry throws — fail, never
skip (a silent skip lets a fixture never run and pass falsely).
"""

import json
from collections.abc import Set
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from wboard.core import Event, Op, WireSchema

# ``tests/corpus_loader.py`` → parents[3] is the repo root. A wrong N must fail
# loudly (the assert below), never yield zero fixtures silently.
FIXTURES_ROOT = Path(__file__).resolve().parents[3] / "spec" / "fixtures"
assert FIXTURES_ROOT.is_dir(), f"fixtures root not found: {FIXTURES_ROOT}"

ROOT_LAYOUT: frozenset[str] = frozenset({".gitkeep", "README.md", "accept", "reject", "project"})

OPS_ADAPTER: TypeAdapter[list[Op]] = TypeAdapter(list[Op])
EVENTS_ADAPTER: TypeAdapter[list[Event]] = TypeAdapter(list[Event])


def load_fixtures(directory: Path) -> list[tuple[str, dict[str, Any]]]:
    """Load every ``.json`` fixture in a corpus directory eagerly. Only
    ``.gitkeep`` is exempt; every other entry throws. A read or JSON error also
    propagates."""
    out: list[tuple[str, dict[str, Any]]] = []
    for entry in sorted(directory.iterdir(), key=lambda p: p.name):
        if entry.name == ".gitkeep":
            continue
        if entry.name.startswith(".") or entry.is_dir() or not entry.name.endswith(".json"):
            raise ValueError(f"unexpected non-fixture entry in corpus: {entry}")
        out.append((entry.name, json.loads(entry.read_text(encoding="utf8"))))
    return out


def assert_root_layout(root: Path, allowed: Set[str]) -> None:
    """The fixture root's own layout is closed too — anything not in ``allowed``
    throws, so a stray root fixture or an unexpected directory cannot go silently
    untested (the loaders only open the dirs named in ``allowed``)."""
    for entry in root.iterdir():
        if entry.name not in allowed:
            raise ValueError(f"unexpected entry in fixture root: {entry}")


def parse_schema(raw: dict[str, Any]) -> WireSchema:
    return WireSchema.model_validate(raw)


def parse_ops(raw: list[Any]) -> list[Op]:
    return OPS_ADAPTER.validate_python(raw)


def parse_events(raw: list[Any]) -> list[Event]:
    return EVENTS_ADAPTER.validate_python(raw)
