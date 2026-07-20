"""Synthetic-only tests for LASI hypertension target-policy comparison."""

import json
import sys

import numpy as np
import pandas as pd
import pytest

from training import compare_lasi_hypertension_target_policies as audit
from training.validate_lasi_hypertension_target_policy_outputs import validate_outputs


def frame(rows=20):
    return pd.DataFrame({
        "dm005": [55] * rows, "ht002": [2] * rows, "ht002c": [np.nan] * rows,
        "indiaindividualweight": [1.0] * rows, "bm001": [1] * rows,
        "bm002": [1] * rows, "bm006": [145] * rows, "bm007": [80] * rows,
        "bm010": [142] * rows, "bm011": [80] * rows, "bm014": [138] * rows,
        "bm015": [92] * rows, "bm017": [140] * rows, "bm018": [86] * rows,
        "bm020": [1] * rows, "bm021": [1] * rows, "bm022": [1] * rows,
    })


def test_all_four_policies_execute_and_use_or_threshold():
    data = frame()
    results = {name: fn(data) for name, fn in audit.POLICY_FUNCTIONS.items()}
    assert tuple(results) == audit.POLICIES
    assert all(result["target"].eq(1).all() for result in results.values())
    data.loc[:, ["bm010", "bm014", "bm017"]] = 120
    data.loc[:, ["bm011", "bm015", "bm018"]] = 90
    assert audit.policy_b(data)["target"].eq(1).all()


def test_policy_a_requires_two_complete_pairs_and_never_mixes_attempts():
    data = frame(3)
    data.loc[0, ["bm007", "bm010"]] = np.nan  # One complete pair only; no cross-attempt mixing.
    data.loc[1, ["bm007"]] = np.nan  # Complete pairs 2 and 3 remain.
    result = audit.policy_a(data)
    assert pd.isna(result.loc[0, "target"])
    assert not pd.isna(result.loc[1, "target"])


def test_policy_b_requires_complete_pairs_two_and_three_and_uses_bm011():
    data = frame(2)
    data.loc[0, "bm011"] = np.nan
    data.loc[1, "bm007"] = np.nan
    result = audit.policy_b(data)
    assert pd.isna(result.loc[0, "target"])
    assert not pd.isna(result.loc[1, "target"])


def test_authoritative_primary_policy_definition_is_importable():
    assert audit.APPROVED_TARGET_POLICY == "last_two_pairs_mean"
    assert audit.APPROVED_TARGET_SOURCE_COLUMNS == ("bm010", "bm011", "bm014", "bm015")
    assert "bm006" not in audit.APPROVED_TARGET_SOURCE_COLUMNS
    assert "bm007" not in audit.APPROVED_TARGET_SOURCE_COLUMNS
    assert audit.PRIMARY_POLICY_VALIDATION_COLUMNS == ("bm017", "bm018")
    assert audit.SYSTOLIC_TARGET_THRESHOLD == 140
    assert audit.DIASTOLIC_TARGET_THRESHOLD == 90


def test_compliance_exclusions_separate_missing_from_noncompliant():
    data = frame(6)
    data["bm022"] = [1.0, 1.0, 2.0, 2.0, np.nan, np.nan]
    outputs = audit.build_outputs(
        data,
        {"individual_rows": 6, "biomarker_rows": 6, "matched_rows": 6,
         "individual_only_rows": 0, "biomarker_only_rows": 0},
        2,
    )
    exclusions = outputs["lasi_hypertension_target_policy_exclusions.json"]["exclusions"]
    assert exclusions["noncompliant_measurement"] == 2
    assert exclusions["missing_compliance"] == 2


def test_policy_c_uses_supplied_averages_and_policy_d_requires_codes():
    data = frame(3)
    data.loc[0, ["bm017", "bm018"]] = [120, 80]
    data.loc[1, "bm001"] = 2
    data.loc[2, "bm022"] = 2
    assert audit.policy_c(data).loc[0, "target"] == 0
    strict = audit.policy_d(data)
    assert not pd.isna(strict.loc[0, "target"])
    assert strict.loc[1:, "target"].isna().all()


def test_base_eligibility_and_missing_medication():
    data = frame(4)
    data.loc[:, "dm005"] = [44, 45, 50, 50]
    data["ht002"] = [2.0, 1.0, np.nan, 2.0]
    outputs = audit.build_outputs(data, {"individual_rows": 4, "biomarker_rows": 4, "matched_rows": 4, "individual_only_rows": 0, "biomarker_only_rows": 0}, 2)
    policy = outputs["lasi_hypertension_target_policy_comparison.json"]["policies"][0]
    assert policy["base_eligible_count"] == "SUPPRESSED_BELOW_2"
    assert data.loc[3, "ht002c"] is np.nan or pd.isna(data.loc[3, "ht002c"])


