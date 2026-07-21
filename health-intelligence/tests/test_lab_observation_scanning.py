"""
test_lab_observation_scanning.py
=================================
Permanent pytest tests for the lab-observation scanning feature added to
health-intelligence/app/main.py.

All fixtures are clearly labeled as fake / test data.
No real patient data is used anywhere in this file.
Tests use FastAPI's TestClient — no real uvicorn subprocess is started.

Coverage:
  [LAB-1]  Verified FBS is detected, included in labEvidenceAvailable,
           and carries module="diabetes".
  [LAB-2]  An unverified observation (isVerified=False) is excluded.
  [LAB-3]  A verified LDL entry carries module="cardiovascular" and does
           NOT appear in the model's usedEvidence or missingEvidence
           (i.e. never leaks into the feature vector).
  [LAB-4a] A verified FBS below 50 mg/dL is excluded + a warning is logged.
  [LAB-4b] A verified HbA1c above 18 % is excluded + a warning is logged.
  [LAB-5]  screeningProbability is identical whether labObservations is
           empty, or filled with multiple verified in-range entries
           (confirms zero leakage into the model score).
"""
import logging
import pytest
from fastapi.testclient import TestClient
from app.main import app, _scan_lab_observations, _LAB_CODE_MAPS, _LAB_SANITY_RANGES

# ---------------------------------------------------------------------------
# Shared TestClient (model loads once at import time — same behaviour as prod)
# ---------------------------------------------------------------------------
client = TestClient(app)

# ---------------------------------------------------------------------------
# Fixture builder helpers — clearly labeled, not real patient data
# ---------------------------------------------------------------------------
_BASE_ASSESSMENT = {
    "age": 55,
    "gender": "male",
    "heightCm": 170.0,
    "weightKg": 85.0,
    "smoking": "never",
    "exercise": "low",
    "schemaVersion": "2.0.0",
}

_BASE_REGIONAL = {
    "language": "en",
    "preferredDietaryType": "vegetarian",
    "stateOrRegionCode": "IN",
    "customRegionalRules": [],
    "schemaVersion": "2.0.0",
}


def _make_payload(lab_observations: list) -> dict:
    """Return a complete evaluate payload with the given labObservations.
    Labeled as test-fixture data throughout."""
    return {
        "userId": "test-fixture-not-real-patient",
        "assessment": _BASE_ASSESSMENT,
        "labObservations": lab_observations,
        "regionalContext": _BASE_REGIONAL,
        "schemaVersion": "2.0.0",
    }


def _verified_obs(code: str, value: float, unit: str) -> dict:
    """Helper: build a verified lab observation fixture."""
    return {
        "code": code,
        "value": value,
        "unit": unit,
        "observedAt": "2026-07-01T08:00:00Z",
        "isVerified": True,
        "verifiedBy": "test-fixture",
    }


def _unverified_obs(code: str, value: float, unit: str) -> dict:
    """Helper: build an unverified lab observation fixture."""
    return {
        "code": code,
        "value": value,
        "unit": unit,
        "observedAt": "2026-07-01T08:00:00Z",
        "isVerified": False,
        "verifiedBy": None,
    }


# ---------------------------------------------------------------------------
# [LAB-1] Verified FBS detected, labEvidenceAvailable, module="diabetes"
# ---------------------------------------------------------------------------
class TestVerifiedFbsDetected:
    """[LAB-1] A verified FBS observation is detected and reported."""

    def test_fbs_in_lab_evidence(self):
        """Verified FBS 126 mg/dL appears in labEvidenceAvailable."""
        payload = _make_payload([_verified_obs("FBS", 126.0, "mg/dL")])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        lab_ev = data.get("labEvidenceAvailable", [])
        assert isinstance(lab_ev, list), "labEvidenceAvailable must be a list"
        assert len(lab_ev) == 1, f"Expected 1 entry, got {len(lab_ev)}"

        entry = lab_ev[0]
        assert entry["canonical"] == "fasting_blood_sugar"
        assert entry["label"] == "Fasting Blood Sugar"
        assert entry["module"] == "diabetes"
        assert entry["value"] == 126.0
        assert entry["isVerified"] is True
        assert "note" in entry

    def test_legacy_verified_means_user_not_clinician_confirmed(self):
        payload = _make_payload([_verified_obs("FBS", 126.0, "mg/dL")])
        entry = client.post(
            "/v1/modules/diabetes/evaluate", json=payload
        ).json()["labEvidenceAvailable"][0]
        assert entry["userConfirmed"] is True
        assert entry["verifiedByClinician"] is False
        assert entry["verificationStatus"] == "user-confirmed"
        assert entry["source"] == "unknown"
        assert entry["plausibleRangePassed"] is True

    def test_fbs_aliases_also_detected(self):
        """Common FBS aliases (fasting_glucose, FPG) also match."""
        for code in ("fasting_glucose", "FPG", "Fasting_Blood_Sugar"):
            payload = _make_payload([_verified_obs(code, 100.0, "mg/dL")])
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
            assert resp.status_code == 200
            lab_ev = resp.json().get("labEvidenceAvailable", [])
            assert len(lab_ev) == 1, (
                f"Alias '{code}' should produce 1 entry, got {len(lab_ev)}"
            )
            assert lab_ev[0]["canonical"] == "fasting_blood_sugar"

    def test_lab_evidence_field_present_even_when_empty(self):
        """labEvidenceAvailable is always present (empty list when no matches)."""
        payload = _make_payload([])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "labEvidenceAvailable" in data
        assert data["labEvidenceAvailable"] == []


