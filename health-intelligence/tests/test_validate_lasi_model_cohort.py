"""Synthetic-only tests for the independent LASI cohort validator."""

import hashlib
import json
from pathlib import Path

import pandas as pd
import pytest

from training import validate_lasi_model_cohort as validator


def group_id(label: str) -> str:
    return hashlib.sha256(f"synthetic:{label}".encode()).hexdigest()


@pytest.fixture
def fixture_files(tmp_path):
    pytest.importorskip("pyarrow")
    household = [group_id("h1"), group_id("h1"), group_id("h2"),
                 group_id("h3"), group_id("h4"), group_id("h4")]
    ssu = [group_id("s1"), group_id("s1"), group_id("s1"),
           group_id("s2"), group_id("s2"), group_id("s2")]
    cohort = pd.DataFrame({
        "age": [45, 55, 60, 70, 80, 101],
        "sex": [1, 2, 1, 2, 1, 2],
        "bmi": [20.0, 25.0, None, 30.0, 10.0, 80.0],
        "waist_cm": [40.0, 80.0, 90.0, None, 150.0, 200.0],
        "systolic_bp": [120, 125, None, 140, 150, 160],
        "diastolic_bp": [70, 75, 80, None, 90, 95],
        "target_undiagnosed_diabetes": [0, 1, 0, 0, 1, 0],
        "household_group_id": household,
        "ssu_group_id": ssu,
        "state": [1, 1, 1, 2, 2, 2],
        "india_dbs_weight": [1.0, 1.2, 0.8, 1.5, 2.0, 0.5],
        "flag_height_100_to_129": [False, True, False, False, False, False],
        "flag_age_above_100": [False, False, False, False, False, True],
        "flag_height_invalid": [False, False, False, False, True, False],
        "flag_waist_invalid": [False, False, False, True, False, False],
        "flag_bmi_invalid": [False, False, False, False, True, False],
    })[validator.EXPECTED_SCHEMA]
    counts = {"total": 6, "positive": 2, "negative": 4}
    expected_groups = {"household": 4, "ssu": 2}
    cohort_path = tmp_path / "cohort.parquet"
    manifest_path = tmp_path / "manifest.json"
    summary_path = tmp_path / "summary.json"
    cohort.to_parquet(cohort_path, index=False, engine="pyarrow")
    manifest = {
        "source_type": "real_lasi_wave1",
        "source_files": {
            "individual": "3_LASI_W1_Individual_v4.dta",
            "biomarker": "4_LASI_W1_Biomarker.dta",
            "dbs": "LASI_Wave1_DBS-Dataset_v1_July2025_STATA.dta",
        },
        "primary_cohort_count": 6,
        "positive_count": 2,
        "negative_count": 4,
        "contains_raw_identifiers": False,
        "contains_target_defining_variables": False,
        "contains_synthetic_training_records": False,
        "excluded_column_list": sorted(validator.FORBIDDEN_COLUMNS),
        "parquet_sha256": validator._sha256(cohort_path),
    }
    summary = validator._calculated_summary(cohort, counts)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    summary_path.write_text(json.dumps(summary), encoding="utf-8")
    return {
        "cohort": cohort, "counts": counts, "groups": expected_groups,
        "cohort_path": cohort_path, "manifest_path": manifest_path,
        "summary_path": summary_path, "manifest": manifest, "summary": summary,
        "tmp_path": tmp_path,
    }


def run_validation(files, name="validation"):
    return validator.validate_cohort(
        files["cohort_path"], files["manifest_path"], files["summary_path"],
        files["tmp_path"] / name / validator.OUTPUT_FILENAME,
        expected_counts=files["counts"], expected_group_counts=files["groups"],
    )


def rewrite_cohort(files, cohort, update_checksum=True):
    cohort.to_parquet(files["cohort_path"], index=False, engine="pyarrow")
    if update_checksum:
        files["manifest"]["parquet_sha256"] = validator._sha256(files["cohort_path"])
        files["manifest_path"].write_text(json.dumps(files["manifest"]), encoding="utf-8")


def test_valid_synthetic_cohort_passes(fixture_files):
    report = run_validation(fixture_files)
    assert report["validation_passed"] is True
    assert report["errors"] == []


def test_checksum_mismatch_fails(fixture_files):
    fixture_files["manifest"]["parquet_sha256"] = "0" * 64
    fixture_files["manifest_path"].write_text(json.dumps(fixture_files["manifest"]), encoding="utf-8")
    report = run_validation(fixture_files)
    assert not report["validation_passed"] and not report["checksum_match"]


@pytest.mark.parametrize("mode", ["unexpected", "reordered"])
def test_unexpected_or_reordered_columns_fail(fixture_files, mode):
    cohort = fixture_files["cohort"].copy()
    if mode == "unexpected":
        cohort["extra"] = 1
    else:
        cohort = cohort[list(reversed(cohort.columns))]
    rewrite_cohort(fixture_files, cohort)
    assert not run_validation(fixture_files, mode)["schema_match"]


