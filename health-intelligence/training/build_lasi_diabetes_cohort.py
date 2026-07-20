"""Build the restricted, de-identified LASI undiagnosed-diabetes cohort.

Production inputs and outputs must remain outside the Git repository. The
builder reads an exact source-column allowlist, exports no raw identifiers or
target-defining evidence, and has no fallback dataset or training behavior.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import platform
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd


JOIN_KEY = "prim_key"
EXPECTED_FILENAMES = {
    "individual": "3_LASI_W1_Individual_v4.dta",
    "biomarker": "4_LASI_W1_Biomarker.dta",
    "dbs": "LASI_Wave1_DBS-Dataset_v1_July2025_STATA.dta",
}
APPROVED_COLUMNS = {
    "individual": [
        "prim_key", "hhid", "ssuid", "dm003", "dm005", "ht003",
        "stateindividualweight",
    ],
    "biomarker": [
        "prim_key", "state", "bm017", "bm018", "bm067", "bm071",
        "bm076",
    ],
    "dbs": ["prim_key", "hba1c", "indiadbsweight", "statedbsweight"],
}
OUTPUT_SCHEMA = [
    "age", "sex", "bmi", "waist_cm", "systolic_bp", "diastolic_bp",
    "target_undiagnosed_diabetes", "household_group_id", "ssu_group_id",
    "state", "india_dbs_weight", "flag_height_100_to_129",
    "flag_age_above_100", "flag_height_invalid", "flag_waist_invalid",
    "flag_bmi_invalid",
]
EXCLUDED_COLUMNS = [
    "prim_key", "hhid", "ssuid", "hba1c", "ht003", "ht003c", "ht003d",
    "stateindividualweight", "statedbsweight",
]
EXPECTED_COUNTS = {"total": 50_865, "positive": 4_635, "negative": 46_230}
OUTPUT_FILES = {
    "cohort": "lasi_undiagnosed_diabetes_cohort.parquet",
    "manifest": "lasi_diabetes_cohort_manifest.json",
    "summary": "lasi_diabetes_cohort_summary.json",
}
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--individual-path", required=True, type=Path)
    parser.add_argument("--biomarker-path", required=True, type=Path)
    parser.add_argument("--dbs-path", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate_external_paths(paths: dict[str, Path], output_dir: Path) -> None:
    """Reject any raw input or output directory located inside this repo."""
    for role, path in paths.items():
        if _is_within(path, REPOSITORY_ROOT):
            raise ValueError(f"{role} raw input must be outside the Git repository")
    if _is_within(output_dir, REPOSITORY_ROOT):
        raise ValueError("Output directory must be outside the Git repository")


def validate_filenames(paths: dict[str, Path]) -> None:
    for role, path in paths.items():
        if path.name.lower() != EXPECTED_FILENAMES[role].lower():
            raise ValueError(
                f"Unexpected {role} filename {path.name!r}; "
                f"expected {EXPECTED_FILENAMES[role]!r}"
            )


def read_approved_columns(
    path: Path,
    role: str,
    reader: Callable[..., tuple[pd.DataFrame, Any]] | None = None,
) -> pd.DataFrame:
    """Read exactly the approved columns; never substitute another source."""
    if role not in APPROVED_COLUMNS:
        raise ValueError(f"Unknown source role: {role}")
    if not path.is_file():
        raise FileNotFoundError(f"Required LASI {role} file not found: {path.name}")
    if reader is None:
        import pyreadstat
        reader = pyreadstat.read_dta
    _, metadata = reader(str(path), metadataonly=True)
    available = {
        name.lower(): name for name in (getattr(metadata, "column_names", []) or [])
    }
    missing = [name for name in APPROVED_COLUMNS[role] if name not in available]
    if missing:
        raise ValueError(f"{role} source missing approved columns: {missing}")
    usecols = [available[name] for name in APPROVED_COLUMNS[role]]
    frame, _ = reader(str(path), usecols=usecols, apply_value_formats=False)
    rename = {available[name]: name for name in APPROVED_COLUMNS[role]}
    return frame.rename(columns=rename)[APPROVED_COLUMNS[role]].copy()


def validate_key(frame: pd.DataFrame, role: str) -> None:
    if JOIN_KEY not in frame:
        raise ValueError(f"{role}: missing prim_key")
    if frame[JOIN_KEY].isna().any():
        raise ValueError(f"{role}: missing prim_key values")
    if frame[JOIN_KEY].duplicated().any():
        raise ValueError(f"{role}: duplicate prim_key values")


def reject_row_expansion(before: int, after: int, stage: str) -> None:
    if after > before:
        raise ValueError(f"Row expansion rejected at {stage}: {before} -> {after}")


def _merge_required(base: pd.DataFrame, right: pd.DataFrame, role: str) -> pd.DataFrame:
    before = len(base)
    renamed = right.rename(columns={
        column: f"{role}__{column}" for column in right if column != JOIN_KEY
    })
    merged = base.merge(
        renamed, on=JOIN_KEY, how="left", validate="one_to_one", indicator=True
    )
    reject_row_expansion(before, len(merged), role)
    unmatched = int(merged["_merge"].eq("left_only").sum())
    if unmatched:
        raise ValueError(f"{role}: {unmatched} unmatched DBS participants")
    return merged.drop(columns="_merge")


def anonymous_group_id(value: Any, salt: str, namespace: str) -> str:
    if pd.isna(value) or not str(value).strip():
        raise ValueError(f"Missing source identifier for {namespace} group")
    message = f"{namespace}:{value}".encode("utf-8")
    return hmac.new(salt.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _validate_nesting(merged: pd.DataFrame) -> None:
    household_ssu = merged.groupby("individual__hhid", dropna=False)[
        "individual__ssuid"
    ].nunique(dropna=False)
    if household_ssu.gt(1).any():
        raise ValueError("Invalid household-to-SSU nesting")
    ssu_state = merged.groupby("individual__ssuid", dropna=False)[
        "biomarker__state"
    ].nunique(dropna=False)
    if ssu_state.gt(1).any():
        raise ValueError("Invalid SSU-to-state nesting")


def _numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)


def construct_cohort(
    individual: pd.DataFrame,
    biomarker: pd.DataFrame,
    dbs: pd.DataFrame,
    salt: str,
    enforce_expected_counts: bool = True,
) -> tuple[pd.DataFrame, dict[str, int]]:
    """Construct the allowed participant-level cohort in memory only."""
    if not salt:
        raise ValueError("LASI_GROUP_SALT is required")
    for role, frame in {
        "individual": individual, "biomarker": biomarker, "dbs": dbs
    }.items():
        validate_key(frame, role)
    merged = _merge_required(dbs.copy(), biomarker, "biomarker")
    merged = _merge_required(merged, individual, "individual")
    reject_row_expansion(len(dbs), len(merged), "final")
    _validate_nesting(merged)

    age = _numeric(merged["individual__dm005"])
    diagnosis = _numeric(merged["individual__ht003"])
    hba1c = _numeric(merged["hba1c"])
    eligible = age.ge(45) & diagnosis.eq(2) & hba1c.notna() & hba1c.ge(0)
    selected = merged.loc[eligible].copy()
    selected_age = age.loc[eligible]
    selected_hba1c = hba1c.loc[eligible]

    height = _numeric(selected["biomarker__bm067"])
    weight = _numeric(selected["biomarker__bm071"])
    waist = _numeric(selected["biomarker__bm076"])
    height_invalid = height.lt(100) | height.gt(220)
    waist_invalid = waist.lt(40) | waist.gt(200)
    clean_height = height.mask(height_invalid)
    clean_waist = waist.mask(waist_invalid)
    bmi = weight / ((clean_height / 100.0) ** 2)
    bmi_invalid = bmi.lt(10) | bmi.gt(80)
    bmi = bmi.mask(bmi_invalid)

    household_ids = selected["individual__hhid"].map(
        lambda value: anonymous_group_id(value, salt, "household")
    )
    ssu_ids = selected["individual__ssuid"].map(
        lambda value: anonymous_group_id(value, salt, "ssu")
    )
    if household_ids.isna().any() or ssu_ids.isna().any():
        raise ValueError("Anonymous group IDs must be nonmissing")
    if selected["individual__hhid"].nunique() != household_ids.nunique():
        raise ValueError("Household anonymous group-ID collision detected")
    if selected["individual__ssuid"].nunique() != ssu_ids.nunique():
        raise ValueError("SSU anonymous group-ID collision detected")

    cohort = pd.DataFrame({
        "age": selected_age,
        "sex": selected["individual__dm003"],
        "bmi": bmi,
        "waist_cm": clean_waist,
        "systolic_bp": _numeric(selected["biomarker__bm017"]),
        "diastolic_bp": _numeric(selected["biomarker__bm018"]),
        "target_undiagnosed_diabetes": selected_hba1c.ge(6.5).astype("int8"),
        "household_group_id": household_ids,
        "ssu_group_id": ssu_ids,
        "state": selected["biomarker__state"],
        "india_dbs_weight": _numeric(selected["indiadbsweight"]),
        "flag_height_100_to_129": height.ge(100) & height.lt(130),
        "flag_age_above_100": selected_age.gt(100),
        "flag_height_invalid": height_invalid.fillna(False),
        "flag_waist_invalid": waist_invalid.fillna(False),
        "flag_bmi_invalid": bmi_invalid.fillna(False),
    }).reset_index(drop=True)
    cohort = cohort[OUTPUT_SCHEMA]
    counts = {
        "total": int(len(cohort)),
        "positive": int(cohort["target_undiagnosed_diabetes"].eq(1).sum()),
        "negative": int(cohort["target_undiagnosed_diabetes"].eq(0).sum()),
    }
    if enforce_expected_counts and counts != EXPECTED_COUNTS:
        raise ValueError(
            f"Expected aggregate count check failed: expected={EXPECTED_COUNTS}, "
            f"observed={counts}"
        )
    return cohort, counts


def _package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _summary(cohort: pd.DataFrame, counts: dict[str, int]) -> dict[str, Any]:
    age = cohort["age"]
    return {
        "aggregate_only": True,
        "row_count": counts["total"],
        "target_counts": counts,
        "predictor_missingness": {
            column: int(cohort[column].isna().sum())
            for column in ["age", "sex", "bmi", "waist_cm", "systolic_bp", "diastolic_bp"]
        },
        "sex_distribution": {
            str(code): int(count) for code, count in cohort["sex"].value_counts(dropna=False).items()
        },
        "age_band_counts": {
            "45_to_59": int(age.ge(45).mul(age.lt(60)).sum()),
            "60_to_74": int(age.ge(60).mul(age.lt(75)).sum()),
            "75_plus": int(age.ge(75).sum()),
        },
        "state_counts": {
            str(code): int(count) for code, count in cohort["state"].value_counts(dropna=False).items()
        },
        "unique_household_group_count": int(cohort["household_group_id"].nunique()),
        "unique_ssu_group_count": int(cohort["ssu_group_id"].nunique()),
        "quality_flag_counts": {
            column: int(cohort[column].sum()) for column in OUTPUT_SCHEMA if column.startswith("flag_")
        },
        "contains_participant_rows": False,
    }


def write_outputs(
    cohort: pd.DataFrame,
    counts: dict[str, int],
    output_dir: Path,
    source_paths: dict[str, Path],
    source_row_counts: dict[str, int],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = output_dir / OUTPUT_FILES["cohort"]
    cohort.to_parquet(parquet_path, index=False, engine="pyarrow")
    manifest = {
        "source_type": "real_lasi_wave1",
        "source_files": {role: path.name for role, path in source_paths.items()},
        "lasi_release_description": "LASI Wave 1 Individual, Biomarker, and July 2025 DBS release",
        "source_row_counts": source_row_counts,
        "joined_row_count": source_row_counts["dbs"],
        "primary_cohort_count": counts["total"],
        "positive_count": counts["positive"],
        "negative_count": counts["negative"],
        "target_definition": {
            "eligibility": "age >= 45; ht003 == 2; valid nonnegative HbA1c",
            "positive": "HbA1c >= 6.5", "negative": "HbA1c < 6.5",
        },
        "predictor_definitions": {
            "age": "dm005", "sex": "dm003", "bmi": "bm071 / (bm067 / 100)^2",
            "waist_cm": "bm076", "systolic_bp": "bm017", "diastolic_bp": "bm018",
        },
        "cleaning_rules": {
            "height_cm": "values <100 or >220 become missing; 100-129.9 flagged",
            "waist_cm": "values <40 or >200 become missing",
            "bmi": "calculated values <10 or >80 become missing",
            "age": "values >100 retained and flagged",
            "imputation": "none", "clipping": "none",
        },
        "excluded_column_list": EXCLUDED_COLUMNS,
        "parquet_sha256": _sha256(parquet_path),
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "software_versions": {
            "python": platform.python_version(), "pandas": pd.__version__,
            "pyreadstat": _package_version("pyreadstat"),
            "pyarrow": _package_version("pyarrow"), "numpy": np.__version__,
        },
        "contains_raw_identifiers": False,
        "contains_target_defining_variables": False,
        "contains_synthetic_training_records": False,
        "output_schema": OUTPUT_SCHEMA,
    }
    (output_dir / OUTPUT_FILES["manifest"]).write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    (output_dir / OUTPUT_FILES["summary"]).write_text(
        json.dumps(_summary(cohort, counts), indent=2), encoding="utf-8"
    )


def main() -> None:
    args = parse_args()
    paths = {
        "individual": args.individual_path,
        "biomarker": args.biomarker_path,
        "dbs": args.dbs_path,
    }
    validate_external_paths(paths, args.output_dir)
    validate_filenames(paths)
    salt = os.environ.get("LASI_GROUP_SALT")
    if not salt:
        raise SystemExit("LASI_GROUP_SALT is required")
    frames = {role: read_approved_columns(path, role) for role, path in paths.items()}
    cohort, counts = construct_cohort(
        frames["individual"], frames["biomarker"], frames["dbs"], salt,
        enforce_expected_counts=True,
    )
    write_outputs(
        cohort, counts, args.output_dir, paths,
        {role: int(len(frame)) for role, frame in frames.items()},
    )
    print("LASI undiagnosed-diabetes modelling cohort created securely.")


if __name__ == "__main__":
    main()
