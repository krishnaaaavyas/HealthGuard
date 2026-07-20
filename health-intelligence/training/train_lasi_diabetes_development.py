"""Run privacy-safe LASI undiagnosed-diabetes development experiments.

This phase compares conservative models on development folds only. It never
evaluates the locked test fold, selects a threshold, saves a model, exports
predictions, or reads raw LASI files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, PolynomialFeatures, StandardScaler
from sklearn.tree import DecisionTreeClassifier


TARGET = "target_undiagnosed_diabetes"
GROUP_COLUMN = "ssu_group_id"
LOCKED_FOLD_INDEX = 0
EXPECTED_SCHEMA = [
    "age", "sex", "bmi", "waist_cm", "systolic_bp", "diastolic_bp",
    TARGET, "household_group_id", GROUP_COLUMN, "state", "india_dbs_weight",
    "flag_height_100_to_129", "flag_age_above_100", "flag_height_invalid",
    "flag_waist_invalid", "flag_bmi_invalid",
]
FORBIDDEN_COLUMNS = {
    "prim_key", "hhid", "ssuid", "hba1c", "ht003", "ht003c", "ht003d",
    "stateindividualweight", "statedbsweight", "target_any_diabetes",
    "five_category_outcome",
}
FORBIDDEN_PREDICTORS = set(EXPECTED_SCHEMA) - {"age", "bmi", "sex"}
FEATURE_SETS = {
    "A": ["age", "bmi"],
    "B": ["age", "bmi", "sex"],
    "C": ["age", "bmi", "sex", "age_squared", "bmi_squared", "age_bmi_interaction"],
}
EXPECTED_COUNTS = {"total": 50_865, "positive": 4_635, "negative": 46_230}
ALGORITHM_CONFIGS = {
    "logistic_regression": {
        "l1_ratio": 0.0, "solver": "lbfgs", "C": 1.0, "max_iter": 2000,
        "class_weight": None,
    },
    "shallow_decision_tree": {
        "max_depth": 3, "min_samples_leaf": 200, "class_weight": None,
    },
    "restricted_hist_gradient_boosting": {
        "max_iter": 100, "learning_rate": 0.05, "max_leaf_nodes": 7,
        "min_samples_leaf": 200, "l2_regularization": 1.0,
    },
    "dummy_prior": {"strategy": "prior"},
}
OUTPUT_FILES = [
    "lasi_development_split_summary.json",
    "lasi_development_model_comparison.json",
    "lasi_development_fold_metrics.csv",
    "lasi_development_calibration_summary.json",
    "lasi_development_run_manifest.json",
]
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cohort-path", required=True, type=Path)
    parser.add_argument("--manifest-path", required=True, type=Path)
    parser.add_argument("--validation-report-path", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--random-seed", required=True, type=int)
    return parser.parse_args()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate_output_dir(output_dir: Path) -> None:
    if _is_within(output_dir, REPOSITORY_ROOT):
        raise ValueError("Output directory must be outside the Git repository")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_prerequisites(
    cohort_path: Path,
    manifest: dict[str, Any],
    validation_report: dict[str, Any],
    cohort: pd.DataFrame,
    expected_counts: dict[str, int] | None = None,
) -> dict[str, int]:
    expected = expected_counts or EXPECTED_COUNTS
    failures = []
    if validation_report.get("validation_passed") is not True:
        failures.append("A passing independent validation report is mandatory")
    required_manifest = {
        "source_type": "real_lasi_wave1",
        "contains_raw_identifiers": False,
        "contains_target_defining_variables": False,
        "contains_synthetic_training_records": False,
    }
    for field, required in required_manifest.items():
        if manifest.get(field) != required:
            failures.append(f"Manifest requirement failed: {field}")
    if not cohort_path.is_file() or _sha256(cohort_path) != manifest.get("parquet_sha256"):
        failures.append("Cohort checksum mismatch")
    columns = list(cohort.columns)
    if columns != EXPECTED_SCHEMA:
        failures.append("Cohort schema or order is not exact")
    if FORBIDDEN_COLUMNS & set(columns):
        failures.append("Raw identifier or forbidden column present")
    if TARGET not in cohort:
        failures.append("Primary target is missing")
        counts = {"total": int(len(cohort)), "positive": 0, "negative": 0}
    else:
        target = pd.to_numeric(cohort[TARGET], errors="coerce")
        counts = {
            "total": int(len(cohort)), "positive": int(target.eq(1).sum()),
            "negative": int(target.eq(0).sum()),
        }
        if target.isna().any() or not target.isin([0, 1]).all():
            failures.append("Primary target is missing or invalid")
    if counts != expected:
        failures.append(f"Cohort or target counts do not match approved counts: {counts}")
    for key in ("total", "positive", "negative"):
        manifest_key = "primary_cohort_count" if key == "total" else f"{key}_count"
        if manifest.get(manifest_key) != expected[key]:
            failures.append(f"Manifest count does not match: {manifest_key}")
    if failures:
        raise ValueError("; ".join(failures))
    return counts


def validate_feature_policy(feature_set: str) -> None:
    if feature_set not in FEATURE_SETS:
        raise ValueError(f"Unknown feature set: {feature_set}")
    allowed_raw = {name for name in FEATURE_SETS[feature_set] if name in {"age", "bmi", "sex"}}
    if allowed_raw & FORBIDDEN_PREDICTORS:
        raise ValueError("Forbidden diabetes predictor requested")
    if feature_set == "C" and set(FEATURE_SETS[feature_set][3:]) != {
        "age_squared", "bmi_squared", "age_bmi_interaction"
    }:
        raise ValueError("Feature Set C engineering policy changed")


def _numeric_pipeline(scale: bool, nonlinear: bool) -> Pipeline:
    steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
    if nonlinear:
        steps.append(("engineered_age_bmi", PolynomialFeatures(degree=2, include_bias=False)))
    if scale:
        steps.append(("scaler", StandardScaler()))
    return Pipeline(steps)


def build_pipeline(feature_set: str, algorithm: str, random_seed: int) -> Pipeline:
    validate_feature_policy(feature_set)
    if algorithm not in ALGORITHM_CONFIGS or algorithm == "dummy_prior":
        raise ValueError(f"Unsupported feature model algorithm: {algorithm}")
    scale = algorithm == "logistic_regression"
    nonlinear = feature_set == "C"
    transformers = [("numeric", _numeric_pipeline(scale, nonlinear), ["age", "bmi"])]
    if feature_set in {"B", "C"}:
        transformers.append((
            "sex",
            Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("one_hot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]),
            ["sex"],
        ))
    preprocessing = ColumnTransformer(transformers, remainder="drop")
    if algorithm == "logistic_regression":
        estimator = LogisticRegression(**ALGORITHM_CONFIGS[algorithm], random_state=random_seed)
    elif algorithm == "shallow_decision_tree":
        estimator = DecisionTreeClassifier(**ALGORITHM_CONFIGS[algorithm], random_state=random_seed)
    else:
        estimator = HistGradientBoostingClassifier(
            **ALGORITHM_CONFIGS[algorithm], random_state=random_seed
        )
    return Pipeline([("preprocessing", preprocessing), ("model", estimator)])


def build_dummy_pipeline() -> Pipeline:
    return Pipeline([("model", DummyClassifier(strategy="prior"))])


def create_locked_split(
    cohort: pd.DataFrame, random_seed: int
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    splitter = StratifiedGroupKFold(
        n_splits=5, shuffle=True, random_state=random_seed
    )
    target = cohort[TARGET].to_numpy()
    groups = cohort[GROUP_COLUMN].to_numpy()
    folds = list(splitter.split(cohort, target, groups))
    development_index, locked_index = folds[LOCKED_FOLD_INDEX]
    locked_target = target[locked_index]
    structure = {
        "row_count": int(len(locked_index)),
        "positive_count": int(np.sum(locked_target == 1)),
        "negative_count": int(np.sum(locked_target == 0)),
        "positive_percentage": float(100 * np.mean(locked_target == 1)),
        "unique_ssu_count": int(pd.Series(groups[locked_index]).nunique()),
    }
    return development_index, locked_index, structure


def development_splits(
    development: pd.DataFrame, random_seed: int
) -> list[tuple[np.ndarray, np.ndarray]]:
    splitter = StratifiedGroupKFold(
        n_splits=5, shuffle=True, random_state=random_seed + 1
    )
    return list(splitter.split(
        development, development[TARGET], development[GROUP_COLUMN]
    ))


def _safe_metrics(target: np.ndarray, probability: np.ndarray) -> dict[str, float]:
    return {
        "roc_auc": float(roc_auc_score(target, probability)),
        "pr_auc": float(average_precision_score(target, probability)),
        "brier_score": float(brier_score_loss(target, probability)),
        "log_loss": float(log_loss(target, probability, labels=[0, 1])),
    }


def _calibration_bins(
    target: np.ndarray, probability: np.ndarray, bins: int = 10
) -> list[dict[str, Any]]:
    edges = np.linspace(0, 1, bins + 1)
    assigned = np.minimum(np.digitize(probability, edges[1:-1]), bins - 1)
    result = []
    for index in range(bins):
        selected = assigned == index
        result.append({
            "bin": index,
            "lower_bound": float(edges[index]),
            "upper_bound": float(edges[index + 1]),
            "count": int(selected.sum()),
            "mean_predicted_probability": float(probability[selected].mean()) if selected.any() else None,
            "observed_positive_rate": float(target[selected].mean()) if selected.any() else None,
        })
    return result


def _configuration_specs() -> list[tuple[str, str]]:
    return [("baseline", "dummy_prior")] + [
        (feature_set, algorithm)
        for feature_set in ("A", "B", "C")
        for algorithm in (
            "logistic_regression", "shallow_decision_tree",
            "restricted_hist_gradient_boosting",
        )
    ]


def run_development_experiments(
    cohort: pd.DataFrame, development_index: np.ndarray, random_seed: int
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    """Fit/evaluate only development folds; locked indices are never accepted."""
    development = cohort.iloc[development_index].reset_index(drop=True)
    folds = development_splits(development, random_seed)
    fold_rows: list[dict[str, Any]] = []
    calibration: dict[str, Any] = {}
    for feature_set, algorithm in _configuration_specs():
        configuration = f"{feature_set}_{algorithm}"
        calibration[configuration] = []
        for fold_index, (train_index, validation_index) in enumerate(folds):
            train = development.iloc[train_index]
            validation = development.iloc[validation_index]
            train_groups = set(train[GROUP_COLUMN])
            validation_groups = set(validation[GROUP_COLUMN])
            if train_groups & validation_groups:
                raise RuntimeError("SSU group leakage across development fold")
            if algorithm == "dummy_prior":
                pipeline = build_dummy_pipeline()
                train_x = np.zeros((len(train), 1))
                validation_x = np.zeros((len(validation), 1))
            else:
                pipeline = build_pipeline(feature_set, algorithm, random_seed)
                raw_features = [name for name in FEATURE_SETS[feature_set] if name in {"age", "bmi", "sex"}]
                train_x = train[raw_features]
                validation_x = validation[raw_features]
            train_y = train[TARGET].to_numpy()
            validation_y = validation[TARGET].to_numpy()
            pipeline.fit(train_x, train_y)
            probability = pipeline.predict_proba(validation_x)[:, 1]
            metrics = _safe_metrics(validation_y, probability)
            fold_rows.append({
                "configuration_name": configuration,
                "feature_set": feature_set,
                "algorithm": algorithm,
                "fold_index": fold_index,
                "train_rows": int(len(train)), "validation_rows": int(len(validation)),
                "train_positives": int(train_y.sum()),
                "validation_positives": int(validation_y.sum()),
                "unique_train_ssus": int(len(train_groups)),
                "unique_validation_ssus": int(len(validation_groups)),
                **metrics,
            })
            calibration[configuration].append({
                "fold_index": fold_index,
                "bins": _calibration_bins(validation_y, probability),
            })
    fold_frame = pd.DataFrame(fold_rows)
    comparison = {
        "primary_comparison_order": [
            "PR-AUC", "Brier score and calibration", "ROC-AUC",
            "fold stability", "simplicity",
        ],
        "threshold_selected": False,
        "configurations": [],
    }
    for configuration, values in fold_frame.groupby("configuration_name", sort=False):
        entry = {"configuration_name": configuration}
        entry.update({
            metric: {
                "mean": float(values[metric].mean()),
                "standard_deviation": float(values[metric].std(ddof=1)),
                "minimum": float(values[metric].min()),
                "maximum": float(values[metric].max()),
            }
            for metric in ("roc_auc", "pr_auc", "brier_score", "log_loss")
        })
        comparison["configurations"].append(entry)
    return fold_rows, comparison, calibration


def _package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def write_outputs(
    output_dir: Path,
    cohort_checksum: str,
    counts: dict[str, int],
    random_seed: int,
    split_summary: dict[str, Any],
    fold_rows: list[dict[str, Any]],
    comparison: dict[str, Any],
    calibration: dict[str, Any],
) -> None:
    validate_output_dir(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / OUTPUT_FILES[0]).write_text(json.dumps(split_summary, indent=2), encoding="utf-8")
    (output_dir / OUTPUT_FILES[1]).write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    pd.DataFrame(fold_rows).to_csv(output_dir / OUTPUT_FILES[2], index=False)
    (output_dir / OUTPUT_FILES[3]).write_text(json.dumps(calibration, indent=2), encoding="utf-8")
    manifest = {
        "source_type": "real_lasi_wave1",
        "cohort_checksum": cohort_checksum,
        "cohort_and_target_counts": counts,
        "random_seed": random_seed,
        "split_method": "StratifiedGroupKFold(n_splits=5, shuffle=True)",
        "locked_fold_index": LOCKED_FOLD_INDEX,
        "locked_test_aggregate_structure": split_summary["locked_test"],
        "development_aggregate_structure": split_summary["development"],
        "feature_set_definitions": FEATURE_SETS,
        "algorithm_configurations": ALGORITHM_CONFIGS,
        "preprocessing_policies": {
            "numeric": "median imputation inside pipeline; logistic scaled",
            "sex": "most-frequent imputation and unknown-safe one-hot encoding inside pipeline",
            "feature_set_c": "age/BMI degree-2 terms after imputation inside pipeline",
            "resampling": "none",
        },
        "software_versions": {
            "python": platform.python_version(), "pandas": pd.__version__,
            "numpy": np.__version__, "scikit_learn": _package_version("scikit-learn"),
        },
        "contains_participant_records": False,
        "contains_row_level_predictions": False,
        "contains_group_identifier_values": False,
        "synthetic_training_records_used": False,
        "raw_lasi_files_accessed": False,
        "old_icmr_model_used": False,
    }
    (output_dir / OUTPUT_FILES[4]).write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    validate_output_dir(args.output_dir)
    for label, path in {
        "cohort": args.cohort_path, "manifest": args.manifest_path,
        "validation report": args.validation_report_path,
    }.items():
        if not path.is_file():
            raise SystemExit(f"Required {label} file is missing")
    manifest = json.loads(args.manifest_path.read_text(encoding="utf-8"))
    validation_report = json.loads(args.validation_report_path.read_text(encoding="utf-8"))
    cohort = pd.read_parquet(args.cohort_path, engine="pyarrow")
    counts = validate_prerequisites(
        args.cohort_path, manifest, validation_report, cohort
    )
    development_index, _locked_index, locked_structure = create_locked_split(
        cohort, args.random_seed
    )
    development = cohort.iloc[development_index]
    development_structure = {
        "row_count": int(len(development)),
        "positive_count": int(development[TARGET].eq(1).sum()),
        "negative_count": int(development[TARGET].eq(0).sum()),
        "positive_percentage": float(100 * development[TARGET].mean()),
        "unique_ssu_count": int(development[GROUP_COLUMN].nunique()),
    }
    split_summary = {
        "method": "StratifiedGroupKFold", "locked_fold_index": LOCKED_FOLD_INDEX,
        "locked_test_evaluated": False, "locked_test": locked_structure,
        "development": development_structure,
    }
    fold_rows, comparison, calibration = run_development_experiments(
        cohort, development_index, args.random_seed
    )
    write_outputs(
        args.output_dir, manifest["parquet_sha256"], counts, args.random_seed,
        split_summary, fold_rows, comparison, calibration,
    )
    print("LASI development comparison complete; locked test remains unevaluated.")


if __name__ == "__main__":
    main()