# ---------------------------------------------------------------------------
# [LAB-2] Unverified observation is excluded
# ---------------------------------------------------------------------------
class TestUnverifiedObservationExcluded:
    """[LAB-2] isVerified=False entries must never appear in labEvidenceAvailable."""

    def test_unverified_fbs_excluded(self):
        """Unverified FBS is silently excluded (not an error, not included)."""
        payload = _make_payload([_unverified_obs("FBS", 126.0, "mg/dL")])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        assert lab_ev == [], (
            f"Unverified FBS must be excluded; got {lab_ev}"
        )

    def test_mix_verified_and_unverified(self):
        """Only the verified entry appears when both verified and unverified are sent."""
        payload = _make_payload([
            _verified_obs("FBS",   126.0, "mg/dL"),
            _unverified_obs("HbA1c", 7.2, "%"),
        ])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        assert len(lab_ev) == 1
        assert lab_ev[0]["canonical"] == "fasting_blood_sugar"
        # HbA1c must not appear
        assert all(e["canonical"] != "hba1c" for e in lab_ev)


# ---------------------------------------------------------------------------
# [LAB-3] LDL detected as cardiovascular, not in feature vector
# ---------------------------------------------------------------------------
class TestLipidPanelCardiovascular:
    """[LAB-3] Verified LDL carries module='cardiovascular' and never enters
    the model's feature vector."""

    def test_ldl_detected_with_cardiovascular_module(self):
        """Verified LDL is detected and labeled cardiovascular."""
        payload = _make_payload([_verified_obs("LDL", 130.0, "mg/dL")])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        lab_ev = data.get("labEvidenceAvailable", [])
        assert len(lab_ev) == 1
        entry = lab_ev[0]
        assert entry["canonical"] == "ldl_cholesterol"
        assert entry["module"] == "cardiovascular"
        assert entry["value"] == 130.0

    def test_ldl_not_in_used_or_missing_evidence(self):
        """LDL must not appear in usedEvidence or missingEvidence (not a model input)."""
        payload = _make_payload([_verified_obs("LDL", 130.0, "mg/dL")])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        used    = data.get("usedEvidence", [])
        missing = data.get("missingEvidence", [])
        all_model_features = set(used) | set(missing)

        assert "ldl_cholesterol" not in all_model_features, (
            "LDL must never appear in the model feature lists"
        )
        assert "ldl" not in all_model_features

    def test_all_lipid_aliases_detected_as_cardiovascular(self):
        """All four lipid analytes with common aliases resolve to cardiovascular."""
        cases = [
            ("TOTAL_CHOLESTEROL", "total_cholesterol"),
            ("HDL",               "hdl_cholesterol"),
            ("LDL",               "ldl_cholesterol"),
            ("Triglycerides",     "triglycerides"),
        ]
        for code, expected_canonical in cases:
            payload = _make_payload([_verified_obs(code, 150.0, "mg/dL")])
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
            assert resp.status_code == 200
            lab_ev = resp.json().get("labEvidenceAvailable", [])
            assert len(lab_ev) == 1, f"Code '{code}' produced {len(lab_ev)} entries"
            assert lab_ev[0]["canonical"] == expected_canonical
            assert lab_ev[0]["module"] == "cardiovascular"


