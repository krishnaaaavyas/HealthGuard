"""Synthetic-only tests for LASI Phase 3A model development."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

from training import train_lasi_diabetes_development as development


@pytest.fixture(scope="module")
def synthetic_cohort():
    rows = 100
    groups = [hashlib.sha256(f"synthetic-ssu-{i // 4}".encode()).hexdigest() for i in range(rows)]
    households = [hashlib.sha256(f"synthetic-house-{i // 2}".encode()).hexdigest() for i in range(rows)]
    target = np.array([1 if i % 5 == 0 else 0 for i in range(rows)], dtype=np.int8)
    frame = pd.DataFrame({
        "age": [45 + (i % 45) for i in range(rows)],
        "sex": [1 if i % 2 == 0 else 2 for i in range(rows)],
        "bmi": [None if i % 17 == 0 else 18 + (i % 20) for i in range(rows)],
        "waist_cm": [70 + (i % 30) for i in range(rows)],
        "systolic_bp": [110 + (i % 40) for i in range(rows)],
        "diastolic_bp": [65 + (i % 25) for i in range(rows)],
        development.TARGET: target,
        "household_group_id": households,
        development.GROUP_COLUMN: groups,
        "state": [1 + (i // 20) for i in range(rows)],
        "india_dbs_weight": [1.0 + (i % 5) / 10 for i in range(rows)],
        "flag_height_100_to_129": [False] * rows,
        "flag_age_above_100": [False] * rows,
        "flag_height_invalid": [False] * rows,
        "flag_waist_invalid": [False] * rows,
        "flag_bmi_invalid": [False] * rows,
    })
    return frame[development.EXPECTED_SCHEMA]


@pytest.fixture
def prerequisite_files(tmp_path, synthetic_cohort):
    pytest.importorskip("pyarrow")
    cohort_path = tmp_path / "lasi_undiagnosed_diabetes_cohort.parquet"
    synthetic_cohort.to_parquet(cohort_path, index=False, engine="pyarrow")
    counts = {"total": 100, "positive": 20, "negative": 80}
    manifest = {
        "source_type": "real_lasi_wave1",
        "contains_raw_identifiers": False,
        "contains_target_defining_variables": False,
        "contains_synthetic_training_records": False,
        "primary_cohort_count": 100,
        "positive_count": 20,
        "negative_count": 80,
        "parquet_sha256": development._sha256(cohort_path),
    }
    validation = {"validation_passed": True}
    return cohort_path, manifest, validation, counts


@pytest.fixture(scope="module")
def split_data(synthetic_cohort):
    return development.create_locked_split(synthetic_cohort, 42)


@pytest.fixture(scope="module")
def experiment_results(synthetic_cohort, split_data):
    development_index, _, _ = split_data
    return development.run_development_experiments(synthetic_cohort, development_index, 42)


def validate(files, cohort):
    path, manifest, report, counts = files
    return development.validate_prerequisites(
        path, manifest, report, cohort, expected_counts=counts
    )


def test_valid_validation_report_is_mandatory(prerequisite_files, synthetic_cohort):
    prerequisite_files[2]["validation_passed"] = False
    with pytest.raises(ValueError, match="mandatory"):
        validate(prerequisite_files, synthetic_cohort)


def test_checksum_mismatch_fails(prerequisite_files, synthetic_cohort):
    prerequisite_files[1]["parquet_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="checksum"):
        validate(prerequisite_files, synthetic_cohort)


def test_wrong_cohort_or_target_counts_fail(prerequisite_files, synthetic_cohort):
    prerequisite_files[3]["positive"] = 21
    with pytest.raises(ValueError, match="counts"):
        validate(prerequisite_files, synthetic_cohort)


def test_synthetic_source_manifest_fails(prerequisite_files, synthetic_cohort):
    prerequisite_files[1]["contains_synthetic_training_records"] = True
    with pytest.raises(ValueError, match="contains_synthetic"):
        validate(prerequisite_files, synthetic_cohort)


@pytest.mark.parametrize("column", ["prim_key", "hba1c", "target_any_diabetes"])
def test_raw_identifier_or_forbidden_column_fails(
    prerequisite_files, synthetic_cohort, column
):
    changed = synthetic_cohort.copy()
    changed[column] = "synthetic-forbidden"
    with pytest.raises(ValueError, match="schema|forbidden"):
        validate(prerequisite_files, changed)


def test_exact_feature_set_allowlists():
    assert development.FEATURE_SETS == {
        "A": ["age", "bmi"],
        "B": ["age", "bmi", "sex"],
        "C": ["age", "bmi", "sex", "age_squared", "bmi_squared", "age_bmi_interaction"],
    }


def test_waist_bp_state_weight_target_and_groups_are_never_predictors():
    forbidden = {
        "waist_cm", "systolic_bp", "diastolic_bp", "state",
        "india_dbs_weight", development.TARGET, development.GROUP_COLUMN,
        "household_group_id",
    }
    all_features = set().union(*map(set, development.FEATURE_SETS.values()))
    assert not forbidden & all_features


def test_model_c_engineering_uses_only_age_and_bmi():
    pipeline = development.build_pipeline("C", "logistic_regression", 42)
    preprocessing = pipeline.named_steps["preprocessing"]
    numeric_columns = preprocessing.transformers[0][2]
    numeric_pipeline = preprocessing.transformers[0][1]
    assert numeric_columns == ["age", "bmi"]
    assert "engineered_age_bmi" in numeric_pipeline.named_steps
    assert numeric_pipeline.named_steps["engineered_age_bmi"].degree == 2


def test_group_ids_are_splitting_only_and_no_ssu_crosses_folds(
    synthetic_cohort, split_data
):
    development_index, locked_index, _ = split_data
    assert not set(development_index) & set(locked_index)
    dev = synthetic_cohort.iloc[development_index].reset_index(drop=True)
    for train, validation in development.development_splits(dev, 42):
        assert not set(dev.iloc[train][development.GROUP_COLUMN]) & set(
            dev.iloc[validation][development.GROUP_COLUMN]
        )


def test_locked_fold_is_never_evaluated(synthetic_cohort, split_data, experiment_results):
    development_index, locked_index, _ = split_data
    fold_rows, _, _ = experiment_results
    assert set(development_index).isdisjoint(set(locked_index))
    for configuration in {row["configuration_name"] for row in fold_rows}:
        rows = [row for row in fold_rows if row["configuration_name"] == configuration]
        assert sum(row["validation_rows"] for row in rows) == len(development_index)


@pytest.mark.parametrize(
    "algorithm",
    ["logistic_regression", "shallow_decision_tree", "restricted_hist_gradient_boosting"],
)
def test_preprocessing_and_imputation_remain_inside_pipeline(algorithm):
    pipeline = development.build_pipeline("B", algorithm, 42)
    assert isinstance(pipeline, Pipeline)
    preprocessing = pipeline.named_steps["preprocessing"]
    assert isinstance(preprocessing, ColumnTransformer)
    for _, transformer, _ in preprocessing.transformers:
        assert isinstance(transformer, Pipeline)
        assert isinstance(transformer.named_steps["imputer"], SimpleImputer)


def test_no_imputation_occurs_before_splitting(synthetic_cohort, split_data):
    assert synthetic_cohort["bmi"].isna().any()
    development.create_locked_split(synthetic_cohort, 42)
    assert synthetic_cohort["bmi"].isna().any()


def test_all_algorithms_and_feature_sets_are_evaluated(experiment_results):
    fold_rows, comparison, calibration = experiment_results
    observed = {(row["feature_set"], row["algorithm"]) for row in fold_rows}
    expected = {("baseline", "dummy_prior")} | {
        (feature_set, algorithm)
        for feature_set in "ABC"
        for algorithm in (
            "logistic_regression", "shallow_decision_tree",
            "restricted_hist_gradient_boosting",
        )
    }
    assert observed == expected
    assert len(comparison["configurations"]) == 10
    assert len(calibration) == 10


def test_no_smote_sampling_or_fallback_dataset_exists():
    source = Path(development.__file__).read_text(encoding="utf-8").lower()
    for forbidden in ("smote", "oversampl", "undersampl", "fallback dataset"):
        assert forbidden not in source


def test_output_directory_inside_git_fails(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setattr(development, "REPOSITORY_ROOT", repo)
    with pytest.raises(ValueError, match="outside the Git repository"):
        development.validate_output_dir(repo / "private-output")


def test_outputs_contain_no_group_values_or_predictions(
    tmp_path, synthetic_cohort, split_data, experiment_results, monkeypatch
):
    monkeypatch.setattr(development, "REPOSITORY_ROOT", tmp_path / "other-repo")
    development_index, _, locked = split_data
    dev = synthetic_cohort.iloc[development_index]
    split_summary = {
        "locked_test": locked,
        "development": {
            "row_count": len(dev), "positive_count": int(dev[development.TARGET].sum()),
            "negative_count": int(dev[development.TARGET].eq(0).sum()),
            "positive_percentage": float(100 * dev[development.TARGET].mean()),
            "unique_ssu_count": int(dev[development.GROUP_COLUMN].nunique()),
        },
    }
    fold_rows, comparison, calibration = experiment_results
    output = tmp_path / "external-output"
    development.write_outputs(
        output, "a" * 64, {"total": 100, "positive": 20, "negative": 80},
        42, split_summary, fold_rows, comparison, calibration,
    )
    assert {path.name for path in output.iterdir()} == set(development.OUTPUT_FILES)
    text = "\n".join(path.read_text(encoding="utf-8") for path in output.iterdir())
    assert "row_level_predictions" in text  # false manifest declaration only
    assert "probabilities" not in text.lower()
    for group_value in synthetic_cohort[development.GROUP_COLUMN].unique():
        assert group_value not in text


def test_production_cli_requires_all_inputs(monkeypatch):
    monkeypatch.setattr("sys.argv", ["development"])
    with pytest.raises(SystemExit):
        development.parse_args()
