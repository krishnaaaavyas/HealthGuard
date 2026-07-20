"""Compare LASI hypertension target policies using aggregate-only outputs."""

from __future__ import annotations

import argparse
import json
from itertools import combinations
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import numpy as np
import pandas as pd

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TARGET_NAME = "undiagnosed_elevated_bp_screening_target"
APPROVED_TARGET_POLICY = "last_two_pairs_mean"
APPROVED_TARGET_SOURCE_COLUMNS = ("bm010", "bm011", "bm014", "bm015")
PRIMARY_POLICY_VALIDATION_COLUMNS = ("bm017", "bm018")
SYSTOLIC_TARGET_THRESHOLD = 140
DIASTOLIC_TARGET_THRESHOLD = 90
INDIVIDUAL_FILE = "3_LASI_W1_Individual_v4.dta"
BIOMARKER_FILE = "4_LASI_W1_Biomarker.dta"
INDIVIDUAL_COLUMNS = ["prim_key", "dm005", "ht002", "ht002c", "indiaindividualweight"]
BIOMARKER_COLUMNS = [
    "prim_key", "bm001", "bm002", "bm006", "bm007", "bm010", "bm011",
    "bm014", "bm015", "bm017", "bm018", "bm020", "bm021", "bm022",
]
POLICIES = (
    "all_valid_pairs_mean", "last_two_pairs_mean",
    "lasi_provided_last_two_average", "strict_compliant_last_two",
)
OUTPUT_FILENAMES = {
    "lasi_hypertension_target_policy_comparison.json",
    "lasi_hypertension_target_policy_agreement.json",
    "lasi_hypertension_target_policy_exclusions.json",
    "lasi_hypertension_target_quality_summary.json",
    "lasi_hypertension_target_policy_manifest.json",
}
BP_CONSENT_ACCEPTED_CODES = frozenset({1})
BP_COMPLIANCE_ACCEPTED_CODES = frozenset({1})
PAIR_COLUMNS = (("bm006", "bm007"), ("bm010", "bm011"), ("bm014", "bm015"))


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate_paths(data_root: Path, output_dir: Path) -> None:
    if _inside(data_root, REPOSITORY_ROOT):
        raise ValueError("data-root must be outside the Git worktree")
    if _inside(output_dir, REPOSITORY_ROOT):
        raise ValueError("output-dir must be outside the Git worktree")
    if output_dir.resolve() == data_root.resolve() or _inside(output_dir, data_root):
        raise ValueError("output-dir must not be inside the raw-data directory")
    if not data_root.is_dir():
        raise FileNotFoundError("data-root is unavailable")


def resolve_sources(data_root: Path) -> tuple[Path, Path]:
    paths = tuple(data_root / name for name in (INDIVIDUAL_FILE, BIOMARKER_FILE))
    if any(not path.is_file() for path in paths):
        raise FileNotFoundError("Required approved LASI source file is unavailable")
    return paths


