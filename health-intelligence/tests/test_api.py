import unittest
import os
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import app.main as main_module
from app.main import app


# ---------------------------------------------------------------------------
# Shared TestClient (app imported once; model state is patched per test class)
# ---------------------------------------------------------------------------
client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_EVAL_PAYLOAD = {
    "userId": "test-fixture-not-real-patient",
    "assessment": {
        "age": 35,
        "gender": "male",
        "heightCm": 175.0,
        "weightKg": 75.0,
        "smoking": "never",
        "exercise": "moderate",
        "familyHistory": "None",
        "symptoms": "None",
        "alcohol": "never",
        "sleepHours": 7.0,
        "systolicBP": 120.0,
        "diastolicBP": 80.0,
        "heartRate": 72.0,
        "fastingBloodSugar": 95.0,
        "schemaVersion": "2.0.0",
    },
    "labObservations": [],
    "regionalContext": {
        "language": "en",
        "preferredDietaryType": "vegetarian",
        "stateOrRegionCode": "IN",
        "customRegionalRules": [],
        "schemaVersion": "2.0.0",
    },
    "schemaVersion": "2.0.0",
}


# ---------------------------------------------------------------------------
# Tests that patch the module-level globals to simulate "no model installed"
# ---------------------------------------------------------------------------
class TestNoModelInstalled(unittest.TestCase):
    """Tests that must pass regardless of whether a model file exists on disk.
    Both use patch.object to force _model=None / _model_installed=False before
    each call, so they are not sensitive to the runtime environment."""

    def _with_no_model(self):
        """Context manager: patches all three model globals to the absent state."""
        return unittest.mock.patch.multiple(
            main_module,
            _model=None,
            _model_installed=False,
            _model_metadata={},
        )

    def test_service_starts_without_model(self):
        """Health endpoint reports model_installed=False when no model is loaded.

        Previously relied on the model artifact being absent from disk.
        Now uses monkeypatching so it is environment-independent.
        """
        with self._with_no_model():
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["process"], "running")
        self.assertEqual(data["model_installed"], False)

    def test_evaluation_returns_model_unavailable(self):
        """Evaluate endpoint returns model-unavailable when no model is loaded.

        Previously relied on the model artifact being absent from disk.
        Now uses monkeypatching so it is environment-independent.
        """
        with self._with_no_model():
            response = client.post(
                "/v1/modules/diabetes/evaluate", json=_EVAL_PAYLOAD
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "model-unavailable")
        self.assertNotIn("score", data)
        self.assertNotIn("riskTier", data)
        self.assertIn("APPROVED_MODEL_NOT_INSTALLED", data.get("reasonCodes", []))
        # labEvidenceAvailable must still be present (empty — no lab obs sent)
        self.assertIn("labEvidenceAvailable", data)


# ---------------------------------------------------------------------------
# Tests that patch the module-level globals to simulate "model IS installed"
# ---------------------------------------------------------------------------
class TestModelInstalled(unittest.TestCase):
    """Tests that explicitly mock a loaded model and confirm the service
    reports it correctly — regardless of the real file on disk."""

    @classmethod
    def setUpClass(cls):
        """Build a minimal sklearn-compatible mock that returns a fixed
        probability when predict_proba is called.  No real model file is
        loaded; no real patient data is used."""
        mock_model = MagicMock()
        # predict_proba returns shape (n_samples, 2); we need index [0][1]
        import numpy as np
        mock_model.predict_proba.return_value = np.array([[0.75, 0.25]])

        mock_metadata = {
            "active_threshold": {"mean_cutoff": 0.5,},
            "lifecycle_status": "RESEARCH_ONLY",
            "model_type": "LogisticRegression(C=1.0, solver=lbfgs)",
            "training_date": "2026-01-01T00:00:00Z",
            "sample_size": 490,
            "feature_list": [
                "age_years", "bmi", "waist_cm",
                "systolic_bp", "diastolic_bp", "sex",
            ],
            "target_column": "diabetes_composite",
            "training_medians": {
                "age_years": 45.0, "bmi": 23.47, "waist_cm": 87.0,
                "systolic_bp": 129.0, "diastolic_bp": 83.0, "sex": 0.0,
            },
            "coefficients": {
                "age_years": 0.044, "bmi": 0.041, "waist_cm": 0.030,
                "systolic_bp": 0.017, "diastolic_bp": -0.018, "sex": -0.043,
            },
            "intercept": -8.59,
            "limitations": ["RESEARCH_ONLY: not validated for clinical use"],
        }

        cls._mock_model    = mock_model
        cls._mock_metadata = mock_metadata
        cls._patches = unittest.mock.patch.multiple(
    main_module,
    _model=mock_model,
    _model_installed=True,
    _model_metadata=mock_metadata,
    _model_active_cutoff=0.5,
)
        cls._patches.start()

    @classmethod
    def tearDownClass(cls):
        cls._patches.stop()

    def test_health_reports_model_installed_true(self):
        """/health reports model_installed=True when a model is patched as loaded."""
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["model_installed"], True)

    def test_evaluate_returns_completed_without_screening_probability(self):
        response = client.post(
            "/v1/modules/diabetes/evaluate", json=_EVAL_PAYLOAD
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["status"], "completed")
        self.assertNotIn("screeningProbability", data)
        self.assertIn("screeningSignal", data)

        # Governance fields must be present
        self.assertIn("RESEARCH_ONLY_MODEL", data.get("reasonCodes", []))
        self.assertIn("usedEvidence", data)
        self.assertIn("missingEvidence", data)
        self.assertIn("labEvidenceAvailable", data)
        self.assertIn("limitations", data)
        self.assertIn("nextSteps", data)


