"""Synthetic-only tests for the frozen hypertension locked-test evaluation."""

import json
import inspect

import numpy as np
import pytest

from training import evaluate_lasi_hypertension_locked_test as evaluation
from training import train_lasi_hypertension_development as development
from test_train_lasi_hypertension_development import synthetic_joined


@pytest.fixture
def development_payloads():
    return {
        "lasi_hypertension_training_manifest.json": {
            "target_name": evaluation.TARGET_NAME,
            "target_policy": evaluation.APPROVED_TARGET_POLICY,
            "approved_predictors": sorted(development.APPROVED_PRODUCTION_PREDICTORS),
            "feature_sets": list(development.FEATURE_SETS),
            "candidate_models": list(development.MODEL_NAMES),
            "participant_level_exported": False,
            "predictions_exported": False,
            "raw_bp_values_exported": False,
            "absolute_paths_exported": False,
            "model_files_exported": False,
            "locked_test_evaluated": False,
            "threshold_selection_partition": "validation",
            "random_seed": 42,
        },
        "lasi_hypertension_split_summary.json": {
            "partitions": {},
            "locked_test_evaluated": False,
        },
        "lasi_hypertension_feature_set_results.json": {
            "feature_sets": [
                {"feature_set": name, "features": list(features)}
                for name, features in development.FEATURE_SETS.items()
            ]
        },
        "lasi_hypertension_candidate_model_results.json": {
            "configurations": [{
                "configuration": evaluation.FROZEN_CONFIGURATION,
                "feature_set": evaluation.FROZEN_FEATURE_SET,
                "model": evaluation.FROZEN_MODEL,
                "locked_test_metrics": None,
            }]
        },
        "lasi_hypertension_threshold_selection.json": {
            "configurations": [{
                "configuration": evaluation.FROZEN_CONFIGURATION,
                "threshold": evaluation.FROZEN_THRESHOLD,
                "sensitivity_target": evaluation.FROZEN_SENSITIVITY_TARGET,
                "selection_partition": "validation",
            }]
        },
        "lasi_hypertension_calibration_summary.json": {
            "configurations": [{
                "configuration": evaluation.FROZEN_CONFIGURATION,
                "locked_test": None,
            }]
        },
    }


@pytest.fixture
def development_dir(tmp_path, development_payloads):
    output = tmp_path / "development"
    output.mkdir()
    for name, payload in development_payloads.items():
        (output / name).write_text(json.dumps(payload), encoding="utf-8")
    return output


def test_frozen_configuration_feature_set_and_threshold_are_exact():
    assert evaluation.FROZEN_CONFIGURATION == "D_logistic_regression"
    assert evaluation.FROZEN_MODEL == "logistic_regression"
    assert evaluation.FROZEN_FEATURES == development.FEATURE_SETS["D"]
    assert evaluation.FROZEN_THRESHOLD == 0.23965717645991863


def test_valid_development_bundle_enforces_frozen_decision(development_dir):
    loaded = evaluation.load_and_verify_development_outputs(development_dir, 10)
    assert loaded["lasi_hypertension_training_manifest.json"][
        "locked_test_evaluated"
    ] is False


def test_alternative_configuration_is_rejected(development_dir):
    path = development_dir / "lasi_hypertension_candidate_model_results.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["configurations"][0]["configuration"] = "C_random_forest"
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="Frozen configuration"):
        evaluation.load_and_verify_development_outputs(development_dir, 10)


def test_changed_threshold_is_rejected(development_dir):
    path = development_dir / "lasi_hypertension_threshold_selection.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["configurations"][0]["threshold"] = 0.5
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="threshold mismatch"):
        evaluation.load_and_verify_development_outputs(development_dir, 10)


def test_confirmation_token_is_checked_before_any_data_access(monkeypatch, tmp_path):
    monkeypatch.setattr(
        evaluation,
        "read_sources",
        lambda *args: pytest.fail("data access occurred before confirmation"),
    )
    with pytest.raises(ValueError, match="confirmation token"):
        evaluation.execute(
            tmp_path / "data",
            tmp_path / "development",
            tmp_path / "output",
            "WRONG",
        )


def test_only_development_rows_fit_preprocessing_and_locked_rows_are_predicted(
    monkeypatch, development_payloads
):
    joined = synthetic_joined(120)
    cohort, _, target, _ = evaluation.construct_target_cohort(joined)
    groups = cohort[["hhid", "ssuid"]].reset_index(drop=True)
    splits = evaluation.create_development_splits(
        groups, target.reset_index(drop=True).astype(int), 42
    )
    expected_fit = set(np.concatenate((splits["training"], splits["validation"])))
    expected_locked = set(splits["locked_test"])
    observed = {}
    real_builder = development.build_pipeline

    class RecordingPipeline:
        def __init__(self):
            self.delegate = real_builder(
                evaluation.FROZEN_MODEL,
                evaluation.FROZEN_FEATURES,
                evaluation.FROZEN_RANDOM_SEED,
            )

        def fit(self, frame, target_values):
            observed["fit"] = set(frame.index)
            self.delegate.fit(frame, target_values)
            return self

        def predict_proba(self, frame):
            observed["predict"] = set(frame.index)
            return self.delegate.predict_proba(frame)

    monkeypatch.setattr(evaluation, "build_pipeline", lambda *args: RecordingPipeline())
    evaluation.evaluate_frozen_configuration(joined, development_payloads, 10)

    assert observed["fit"] == expected_fit
    assert observed["predict"] == expected_locked
    assert not observed["fit"] & observed["predict"]


def test_outputs_are_aggregate_private_and_small_cells_are_suppressed(
    development_payloads,
):
    outputs = evaluation.evaluate_frozen_configuration(
        synthetic_joined(120), development_payloads, 10
    )
    serialized = json.dumps(outputs)
    assert set(outputs) == evaluation.OUTPUT_FILENAMES
    assert "prim_key" not in serialized
    assert '"hhid"' not in serialized
    assert '"ssuid"' not in serialized
    assert "bm010" not in serialized
    assert '"predictions":' not in serialized
    metrics = outputs["lasi_hypertension_locked_test_metrics.json"]
    for key, value in metrics.items():
        if key.endswith("_count") and isinstance(value, int):
            assert value == 0 or value >= 10


def test_repeated_run_is_rejected(tmp_path, development_payloads):
    outputs = evaluation.evaluate_frozen_configuration(
        synthetic_joined(120), development_payloads, 10
    )
    output_dir = tmp_path / "locked"
    evaluation.write_outputs(outputs, output_dir)
    with pytest.raises(RuntimeError, match="already been evaluated"):
        evaluation.write_outputs(outputs, output_dir)


def test_test_only_overwrite_is_not_a_cli_option():
    assert "allow-test-overwrite" not in inspect.getsource(evaluation.parse_args)
