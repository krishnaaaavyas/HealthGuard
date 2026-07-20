"""Validate privacy and schema of LASI hypertension target-policy outputs."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

try:
    from training.compare_lasi_hypertension_target_policies import OUTPUT_FILENAMES, POLICIES, TARGET_NAME
except ModuleNotFoundError:
    from compare_lasi_hypertension_target_policies import OUTPUT_FILENAMES, POLICIES, TARGET_NAME

ROW_KEYS = {"prim_key", "participant_id", "row_index", "rows", "records", "predictions"}
RAW_BP_KEYS = {"systolic", "diastolic"}


def _absolute(value: Any) -> bool:
    if isinstance(value, dict): return any(_absolute(k) or _absolute(v) for k, v in value.items())
    if isinstance(value, list): return any(_absolute(v) for v in value)
    if not isinstance(value, str): return False
    return bool(re.match(r"^[A-Za-z]:[\\/]", value)) or (value.startswith("/") and PurePosixPath(value).is_absolute()) or PureWindowsPath(value).is_absolute()


def _unsafe_structure(value: Any) -> bool:
    if isinstance(value, dict):
        if ROW_KEYS & set(value): return True
        if RAW_BP_KEYS & set(value): return True
        return any(_unsafe_structure(v) for v in value.values())
    if isinstance(value, list):
        if value and all(isinstance(item, dict) for item in value):
            combined = set().union(*(item.keys() for item in value))
            if ROW_KEYS & combined: return True
        return any(_unsafe_structure(v) for v in value)
    return False


def _small_exact(value: Any, minimum: int) -> bool:
    if isinstance(value, dict): return any(_small_exact(v, minimum) for v in value.values())
    if isinstance(value, list): return any(_small_exact(v, minimum) for v in value)
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value < minimum


def validate_outputs(output_dir: Path, minimum: int = 10) -> dict[str, Any]:
    if minimum < 2: raise ValueError("min-cell-count must be at least 2")
    if not output_dir.is_dir(): raise FileNotFoundError("output-dir is unavailable")
    actual = {path.name for path in output_dir.iterdir() if path.is_file()}
    if actual != OUTPUT_FILENAMES: raise ValueError("Unexpected output filenames")
    payloads = {name: json.loads((output_dir / name).read_text(encoding="utf-8")) for name in actual}
    errors: list[str] = []
    for name, payload in payloads.items():
        if _absolute(payload): errors.append(f"absolute path: {name}")
        if _unsafe_structure(payload): errors.append(f"participant-like array or raw BP values: {name}")
        if _small_exact(payload, minimum): errors.append(f"unsuppressed small count: {name}")
    comparison = payloads["lasi_hypertension_target_policy_comparison.json"].get("policies", [])
    names = [item.get("policy_name") for item in comparison]
    if tuple(names) != POLICIES: errors.append("executed policy set differs from declared policy set")
    manifest = payloads["lasi_hypertension_target_policy_manifest.json"]
    required_false = ("target_policy_approved", "participant_level_exported", "raw_bp_values_exported",
        "direct_identifier_values_exported", "absolute_paths_exported", "cohort_created", "model_trained",
        "locked_test_created", "locked_test_evaluated")
    if manifest.get("target_name") != TARGET_NAME: errors.append("wrong target name")
    if tuple(manifest.get("compared_policies", [])) != POLICIES: errors.append("manifest policy set mismatch")
    if any(manifest.get(field) is not False for field in required_false): errors.append("required fail-safe manifest assertion failed")
    if manifest.get("small_cell_suppression_applied") is not True or manifest.get("minimum_cell_count") != minimum:
        errors.append("suppression manifest mismatch")
    if errors: raise ValueError("; ".join(errors))
    return {"validation_passed": True, "validated_output_count": 5, "minimum_cell_count": minimum}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--min-cell-count", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    validate_outputs(args.output_dir, args.min_cell_count)
    print("LASI hypertension target-policy outputs passed privacy validation.")


if __name__ == "__main__": main()