def read_approved_sources(individual_path: Path, biomarker_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    individual = pd.read_stata(individual_path, columns=INDIVIDUAL_COLUMNS, convert_categoricals=False)
    biomarker = pd.read_stata(biomarker_path, columns=BIOMARKER_COLUMNS, convert_categoricals=False)
    if list(individual.columns) != INDIVIDUAL_COLUMNS or list(biomarker.columns) != BIOMARKER_COLUMNS:
        raise ValueError("Required approved fields could not be resolved exactly")
    return individual, biomarker


def validate_key(frame: pd.DataFrame, source: str) -> None:
    if frame["prim_key"].isna().any() or frame["prim_key"].duplicated().any():
        raise ValueError(f"{source} prim_key must be nonmissing and unique")


def private_join(individual: pd.DataFrame, biomarker: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    validate_key(individual, "individual")
    validate_key(biomarker, "biomarker")
    outer = individual.merge(biomarker, on="prim_key", how="outer", validate="one_to_one", indicator=True)
    diagnostics = {
        "individual_rows": len(individual), "biomarker_rows": len(biomarker),
        "matched_rows": int(outer["_merge"].eq("both").sum()),
        "individual_only_rows": int(outer["_merge"].eq("left_only").sum()),
        "biomarker_only_rows": int(outer["_merge"].eq("right_only").sum()),
    }
    joined = outer.loc[outer["_merge"].eq("both")].drop(columns=["_merge", "prim_key"])
    return joined, diagnostics


def _numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def valid_bp_value(series: pd.Series) -> pd.Series:
    values = _numeric(series)
    return values.notna() & np.isfinite(values) & values.gt(0)


def valid_pairs(frame: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        f"pair_{index}": valid_bp_value(frame[systolic]) & valid_bp_value(frame[diastolic])
        for index, (systolic, diastolic) in enumerate(PAIR_COLUMNS, 1)
    }, index=frame.index)


def policy_a(frame: pd.DataFrame) -> pd.DataFrame:
    pairs = valid_pairs(frame)
    count = pairs.sum(axis=1)
    systolic = pd.concat([
        _numeric(frame[s]).where(pairs[f"pair_{i}"]) for i, (s, _) in enumerate(PAIR_COLUMNS, 1)
    ], axis=1).mean(axis=1).where(count.ge(2))
    diastolic = pd.concat([
        _numeric(frame[d]).where(pairs[f"pair_{i}"]) for i, (_, d) in enumerate(PAIR_COLUMNS, 1)
    ], axis=1).mean(axis=1).where(count.ge(2))
    return _target_frame(systolic, diastolic)


def policy_b(frame: pd.DataFrame) -> pd.DataFrame:
    pairs = valid_pairs(frame)
    eligible = pairs["pair_2"] & pairs["pair_3"]
    systolic = (_numeric(frame[APPROVED_TARGET_SOURCE_COLUMNS[0]]) + _numeric(frame[APPROVED_TARGET_SOURCE_COLUMNS[2]])) / 2
    diastolic = (_numeric(frame[APPROVED_TARGET_SOURCE_COLUMNS[1]]) + _numeric(frame[APPROVED_TARGET_SOURCE_COLUMNS[3]])) / 2
    return _target_frame(systolic.where(eligible), diastolic.where(eligible))


def policy_c(frame: pd.DataFrame) -> pd.DataFrame:
    eligible = valid_bp_value(frame["bm017"]) & valid_bp_value(frame["bm018"])
    return _target_frame(_numeric(frame["bm017"]).where(eligible), _numeric(frame["bm018"]).where(eligible))


def policy_d(frame: pd.DataFrame) -> pd.DataFrame:
    result = policy_b(frame)
    compliant = _numeric(frame["bm001"]).isin(BP_CONSENT_ACCEPTED_CODES) & _numeric(frame["bm022"]).isin(BP_COMPLIANCE_ACCEPTED_CODES)
    result.loc[~compliant, ["systolic", "diastolic", "target"]] = np.nan
    return result


def _target_frame(systolic: pd.Series, diastolic: pd.Series) -> pd.DataFrame:
    target = ((systolic >= SYSTOLIC_TARGET_THRESHOLD) | (diastolic >= DIASTOLIC_TARGET_THRESHOLD)).astype("Int8")
    target = target.where(systolic.notna() & diastolic.notna())
    return pd.DataFrame({"systolic": systolic, "diastolic": diastolic, "target": target})


POLICY_FUNCTIONS = {
    "all_valid_pairs_mean": policy_a,
    "last_two_pairs_mean": policy_b,
    "lasi_provided_last_two_average": policy_c,
    "strict_compliant_last_two": policy_d,
}


def suppress(count: int, minimum: int) -> int | str:
    return count if count == 0 or count >= minimum else f"SUPPRESSED_BELOW_{minimum}"


def safe_percentage(count: int, denominator: int, minimum: int) -> float | str | None:
    if denominator == 0:
        return None
    if 0 < count < minimum:
        return f"SUPPRESSED_BELOW_{minimum}"
    return round(100 * count / denominator, 6)


def distribution(series: pd.Series, minimum: int) -> dict[str, int | str]:
    counts = series.value_counts(dropna=False)
    return {("missing" if pd.isna(key) else str(key)): suppress(int(value), minimum) for key, value in sorted(counts.items(), key=lambda item: str(item[0]))}


def weighted_prevalence(target: pd.Series, weight: pd.Series, minimum: int = 10) -> float | str | None:
    weights = _numeric(weight)
    mask = target.notna() & weights.notna() & np.isfinite(weights) & weights.gt(0)
    if not mask.any():
        return None
    positive = int(target[mask].eq(1).sum())
    if 0 < positive < minimum:
        return f"SUPPRESSED_BELOW_{minimum}"
    return round(float(np.average(target[mask].astype(float), weights=weights[mask])) * 100, 6)


def _policy_definition(name: str) -> tuple[str, str]:
    return {
        POLICIES[0]: ("Mean systolic and diastolic across the same valid pairs; at least two pairs.", "at_least_two_complete_valid_pairs"),
        POLICIES[1]: ("Mean complete valid pairs 2 and 3.", "complete_valid_pairs_2_and_3"),
        POLICIES[2]: ("Use LASI-provided bm017 and bm018 directly when both are valid.", "valid_bm017_and_bm018"),
        POLICIES[3]: ("Policy B plus accepted BP consent and compliance codes.", "policy_b_plus_consent_and_compliance"),
    }[name]


def build_outputs(joined: pd.DataFrame, join_diagnostics: dict[str, int], minimum: int) -> dict[str, Any]:
    age = _numeric(joined["dm005"])
    diagnosis = _numeric(joined["ht002"])
    base = age.ge(45) & diagnosis.eq(2)
    base_frame = joined.loc[base]
    results = {name: function(base_frame) for name, function in POLICY_FUNCTIONS.items()}
    comparison = []
    for name in POLICIES:
        target = results[name]["target"]
        constructible = int(target.notna().sum())
        positive = int(target.eq(1).sum())
        negative = int(target.eq(0).sum())
        definition, requirement = _policy_definition(name)
        comparison.append({
            "policy_name": name, "policy_definition": definition,
            "base_eligible_count": suppress(len(base_frame), minimum),
            "constructible_target_count": suppress(constructible, minimum),
            "excluded_count": suppress(len(base_frame) - constructible, minimum),
            "positive_count": suppress(positive, minimum), "negative_count": suppress(negative, minimum),
            "unweighted_prevalence_percent": safe_percentage(positive, constructible, minimum),
            "nationally_weighted_prevalence_percent": weighted_prevalence(target, base_frame["indiaindividualweight"], minimum),
            "valid_pair_requirement": requirement, "target_threshold": "systolic >= 140 OR diastolic >= 90",
            "target_name": TARGET_NAME,
        })
    agreements = []
    for first, second in combinations(POLICIES, 2):
        left, right = results[first]["target"], results[second]["target"]
        mask = left.notna() & right.notna()
        cells = {
            "both_positive": int((mask & left.eq(1) & right.eq(1)).sum()),
            "first_positive_second_negative": int((mask & left.eq(1) & right.eq(0)).sum()),
            "first_negative_second_positive": int((mask & left.eq(0) & right.eq(1)).sum()),
            "both_negative": int((mask & left.eq(0) & right.eq(0)).sum()),
        }
        compared = int(mask.sum())
        agreements.append({"first_policy": first, "second_policy": second,
            **{key: suppress(value, minimum) for key, value in cells.items()},
            "compared_count": suppress(compared, minimum),
            "overall_agreement_percent": safe_percentage(cells["both_positive"] + cells["both_negative"], compared, minimum)})
    pairs = valid_pairs(base_frame)
    pair_count = pairs.sum(axis=1)
    b, c = results[POLICIES[1]], results[POLICIES[2]]
    both = b["target"].notna() & c["target"].notna()
    sys_diff = (b["systolic"] - c["systolic"]).abs().where(both)
    dia_diff = (b["diastolic"] - c["diastolic"]).abs().where(both)
    def bands(series: pd.Series) -> dict[str, int | str]:
        values = series.dropna()
        raw = {"below_1": int(values.lt(1).sum()), "1_to_below_5": int(values.ge(1).mul(values.lt(5)).sum()),
               "5_to_below_10": int(values.ge(5).mul(values.lt(10)).sum()), "10_or_more": int(values.ge(10).sum())}
        return {key: suppress(value, minimum) for key, value in raw.items()}
    exclusions = {
        "below_age_eligibility": suppress(int(age.lt(45).sum()), minimum),
        "diagnosed_hypertension": suppress(int(age.ge(45).mul(diagnosis.eq(1)).sum()), minimum),
        "unknown_diagnosis": suppress(int(age.ge(45).mul(~diagnosis.isin([1, 2])).sum()), minimum),
        "missing_private_join": suppress(join_diagnostics["individual_only_rows"] + join_diagnostics["biomarker_only_rows"], minimum),
        "insufficient_valid_pairs": suppress(int((pair_count < 2).sum()), minimum),
        "missing_lasi_provided_average": suppress(int((~(valid_bp_value(base_frame["bm017"]) & valid_bp_value(base_frame["bm018"]))).sum()), minimum),
        "missing_consent": suppress(int(_numeric(base_frame["bm001"]).isna().sum()), minimum),
        "noncompliant_measurement": suppress(int((_numeric(base_frame["bm022"]).notna() & ~_numeric(base_frame["bm022"]).isin(BP_COMPLIANCE_ACCEPTED_CODES)).sum()), minimum),
        "missing_compliance": suppress(int(_numeric(base_frame["bm022"]).isna().sum()), minimum),
    }
    quality = {
        "valid_pair_patterns": distribution(pairs.astype(int).astype(str).agg("".join, axis=1), minimum),
        "valid_pair_count_distribution": distribution(pair_count, minimum),
        "policy_b_and_supplied_average_available": suppress(int(both.sum()), minimum),
        "systolic_absolute_difference_bands": bands(sys_diff), "diastolic_absolute_difference_bands": bands(dia_diff),
        "bp_consent_distribution": distribution(base_frame["bm001"], minimum),
        "recent_pre_measurement_activity_distribution": distribution(base_frame["bm002"], minimum),
        "position_distribution": distribution(base_frame["bm021"], minimum),
        "compliance_distribution": distribution(base_frame["bm022"], minimum),
        "nonpositive_or_nonfinite_bp_value_counts": {column: suppress(int((~valid_bp_value(base_frame[column]) & base_frame[column].notna()).sum()), minimum) for pair in PAIR_COLUMNS for column in pair},
        "positive_numeric_bp_values_retained_counts": {column: suppress(int(valid_bp_value(base_frame[column]).sum()), minimum) for pair in PAIR_COLUMNS for column in pair},
    }
    manifest = {"target_name": TARGET_NAME, "target_policy_approved": False,
        "compared_policies": list(POLICIES), "participant_level_exported": False,
        "raw_bp_values_exported": False, "direct_identifier_values_exported": False,
        "absolute_paths_exported": False, "small_cell_suppression_applied": True,
        "minimum_cell_count": minimum, "cohort_created": False, "model_trained": False,
        "locked_test_created": False, "locked_test_evaluated": False,
        "join_diagnostics": {key: suppress(value, minimum) for key, value in join_diagnostics.items()}}
    return {
        "lasi_hypertension_target_policy_comparison.json": {"policies": comparison},
        "lasi_hypertension_target_policy_agreement.json": {"agreements": agreements},
        "lasi_hypertension_target_policy_exclusions.json": {"exclusions": exclusions},
        "lasi_hypertension_target_quality_summary.json": quality,
        "lasi_hypertension_target_policy_manifest.json": manifest,
    }


def write_outputs(outputs: dict[str, Any], output_dir: Path) -> None:
    if set(outputs) != OUTPUT_FILENAMES:
        raise RuntimeError("Unexpected output schema")
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in sorted(outputs):
        (output_dir / name).write_text(json.dumps(outputs[name], indent=2, sort_keys=True), encoding="utf-8")


def execute(data_root: Path, output_dir: Path, minimum: int = 10) -> dict[str, Any]:
    if minimum < 2:
        raise ValueError("min-cell-count must be at least 2")
    validate_paths(data_root, output_dir)
    individual, biomarker = read_approved_sources(*resolve_sources(data_root))
    joined, diagnostics = private_join(individual, biomarker)
    outputs = build_outputs(joined, diagnostics, minimum)
    write_outputs(outputs, output_dir)
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--min-cell-count", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    execute(args.data_root, args.output_dir, args.min_cell_count)
    print("LASI hypertension target-policy aggregate comparison complete.")


if __name__ == "__main__":
    main()
