"""Synthetic privacy-validator tests for hypertension target-policy outputs."""

import json

import numpy as np
import pandas as pd
import pytest

from training import compare_lasi_hypertension_target_policies as audit
from training import validate_lasi_hypertension_target_policy_outputs as validator


def frame(rows=20):
    return pd.DataFrame({
        "dm005": [55] * rows, "ht002": [2] * rows, "ht002c": [np.nan] * rows,
        "indiaindividualweight": [1.0] * rows, "bm001": [1] * rows, "bm002": [1] * rows,
        "bm006": [145] * rows, "bm007": [80] * rows, "bm010": [142] * rows,
        "bm011": [80] * rows, "bm014": [138] * rows, "bm015": [92] * rows,
        "bm017": [140] * rows, "bm018": [86] * rows, "bm020": [1] * rows,
        "bm021": [1] * rows, "bm022": [1] * rows,
    })


@pytest.fixture
def output(tmp_path):
    directory = tmp_path / "outputs"
    bundle = audit.build_outputs(frame(), {"individual_rows": 20, "biomarker_rows": 20, "matched_rows": 20, "individual_only_rows": 0, "biomarker_only_rows": 0}, 10)
    audit.write_outputs(bundle, directory)
    return directory


def mutate(output, filename, callback):
    path = output / filename
    payload = json.loads(path.read_text(encoding="utf-8"))
    callback(payload)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_valid_outputs_pass(output):
    assert validator.validate_outputs(output, 10)["validation_passed"] is True


def test_unexpected_file_rejected(output):
    (output / "participant.csv").write_text("fake", encoding="utf-8")
    with pytest.raises(ValueError, match="Unexpected output filenames"):
        validator.validate_outputs(output, 10)


def test_participant_like_arrays_rejected(output):
    mutate(output, "lasi_hypertension_target_quality_summary.json", lambda payload: payload.update({"rows": [{"participant_id": "FAKE"}]}))
    with pytest.raises(ValueError, match="participant-like"):
        validator.validate_outputs(output, 10)


def test_raw_bp_values_rejected(output):
    mutate(output, "lasi_hypertension_target_quality_summary.json", lambda payload: payload.update({"systolic": [120, 130]}))
    with pytest.raises(ValueError, match="raw BP"):
        validator.validate_outputs(output, 10)


def test_policy_set_mismatch_rejected(output):
    mutate(output, "lasi_hypertension_target_policy_comparison.json", lambda payload: payload["policies"].pop())
    with pytest.raises(ValueError, match="policy set"):
        validator.validate_outputs(output, 10)


def test_validator_cli_defaults(monkeypatch):
    monkeypatch.setattr("sys.argv", ["validate", "--output-dir", "out"])
    assert validator.parse_args().min_cell_count == 10
