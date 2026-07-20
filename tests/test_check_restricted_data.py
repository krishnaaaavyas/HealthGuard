"""Synthetic-only tests for the restricted-data protection checker."""

from pathlib import Path

import pytest

from scripts import check_restricted_data as checker


def _restricted_root_one() -> str:
    return "C:" + "\\HealthGuard-Restricted-Data"


def _restricted_root_two() -> str:
    return "C:" + "\\LASI-Research"


def test_required_gitignore_patterns_are_present():
    rules = Path(".gitignore").read_text(encoding="utf-8").splitlines()
    required = {
        "*.dta", "*.sav", "*.sas7bdat", "*.xpt", "*.parquet",
        "*.feather", "*.arrow", "*.pkl", "*.pickle", "*.joblib",
        "*.onnx", ".env", ".env.*", "restricted-data/", "private-data/",
        "derived-secure/", "model-output/", "evaluation-output/",
    }
    assert required <= set(rules)


@pytest.mark.parametrize(
    "filename",
    [
        "sample.dta", "sample.sav", "sample.sas7bdat", "sample.xpt",
        "cohort.parquet", "cohort.feather", "cohort.arrow", "model.pkl",
        "model.pickle", "model.joblib", "model.onnx",
    ],
)
def test_restricted_extensions_fail(filename):
    assert checker.filename_violations(filename)


@pytest.mark.parametrize(
    "filename,expected_reason",
    [
        ("exports/participant_level.csv", "participant-level"),
        ("exports/merged_cohort.jsonl", "participant-level"),
        ("exports/model_predictions.csv", "model prediction"),
        ("exports/screening_probabilities.tsv", "model prediction"),
    ],
)
def test_derived_records_and_predictions_fail(filename, expected_reason):
    reasons = checker.filename_violations(filename)
    assert any(expected_reason in reason for reason in reasons)


def test_restricted_directory_names_fail():
    for directory in checker.RESTRICTED_DIRECTORY_NAMES:
        assert checker.filename_violations(f"{directory}/notes.txt")


def test_approved_variable_mentions_are_allowed():
    text = "Approved schema fields include prim_key and hba1c."
    assert checker.inspect_entry("training/audit.py", text) == []
    assert checker.inspect_entry("docs/schema.md", text) == []


def test_absolute_restricted_paths_fail_without_echoing_content():
    for root in (_restricted_root_one(), _restricted_root_two()):
        violations = checker.content_violations(root + "\\wave1\\sample.dta")
        assert violations == ["absolute path under a restricted external root"]


def test_directory_scan_uses_only_temporary_fake_files(tmp_path):
    (tmp_path / "safe.py").write_text("FIELDS = ['prim_key', 'hba1c']")
    (tmp_path / "fake_model_predictions.csv").write_text("fake,content\n")
    (tmp_path / "fake.dta").write_bytes(b"not real stata data")

    violations = checker.scan_directory(tmp_path)

    paths = {violation.path for violation in violations}
    assert "safe.py" not in paths
    assert "fake_model_predictions.csv" in paths
    assert "fake.dta" in paths


def test_external_restricted_directory_is_refused_before_opening():
    with pytest.raises(ValueError, match="Refusing"):
        checker.ensure_safe_directory(_restricted_root_one())
    with pytest.raises(ValueError, match="Refusing"):
        checker.ensure_safe_directory(_restricted_root_two() + "\\wave1")


def test_tracked_mode_scans_git_paths_without_external_access(tmp_path, monkeypatch):
    (tmp_path / "safe.md").write_text("aggregate reports only")
    monkeypatch.setattr(
        checker, "_git_paths", lambda repo, staged: ["safe.md", "raw/sample.dta"]
    )

    violations = checker.scan_git(tmp_path, staged=False)

    assert any(violation.path == "raw/sample.dta" for violation in violations)


def test_staged_mode_scans_index_content(tmp_path, monkeypatch):
    restricted_text = _restricted_root_two() + "\\private\\wave1.dta"
    monkeypatch.setattr(
        checker, "_git_paths", lambda repo, staged: ["config.txt"]
    )
    monkeypatch.setattr(
        checker, "_staged_text", lambda repo, path: restricted_text
    )

    violations = checker.scan_git(tmp_path, staged=True)

    assert any("absolute path" in violation.reason for violation in violations)


def test_cli_returns_failure_for_restricted_directory_content(tmp_path):
    (tmp_path / "participant_records.csv").write_text("fake only")
    assert checker.main(["--directory", str(tmp_path)]) == 1


def test_cli_returns_success_for_safe_directory(tmp_path):
    (tmp_path / "audit.py").write_text("FIELDS = ['prim_key', 'hba1c']")
    assert checker.main(["--directory", str(tmp_path)]) == 0
