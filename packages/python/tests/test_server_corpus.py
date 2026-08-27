"""Server corpus runner: the WHOLE corpus through BoardService. accept/ applies
cleanly; reject/ returns the code and leaves the log empty; project/ folds
batch-by-batch to the exact expect.state and expect.events. Same files as the TS
server runner, fail-not-skip."""

from typing import Any

import pytest

from corpus_loader import (
    FIXTURES_ROOT,
    ROOT_LAYOUT,
    assert_root_layout,
    load_fixtures,
    parse_events,
    parse_ops,
    parse_schema,
)
from wboard.core import ApplyAccepted, ApplyRejected, Element
from wboard.server import BoardService

assert_root_layout(FIXTURES_ROOT, ROOT_LAYOUT)

ACCEPT = load_fixtures(FIXTURES_ROOT / "accept")
REJECT = load_fixtures(FIXTURES_ROOT / "reject")
PROJECT = load_fixtures(FIXTURES_ROOT / "project")


def test_corpus_is_non_empty() -> None:
    assert ACCEPT and REJECT and PROJECT


@pytest.mark.parametrize("raw", [fx for _, fx in ACCEPT], ids=[name for name, _ in ACCEPT])
def test_accept_applies_cleanly(raw: dict[str, Any]) -> None:
    svc = BoardService()
    board = svc.create_board(parse_schema(raw["schema"]))
    result = svc.apply(board, parse_ops(raw["input"]["ops"]), "corpus")
    assert isinstance(result, ApplyAccepted)


@pytest.mark.parametrize("raw", [fx for _, fx in REJECT], ids=[name for name, _ in REJECT])
def test_reject_returns_code_and_appends_nothing(raw: dict[str, Any]) -> None:
    svc = BoardService()
    board = svc.create_board(parse_schema(raw["schema"]))
    result = svc.apply(board, parse_ops(raw["input"]["ops"]), "corpus")
    assert isinstance(result, ApplyRejected)
    assert result.code == raw["expect"]["reject"]
    assert svc.get_events(board).events == []


@pytest.mark.parametrize("raw", [fx for _, fx in PROJECT], ids=[name for name, _ in PROJECT])
def test_project_folds_to_declared_state_and_events(raw: dict[str, Any]) -> None:
    svc = BoardService()
    board = svc.create_board(parse_schema(raw["schema"]))

    for i, batch in enumerate(raw["batches"]):
        result = svc.apply(board, parse_ops(batch["ops"]), batch["actor"])
        if batch["expect"] == "accept":
            assert isinstance(result, ApplyAccepted), f"batch {i}"
        else:
            assert isinstance(result, ApplyRejected), f"batch {i}"
            assert result.code == batch["expect"]["reject"], f"batch {i}"

    expected_state = {eid: Element.model_validate(el) for eid, el in raw["expect"]["state"].items()}
    assert svc.get_state(board) == expected_state
    assert svc.get_events(board).events == parse_events(raw["expect"]["events"])
