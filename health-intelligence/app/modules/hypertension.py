"""Privacy-safe, non-diagnostic hypertension screening-awareness module."""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from app.core.model_registry import (
    APPROVED_FEATURES,
    APPROVED_THRESHOLD,
    MODEL_VERSION,
    ModelState,
)
from app.schemas.health_context import HealthContext


APPROVED_USER_FACING_TEXT = (
    "Your answers suggest that checking your blood pressure with a validated "
    "measurement would be worthwhile. This is not a diagnosis."
)

LIMITATIONS = [
    "This is a non-diagnostic screening-awareness model.",
    "The model was developed for adults aged 45 years and older without a previous hypertension diagnosis.",
    "The model cannot replace a validated blood-pressure measurement or clinical assessment.",
    "Model discrimination and specificity are limited; generalizability outside the development population is unknown.",
]


def _response(
    status: str,
    screening_signal: str | None,
    reason_codes: list[str],
    missing_inputs: list[str],
    recommended_actions: list[str],
    model_version: str = MODEL_VERSION,
    message: str | None = None,
    result_type: str = "screening-awareness",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "moduleId": "hypertension-screening-awareness",
        "resultType": result_type,
        "status": status,
        "reasonCodes": reason_codes,
        "missingInputs": missing_inputs,
        "recommendedActions": recommended_actions,
        "limitations": LIMITATIONS,
        "modelVersion": model_version,
    }
    if screening_signal is not None:
        payload["screeningSignal"] = screening_signal
    if message is not None:
        payload["message"] = message
    return payload


def _is_emergency_bp(systolic: float | None, diastolic: float | None) -> bool:
    return bool(
        (systolic is not None and math.isfinite(systolic) and systolic >= 180)
        or (diastolic is not None and math.isfinite(diastolic) and diastolic >= 120)
    )


def _activity_category(structured: str | None, legacy: str) -> str | None:
    if structured is not None:
        return structured
    # Deployment compatibility adapter only. This mapping is not an
    # additional model-validation result.
    return {
        "active": "high",
        "moderate": "moderate",
        "light": "low",
        "none": "low",
    }.get(legacy.lower().strip())


def build_feature_row(context: HealthContext) -> tuple[dict[str, Any] | None, list[str]]:
    assessment = context.assessment
    gender = assessment.gender.lower().strip()
    if gender == "other":
        return None, ["gender"]
    sex = {"male": 1, "female": 2}.get(gender)
    if sex is None:
        return None, ["gender"]

    smoking = assessment.smoking.lower().strip()
    if smoking not in {"never", "current", "former"}:
        return None, ["smoking"]

    activity = _activity_category(
        assessment.physicalActivityCategory,
        assessment.exercise,
    )
    family_history = (
        1 if assessment.familyHistoryHypertension is True
        else 0 if assessment.familyHistoryHypertension is False
        else float("nan")
    )
    row = {
        "age": float(assessment.age),
        "height_cm": float(assessment.heightCm),
        "weight_kg": float(assessment.weightKg),
        "sex": sex,
        "family_history_hypertension": family_history,
        "physical_activity_category": activity,
        "smoking_category": smoking,
    }
    missing = []
    if assessment.familyHistoryHypertension is None:
        missing.append("familyHistoryHypertension")
    if activity is None:
        missing.append("physicalActivityCategory")
    if not math.isfinite(row["height_cm"]) or row["height_cm"] <= 0:
        return None, ["heightCm"]
    if not math.isfinite(row["weight_kg"]) or row["weight_kg"] <= 0:
        return None, ["weightKg"]
    return row, missing