def test_private_join_is_one_to_one_and_drops_key():
    left = pd.DataFrame({"prim_key": ["S1", "S2"], "dm005": [50, 60]})
    right = pd.DataFrame({"prim_key": ["S1", "S2"], "bm001": [1, 1]})
    joined, diagnostics = audit.private_join(left, right)
    assert "prim_key" not in joined
    assert diagnostics["matched_rows"] == 2
    with pytest.raises(ValueError, match="unique"):
        audit.private_join(pd.concat([left, left.iloc[[0]]]), right)


def test_weighted_prevalence_ignores_invalid_weights():
    target = pd.Series([1, 0, 1, 0, 1, 0])
    weights = pd.Series([2.0, 2.0, 2.0, 2.0, 0.0, -1.0])
    assert audit.weighted_prevalence(target, weights, 2) == 50.0
    assert audit.weighted_prevalence(target, weights, 10) == "SUPPRESSED_BELOW_10"


def test_small_counts_suppressed_and_generation_deterministic():
    assert audit.suppress(0, 10) == 0
    assert audit.suppress(9, 10) == "SUPPRESSED_BELOW_10"
    first = audit.build_outputs(frame(), {"individual_rows": 20, "biomarker_rows": 20, "matched_rows": 20, "individual_only_rows": 0, "biomarker_only_rows": 0}, 10)
    second = audit.build_outputs(frame(), {"individual_rows": 20, "biomarker_rows": 20, "matched_rows": 20, "individual_only_rows": 0, "biomarker_only_rows": 0}, 10)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    manifest = first["lasi_hypertension_target_policy_manifest.json"]
    assert manifest["cohort_created"] is manifest["model_trained"] is False
    assert manifest["locked_test_created"] is manifest["locked_test_evaluated"] is False


def test_cli_integration_with_synthetic_dta_files(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    data_root = tmp_path / "synthetic-data"
    output = tmp_path / "aggregate-output"
    repo.mkdir(); data_root.mkdir()
    rows = 20
    keys = [f"SYNTHETIC-{i}" for i in range(rows)]
    values = frame(rows)
    individual = values[audit.INDIVIDUAL_COLUMNS[1:]].copy()
    individual.insert(0, "prim_key", keys)
    biomarker = values[audit.BIOMARKER_COLUMNS[1:]].copy()
    biomarker.insert(0, "prim_key", keys)
    individual.to_stata(data_root / audit.INDIVIDUAL_FILE, write_index=False)
    biomarker.to_stata(data_root / audit.BIOMARKER_FILE, write_index=False)
    monkeypatch.setattr(audit, "REPOSITORY_ROOT", repo)
    monkeypatch.setattr(sys, "argv", ["compare", "--data-root", str(data_root), "--output-dir", str(output)])
    audit.main()
    validate_outputs(output, 10)
    serialized = "".join(path.read_text(encoding="utf-8") for path in output.iterdir())
    assert not any(key in serialized for key in keys)
    assert set(json.loads((output / "lasi_hypertension_target_policy_manifest.json").read_text())["compared_policies"]) == set(audit.POLICIES)


def test_cli_defaults_and_requires_paths(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["compare", "--data-root", "data", "--output-dir", "out"])
    assert audit.parse_args().min_cell_count == 10
    monkeypatch.setattr(sys, "argv", ["compare"])
    with pytest.raises(SystemExit): audit.parse_args()


def test_paths_fail_closed_and_extreme_positive_values_are_retained(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    external = tmp_path / "external"
    repo.mkdir(); external.mkdir()
    monkeypatch.setattr(audit, "REPOSITORY_ROOT", repo)
    with pytest.raises(ValueError, match="data-root"):
        audit.validate_paths(repo / "data", external / "out")
    with pytest.raises(ValueError, match="output-dir"):
        audit.validate_paths(external, repo / "out")
    with pytest.raises(ValueError, match="raw-data"):
        audit.validate_paths(external, external / "out")
    data = frame(2)
    data.loc[0, "bm006"] = 999
    assert audit.valid_bp_value(data["bm006"]).all()
    assert audit.policy_a(data)["target"].notna().all()
