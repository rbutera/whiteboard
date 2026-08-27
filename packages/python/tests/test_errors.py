"""The error enum is closed and exactly six, both directions."""

from typing import get_args

from wboard.core import ERROR_CODES
from wboard.core.errors import ErrorCode


def test_exactly_six_codes() -> None:
    assert len(ERROR_CODES) == 6
    assert len(set(ERROR_CODES)) == 6


def test_tuple_matches_literal_both_ways() -> None:
    assert set(ERROR_CODES) == set(get_args(ErrorCode))