def evaluate_hypertension(context: HealthContext, model_state: ModelState) -> dict[str, Any]:
    assessment = context.assessment

    has_bp_reading = (
        assessment.systolicBP is not None
        and assessment.diastolicBP is not None
    )
    has_known_hypertension = assessment.knownHypertension is True

    if has_bp_reading or has_known_hypertension:
        return _response(
            status="complete",
            screening_signal=None,
            reason_codes=["REAL_MEASUREMENT_OR_KNOWN_DIAGNOSIS_PRECEDENCE"],
            missing_inputs=[],
            recommended_actions=["FOLLOW_CLINICIAN_DIRECTED_MANAGEMENT"],
            message="Real blood pressure measurement or known diagnosis takes precedence over any predicted signal.",
            result_type="confirmed-evidence",
        )

    if _is_emergency_bp(assessment.systolicBP, assessment.diastolicBP) or assessment.urgentSymptoms is True:
        return _response(
            "measurement-requires-verification",
            "not-evaluated",
            ["SAFETY_OVERRIDE", "URGENT_CLINICAL_REVIEW_REQUIRED"],
            [],
            ["SEEK_PROMPT_MEDICAL_ASSESSMENT"],
            message="A reported blood-pressure measurement or urgent symptom requires prompt medical assessment.",
        )

    if assessment.knownHypertension is True or assessment.takingAntihypertensiveMedication is True:
        return _response(
            "completed",
            "not-evaluated",
            ["KNOWN_CONDITION_MANAGEMENT_CONTEXT", "PROFILE_MODEL_NOT_RUN"],
            [],
            ["CONTINUE_CLINICIAN_DIRECTED_MANAGEMENT"],
            message="The profile screening model is not intended for people with known hypertension or antihypertensive treatment.",
        )

    if assessment.systolicBP is not None or assessment.diastolicBP is not None:
        return _response(
            "measurement-requires-verification",
            "not-evaluated",
            ["REPORTED_BP_REQUIRES_VALIDATED_MEASUREMENT", "PROFILE_MODEL_NOT_RUN"],
            [],
            ["VERIFY_BLOOD_PRESSURE_WITH_VALIDATED_MEASUREMENT"],
            message="A reported blood-pressure value requires measurement verification and is not interpreted as a diagnosis here.",
        )

    if assessment.age < 45:
        return _response(
            "outside-intended-population",
            "not-evaluated",
            ["AGE_BELOW_MODEL_POPULATION"],
            [],
            ["USE_STANDARD_NON_MODEL_BLOOD_PRESSURE_GUIDANCE"],
        )

    if assessment.knownHypertension is None:
        return _response(
            "insufficient-information",
            "not-evaluated",
            ["PREVIOUS_HYPERTENSION_STATUS_REQUIRED"],
            ["knownHypertension"],
            ["CONFIRM_PREVIOUS_HYPERTENSION_STATUS"],
        )

    feature_row, missing = build_feature_row(context)
    if feature_row is None:
        return _response(
            "insufficient-information",
            "not-evaluated",
            ["REQUIRED_MODEL_INPUT_UNSUPPORTED"],
            missing,
            ["COMPLETE_SUPPORTED_PROFILE_INPUTS"],
        )

    if not model_state.available:
        return _response(
            "model-unavailable",
            "not-evaluated",
            [model_state.reason],
            missing,
            ["USE_STANDARD_NON_MODEL_BLOOD_PRESSURE_GUIDANCE"],
            model_version="unassigned",
        )

    try:
        frame = pd.DataFrame([feature_row], columns=list(APPROVED_FEATURES))
        probability = float(model_state.model.predict_proba(frame)[0][1])
        if not math.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError("invalid model output")
        if probability >= APPROVED_THRESHOLD:
            return _response(
                "completed",
                "blood-pressure-measurement-recommended",
                ["PROFILE_SCREENING_PROMPT", "CONFIRMATORY_MEASUREMENT_REQUIRED"],
                missing,
                ["CHECK_BLOOD_PRESSURE_WITH_VALIDATED_MEASUREMENT"],
                message=APPROVED_USER_FACING_TEXT,
            )
        return _response(
            "completed",
            "no-profile-screening-prompt",
            ["NO_PROFILE_SCREENING_PROMPT", "MODEL_IS_NOT_DIAGNOSTIC"],
            missing,
            ["FOLLOW_ROUTINE_BLOOD_PRESSURE_SCREENING_GUIDANCE"],
            message="The profile model did not generate an additional measurement prompt. This is not a diagnosis.",
        )
    except Exception:
        return _response(
            "model-unavailable",
            "not-evaluated",
            ["HYPERTENSION_MODEL_INFERENCE_FAILED"],
            missing,
            ["USE_STANDARD_NON_MODEL_BLOOD_PRESSURE_GUIDANCE"],
            model_version="unassigned",
        )
