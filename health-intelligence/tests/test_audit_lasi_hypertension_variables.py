"""Synthetic-only tests for the LASI hypertension variable audit."""

import json
from types import SimpleNamespace

import pandas as pd
import pytest

from training import audit_lasi_hypertension_variables as cli
from training import lasi_hypertension_audit_utils as audit


@pytest.fixture
def synthetic_metadata():
    return SimpleNamespace(
        column_names=[
            "age_var", "sex_var", "height_var", "weight_var", "bmi_var",
            "family_bp", "activity", "smoking", "sbp_reading_1",
            "dbp_reading_1", "bp_complete", "diagnosis", "medication",
            "survey_weight", "cluster", "prim_key", "unrelated",
        ],
        column_names_to_labels={
            "age_var": "Age of respondent", "sex_var": "Respondent sex",
            "height_var": "Measured height", "weight_var": "Measured weight",
            "bmi_var": "Body mass index", "family_bp": "Family history of hypertension",
            "activity": "Physical activity category", "smoking": "Current smoking category",
            "sbp_reading_1": "Systolic blood pressure reading 1",
            "dbp_reading_1": "Diastolic blood pressure reading 1",
            "bp_complete": "Blood pressure measurement complete",
            "diagnosis": "Doctor diagnosed hypertension",
            "medication": "Medication for high blood pressure",
            "survey_weight": "Survey weight", "cluster": "Primary sampling cluster",
            "prim_key": "Respondent identifier", "unrelated": "Housing roof material",
        },
        readstat_variable_types={},
        variable_value_labels={
            "sex_var": {1: "Male", 2: "Female"},
            "activity": {1: "Active", 2: "Inactive"},
        },
    )


def synthetic_reader(metadata, rows=20):
    def reader(path, **kwargs):
        if kwargs.get("metadataonly"):
            return pd.DataFrame(), metadata
        columns = kwargs["usecols"]
        data = {}
        for column in columns:
            if column in {"sbp_reading_1", "dbp_reading_1"}:
                data[column] = list(range(100, 100 + rows))
            elif column == "activity":
                data[column] = [1] * 15 + [2] * 5
            else:
                data[column] = [1] * rows
        return pd.DataFrame(data), metadata
    return reader


def test_real_data_is_not_required_for_metadata_discovery(tmp_path, synthetic_metadata):
    candidates, distributions, missingness = audit.discover_file(
        tmp_path / "synthetic.dta", "individual", 10,
        reader=synthetic_reader(synthetic_metadata),
    )
    assert candidates
    assert distributions
    assert missingness


def test_approved_profile_fields_and_bmi_requirements_are_represented():
    expected = {
        "age", "sex", "height", "weight", "bmi",
        "family_history_hypertension", "physical_activity_category",
        "smoking_category",
    }
    observed = {
        audit.classify_metadata(name, label)["canonical_name"]
        for name, label in [
            ("a", "Age of respondent"), ("s", "Respondent sex"),
            ("h", "Measured height"), ("w", "Measured weight"),
            ("b", "Body mass index"), ("f", "Family history of hypertension"),
            ("p", "Physical activity category"), ("t", "Current smoking category"),
        ]
    }
    assert observed == expected
    assert "deterministically calculate" in audit.proposed_transformation("bmi")


@pytest.mark.parametrize(
    ("name", "label", "role"),
    [
        ("sbp", "Systolic blood pressure reading 1", "target_construction"),
        ("dbp", "Diastolic blood pressure measurement 1", "target_construction"),
        ("dx", "Doctor diagnosed hypertension", "eligibility"),
        ("rx", "Medication for high blood pressure", "eligibility"),
    ],
)
def test_bp_diagnosis_and_medication_are_forbidden_predictors(name, label, role):
    result = audit.classify_metadata(name, label)
    assert result["role"] == role
    assert result["allowed_in_profile_model"] is False


def test_direct_identifiers_are_prohibited_and_never_loaded(
    tmp_path, synthetic_metadata
):
    candidates, _, _ = audit.discover_file(
        tmp_path / "synthetic.dta", "individual", 10,
        reader=synthetic_reader(synthetic_metadata),
    )
    identifier = next(item for item in candidates if item["role"] == "identifier")
    assert identifier["allowed_in_profile_model"] is False
    assert identifier["source_label"] is None
    assert identifier["code_meanings"] == []


def test_small_cells_suppressed_and_bp_values_not_exported(tmp_path, synthetic_metadata):
    _, distributions, _ = audit.discover_file(
        tmp_path / "synthetic.dta", "individual", 10,
        reader=synthetic_reader(synthetic_metadata),
    )
    assert distributions["individual.activity"]["2"] == "SUPPRESSED_BELOW_10"
    assert distributions["individual.activity"]["1"] == 15
    assert distributions["individual.sbp_reading_1"] == "not_exported_raw_bp_measurement"
    assert distributions["individual.dbp_reading_1"] == "not_exported_raw_bp_measurement"


def test_paths_inside_repository_and_raw_output_nesting_are_rejected(
    tmp_path, monkeypatch
):
    repo = tmp_path / "repo"
    data = tmp_path / "data"
    codebooks = tmp_path / "codebooks"
    for path in (repo, data, codebooks):
        path.mkdir()
    monkeypatch.setattr(audit, "REPOSITORY_ROOT", repo)
    with pytest.raises(ValueError, match="data-root"):
        audit.validate_roots(repo / "raw", codebooks, tmp_path / "out")
    with pytest.raises(ValueError, match="codebook-root"):
        audit.validate_roots(data, repo / "codebooks", tmp_path / "out")
    with pytest.raises(ValueError, match="output-dir"):
        audit.validate_roots(data, codebooks, repo / "out")
    with pytest.raises(ValueError, match="nested under data-root"):
        audit.validate_roots(data, codebooks, data / "out")


def test_output_generation_is_deterministic_and_aggregate_only(tmp_path):
    records = [([{"canonical_name": "age", "role": "predictor"}], {}, {})]
    first = audit.build_bundle(records, ["individual.dta"], ["codebook.pdf"], 10)
    second = audit.build_bundle(records, ["individual.dta"], ["codebook.pdf"], 10)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert first["lasi_hypertension_audit_manifest.json"]["cohort_created"] is False
    assert first["lasi_hypertension_audit_manifest.json"]["model_trained"] is False


def test_cli_defaults_to_ten_and_requires_roots(monkeypatch):
    monkeypatch.setattr("sys.argv", [
        "audit", "--data-root", "data", "--codebook-root", "codes",
        "--output-dir", "out",
    ])
    assert cli.parse_args().min_cell_count == 10
    monkeypatch.setattr("sys.argv", ["audit"])
    with pytest.raises(SystemExit):
        cli.parse_args()
