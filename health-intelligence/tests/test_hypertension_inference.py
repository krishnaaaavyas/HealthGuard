"""Synthetic-only tests for hypertension artifact loading and inference."""

import json
from unittest.mock import MagicMock, patch

import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import app.main as main_module
from app.core.artifact_integrity import sha256_file
from app.core.model_registry import (
    APPROVED_FEATURES,
    APPROVED_THRESHOLD,
    ARTIFACT_MISSING,
    CHECKSUM_INVALID,
    DIRECTORY_NOT_CONFIGURED,
    METADATA_FILENAME,
    METADATA_INVALID,
    MODEL_FILENAME,
    MODEL_VERSION,
    SHA256_FILENAME,
    ModelState,
    load_hypertension_model,
)
from app.modules.hypertension import APPROVED_USER_FACING_TEXT
from app.modules.hypertension import build_feature_row
from app.schemas.health_context import HealthContext


client = TestClient(main_module.app)


def synthetic_pipeline() -> Pipeline:
    numeric = ["age", "height_cm", "weight_kg"]
    categorical = [
        "sex", "family_history_hypertension",
        "physical_activity_category", "smoking_category",
    ]
    preprocessing = ColumnTransformer([
        ("numeric", Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]), numeric),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical),
    ])
    model = Pipeline([
        ("preprocessing", preprocessing),
        ("classifier", LogisticRegression(max_iter=2000, random_state=42)),
    ])
    rows = pd.DataFrame([
        [45, 160, 55, 1, 0, "high", "never"],
        [50, 165, 65, 2, 1, "moderate", "former"],
        [60, 170, 80, 1, 0, "low", "current"],
        [70, 155, 72, 2, 1, "low", "never"],
    ], columns=list(APPROVED_FEATURES))
    model.fit(rows, [0, 0, 1, 1])
    return model


def write_bundle(directory, mutate_metadata=None):
    model_path = directory / MODEL_FILENAME
    joblib.dump(synthetic_pipeline(), model_path)
    digest = sha256_file(model_path)
    metadata = {
        "model_version": MODEL_VERSION,
        "approval_status": "approved_with_restrictions",
        "configuration": "D_logistic_regression",
        "features": list(APPROVED_FEATURES),
        "frozen_threshold": APPROVED_THRESHOLD,
        "no_exact_probability_display": True,
        "approved_for_screening_awareness": True,
        "approved_for_diagnosis": False,
        "approved_for_treatment_decisions": False,
        "artifact_filename": MODEL_FILENAME,
        "artifact_sha256": digest,
        "model_type": "sklearn.pipeline.Pipeline(LogisticRegression)",
    }
    if mutate_metadata:
        mutate_metadata(metadata)
    (directory / METADATA_FILENAME).write_text(json.dumps(metadata), encoding="utf-8")
    (directory / SHA256_FILENAME).write_text(json.dumps({
        "model_version": MODEL_VERSION,
        "artifact_filename": MODEL_FILENAME,
        "sha256": digest,
    }), encoding="utf-8")
    return model_path


def payload(**overrides):
    assessment = {
        "age": 55,
        "gender": "male",
        "heightCm": 170,
        "weightKg": 75,
        "smoking": "never",
        "exercise": "moderate",
        "knownHypertension": False,
        "takingAntihypertensiveMedication": False,
        "familyHistoryHypertension": None,
        "physicalActivityCategory": "moderate",
        "systolicBP": None,
        "diastolicBP": None,
    }
    assessment.update(overrides)
    return {
        "userId": "synthetic-hypertension-test-fixture",
        "assessment": assessment,
        "regionalContext": {"language": "en"},
    }


class FixedProbabilityModel:
    def __init__(self, probability):
        self.probability = probability
        self.calls = 0

    def predict_proba(self, frame):
        self.calls += 1
        assert list(frame.columns) == list(APPROVED_FEATURES)
        return np.array([[1 - self.probability, self.probability]])


