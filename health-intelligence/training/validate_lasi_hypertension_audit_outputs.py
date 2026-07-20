"""Validate privacy and schema of LASI hypertension aggregate audit outputs."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:
    from training.lasi_hypertension_audit_utils import (
        OUTPUT_FILENAMES, contains_row_like_array, has_absolute_path,
        suppression_marker,
    )
except ModuleNotFoundError:  # Direct script execution from repository root.
    from lasi_hypertension_audit_utils import (
        OUTPUT_FILENAMES, contains_row_like_array, has_absolute_path,
        suppression_marker,
    )


TOP_LEVEL_SCHEMAS = {
    "lasi_hypertension_variable_candidates.json": {
        "aggregate_metadata_only", "candidates",
    },
    "lasi_hypertension_target_candidates.json": {
        "target_name", "target_constructed",
        "representative_bp_aggregation_approved", "candidates",
    },
    "lasi_hypertension_predictor_candidates.json": {
        "predictor_allowlist_policy", "candidates",
    },
    "lasi_hypertension_code_distributions.json": {
        "aggregate_only", "distributions",
    },
    "lasi_hypertension_missingness_summary.json": {
        "aggregate_only", "variables",
    },
    "lasi_hypertension_audit_manifest.json": {
        "source_files", "codebook_files", "participant_level_exported",
        "absolute_paths_exported", "direct_identifier_values_exported",
        "raw_bp_values_exported", "small_cell_suppression_applied",
        "minimum_cell_count", "model_trained", "cohort_created",
        "locked_test_created", "locked_test_evaluated",
    },
}
REQUIRED_FALSE = {
    "participant_level_exported", "absolute_paths_exported",
    "direct_identifier_values_exported", "raw_bp_values_exported",
    "model_trained", "cohort_created", "locked_test_created",
    "locked_test_evaluated",
}
CANDIDATE_FIELDS = {
    "canonical_name", "source_file", "source_column", "source_label", "role",
    "data_type", "code_meanings", "missing_and_special_codes",
    "proposed_transformation", "available_from_healthguard_users",
    "allowed_in_profile_model", "leakage_rationale", "manual_approval_status",
}
EMAIL = re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d -]{8,}\d)(?!\d)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--min-cell-count", type=int, default=10)
    return parser.parse_args()


def _contains_small_exact_count(value: Any, minimum: int) -> bool:
    if isinstance(value, dict):
        return any(_contains_small_exact_count(item, minimum) for item in value.values())
    if isinstance(value, list):
        return any(_contains_small_exact_count(item, minimum) for item in value)
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value < minimum


def _contains_direct_identifier_value(value: Any) -> bool:
    if isinstance(value, dict):
        return any(_contains_direct_identifier_value(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_direct_identifier_value(item) for item in value)
    return isinstance(value, str) and bool(EMAIL.search(value) or PHONE.search(value))


def validate_outputs(output_dir: Path, min_cell_count: int = 10) -> dict[str, Any]:
    if min_cell_count < 2:
        raise ValueError("min-cell-count must be at least 2")
    if not output_dir.is_dir():
        raise FileNotFoundError("Hypertension audit output directory is unavailable")
    actual = {path.name for path in output_dir.iterdir() if path.is_file()}
    if actual != OUTPUT_FILENAMES:
        raise ValueError(f"Unexpected output filenames: {sorted(actual)}")
    payloads = {
        name: json.loads((output_dir / name).read_text(encoding="utf-8"))
        for name in sorted(actual)
    }
    errors = []
    for name, payload in payloads.items():
        if not isinstance(payload, dict) or set(payload) != TOP_LEVEL_SCHEMAS[name]:
            errors.append(f"Unexpected aggregate schema: {name}")
        if has_absolute_path(payload):
            errors.append(f"Absolute path detected: {name}")
        if contains_row_like_array(payload):
            errors.append(f"Row-like participant array detected: {name}")
        if _contains_direct_identifier_value(payload):
            errors.append(f"Possible direct identifier value detected: {name}")

    distributions = payloads["lasi_hypertension_code_distributions.json"]["distributions"]
    missingness = payloads["lasi_hypertension_missingness_summary.json"]["variables"]
    if _contains_small_exact_count(distributions, min_cell_count):
        errors.append("Unsuppressed small cell in code distributions")
    if _contains_small_exact_count(missingness, min_cell_count):
        errors.append("Unsuppressed small cell in missingness summary")
    marker = suppression_marker(min_cell_count)
    serialized_aggregates = json.dumps({"d": distributions, "m": missingness})
    if "SUPPRESSED_BELOW_" in serialized_aggregates and marker not in serialized_aggregates:
        errors.append("Suppression marker does not match configured minimum")

    candidates = payloads["lasi_hypertension_variable_candidates.json"]["candidates"]
    for candidate in candidates:
        if not isinstance(candidate, dict) or set(candidate) != CANDIDATE_FIELDS:
            errors.append("Candidate record is outside the approved aggregate metadata schema")
            if not isinstance(candidate, dict):
                continue
        if candidate.get("role") == "identifier":
            if candidate.get("source_label") is not None or candidate.get("code_meanings"):
                errors.append("Identifier metadata exposes unsafe label or codebook content")
        if candidate.get("canonical_name") in {
            "repeated_systolic_bp", "repeated_diastolic_bp"
        }:
            key_suffix = f".{candidate.get('source_column')}"
            matching = [value for key, value in distributions.items() if key.endswith(key_suffix)]
            if matching != ["not_exported_raw_bp_measurement"]:
                errors.append("Raw BP observation distribution detected")

    target_candidates = payloads["lasi_hypertension_target_candidates.json"]["candidates"]
    predictor_candidates = payloads["lasi_hypertension_predictor_candidates.json"]["candidates"]
    if any(item not in candidates for item in target_candidates + predictor_candidates):
        errors.append("Target or predictor candidate is absent from the audited candidate set")

    manifest = payloads["lasi_hypertension_audit_manifest.json"]
    for field in REQUIRED_FALSE:
        if manifest.get(field) is not False:
            errors.append(f"Required false privacy assertion failed: {field}")
    if manifest.get("small_cell_suppression_applied") is not True:
        errors.append("Small-cell suppression assertion is missing or false")
    if manifest.get("minimum_cell_count") != min_cell_count:
        errors.append("Manifest minimum-cell count mismatch")
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "validation_passed": True,
        "validated_output_count": len(payloads),
        "minimum_cell_count": min_cell_count,
    }


def main() -> None:
    args = parse_args()
    validate_outputs(args.output_dir, args.min_cell_count)
    print("LASI hypertension aggregate audit outputs passed privacy validation.")


if __name__ == "__main__":
    main()
