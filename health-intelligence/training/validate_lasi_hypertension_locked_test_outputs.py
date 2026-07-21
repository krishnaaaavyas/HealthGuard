"""Validate aggregate-only LASI hypertension locked-test outputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from training.evaluate_lasi_hypertension_locked_test import (
        FROZEN_CONFIGURATION,
        FROZEN_FEATURES,
        FROZEN_FEATURE_SET,
        FROZEN_MODEL,
        FROZEN_RANDOM_SEED,
        FROZEN_THRESHOLD,
        OUTPUT_FILENAMES,
    )
    from training.validate_lasi_hypertension_training_outputs import (
        _forbidden_keys,
        _has_absolute_path,
        _unsuppressed_small_counts,
    )
except ModuleNotFoundError:
    from evaluate_lasi_hypertension_locked_test import (
        FROZEN_CONFIGURATION,
        FROZEN_FEATURES,
        FROZEN_FEATURE_SET,
        FROZEN_MODEL,
        FROZEN_RANDOM_SEED,
        FROZEN_THRESHOLD,
        OUTPUT_FILENAMES,
    )
    from validate_lasi_hypertension_training_outputs import (
        _forbidden_keys,
        _has_absolute_path,
        _unsuppressed_small_counts,
    )


def validate_outputs(output_dir: Path, minimum: int = 10) -> dict[str, Any]:
    if minimum < 2:
        raise ValueError("min-cell-count must be at least 2")
    if not output_dir.is_dir():
        raise FileNotFoundError(f"Locked-test output directory is unavailable: {output_dir}")
    actual = {path.name for path in output_dir.iterdir() if path.is_file()}
    if actual != OUTPUT_FILENAMES:
        raise ValueError(
            "Locked-test output filenames mismatch; "
            f"missing={sorted(OUTPUT_FILENAMES - actual)}; "
            f"unexpected={sorted(actual - OUTPUT_FILENAMES)}"
        )
    payloads = {
        name: json.loads((output_dir / name).read_text(encoding="utf-8"))
        for name in sorted(actual)
    }
    errors: list[str] = []
    for name, payload in payloads.items():
        forbidden = _forbidden_keys(payload)
        if forbidden:
            errors.append(f"Forbidden participant, prediction, or BP keys in {name}: {sorted(forbidden)}")
        if _has_absolute_path(payload):
            errors.append(f"Absolute path detected in {name}")
        if _unsuppressed_small_counts(payload, minimum):
            errors.append(f"Unsuppressed small cell detected in {name}")

    manifest = payloads["lasi_hypertension_locked_test_manifest.json"]
    expected = {
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
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            errors.append(f"Frozen governance assertion mismatch: {key}")
    metrics = payloads["lasi_hypertension_locked_test_metrics.json"]
    if metrics.get("configuration") != FROZEN_CONFIGURATION:
        errors.append("Metrics configuration mismatch")
    if metrics.get("frozen_threshold") != FROZEN_THRESHOLD:
        errors.append("Metrics threshold mismatch")
    required_metrics = {
        "row_count", "positive_count", "negative_count", "prevalence",
        "auroc", "average_precision", "brier_score", "sensitivity",
        "specificity", "ppv", "npv", "true_negative_count",
        "false_positive_count", "false_negative_count", "true_positive_count",
    }
    if not required_metrics <= set(metrics):
        errors.append("Locked-test metrics schema is incomplete")
    calibration = payloads["lasi_hypertension_locked_test_calibration.json"]
    if calibration.get("configuration") != FROZEN_CONFIGURATION or not {
        "calibration_intercept", "calibration_slope"
    } <= set(calibration):
        errors.append("Calibration schema mismatch")
    decision = payloads["lasi_hypertension_final_model_decision_input.json"]
    if decision.get("manual_decision_required") is not True:
        errors.append("Manual decision requirement is missing")
    if decision.get("automatic_approval_performed") is not False:
        errors.append("Automatic approval is forbidden")
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "validation_passed": True,
        "validated_output_count": len(payloads),
        "locked_test_evaluated": True,
        "minimum_cell_count": minimum,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--min-cell-count", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    validate_outputs(args.output_dir, args.min_cell_count)
    print("LASI hypertension locked-test outputs passed privacy validation.")


if __name__ == "__main__":
    main()
