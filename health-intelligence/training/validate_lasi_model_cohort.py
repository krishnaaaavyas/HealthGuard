"""Independently validate the restricted LASI modelling cohort.

The validator reads one derived Parquet file plus its aggregate manifest and
summary. It writes a single aggregate-only validation report and never emits
participant rows, group-ID values, predictions, or a modified cohort.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import numpy as np
import pandas as pd


EXPECTED_SCHEMA = [
    "age", "sex", "bmi", "waist_cm", "systolic_bp", "diastolic_bp",
    "target_undiagnosed_diabetes", "household_group_id", "ssu_group_id",
    "state", "india_dbs_weight", "flag_height_100_to_129",
    "flag_age_above_100", "flag_height_invalid", "flag_waist_invalid",
    "flag_bmi_invalid",
]
FORBIDDEN_COLUMNS = {
    "prim_key", "hhid", "ssuid", "hba1c", "ht003", "ht003c", "ht003d",
    "stateindividualweight", "statedbsweight", "target_any_diabetes",
    "five_category_outcome",
}
EXPECTED_COUNTS = {"total": 50_865, "positive": 4_635, "negative": 46_230}
EXPECTED_GROUP_COUNTS = {"household": 35_436, "ssu": 2_438}
EXPECTED_SOURCE_TYPE = "real_lasi_wave1"
OUTPUT_FILENAME = "lasi_model_cohort_validation.json"
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
HMAC_PATTERN = re.compile(r"^[0-9a-f]{64}$")
WINDOWS_ABSOLUTE_PATTERN = re.compile(r"^[A-Za-z]:[\\/]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cohort-path", required=True, type=Path)
    parser.add_argument("--manifest-path", required=True, type=Path)
    parser.add_argument("--summary-path", required=True, type=Path)
    parser.add_argument("--output-path", required=True, type=Path)
    return parser.parse_args()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate_output_path(output_path: Path) -> None:
    if _is_within(output_path, REPOSITORY_ROOT):
        raise ValueError("Validation output path must be outside the Git repository")
    if output_path.name != OUTPUT_FILENAME:
        raise ValueError(f"Output filename must be {OUTPUT_FILENAME}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _add(check: bool, message: str, errors: list[str]) -> bool:
    if not check:
        errors.append(message)
    return check


def _string_values(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _string_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _string_values(item)
    elif isinstance(value, str):
        yield value


def _contains_absolute_path(value: Any) -> bool:
    for text in _string_values(value):
        if WINDOWS_ABSOLUTE_PATTERN.match(text):
            return True
        if text.startswith("/") and PurePosixPath(text).is_absolute():
            return True
    return False


def _manifest_checks(
    manifest: dict[str, Any],
    expected_counts: dict[str, int],
    group_values: set[str] | None = None,
) -> dict[str, bool]:
    source_files = manifest.get("source_files")
    basenames_only = isinstance(source_files, dict) and all(
        isinstance(value, str)
        and value == PureWindowsPath(value).name
        and value == PurePosixPath(value).name
        for value in source_files.values()
    )
    lowered_keys = {text.lower() for text in _string_values(manifest)}
    serialized = json.dumps(manifest, sort_keys=True)
    return {
        "source_type": manifest.get("source_type") == EXPECTED_SOURCE_TYPE,
        "primary_cohort_count": manifest.get("primary_cohort_count") == expected_counts["total"],
        "positive_count": manifest.get("positive_count") == expected_counts["positive"],
        "negative_count": manifest.get("negative_count") == expected_counts["negative"],
        "contains_raw_identifiers_false": manifest.get("contains_raw_identifiers") is False,
        "contains_target_defining_variables_false": manifest.get("contains_target_defining_variables") is False,
        "contains_synthetic_training_records_false": manifest.get("contains_synthetic_training_records") is False,
        "source_files_are_basenames": basenames_only,
        "contains_no_absolute_paths": not _contains_absolute_path(manifest),
        "contains_no_salt": not any("salt" in text for text in lowered_keys),
        "contains_no_group_identifier_values": not any(
            value in serialized for value in (group_values or set())
        ),
    }


def _distribution(series: pd.Series) -> dict[str, int]:
    return {
        str(code): int(count)
        for code, count in series.value_counts(dropna=False).items()
    }


def _calculated_summary(cohort: pd.DataFrame, counts: dict[str, int]) -> dict[str, Any]:
    age = pd.to_numeric(cohort["age"], errors="coerce")
    return {
        "row_count": counts["total"],
        "target_counts": counts,
        "predictor_missingness": {
            column: int(cohort[column].isna().sum())
            for column in ["age", "sex", "bmi", "waist_cm", "systolic_bp", "diastolic_bp"]
        },
        "sex_distribution": _distribution(cohort["sex"]),
        "age_band_counts": {
            "45_to_59": int((age.ge(45) & age.lt(60)).sum()),
            "60_to_74": int((age.ge(60) & age.lt(75)).sum()),
            "75_plus": int(age.ge(75).sum()),
        },
        "state_counts": _distribution(cohort["state"]),
        "unique_household_group_count": int(cohort["household_group_id"].nunique()),
        "unique_ssu_group_count": int(cohort["ssu_group_id"].nunique()),
        "quality_flag_counts": {
            column: int(pd.to_numeric(cohort[column], errors="coerce").fillna(0).sum())
            for column in EXPECTED_SCHEMA if column.startswith("flag_")
        },
    }


def _summary_checks(summary: dict[str, Any], calculated: dict[str, Any]) -> dict[str, bool]:
    fields = [
        "row_count", "target_counts", "predictor_missingness", "sex_distribution",
        "age_band_counts", "state_counts", "unique_household_group_count",
        "unique_ssu_group_count", "quality_flag_counts",
    ]
    return {field: summary.get(field) == calculated[field] for field in fields}


def validate_cohort(
    cohort_path: Path,
    manifest_path: Path,
    summary_path: Path,
    output_path: Path,
    expected_counts: dict[str, int] | None = None,
    expected_group_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Validate and write one aggregate-only report, returning that report."""
    expected_counts = expected_counts or EXPECTED_COUNTS
    expected_group_counts = expected_group_counts or EXPECTED_GROUP_COUNTS
    validate_output_path(output_path)
    for label, path in {
        "cohort": cohort_path, "manifest": manifest_path, "summary": summary_path
    }.items():
        if not path.is_file():
            raise FileNotFoundError(f"Required {label} file not found")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    cohort = pd.read_parquet(cohort_path, engine="pyarrow")
    errors: list[str] = []
    warnings: list[str] = []

    checksum_match = _sha256(cohort_path) == manifest.get("parquet_sha256")
    _add(checksum_match, "Parquet checksum does not match manifest", errors)
    actual_columns = list(cohort.columns)
    schema_match = actual_columns == EXPECTED_SCHEMA
    _add(schema_match, "Cohort schema or column order is not exact", errors)
    forbidden_present = sorted(FORBIDDEN_COLUMNS & set(actual_columns))
    _add(not forbidden_present, "Forbidden cohort columns are present", errors)

    # Continue only when required columns exist; otherwise report structural errors safely.
    missing_required = [column for column in EXPECTED_SCHEMA if column not in cohort]
    range_checks: dict[str, int] = {}
    group_counts = {"household": None, "ssu": None}
    nesting = {"household_to_ssu": False, "ssu_to_state": False}
    calculated: dict[str, Any] | None = None
    summary_consistency: dict[str, bool] = {}
    counts = {"total": int(len(cohort)), "positive": 0, "negative": 0}

    if not missing_required:
        target = pd.to_numeric(cohort["target_undiagnosed_diabetes"], errors="coerce")
        counts.update({
            "positive": int(target.eq(1).sum()),
            "negative": int(target.eq(0).sum()),
        })
        _add(counts["total"] == expected_counts["total"], "Wrong cohort row count", errors)
        _add(not target.isna().any(), "Target contains missing values", errors)
        _add(target.dropna().isin([0, 1]).all(), "Target contains values other than 0 and 1", errors)
        _add(counts["positive"] == expected_counts["positive"], "Wrong positive target count", errors)
        _add(counts["negative"] == expected_counts["negative"], "Wrong negative target count", errors)

        age = pd.to_numeric(cohort["age"], errors="coerce")
        sex = pd.to_numeric(cohort["sex"], errors="coerce")
        bmi = pd.to_numeric(cohort["bmi"], errors="coerce")
        waist = pd.to_numeric(cohort["waist_cm"], errors="coerce")
        weight = pd.to_numeric(cohort["india_dbs_weight"], errors="coerce")
        range_checks = {
            "age_below_45_or_missing": int((age.lt(45) | age.isna()).sum()),
            "invalid_sex_code_or_missing": int((~sex.isin([1, 2])).sum()),
            "bmi_outside_10_to_80": int((bmi.notna() & ~bmi.between(10, 80)).sum()),
            "waist_outside_40_to_200": int((waist.notna() & ~waist.between(40, 200)).sum()),
            "nonfinite_or_nonpositive_weight": int((~np.isfinite(weight) | weight.le(0)).sum()),
        }
        for name, count in range_checks.items():
            _add(count == 0, f"Range validation failed: {name}", errors)

        household = cohort["household_group_id"]
        ssu = cohort["ssu_group_id"]
        household_format_bad = int(
            (household.isna() | ~household.astype("string").str.fullmatch(HMAC_PATTERN, na=False)).sum()
        )
        ssu_format_bad = int(
            (ssu.isna() | ~ssu.astype("string").str.fullmatch(HMAC_PATTERN, na=False)).sum()
        )
        _add(household_format_bad == 0, "Malformed household group IDs", errors)
        _add(ssu_format_bad == 0, "Malformed SSU group IDs", errors)
        household_nesting_bad = int(
            cohort.groupby("household_group_id", dropna=False)["ssu_group_id"]
            .nunique(dropna=False).gt(1).sum()
        )
        ssu_nesting_bad = int(
            cohort.groupby("ssu_group_id", dropna=False)["state"]
            .nunique(dropna=False).gt(1).sum()
        )
        nesting = {
            "household_to_ssu": household_nesting_bad == 0,
            "ssu_to_state": ssu_nesting_bad == 0,
        }
        _add(nesting["household_to_ssu"], "Household-to-SSU nesting is inconsistent", errors)
        _add(nesting["ssu_to_state"], "SSU-to-state nesting is inconsistent", errors)
        group_counts = {
            "household": int(household.nunique(dropna=True)),
            "ssu": int(ssu.nunique(dropna=True)),
        }
        _add(group_counts["household"] == expected_group_counts["household"], "Wrong unique household-group count", errors)
        _add(group_counts["ssu"] == expected_group_counts["ssu"], "Wrong unique SSU-group count", errors)

        exact_duplicates = int(cohort.duplicated().sum())
        if exact_duplicates:
            warnings.append(
                "Exact duplicate feature rows observed; not interpreted as duplicate participants"
            )
        calculated = _calculated_summary(cohort, counts)
        summary_consistency = _summary_checks(summary, calculated)
        for field, matches in summary_consistency.items():
            _add(matches, f"Supplied summary mismatch: {field}", errors)
    else:
        exact_duplicates = 0
        errors.append("Required schema columns are missing")

    group_values = set()
    if not missing_required:
        group_values.update(cohort["household_group_id"].dropna().astype(str))
        group_values.update(cohort["ssu_group_id"].dropna().astype(str))
    manifest_checks = _manifest_checks(manifest, expected_counts, group_values)
    for name, passed in manifest_checks.items():
        _add(passed, f"Manifest validation failed: {name}", errors)

    report = {
        "validation_passed": not errors,
        "checksum_match": checksum_match,
        "schema_match": schema_match,
        "row_count": counts["total"],
        "target_counts": counts,
        "predictor_missingness": (
            calculated["predictor_missingness"] if calculated else {}
        ),
        "range_check_counts": range_checks,
        "group_counts": group_counts,
        "nesting_results": nesting,
        "exact_duplicate_row_count": exact_duplicates,
        "manifest_checks": manifest_checks,
        "summary_consistency_checks": summary_consistency,
        "errors": errors,
        "warnings": warnings,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    args = parse_args()
    try:
        report = validate_cohort(
            args.cohort_path, args.manifest_path, args.summary_path, args.output_path
        )
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"LASI cohort validation could not run: {exc}") from exc
    if not report["validation_passed"]:
        raise SystemExit("LASI cohort validation failed; see aggregate validation report")
    print("LASI cohort validation passed. Aggregate report written.")


if __name__ == "__main__":
    main()
