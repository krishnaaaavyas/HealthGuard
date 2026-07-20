"""Synthetic-only tests for LASI hypertension target auditing."""

import pytest

from training import audit_lasi_hypertension_target as target_cli
from training import lasi_hypertension_audit_utils as audit


def test_target_and_predictor_candidates_remain_separated():
    candidates = [
        {**audit.classify_metadata("sbp", "Systolic blood pressure reading 1"), "source_column": "sbp"},
        {**audit.classify_metadata("dx", "Doctor diagnosed hypertension"), "source_column": "dx"},
        {**audit.classify_metadata("age", "Age of respondent"), "source_column": "age"},
    ]
    bundle = audit.build_bundle([(candidates, {}, {})], ["synthetic.dta"], ["codes.pdf"], 10)
    target = bundle["lasi_hypertension_target_candidates.json"]
    predictors = bundle["lasi_hypertension_predictor_candidates.json"]
    assert {item["source_column"] for item in target["candidates"]} == {"sbp", "dx"}
    assert {item["source_column"] for item in predictors["candidates"]} == {"age"}
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