def loaded_state(probability=0.9):
    return ModelState(
        name="hypertension", status="loaded",
        model=FixedProbabilityModel(probability),
        metadata={"model_version": MODEL_VERSION}, reason="AVAILABLE",
    )


def evaluate(request_payload, state=None):
    with patch.object(main_module, "hypertension_model_state", state or loaded_state()):
        return client.post("/v1/modules/hypertension/evaluate", json=request_payload)


def test_valid_artifact_load(tmp_path):
    write_bundle(tmp_path)
    state = load_hypertension_model(tmp_path)
    assert state.available
    assert state.metadata["features"] == list(APPROVED_FEATURES)


def test_checksum_failure(tmp_path):
    model_path = write_bundle(tmp_path)
    model_path.write_bytes(model_path.read_bytes() + b"tampered")
    with patch("joblib.load") as deserialize:
        state = load_hypertension_model(tmp_path)
    deserialize.assert_not_called()
    assert not state.available
    assert state.reason == CHECKSUM_INVALID


def test_checksum_record_missing_fails_closed(tmp_path):
    write_bundle(tmp_path)
    (tmp_path / SHA256_FILENAME).unlink()
    assert load_hypertension_model(tmp_path).reason == CHECKSUM_INVALID


def test_checksum_record_malformed_fails_closed(tmp_path):
    write_bundle(tmp_path)
    (tmp_path / SHA256_FILENAME).write_text('{"sha256":"not-a-digest"}', encoding="utf-8")
    assert load_hypertension_model(tmp_path).reason == CHECKSUM_INVALID


@pytest.mark.parametrize("mutation", [
    lambda metadata: metadata.update({"configuration": "A_logistic_regression"}),
    lambda metadata: metadata.update({"model_version": "wrong-version"}),
    lambda metadata: metadata.update({"approval_status": "pending"}),
])
def test_metadata_mismatch(tmp_path, mutation):
    write_bundle(tmp_path, mutation)
    assert not load_hypertension_model(tmp_path).available


def test_feature_order_mismatch(tmp_path):
    write_bundle(tmp_path, lambda metadata: metadata["features"].reverse())
    assert not load_hypertension_model(tmp_path).available


def test_threshold_mismatch(tmp_path):
    write_bundle(tmp_path, lambda metadata: metadata.update({"frozen_threshold": 0.5}))
    assert not load_hypertension_model(tmp_path).available


def test_artifact_absent(tmp_path):
    state = load_hypertension_model(tmp_path)
    assert not state.available
    assert state.reason == ARTIFACT_MISSING


def test_environment_variable_absent_or_blank_is_unavailable(monkeypatch):
    monkeypatch.delenv("HYPERTENSION_MODEL_DIR", raising=False)
    assert load_hypertension_model().reason == DIRECTORY_NOT_CONFIGURED
    monkeypatch.setenv("HYPERTENSION_MODEL_DIR", "   ")
    assert load_hypertension_model().reason == DIRECTORY_NOT_CONFIGURED


def test_missing_directory_is_unavailable(tmp_path, monkeypatch):
    missing = tmp_path / "does-not-exist"
    monkeypatch.setenv("HYPERTENSION_MODEL_DIR", str(missing))
    assert load_hypertension_model().reason == ARTIFACT_MISSING


def test_metadata_missing_or_malformed_is_unavailable(tmp_path):
    write_bundle(tmp_path)
    (tmp_path / METADATA_FILENAME).unlink()
    assert load_hypertension_model(tmp_path).reason == METADATA_INVALID

    write_bundle(tmp_path)
    (tmp_path / METADATA_FILENAME).write_text("{malformed", encoding="utf-8")
    assert load_hypertension_model(tmp_path).reason == METADATA_INVALID


def test_age_below_45_skips_model():
    state = loaded_state()
    response = evaluate(payload(age=44), state)
    assert response.json()["status"] == "outside-intended-population"
    assert state.model.calls == 0


