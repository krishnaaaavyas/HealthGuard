"""Synthetic-only privacy-validator tests for LASI hypertension audits."""

import json

import pytest

from training import lasi_hypertension_audit_utils as audit
from training import validate_lasi_hypertension_audit_outputs as validator


@pytest.fixture
def valid_output(tmp_path):
    candidate = {
        "canonical_name": "age", "role": "predictor",
        "source_file": "synthetic_individual.dta", "source_column": "age_var",
        "source_label": "Age of respondent", "data_type": "int16",
        "code_meanings": [], "missing_and_special_codes": "requires_manual_codebook_review",
        "proposed_transformation": "Preserve documented codes",
        "available_from_healthguard_users": True,
        "allowed_in_profile_model": True,
        "leakage_rationale": "Synthetic test candidate",
        "manual_approval_status": "requires_manual_review",
    }
    bundle = audit.build_bundle(
        [([candidate], {"individual.age_var": {"45": 10}},
          {"individual.age_var": {"row_count": 20, "missing_count": 0}})],
        ["synthetic_individual.dta"], ["synthetic_codebook.pdf"], 10,
    )
    output = tmp_path / "aggregate-output"
    audit.write_bundle(bundle, output)
    return output


def mutate(output, filename, callback):
    path = output / filename
    payload = json.loads(path.read_text(encoding="utf-8"))
    callback(payload)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_valid_aggregate_outputs_pass(valid_output):
    result = validator.validate_outputs(valid_output, 10)
    assert result == {
        "validation_passed": True,
        "validated_output_count": 6,
        "minimum_cell_count": 10,
    }


@pytest.mark.parametrize("path_value", [r"C:\private\data.dta", "/private/data.dta"])
def test_absolute_paths_fail(valid_output, path_value):
    mutate(
        valid_output, "lasi_hypertension_audit_manifest.json",
        lambda payload: payload["source_files"].append(path_value),
    )
    with pytest.raises(ValueError, match="Absolute path"):
        validator.validate_outputs(valid_output, 10)


def test_row_like_participant_arrays_fail(valid_output):
    mutate(
        valid_output, "lasi_hypertension_variable_candidates.json",
        lambda payload: payload["candidates"].append(
            {"row_index": 1, "participant_id": "SYNTHETIC-ID"}
        ),
    )
    with pytest.raises(ValueError, match="Row-like participant"):
        validator.validate_outputs(valid_output, 10)


def test_direct_identifier_values_fail(valid_output):
    mutate(
        valid_output, "lasi_hypertension_audit_manifest.json",
        lambda payload: payload["codebook_files"].append("person@example.test"),
    )
    with pytest.raises(ValueError, match="direct identifier"):
        validator.validate_outputs(valid_output, 10)


def test_unsuppressed_small_cells_fail(valid_output):
    mutate(
        valid_output, "lasi_hypertension_code_distributions.json",
        lambda payload: payload["distributions"].update(
            {"individual.smoking": {"1": 9}}
        ),
    )
    with pytest.raises(ValueError, match="Unsuppressed small cell"):
        validator.validate_outputs(valid_output, 10)


def test_required_manifest_assertions_fail_closed(valid_output):
    mutate(
        valid_output, "lasi_hypertension_audit_manifest.json",
        lambda payload: payload.update({"model_trained": True}),
    )
    with pytest.raises(ValueError, match="model_trained"):
        validator.validate_outputs(valid_output, 10)


def test_unexpected_filename_fails(valid_output):
    (valid_output / "participant_rows.json").write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="Unexpected output filenames"):
        validator.validate_outputs(valid_output, 10)


def test_unexpected_top_level_schema_fails(valid_output):
    mutate(
        valid_output, "lasi_hypertension_predictor_candidates.json",
        lambda payload: payload.update({"participant_rows": []}),
    )
    with pytest.raises(ValueError, match="Unexpected aggregate schema"):
        validator.validate_outputs(valid_output, 10)


def test_raw_bp_observation_lists_fail(valid_output):
    bp_candidate = {
        "canonical_name": "repeated_systolic_bp", "role": "target_construction",
        "source_column": "sbp_1",
    }
    mutate(
        valid_output, "lasi_hypertension_variable_candidates.json",
        lambda payload: payload["candidates"].append(bp_candidate),
    )
    mutate(
        valid_output, "lasi_hypertension_code_distributions.json",
        lambda payload: payload["distributions"].update(
            {"biomarker.sbp_1": [120, 130, 140]}
        ),
    )
    with pytest.raises(ValueError, match="Raw BP observation"):
        validator.validate_outputs(valid_output, 10)


def test_validator_cli_defaults_and_requires_output(monkeypatch):
    monkeypatch.setattr("sys.argv", ["validator", "--output-dir", "out"])
    assert validator.parse_args().min_cell_count == 10
    monkeypatch.setattr("sys.argv", ["validator"])
    with pytest.raises(SystemExit):
        validator.parse_args()
