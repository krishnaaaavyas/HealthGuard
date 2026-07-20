"""Synthetic-only tests for LASI hypertension target auditing."""

import pandas as pd
import pytest

from training import audit_lasi_hypertension_target as target_cli
from training import lasi_hypertension_audit_utils as audit


def test_target_and_predictor_candidates_remain_separated():
    candidates = []
    for canonical, mapping in audit.AUTHORITATIVE_MAPPING.items():
        candidates.append({
            "canonical_name": canonical,
            "source_columns": list(mapping["columns"]),
            "role": mapping["role"],
        })
    bundle = audit.build_bundle([(candidates, {}, {})], ["synthetic.dta"], ["codes.pdf"], 10)
    target = bundle["lasi_hypertension_target_candidates.json"]
    predictors = bundle["lasi_hypertension_predictor_candidates.json"]
    assert {item["canonical_name"] for item in target["candidates"]} == audit.APPROVED_TARGET_RECORDS
    assert {item["canonical_name"] for item in predictors["candidates"]} == audit.APPROVED_PRODUCTION_PREDICTORS
    assert target["target_constructed"] is False
    assert target["representative_bp_aggregation_approved"] is False


def test_internal_target_name_and_preliminary_policy_are_preserved():
    bundle = audit.build_bundle([], [], [], 10)
    target = bundle["lasi_hypertension_target_candidates.json"]
    assert target["target_name"] == "undiagnosed_elevated_bp_screening_target"
    assert target["target_constructed"] is False


def test_ambiguous_mapping_is_not_automatically_approved():
    assert audit.classify_metadata("mystery", "General health question") is None
    candidate = audit.classify_metadata("age", "Age of respondent")
    assert candidate["manual_approval_status"] == "requires_manual_review"


def test_target_cli_defaults_and_requires_all_inputs(monkeypatch):
    monkeypatch.setattr("sys.argv", [
        "target", "--data-root", "data", "--codebook-root", "codes",
        "--output-dir", "out",
    ])
    assert target_cli.parse_args().min_cell_count == 10
    monkeypatch.setattr("sys.argv", ["target"])
    with pytest.raises(SystemExit):
        target_cli.parse_args()


def test_no_model_or_cohort_pipeline_is_created():
    manifest = audit.build_bundle([], [], [], 10)[
        "lasi_hypertension_audit_manifest.json"
    ]
    assert manifest["model_trained"] is False
    assert manifest["cohort_created"] is False
    assert manifest["locked_test_created"] is False
    assert manifest["locked_test_evaluated"] is False


def test_family_history_derivation_excludes_grandchildren():
    frame = pd.DataFrame({
        "fm303s1": [0, 1, 0, 0], "fm303s2": [0, None, 0, 0],
        "fm303s3": [0, 0, None, 0], "fm303s4": [0, 0, 0, 0],
        "fm303s5": [0, 0, 0, 0],
        "fm303s6": [1, 0, 1, 0], "fm303s7": [1, 0, 1, 0],
    })
    result = audit.derive_family_history(frame)
    assert result.iloc[0] == 0  # Grandchildren do not create a positive.
    assert result.iloc[1] == 1  # Positive overrides other missing components.
    assert pd.isna(result.iloc[2])
    assert result.iloc[3] == 0


def test_physical_activity_mapping_is_deterministic():
    frame = pd.DataFrame({
        "hb211": [1, 5, 3, 4, None, 5],
        "hb213": [5, 1, 5, 4, 3, None],
    })
    result = audit.derive_physical_activity(frame)
    assert result.iloc[:5].tolist() == ["high", "high", "moderate", "low", "moderate"]
    assert pd.isna(result.iloc[5])


def test_smoking_mapping_is_deterministic_and_smokeless_is_context_only():
    frame = pd.DataFrame({
        "hb001": [2, 1, 1, 1, 1, None],
        "hb003": [None, 1, 3, 2, None, 1],
        "hb003_a": [None, 1, 2, 1, None, 1],
    })
    category, smokeless = audit.derive_smoking(frame)
    assert category.iloc[:3].tolist() == ["never", "current", "former"]
    assert category.iloc[3:].isna().all()
    assert smokeless.iloc[:4].tolist() == [False, False, False, True]
    assert smokeless.iloc[4:].isna().all()
    assert "smokeless_only" not in audit.APPROVED_PRODUCTION_PREDICTORS


def test_diagnosis_eligibility_does_not_require_medication_for_ht002_no():
    diagnosis = audit.diagnosis_eligibility(pd.Series([1, 2, None, 3]))
    assert diagnosis.iloc[:2].tolist() == [False, True]
    assert diagnosis.iloc[2:].isna().all()
    assert audit.AUTHORITATIVE_MAPPING["current_hypertension_medication"]["role"] == "eligibility"