class TestThresholdRiskTier(unittest.TestCase):
    """Threshold classification tests using mocked models and metadata only."""

    def _evaluate_with_probability(self, probability, cutoff=0.20):
        import numpy as np

        mock_model = MagicMock()
        mock_model.predict_proba.return_value = np.array(
            [[1.0 - probability, probability]]
        )
        mock_metadata = {
            "lifecycle_status": "RESEARCH_ONLY",
            "training_date": "synthetic-test-fixture",
            "active_threshold": {"mean_cutoff": cutoff},
        }
        with patch.multiple(
            main_module,
            _model=mock_model,
            _model_installed=True,
            _model_metadata=mock_metadata,
            _model_active_cutoff=cutoff,
        ):
            return client.post(
                "/v1/modules/diabetes/evaluate", json=_EVAL_PAYLOAD
            )

    def test_probability_above_cutoff_is_elevated(self):
        response = self._evaluate_with_probability(0.80, cutoff=0.20)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["screeningSignal"], "elevated-screening-signal")

    def test_probability_below_cutoff_is_lower(self):
        response = self._evaluate_with_probability(0.05, cutoff=0.20)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["screeningSignal"], "below-screening-threshold")

    def test_probability_is_absent_recursively(self):
        response = self._evaluate_with_probability(0.80, cutoff=0.20)
        self.assertNotIn("screeningProbability", json.dumps(response.json()))

    def test_missing_active_threshold_falls_back_safely(self):
        import numpy as np
        mock_model = MagicMock()
        mock_model.predict_proba.return_value = np.array([[0.8, 0.2]])
        mock_metadata = {"lifecycle_status": "RESEARCH_ONLY"}
        with patch.multiple(
            main_module,
            _model=mock_model,
            _model_installed=True,
            _model_metadata=mock_metadata,
            _model_active_cutoff=None,
        ):
            response = client.post(
                "/v1/modules/diabetes/evaluate", json=_EVAL_PAYLOAD
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "model-unavailable")
        self.assertNotIn("screeningSignal", response.json())

    def test_malformed_active_threshold_falls_back_safely(self):
        mock_model = MagicMock()
        mock_metadata = {
            "lifecycle_status": "RESEARCH_ONLY",
            "active_threshold": {"mean_cutoff": "not-a-number"},
        }
        with patch.multiple(
            main_module,
            _model=mock_model,
            _model_installed=True,
            _model_metadata=mock_metadata,
            _model_active_cutoff="not-a-number",
        ):
            response = client.post(
                "/v1/modules/diabetes/evaluate", json=_EVAL_PAYLOAD
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "model-unavailable")
        self.assertNotIn("screeningSignal", response.json())


# ---------------------------------------------------------------------------
# Tests that do NOT depend on model state (file-presence governance tests)
# ---------------------------------------------------------------------------
class TestDiabetesAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_synthetic_csv_absent(self):
        """Verify synthetic diabetes CSV is completely absent."""
        self.assertFalse(
            os.path.exists("health-intelligence/health-intelligence/data/diabetes_data.csv")
        )
        self.assertFalse(
            os.path.exists("health-intelligence/data/diabetes_data.csv")
        )

    def test_synthetic_generator_absent(self):
        """Verify synthetic data generator script is completely absent."""
        self.assertFalse(
            os.path.exists("health-intelligence/training/generate_synthetic_data.py")
        )

    def test_synthetic_model_artifact_absent(self):
        """Verify synthetic model and metadata artifacts in the old nested path
        are completely absent (the real model lives at health-intelligence/models/,
        not health-intelligence/health-intelligence/models/)."""
        self.assertFalse(
            os.path.exists(
                "health-intelligence/health-intelligence/models/diabetes_model.joblib"
            )
        )
        self.assertFalse(
            os.path.exists(
                "health-intelligence/health-intelligence/models/diabetes_model_metadata.json"
            )
        )

    def test_ready_endpoint_reports_not_ready(self):
        """Verify ready endpoint reports not ready for inference with a stable
        reason code (this endpoint is hardcoded APPROVED_MODEL_NOT_INSTALLED
        regardless of model state and is not expected to change until a
        validated production model is released)."""
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["ready"], False)
        self.assertEqual(data["reason"], "APPROVED_MODEL_NOT_INSTALLED")


if __name__ == "__main__":
    unittest.main()
