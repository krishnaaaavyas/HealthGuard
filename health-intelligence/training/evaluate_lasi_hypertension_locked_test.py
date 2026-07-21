"""Evaluate the manually frozen LASI hypertension champion exactly once."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import confusion_matrix

try:
    from training.build_lasi_hypertension_cohort import (
        APPROVED_TARGET_POLICY,
        REPOSITORY_ROOT,
        TARGET_NAME,
        construct_target_cohort,
        private_join,
        read_sources,
        validate_paths,
    )
    from training.train_lasi_hypertension_development import (
        FEATURE_SETS,
        _classification_metrics,
        build_pipeline,
        calibration_statistics,
        create_development_splits,
        suppress_count,
    )
    from training.validate_lasi_hypertension_training_outputs import (
        validate_outputs as validate_development_outputs,
    )
except ModuleNotFoundError:
    from build_lasi_hypertension_cohort import (
        APPROVED_TARGET_POLICY,
        REPOSITORY_ROOT,
        TARGET_NAME,
        construct_target_cohort,
        private_join,
        read_sources,
        validate_paths,
    )
    from train_lasi_hypertension_development import (
        FEATURE_SETS,
        _classification_metrics,
        build_pipeline,
        calibration_statistics,
        create_development_splits,
        suppress_count,
    )
    from validate_lasi_hypertension_training_outputs import (
        validate_outputs as validate_development_outputs,
    )

CONFIRMATION_TOKEN = "EVALUATE_FROZEN_D_LOGISTIC_ONCE"
FROZEN_CONFIGURATION = "D_logistic_regression"
FROZEN_FEATURE_SET = "D"
FROZEN_MODEL = "logistic_regression"
FROZEN_FEATURES = (
    "age",
    "height_cm",
    "weight_kg",
    "sex",
    "family_history_hypertension",
    "physical_activity_category",
    "smoking_category",
)
FROZEN_THRESHOLD = 0.23965717645991863
FROZEN_SENSITIVITY_TARGET = 0.80
FROZEN_RANDOM_SEED = 42
OUTPUT_FILENAMES = {
    "lasi_hypertension_locked_test_metrics.json",
    "lasi_hypertension_locked_test_calibration.json",
    "lasi_hypertension_locked_test_manifest.json",
    "lasi_hypertension_final_model_decision_input.json",
}


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def load_and_verify_development_outputs(
    output_dir: Path, minimum: int = 10
) -> dict[str, Any]:
    """Validate the development bundle and its exact frozen decision."""
    validate_development_outputs(output_dir, minimum)
    payloads = {
        path.name: json.loads(path.read_text(encoding="utf-8"))
        for path in output_dir.iterdir()
        if path.is_file()
    }
    manifest = payloads["lasi_hypertension_training_manifest.json"]
    expected_manifest = {
        "target_name": TARGET_NAME,
        "target_policy": APPROVED_TARGET_POLICY,
        "random_seed": FROZEN_RANDOM_SEED,
        "locked_test_evaluated": False,
        "threshold_selection_partition": "validation",
    }
    for key, expected in expected_manifest.items():
        if manifest.get(key) != expected:
            raise ValueError(f"Development manifest mismatch for {key}")
    if tuple(FEATURE_SETS.get(FROZEN_FEATURE_SET, ())) != FROZEN_FEATURES:
        raise ValueError("Frozen feature-set registry mismatch")

    feature_rows = payloads["lasi_hypertension_feature_set_results.json"].get(
        "feature_sets", []
    )
    frozen_feature_rows = [
        row for row in feature_rows if row.get("feature_set") == FROZEN_FEATURE_SET
    ]
    if len(frozen_feature_rows) != 1 or tuple(
        frozen_feature_rows[0].get("features", [])
    ) != FROZEN_FEATURES:
        raise ValueError("Development output does not contain exact frozen feature set D")

    model_rows = payloads["lasi_hypertension_candidate_model_results.json"].get(
        "configurations", []
    )
    frozen_models = [
        row for row in model_rows if row.get("configuration") == FROZEN_CONFIGURATION
    ]
    if len(frozen_models) != 1 or frozen_models[0].get("feature_set") != FROZEN_FEATURE_SET:
        raise ValueError("Frozen configuration is missing or has the wrong feature set")
    if frozen_models[0].get("model") != FROZEN_MODEL:
        raise ValueError("Frozen configuration is not logistic regression")

    threshold_rows = payloads["lasi_hypertension_threshold_selection.json"].get(
        "configurations", []
    )
    frozen_thresholds = [
        row for row in threshold_rows
        if row.get("configuration") == FROZEN_CONFIGURATION
    ]
    if len(frozen_thresholds) != 1:
        raise ValueError("Frozen threshold configuration is missing or duplicated")
    frozen_threshold = frozen_thresholds[0]
    if frozen_threshold.get("threshold") != FROZEN_THRESHOLD:
        raise ValueError("Frozen threshold mismatch")
    if frozen_threshold.get("selection_partition") != "validation":
        raise ValueError("Frozen threshold was not selected on validation")
    if frozen_threshold.get("sensitivity_target") != FROZEN_SENSITIVITY_TARGET:
        raise ValueError("Frozen sensitivity target mismatch")
    return payloads


def evaluate_frozen_configuration(
    joined,
    development_payloads: dict[str, Any],
    minimum: int = 10,
) -> dict[str, dict[str, Any]]:
    """Fit on development rows and evaluate only the untouched locked split."""
    if minimum < 2:
        raise ValueError("min-cell-count must be at least 2")
    # Recheck the in-memory bundle in case this internal helper is called directly.
    manifest = development_payloads["lasi_hypertension_training_manifest.json"]
    if manifest.get("locked_test_evaluated") is not False:
        raise ValueError("Development bundle already claims locked-test evaluation")
    cohort, predictors, target, _ = construct_target_cohort(joined)
    groups = cohort[["hhid", "ssuid"]].reset_index(drop=True)
    predictors = predictors.reset_index(drop=True)
    target = target.reset_index(drop=True).astype(int)
    splits = create_development_splits(groups, target, FROZEN_RANDOM_SEED)
    development_index = np.sort(
        np.concatenate((splits["training"], splits["validation"]))
    )
    locked_index = splits["locked_test"]
    if np.intersect1d(development_index, locked_index).size:
        raise RuntimeError("Locked-test rows overlap development rows")

    pipeline = build_pipeline(
        FROZEN_MODEL, FROZEN_FEATURES, FROZEN_RANDOM_SEED
    )
    pipeline.fit(
        predictors.iloc[development_index][list(FROZEN_FEATURES)],
        target.iloc[development_index],
    )
    probability = pipeline.predict_proba(
        predictors.iloc[locked_index][list(FROZEN_FEATURES)]
    )[:, 1]
    locked_target = target.iloc[locked_index].to_numpy()
    metrics = _classification_metrics(
        locked_target, probability, FROZEN_THRESHOLD
    )
    predicted = probability >= FROZEN_THRESHOLD
    tn, fp, fn, tp = confusion_matrix(
        locked_target, predicted, labels=[0, 1]
    ).ravel()
    positive_count = int(np.sum(locked_target == 1))
    negative_count = int(np.sum(locked_target == 0))
    count_payload = {
        "row_count": suppress_count(len(locked_index), minimum),
        "positive_count": suppress_count(positive_count, minimum),
        "negative_count": suppress_count(negative_count, minimum),
        "true_negative_count": suppress_count(int(tn), minimum),
        "false_positive_count": suppress_count(int(fp), minimum),
        "false_negative_count": suppress_count(int(fn), minimum),
        "true_positive_count": suppress_count(int(tp), minimum),
    }
    calibration = calibration_statistics(locked_target, probability)
    return {
        "lasi_hypertension_locked_test_metrics.json": {
            "configuration": FROZEN_CONFIGURATION,
            "frozen_threshold": FROZEN_THRESHOLD,
            **count_payload,
            "prevalence": float(np.mean(locked_target)),
            **metrics,
        },
        "lasi_hypertension_locked_test_calibration.json": {
            "configuration": FROZEN_CONFIGURATION,
            "calibration_intercept": calibration["intercept"],
            "calibration_slope": calibration["slope"],
        },
        "lasi_hypertension_locked_test_manifest.json": {
            "target_name": TARGET_NAME,
            "target_policy": APPROVED_TARGET_POLICY,
            "champion_frozen": True,
            "frozen_configuration": FROZEN_CONFIGURATION,
            "frozen_feature_set": FROZEN_FEATURE_SET,
            "frozen_features": list(FROZEN_FEATURES),
            "frozen_model": FROZEN_MODEL,
            "frozen_threshold": FROZEN_THRESHOLD,
            "random_seed": FROZEN_RANDOM_SEED,
            "locked_test_evaluated": True,
            "alternative_models_evaluated_on_locked_test": False,
            "threshold_retuned": False,
            "participant_level_exported": False,
            "predictions_exported": False,
            "raw_bp_values_exported": False,
            "absolute_paths_exported": False,
            "model_files_exported": False,
        },
        "lasi_hypertension_final_model_decision_input.json": {
            "configuration": FROZEN_CONFIGURATION,
            "manual_decision_required": True,
            "approval_status": "pending_manual_review",
            "locked_test_evidence_generated": True,
            "automatic_approval_performed": False,
        },
    }


def write_outputs(
    outputs: dict[str, Any],
    output_dir: Path,
    *,
    _allow_test_overwrite: bool = False,
) -> None:
    if set(outputs) != OUTPUT_FILENAMES:
        raise RuntimeError("Unexpected locked-test output schema")
    manifest_path = output_dir / "lasi_hypertension_locked_test_manifest.json"
    if manifest_path.is_file():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = {}
        if existing.get("locked_test_evaluated") is True and not _allow_test_overwrite:
            raise RuntimeError("Locked test has already been evaluated in this output directory")
    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.iterdir()) and not _allow_test_overwrite:
        raise ValueError("Locked-test output directory must be empty")
    for name, payload in outputs.items():
        (output_dir / name).write_text(
            json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
        )


def execute(
    data_root: Path,
    development_output_dir: Path,
    output_dir: Path,
    confirmation_token: str,
    minimum: int = 10,
) -> dict[str, Any]:
    if confirmation_token != CONFIRMATION_TOKEN:
        raise ValueError("Exact locked-test confirmation token is required")
    validate_paths(data_root, output_dir)
    if _inside(development_output_dir, REPOSITORY_ROOT):
        raise ValueError("development-output-dir must be outside the Git worktree")
    development = load_and_verify_development_outputs(
        development_output_dir, minimum
    )
    joined, _ = private_join(*read_sources(data_root))
    outputs = evaluate_frozen_configuration(joined, development, minimum)
    write_outputs(outputs, output_dir)
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--development-output-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--confirmation-token", required=True)
    parser.add_argument("--min-cell-count", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    execute(
        args.data_root,
        args.development_output_dir,
        args.output_dir,
        args.confirmation_token,
        args.min_cell_count,
    )
    print("Frozen LASI hypertension locked-test evidence created for manual review.")


if __name__ == "__main__":
    main()