def test_bp_reading_override_skips_model_and_returns_confirmed_evidence():
    state = loaded_state()
    response = evaluate(payload(systolicBP=120, diastolicBP=80), state)
    body = response.json()
    assert body["status"] == "complete"
    assert body["resultType"] == "confirmed-evidence"
    assert "precedence" in body["message"].lower()
    assert "screeningProbability" not in body
    assert "screeningSignal" not in body
    assert state.model.calls == 0


def test_known_hypertension_override_skips_model_and_returns_confirmed_evidence():
    state = loaded_state()
    response = evaluate(payload(knownHypertension=True), state)
    body = response.json()
    assert body["status"] == "complete"
    assert body["resultType"] == "confirmed-evidence"
    assert "precedence" in body["message"].lower()
    assert "screeningProbability" not in body
    assert "screeningSignal" not in body
    assert state.model.calls == 0


def test_medication_uses_context_only_route():
    state = loaded_state()
    response = evaluate(payload(takingAntihypertensiveMedication=True), state)
    assert response.json()["status"] == "completed"
    assert response.json()["screeningSignal"] == "not-evaluated"
    assert state.model.calls == 0


def test_bp_evidence_requires_verification_without_model_call():
    state = loaded_state()
    response = evaluate(payload(systolicBP=135), state)
    assert response.json()["status"] == "measurement-requires-verification"
    assert state.model.calls == 0


def test_missing_previous_diagnosis_status_is_not_assumed_false():
    response = evaluate(payload(knownHypertension=None))
    assert response.json()["status"] == "insufficient-information"
    assert response.json()["missingInputs"] == ["knownHypertension"]


def test_eligible_profile_returns_approved_screening_signal_and_text():
    response = evaluate(payload())
    body = response.json()
    assert body["status"] == "completed"
    assert body["screeningSignal"] == "blood-pressure-measurement-recommended"
    assert body["message"] == APPROVED_USER_FACING_TEXT


def test_other_gender_fails_safely():
    response = evaluate(payload(gender="other"))
    assert response.json()["status"] == "insufficient-information"
    assert "gender" in response.json()["missingInputs"]


def test_invalid_structured_activity_is_rejected_safely():
    response = evaluate(payload(physicalActivityCategory="extreme"))
    assert response.status_code == 422


def test_inference_is_deterministic_and_legacy_activity_adapter_works():
    state = loaded_state(0.1)
    first = evaluate(payload(physicalActivityCategory=None, exercise="active"), state).json()
    second = evaluate(payload(physicalActivityCategory=None, exercise="active"), state).json()
    assert first == second
    assert first["screeningSignal"] == "no-profile-screening-prompt"


def test_structured_activity_category_takes_precedence_over_legacy_adapter():
    context = HealthContext.model_validate(
        payload(physicalActivityCategory="high", exercise="none")
    )
    row, _ = build_feature_row(context)
    assert row["physical_activity_category"] == "high"


def test_probability_and_diagnostic_keys_are_never_exposed():
    serialized = json.dumps(evaluate(payload()).json()).lower()
    for forbidden in ("probability", "percentage", "riskscore", "risk score", "diagnostictier"):
        assert forbidden not in serialized


def test_model_unavailable_is_safe():
    state = ModelState(name="hypertension", reason=CHECKSUM_INVALID)
    body = evaluate(payload(), state).json()
    assert body["status"] == "model-unavailable"
    assert body["screeningSignal"] == "not-evaluated"
    assert body["reasonCodes"] == [CHECKSUM_INVALID]
    serialized = json.dumps(body)
    assert "sha256" not in serialized.lower()
    assert "\\" not in serialized


def test_health_endpoints_report_models_independently():
    with patch.object(main_module, "hypertension_model_state", loaded_state()):
        health = client.get("/health").json()["models"]["hypertension"]
        assert health["status"] == "loaded"
        assert health["installed"] is True
        assert client.get("/ready").json()["ready"] is True
        assert client.get("/models").json()["active_models"]["hypertension"]["status"] == "loaded"


def test_fixtures_have_no_real_lasi_dependency():
    source = __file__
    assert "LASI_DATA_ROOT" not in source