def test_forbidden_column_fails(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort["hba1c"] = 6.5
    rewrite_cohort(fixture_files, cohort)
    report = run_validation(fixture_files)
    assert not report["validation_passed"]
    assert any("Forbidden" in error for error in report["errors"])


def test_wrong_target_counts_fail(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort["target_undiagnosed_diabetes"] = 0
    rewrite_cohort(fixture_files, cohort)
    assert not run_validation(fixture_files)["validation_passed"]


def test_missing_target_fails(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort.loc[0, "target_undiagnosed_diabetes"] = None
    rewrite_cohort(fixture_files, cohort)
    report = run_validation(fixture_files)
    assert any("missing" in error.lower() for error in report["errors"])


def test_invalid_target_value_fails(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort.loc[0, "target_undiagnosed_diabetes"] = 2
    rewrite_cohort(fixture_files, cohort)
    report = run_validation(fixture_files)
    assert any("other than 0 and 1" in error for error in report["errors"])


@pytest.mark.parametrize(
    ("column", "value", "message"),
    [("age", 44, "age_below_45"), ("sex", 9, "invalid_sex"),
     ("bmi", 81, "bmi_outside"), ("waist_cm", 201, "waist_outside"),
     ("india_dbs_weight", 0, "nonfinite_or_nonpositive")],
)
def test_invalid_ranges_fail(fixture_files, column, value, message):
    cohort = fixture_files["cohort"].copy()
    cohort.loc[0, column] = value
    rewrite_cohort(fixture_files, cohort)
    report = run_validation(fixture_files, column)
    assert any(message in error for error in report["errors"])


def test_malformed_group_id_fails(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort.loc[0, "household_group_id"] = "NOT-HMAC"
    rewrite_cohort(fixture_files, cohort)
    assert any("Malformed household" in error for error in run_validation(fixture_files)["errors"])


def test_household_to_ssu_inconsistency_fails(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort.loc[1, "ssu_group_id"] = group_id("s2")
    rewrite_cohort(fixture_files, cohort)
    assert any("Household-to-SSU" in error for error in run_validation(fixture_files)["errors"])


def test_ssu_to_state_inconsistency_fails(fixture_files):
    cohort = fixture_files["cohort"].copy()
    cohort.loc[1, "state"] = 9
    rewrite_cohort(fixture_files, cohort)
    assert any("SSU-to-state" in error for error in run_validation(fixture_files)["errors"])


def test_manifest_claiming_synthetic_data_fails(fixture_files):
    fixture_files["manifest"]["contains_synthetic_training_records"] = True
    fixture_files["manifest_path"].write_text(json.dumps(fixture_files["manifest"]), encoding="utf-8")
    report = run_validation(fixture_files)
    assert not report["manifest_checks"]["contains_synthetic_training_records_false"]


@pytest.mark.parametrize("bad_path", [r"C:\private\source.dta", "/private/source.dta"])
def test_manifest_absolute_path_fails(fixture_files, bad_path):
    fixture_files["manifest"]["source_files"]["dbs"] = bad_path
    fixture_files["manifest_path"].write_text(json.dumps(fixture_files["manifest"]), encoding="utf-8")
    report = run_validation(fixture_files, "absolute")
    assert not report["manifest_checks"]["contains_no_absolute_paths"]


def test_output_inside_repository_fails(tmp_path, fixture_files, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setattr(validator, "REPOSITORY_ROOT", repo)
    with pytest.raises(ValueError, match="outside the Git repository"):
        validator.validate_cohort(
            fixture_files["cohort_path"], fixture_files["manifest_path"],
            fixture_files["summary_path"], repo / validator.OUTPUT_FILENAME,
            expected_counts=fixture_files["counts"],
            expected_group_counts=fixture_files["groups"],
        )


def test_validation_output_contains_no_rows_or_group_values(fixture_files):
    run_validation(fixture_files)
    output = fixture_files["tmp_path"] / "validation" / validator.OUTPUT_FILENAME
    text = output.read_text(encoding="utf-8")
    assert "participant" not in text.lower()
    for value in set(fixture_files["cohort"]["household_group_id"]) | set(
        fixture_files["cohort"]["ssu_group_id"]
    ):
        assert value not in text
    payload = json.loads(text)
    assert not any(isinstance(value, list) and value and isinstance(value[0], dict)
                   for value in payload.values())


def test_summary_mismatch_fails(fixture_files):
    fixture_files["summary"]["age_band_counts"]["45_to_59"] = 999
    fixture_files["summary_path"].write_text(json.dumps(fixture_files["summary"]), encoding="utf-8")
    report = run_validation(fixture_files)
    assert not report["summary_consistency_checks"]["age_band_counts"]


def test_production_cli_requires_all_inputs_and_has_no_fallback(monkeypatch):
    monkeypatch.setattr("sys.argv", ["validator"])
    with pytest.raises(SystemExit):
        validator.parse_args()
    source = Path(validator.__file__).read_text(encoding="utf-8").lower()
    assert "generate_synthetic" not in source
    assert "fallback dataset" not in source
