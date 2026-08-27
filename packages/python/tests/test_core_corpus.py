"""Core corpus runner: every accept/ + reject/ fixture through validate() from an
empty board, exact code on reject, enum closure both ways. The Python twin runs
the SAME files the TS runner does (fail-not-skip)."""

from typing import Any

import pytest

from corpus_loader import (
    FIXTURES_ROOT,
    ROOT_LAYOUT,
    assert_root_layout,
    load_fixtures,
    parse_ops,
    parse_schema,
)
from wboard.core import ERROR_CODES, ApplyAccepted, ApplyRejected, validate

# Root layout is closed before the loaders open their dirs.
assert_root_layout(FIXTURES_ROOT, ROOT_LAYOUT)

ACCEPT = load_fixtures(FIXTURES_ROOT / "accept")
REJECT = load_fixtures(FIXTURES_ROOT / "reject")


def test_corpus_is_non_empty() -> None:
    assert len(ACCEPT) > 0
    assert len(REJECT) > 0


@pytest.mark.parametrize("raw", [fx for _, fx in ACCEPT], ids=[name for name, _ in ACCEPT])
def test_accept_fixture(raw: dict[str, Any]) -> None:
    assert raw["expect"] == "accept"
    schema = parse_schema(raw["schema"])
    ops = parse_ops(raw["input"]["ops"])
    assert isinstance(validate(schema, ops, {}), ApplyAccepted)


@pytest.mark.parametrize("raw", [fx for _, fx in REJECT], ids=[name for name, _ in REJECT])
def test_reject_fixture(raw: dict[str, Any]) -> None:
    code = raw["expect"]["reject"]
    # Closure direction (b): every fixture's reject code is in the enum.
    assert code in ERROR_CODES
    schema = parse_schema(raw["schema"])
    ops = parse_ops(raw["input"]["ops"])
    result = validate(schema, ops, {})
    assert isinstance(result, ApplyRejected)
    assert result.code == code


def test_enum_closure_every_code_has_a_reject_fixture() -> None:
    # Closure direction (a): every enum code appears in at least one reject fixture.
    seen = {fx["expect"]["reject"] for _, fx in REJECT}
    for code in ERROR_CODES:
        assert code in seen
