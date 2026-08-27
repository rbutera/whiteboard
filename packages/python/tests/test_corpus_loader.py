"""The loader is fail-not-skip: a stray file, a nested dir, or a non-.gitkeep
hidden entry throws; .gitkeep is the only exemption; the fixture root layout is
closed. Mirrors the TS loader tests."""

from pathlib import Path

import pytest

from corpus_loader import ROOT_LAYOUT, assert_root_layout, load_fixtures


def test_stray_non_json_file_throws(tmp_path: Path) -> None:
    (tmp_path / "notes.txt").write_text("not a fixture")
    with pytest.raises(ValueError, match="unexpected non-fixture entry"):
        load_fixtures(tmp_path)


def test_nested_directory_throws(tmp_path: Path) -> None:
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "a.json").write_text("{}")
    with pytest.raises(ValueError, match="unexpected non-fixture entry"):
        load_fixtures(tmp_path)


def test_gitkeep_only_is_exempt(tmp_path: Path) -> None:
    (tmp_path / ".gitkeep").write_text("")
    assert load_fixtures(tmp_path) == []


def test_hidden_non_gitkeep_throws(tmp_path: Path) -> None:
    (tmp_path / ".bad.json").write_text("{}")
    with pytest.raises(ValueError, match="unexpected non-fixture entry"):
        load_fixtures(tmp_path)


def test_root_layout_rejects_unexpected_entry(tmp_path: Path) -> None:
    (tmp_path / "accept").mkdir()
    (tmp_path / "surprise").mkdir()
    with pytest.raises(ValueError, match="unexpected entry in fixture root"):
        assert_root_layout(tmp_path, ROOT_LAYOUT)


def test_loads_a_valid_fixture(tmp_path: Path) -> None:
    (tmp_path / "a.json").write_text('{"ok": true}')
    assert load_fixtures(tmp_path) == [("a.json", {"ok": True})]


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_constants_rejected(tmp_path: Path, token: str) -> None:
    # JSON.parse throws on these; the loader must too, not silently accept a
    # non-finite float the wire cannot carry.
    (tmp_path / "bad.json").write_text(f'{{"n": {token}}}')
    with pytest.raises(ValueError, match="non-finite JSON constant"):
        load_fixtures(tmp_path)