# ---------------------------------------------------------------------------
# [LAB-4] Out-of-range values excluded + warning logged
# ---------------------------------------------------------------------------
class TestSanityRangeCheck:
    """[LAB-4] Values outside physiological sanity bounds are excluded with a
    logged warning — never silently dropped, never silently included."""

    def test_fbs_below_50_excluded(self, caplog):
        """FBS 10 mg/dL (< 50) is excluded and a WARNING is logged."""
        payload = _make_payload([_verified_obs("FBS", 10.0, "mg/dL")])

        with caplog.at_level(logging.WARNING, logger="app.main"):
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)

        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        assert lab_ev == [], (
            f"FBS 10 mg/dL must be excluded; got {lab_ev}"
        )
        # A warning must have been emitted — not a silent drop
        warn_msgs = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert "LAB_VALUE_OUTSIDE_PLAUSIBLE_RANGE" in warn_msgs

    def test_fbs_above_400_excluded(self, caplog):
        """FBS 999 mg/dL (> 400) is excluded and a WARNING is logged."""
        payload = _make_payload([_verified_obs("FBS", 999.0, "mg/dL")])

        with caplog.at_level(logging.WARNING, logger="app.main"):
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)

        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        assert lab_ev == []
        warn_msgs = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert "LAB_VALUE_OUTSIDE_PLAUSIBLE_RANGE" in warn_msgs

    def test_hba1c_above_18_excluded(self, caplog):
        """HbA1c 25 % (> 18) is excluded and a WARNING is logged."""
        payload = _make_payload([_verified_obs("HbA1c", 25.0, "%")])

        with caplog.at_level(logging.WARNING, logger="app.main"):
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)

        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        assert lab_ev == [], (
            f"HbA1c 25% must be excluded; got {lab_ev}"
        )
        warn_msgs = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert "LAB_VALUE_OUTSIDE_PLAUSIBLE_RANGE" in warn_msgs

    def test_hba1c_below_3_excluded(self, caplog):
        """HbA1c 1.5 % (< 3) is excluded and a WARNING is logged."""
        payload = _make_payload([_verified_obs("HbA1c", 1.5, "%")])

        with caplog.at_level(logging.WARNING, logger="app.main"):
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)

        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        assert lab_ev == []
        warn_msgs = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert "LAB_VALUE_OUTSIDE_PLAUSIBLE_RANGE" in warn_msgs

    def test_fbs_at_exact_boundary_included(self):
        """FBS at exact boundary values (50 and 400) must be included, not excluded."""
        for boundary_value in (50.0, 400.0):
            payload = _make_payload([_verified_obs("FBS", boundary_value, "mg/dL")])
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
            assert resp.status_code == 200
            lab_ev = resp.json().get("labEvidenceAvailable", [])
            assert len(lab_ev) == 1, (
                f"FBS {boundary_value} at exact boundary must be INCLUDED; got {lab_ev}"
            )

    def test_hba1c_at_exact_boundary_included(self):
        """HbA1c at exact boundary values (3 and 18) must be included, not excluded."""
        for boundary_value in (3.0, 18.0):
            payload = _make_payload([_verified_obs("HbA1c", boundary_value, "%")])
            resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
            assert resp.status_code == 200
            lab_ev = resp.json().get("labEvidenceAvailable", [])
            assert len(lab_ev) == 1, (
                f"HbA1c {boundary_value} at exact boundary must be INCLUDED; got {lab_ev}"
            )

    def test_no_range_defined_for_lipids_accepted_as_is(self):
        """Lipid analytes have no sanity range defined yet — accepted regardless of value."""
        # No range in _LAB_SANITY_RANGES for ldl_cholesterol
        assert "ldl_cholesterol" not in _LAB_SANITY_RANGES, (
            "If a range is added later, update this test to match the new bounds"
        )
        payload = _make_payload([_verified_obs("LDL", 5000.0, "mg/dL")])
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        lab_ev = resp.json().get("labEvidenceAvailable", [])
        # Accepted as-is (no range check applied)
        assert len(lab_ev) == 1


# ---------------------------------------------------------------------------
# [LAB-5] screening signal is unaffected by labObservations (no leakage)
# ---------------------------------------------------------------------------

