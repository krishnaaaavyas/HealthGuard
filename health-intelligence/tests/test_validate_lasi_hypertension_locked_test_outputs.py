"""Synthetic privacy-validator tests for locked-test aggregate outputs."""

import json

import pytest

from training import evaluate_lasi_hypertension_locked_test as evaluation
from training import validate_lasi_hypertension_locked_test_outputs as validator
from test_evaluate_lasi_hypertension_locked_test import development_payloads
from test_train_lasi_hypertension_development import synthetic_joined


@pytest.fixture
def output_dir(tmp_path, development_payloads):
    outputs = evaluation.evaluate_frozen_configuration(
        synthetic_joined(120), development_payloads, 10
    )
    output = tmp_path / "locked"
    evaluation.write_outputs(outputs, output)
    return output


def mutate(output_dir, filename, callback):
    path = output_dir / filename
    payload = json.loads(path.read_text(encoding="utf-8"))
    callback(payload)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_valid_locked_test_bundle_passes(output_dir):
    result = validator.validate_outputs(output_dir, 10)
    assert result["validation_passed"] is True
    assert result["validated_output_count"] == 4


def test_output_schema_is_exact(output_dir):
    (output_dir / "participant_predictions.json").write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="filenames mismatch"):
        validator.validate_outputs(output_dir, 10)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("frozen_configuration", "C_random_forest"),
        ("frozen_threshold", 0.5),
        ("threshold_retuned", True),
        ("alternative_models_evaluated_on_locked_test", True),
        ("predictions_exported", True),
        ("model_files_exported", True),
    ],
)
def test_frozen_governance_mutations_are_rejected(output_dir, field, value):
    mutate(
        output_dir,
        "lasi_hypertension_locked_test_manifest.json",
        lambda payload: payload.update({field: value}),
    )
    with pytest.raises(ValueError, match="governance assertion"):
        validator.validate_outputs(output_dir, 10)


def test_participant_predictions_are_rejected(output_dir):
    mutate(
        output_dir,
        "lasi_hypertension_locked_test_metrics.json",
        lambda payload: payload.update({"predictions": [0.2, 0.8]}),
    )
    with pytest.raises(ValueError, match="Forbidden"):
        validator.validate_outputs(output_dir, 10)


def test_unsuppressed_small_count_is_rejected(output_dir):
    mutate(
        output_dir,
        "lasi_hypertension_locked_test_metrics.json",
        lambda payload: payload.update({"false_negative_count": 3}),
    )
    with pytest.raises(ValueError, match="small cell"):
        validator.validate_outputs(output_dir, 10)


def test_absolute_paths_are_rejected(output_dir):
    mutate(
        output_dir,
        "lasi_hypertension_final_model_decision_input.json",
        lambda payload: payload.update({"note": r"C:\private\locked"}),
    )
    with pytest.raises(ValueError, match="Absolute path"):
        validator.validate_outputs(output_dir, 10)


def test_manual_decision_cannot_be_bypassed(output_dir):
    mutate(
        output_dir,
        "lasi_hypertension_final_model_decision_input.json",
        lambda payload: payload.update({"automatic_approval_performed": True}),
    )
    with pytest.raises(ValueError, match="Automatic approval"):
        validator.validate_outputs(output_dir, 10)
