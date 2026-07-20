"""Synthetic-only tests for the LASI hypertension variable audit."""

import json
import sys
from types import SimpleNamespace

import pandas as pd
import pytest

from training import audit_lasi_hypertension_variables as cli
from training import audit_lasi_hypertension_target as target_cli
from training.validate_lasi_hypertension_audit_outputs import validate_outputs
from training import lasi_hypertension_audit_utils as audit


@pytest.fixture
def synthetic_metadata():
    return SimpleNamespace(
        column_names=[
            *sorted(audit.authoritative_columns()), "unrelated",
        ],
        column_names_to_labels={
            column: f"Approved synthetic label for {column}"
            for column in audit.authoritative_columns()
        },
        readstat_variable_types={},
        variable_value_labels={"dm003": {1: "Male", 2: "Female"}},
    )


def synthetic_reader(metadata, rows=20):
    def reader(path, **kwargs):
        if kwargs.get("metadataonly"):
            return pd.DataFrame(), metadata
        columns = kwargs["usecols"]
        data = {}
        for column in columns:
            if column in {"bm006", "bm007", "bm010", "bm011", "bm014", "bm015", "bm017", "bm018"}:
                data[column] = list(range(100, 100 + rows))
            elif column == "hb211":
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
    assert audit.APPROVED_PRODUCTION_PREDICTORS == {
        "age", "sex", "height_cm", "weight_kg", "bmi",
        "family_history_hypertension", "physical_activity_category",
        "smoking_category",
    }
    assert audit.AUTHORITATIVE_MAPPING["bmi"]["columns"] == ("bm067", "bm071")
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
    identifier = next(item for item in candidates if item["canonical_name"] == "private_join_key")
    assert identifier["allowed_in_profile_model"] is False
    assert identifier["source_labels"] == []
    assert identifier["code_meanings"] == {}


def test_small_cells_suppressed_and_bp_values_not_exported(tmp_path, synthetic_metadata):
    _, individual_distributions, _ = audit.discover_file(
        tmp_path / "synthetic.dta", "individual", 10,
        reader=synthetic_reader(synthetic_metadata),
    )
    _, biomarker_distributions, _ = audit.discover_file(
        tmp_path / "synthetic.dta", "biomarker", 10,
        reader=synthetic_reader(synthetic_metadata),
    )
    assert individual_distributions["individual.hb211"]["2"] == "SUPPRESSED_BELOW_10"
    assert individual_distributions["individual.hb211"]["1"] == 15
    assert biomarker_distributions["biomarker.bm006"] == "not_exported_raw_bp_measurement"
    assert biomarker_distributions["biomarker.bm011"] == "not_exported_raw_bp_measurement"


def test_authoritative_registry_contains_every_approved_column_and_bm011():
    assert "bm011" in audit.authoritative_columns()
    assert audit.AUTHORITATIVE_MAPPING["diastolic_2"]["columns"] == ("bm011",)
    assert audit.AUTHORITATIVE_MAPPING["previous_hypertension_diagnosis"] == {
        "source_role": "individual", "columns": ("ht002",), "role": "eligibility"
    }
    assert audit.AUTHORITATIVE_MAPPING["current_hypertension_medication"] == {
        "source_role": "individual", "columns": ("ht002c",), "role": "eligibility"
    }


def test_only_height_and_weight_are_physical_measurement_predictor_values():
    measurement_columns = {
        column for canonical in ("height_cm", "weight_kg")
        for column in audit.AUTHORITATIVE_MAPPING[canonical]["columns"]
    }
    assert measurement_columns == {"bm067", "bm071"}
    assert not set(audit.AUTHORITATIVE_MAPPING["height_weight_quality"]["columns"]) & audit.predictor_source_columns()


def test_weights_and_identifiers_cannot_enter_model_features():
    forbidden = {
        "indiaindividualweight", "stateindividualweight", "hhid", "ssuid", "prim_key"
    }
    assert not forbidden & audit.predictor_source_columns()
    assert audit.classify_metadata("indiaindividualweight", "Survey weight")["role"] == "survey_design"


def test_explicit_rejections_do_not_enter_predictor_sources():
    required_rejections = {
        "fm303s6", "fm303s7", "hb212", "hb214", "hb215", "hb216",
        "es010_1", "es010_2", "es010_3", "es010_4", "es010_5", "es010_6",
        "ee010a", "ht002", "ht002c", "bm011",
    }
    assert required_rejections <= audit.EXPLICITLY_REJECTED_PREDICTOR_COLUMNS
    assert not required_rejections & audit.predictor_source_columns()


def test_broad_discovery_cannot_extend_authoritative_allowlist():
    before = set(audit.APPROVED_PRODUCTION_PREDICTORS)
    exploratory = audit.classify_metadata("walking_safety", "Physical activity walking frequency")
    assert exploratory is not None
    assert set(audit.APPROVED_PRODUCTION_PREDICTORS) == before
    assert "walking_safety" not in audit.authoritative_columns()


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


def test_both_cli_paths_generate_exact_authoritative_outputs(
    tmp_path, monkeypatch, synthetic_metadata
):
    repo = tmp_path / "repo"
    data = tmp_path / "synthetic-data"
    codebooks = tmp_path / "synthetic-codebooks"
    repo.mkdir()
    data.mkdir()
    codebooks.mkdir()
    for basename in audit.EXPECTED_DATA_FILES.values():
        (data / basename).write_text("synthetic fixture only", encoding="utf-8")
    (codebooks / "synthetic-codebook.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(audit, "REPOSITORY_ROOT", repo)
    monkeypatch.setitem(
        sys.modules, "pyreadstat",
        SimpleNamespace(read_dta=synthetic_reader(synthetic_metadata)),
    )

    for command, module in (("variables", cli), ("target", target_cli)):
        output = tmp_path / f"{command}-output"
        monkeypatch.setattr(sys, "argv", [
            command, "--data-root", str(data), "--codebook-root", str(codebooks),
            "--output-dir", str(output),
        ])
        module.main()
        predictors = json.loads((output / "lasi_hypertension_predictor_candidates.json").read_text(encoding="utf-8"))["candidates"]
        targets = json.loads((output / "lasi_hypertension_target_candidates.json").read_text(encoding="utf-8"))["candidates"]
        assert len(predictors) == 8
        assert {item["canonical_name"] for item in predictors} == audit.APPROVED_PRODUCTION_PREDICTORS
        assert {item["canonical_name"] for item in targets} == audit.APPROVED_TARGET_RECORDS
        assert all(item["manual_approval_status"] == "approved" for item in predictors)
        validate_outputs(output, 10)


@pytest.mark.parametrize(
    ("name", "label"),
    [("distractor_age", "Age at marriage"), ("weight", "Individual survey weight")],
)
def test_broad_distractors_never_enter_official_allowlist(name, label):
    assert name not in audit.authoritative_columns()
    discovered = audit.classify_metadata(name, label)
    assert discovered is None or discovered["canonical_name"] not in audit.APPROVED_PRODUCTION_PREDICTORS


def test_cli_defaults_to_ten_and_requires_roots(monkeypatch):
    monkeypatch.setattr("sys.argv", [
        "audit", "--data-root", "data", "--codebook-root", "codes",
        "--output-dir", "out",
    ])
    assert cli.parse_args().min_cell_count == 10
    monkeypatch.setattr("sys.argv", ["audit"])
    with pytest.raises(SystemExit):
        cli.parse_args()