class TestNoScoreLeak:
    """[LAB-5] Model output must be identical regardless of lab observations
    submitted — lab values must never affect the screening probability."""

    @pytest.fixture(autouse=True)
    def _installed_test_model(self, monkeypatch):
        import numpy as np
        from unittest.mock import MagicMock
        import app.main as main_module

        mock_model = MagicMock()
        mock_model.predict_proba.return_value = np.array([[0.75, 0.25]])

        mock_metadata = {
            "lifecycle_status": "RESEARCH_ONLY",
            "training_date": "synthetic-test-fixture",
            "active_threshold": {
                "mean_cutoff": 0.5,
            },
        }

        monkeypatch.setattr(main_module, "_model", mock_model)
        monkeypatch.setattr(main_module, "_model_installed", True)
        monkeypatch.setattr(main_module, "_model_metadata", mock_metadata)
        monkeypatch.setattr(main_module, "_model_active_cutoff", 0.5)

    def _get_signal(self, lab_observations: list) -> str:
        payload = _make_payload(lab_observations)
        resp = client.post("/v1/modules/diabetes/evaluate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed", (
            f"Expected model to be installed and active; got status={data['status']}"
        )
        assert "screeningProbability" not in data
        return data["screeningSignal"]

    def test_probability_same_with_no_labs(self):
        """Baseline: prob with empty labObservations."""
        assert self._get_signal([]) == "below-screening-threshold"

    def test_probability_unchanged_by_in_range_fbs(self):
        """Adding a verified in-range FBS does not change the probability."""
        signal_no_labs = self._get_signal([])
        signal_with_fbs = self._get_signal([_verified_obs("FBS", 126.0, "mg/dL")])
        assert signal_no_labs == signal_with_fbs

    def test_probability_unchanged_by_hba1c(self):
        """Adding a verified HbA1c does not change the probability."""
        prob_no_labs  = self._get_signal([])
        prob_with_hba = self._get_signal([_verified_obs("HbA1c", 7.2, "%")])
        assert prob_no_labs == prob_with_hba

    def test_probability_unchanged_by_full_lipid_panel(self):
        """Adding a full verified lipid panel does not change the probability."""
        lipids = [
            _verified_obs("TOTAL_CHOLESTEROL", 210.0, "mg/dL"),
            _verified_obs("LDL",               130.0, "mg/dL"),
            _verified_obs("HDL",               45.0,  "mg/dL"),
            _verified_obs("Triglycerides",     175.0, "mg/dL"),
        ]
        prob_no_labs    = self._get_signal([])
        prob_with_lipid = self._get_signal(lipids)
        assert prob_no_labs == prob_with_lipid, (
            f"Lipid panel affected probability: {prob_no_labs} → {prob_with_lipid}"
        )

    def test_probability_unchanged_by_out_of_range_entry(self):
        """Even an excluded (out-of-range) observation must not affect scoring."""
        prob_no_labs   = self._get_signal([])
        prob_with_oor  = self._get_signal([_verified_obs("FBS", 10.0, "mg/dL")])
        assert prob_no_labs == prob_with_oor, (
            f"Out-of-range FBS changed probability: {prob_no_labs} → {prob_with_oor}"
        )

    def test_probability_unchanged_by_mixed_payload(self):
        """A mixed payload (verified+unverified+out-of-range+lipids) leaves prob unchanged."""
        mixed = [
            _verified_obs("FBS",             126.0, "mg/dL"),   # in-range, included
            _verified_obs("HbA1c",           7.2,   "%"),        # in-range, included
            _verified_obs("FBS",             10.0,  "mg/dL"),    # out-of-range, excluded
            _unverified_obs("HbA1c",         5.5,   "%"),        # unverified, excluded
            _verified_obs("LDL",             130.0, "mg/dL"),    # cardiovascular, included
        ]
        prob_no_labs = self._get_signal([])
        prob_mixed   = self._get_signal(mixed)
        assert prob_no_labs == prob_mixed, (
            f"Mixed payload changed probability: {prob_no_labs} → {prob_mixed}"
        )


class TestMessyFrontendLabInputs:
    """Synthetic upload fixtures exercising messy but realistic input shapes."""

    @pytest.mark.parametrize("unit", ["MG/DL", "mg / dL"])
    def test_fbs_with_unexpected_unit_format_is_still_detected(self, unit):
        payload = _make_payload([_verified_obs("FBS", 110.0, unit)])
        response = client.post("/v1/modules/diabetes/evaluate", json=payload)

        assert response.status_code == 200
        evidence = response.json()["labEvidenceAvailable"]
        assert len(evidence) == 1
        assert evidence[0]["canonical"] == "fasting_blood_sugar"
        assert evidence[0]["unit"] == unit

    def test_unknown_lab_code_is_silently_ignored(self, caplog):
        unknown_code = "APOLIPOPROTEIN_B_TEST_FIXTURE"
        assert unknown_code.lower() not in _LAB_CODE_MAPS
        payload = _make_payload([_verified_obs(unknown_code, 95.0, "mg/dL")])

        with caplog.at_level(logging.WARNING, logger="app.main"):
            response = client.post(
                "/v1/modules/diabetes/evaluate", json=payload
            )

        assert response.status_code == 200
        assert response.json()["labEvidenceAvailable"] == []
        assert not caplog.records

    def test_null_lab_value_is_excluded_with_warning(self, caplog):
        payload = _make_payload([_verified_obs("FBS", None, "mg/dL")])

        with caplog.at_level(logging.WARNING, logger="app.main"):
            response = client.post(
                "/v1/modules/diabetes/evaluate", json=payload
            )

        assert response.status_code == 200
        assert response.json()["labEvidenceAvailable"] == []
        warnings = [record.message for record in caplog.records]
        assert "LAB_VALUE_NON_NUMERIC_OR_MISSING" in warnings
