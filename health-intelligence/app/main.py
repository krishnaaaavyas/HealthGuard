"""
main.py — HealthGuard AI Health-Intelligence FastAPI Service
=============================================================
At startup this service attempts to load a trained model artifact from:
    health-intelligence/models/diabetes_model.joblib

If the artifact loads successfully AND its metadata declares a recognised
lifecycle_status (RESEARCH_ONLY or VALIDATION_CANDIDATE), the evaluate
endpoint uses the model to compute a screening probability.

If loading fails for any reason (file absent, corrupted, unrecognised
lifecycle state, inference error), the endpoint falls back to the same
"model-unavailable" response as before — it never crashes and never guesses.

The response exposes a threshold-based screening signal, never the internal
model probability. Unavailable responses retain the same fail-safe contract.
"""

import json
import logging
import math
from pathlib import Path
from fastapi import FastAPI
from pydantic import BaseModel, root_validator
from typing import List, Optional, Literal

log = logging.getLogger(__name__)

app = FastAPI(title="HealthGuard AI - Health Intelligence Service", version="2.0.0")

# ---------------------------------------------------------------------------
# Accepted lifecycle states that permit model use in responses
# ---------------------------------------------------------------------------
_ACCEPTED_LIFECYCLE_STATES = {"RESEARCH_ONLY", "VALIDATION_CANDIDATE"}

# ---------------------------------------------------------------------------
# Model loading — attempted once at module import time, fails silently.
# Paths are resolved relative to this file so the service works regardless
# of the caller's working directory.
# ---------------------------------------------------------------------------
_APP_DIR    = Path(__file__).resolve().parent   # health-intelligence/app/
_HI_DIR     = _APP_DIR.parent                   # health-intelligence/
_MODEL_PATH    = _HI_DIR / "models" / "diabetes_model.joblib"
_METADATA_PATH = _HI_DIR / "models" / "diabetes_model_metadata.json"

_model = None
_model_metadata: dict = {}
_model_installed: bool = False
# Active probability cutoff read from metadata["active_threshold"]["mean_cutoff"]
# at load time.  Used in evaluate_diabetes for the "elevated vs not_elevated"
# classification. None if the model is absent or threshold validation failed;
# either state requires the model-unavailable response.
_model_active_cutoff: Optional[float] = None


def _validate_active_cutoff(value) -> float:
    """Return a valid probability cutoff or raise ValueError."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("active_threshold.mean_cutoff must be numeric.")
    cutoff = float(value)
    if not math.isfinite(cutoff) or not 0.0 <= cutoff <= 1.0:
        raise ValueError(
            "active_threshold.mean_cutoff must be finite and between 0 and 1."
        )
    return cutoff

try:
    import joblib as _joblib

    _loaded = _joblib.load(str(_MODEL_PATH))
    with open(str(_METADATA_PATH), "r", encoding="utf-8") as _f:
        _loaded_meta = json.load(_f)

    _lifecycle = _loaded_meta.get("lifecycle_status", "")
    if _lifecycle not in _ACCEPTED_LIFECYCLE_STATES:
        raise ValueError(
            f"Rejected: lifecycle_status='{_lifecycle}' is not in "
            f"accepted states {_ACCEPTED_LIFECYCLE_STATES}."
        )

    # Validate the cutoff before accepting the model.
    # KeyError / TypeError here fall through to the generic except, triggering
    # the model-unavailable fallback — the service never partially loads.
    _loaded_cutoff = _validate_active_cutoff(
        _loaded_meta["active_threshold"]["mean_cutoff"]
    )

    _model = _loaded
    _model_metadata = _loaded_meta
    _model_installed = True
    _model_active_cutoff = _loaded_cutoff

    log.info(
        "Model loaded. lifecycle=%s sample_size=%s active_cutoff=%.6f",
        _lifecycle, _loaded_meta.get("sample_size"), _model_active_cutoff,
    )

except FileNotFoundError:
    _model = None
    _model_metadata = {}
    _model_installed = False
    _model_active_cutoff = None
    log.info(
        "No model artifact at %s — service will return model-unavailable.", _MODEL_PATH
    )
except Exception as _load_exc:
    _model = None
    _model_metadata = {}
    _model_installed = False
    _model_active_cutoff = None
    log.warning(
        "Model load failed (%s) — service will return model-unavailable.", _load_exc
    )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class Assessment(BaseModel):
    age: int
    gender: str
    heightCm: float
    weightKg: float
    smoking: str
    exercise: str
    familyHistory: str = ""
    symptoms: str = ""
    alcohol: str = "never"
    sleepHours: float = 7.0
    # BP and glucose fields are Optional — no fabricated defaults
    systolicBP: Optional[float] = None
    diastolicBP: Optional[float] = None
    heartRate: Optional[float] = None
    fastingBloodSugar: Optional[float] = None
    schemaVersion: str = "2.0.0"

class LabObservation(BaseModel):
    code: str
    value: Optional[float]   # Optional: null means result pending / not yet available
    unit: str
    observedAt: str
    isVerified: bool = False
    verifiedBy: Optional[str] = None
    source: Literal["ocr", "manual", "report", "unknown"] = "unknown"
    plausibleRangePassed: bool = False
    userConfirmed: bool = False
    unitConfirmed: bool = False
    verifiedByClinician: bool = False
    extractionConfidence: Optional[float] = None
    verificationStatus: Literal[
        "unreviewed", "user-confirmed", "clinician-verified"
    ] = "unreviewed"

    @root_validator(pre=False, skip_on_failure=True)
    def normalize_verification(cls, values):
        values["userConfirmed"] = bool(
            values.get("userConfirmed") or values.get("isVerified")
        )
        values["verifiedByClinician"] = bool(values.get("verifiedByClinician"))
        values["verificationStatus"] = (
            "clinician-verified" if values["verifiedByClinician"]
            else "user-confirmed" if values["userConfirmed"]
            else "unreviewed"
        )
        confidence = values.get("extractionConfidence")
        if confidence is not None and not 0 <= confidence <= 1:
            raise ValueError("extractionConfidence must be between 0 and 1")
        code = values.get("code", "").lower().strip().replace("-", "_").replace(" ", "_")
        value = values.get("value")
        trusted_ranges = {
            "fbs": (50.0, 400.0), "fasting_glucose": (50.0, 400.0),
            "fasting_blood_sugar": (50.0, 400.0), "fpg": (50.0, 400.0),
            "hba1c": (3.0, 18.0), "hb_a1c": (3.0, 18.0), "a1c": (3.0, 18.0),
        }
        bounds = trusted_ranges.get(code)
        values["plausibleRangePassed"] = bool(
            value is not None and math.isfinite(value) and
            ((bounds[0] <= value <= bounds[1]) if bounds else value >= 0)
        )
        return values

class RegionalContext(BaseModel):
    language: str = "en"
    preferredDietaryType: str = "vegetarian"
    stateOrRegionCode: str = "IN"
    customRegionalRules: List[str] = []
    schemaVersion: str = "2.0.0"

class HealthContext(BaseModel):
    userId: str
    assessment: Assessment
    labObservations: List[LabObservation] = []
    regionalContext: RegionalContext
    schemaVersion: str = "2.0.0"


# ---------------------------------------------------------------------------
# Lab-observation evidence detection
# ---------------------------------------------------------------------------
# Maps lower-cased, whitespace-stripped observation codes (and common aliases)
# to a canonical name, a human-readable label, a module tag, and a note.
#
# module tags:
#   "diabetes"        — relevant to the current RESEARCH_ONLY diabetes model
#                       (not used as model inputs under the leakage policy,
#                       but acknowledged for future lab-input model versions)
#   "cardiovascular"  — reserved for the future hypertension / CVD module;
#                       not used in any current calculation or scoring logic
_LAB_CODE_MAPS: dict[str, dict] = {
    # ── Fasting blood sugar / fasting plasma glucose ─────────────────────────
    "fbs":               {"canonical": "fasting_blood_sugar", "label": "Fasting Blood Sugar",     "module": "diabetes"},
    "fasting_glucose":   {"canonical": "fasting_blood_sugar", "label": "Fasting Blood Sugar",     "module": "diabetes"},
    "fpg":               {"canonical": "fasting_blood_sugar", "label": "Fasting Blood Sugar",     "module": "diabetes"},
    "fasting_blood_sugar": {"canonical": "fasting_blood_sugar", "label": "Fasting Blood Sugar",   "module": "diabetes"},
    "glucose_fasting":   {"canonical": "fasting_blood_sugar", "label": "Fasting Blood Sugar",     "module": "diabetes"},
    # ── HbA1c ────────────────────────────────────────────────────────────────
    "hba1c":             {"canonical": "hba1c",               "label": "HbA1c",                  "module": "diabetes"},
    "hb_a1c":            {"canonical": "hba1c",               "label": "HbA1c",                  "module": "diabetes"},
    "hemoglobin_a1c":    {"canonical": "hba1c",               "label": "HbA1c",                  "module": "diabetes"},
    "a1c":               {"canonical": "hba1c",               "label": "HbA1c",                  "module": "diabetes"},
    "glycated_hb":       {"canonical": "hba1c",               "label": "HbA1c",                  "module": "diabetes"},
    # ── Total cholesterol ────────────────────────────────────────────────────
    "total_cholesterol":     {"canonical": "total_cholesterol", "label": "Total Cholesterol",     "module": "cardiovascular"},
    "cholesterol":           {"canonical": "total_cholesterol", "label": "Total Cholesterol",     "module": "cardiovascular"},
    "tc":                    {"canonical": "total_cholesterol", "label": "Total Cholesterol",     "module": "cardiovascular"},
    "chol":                  {"canonical": "total_cholesterol", "label": "Total Cholesterol",     "module": "cardiovascular"},
    # ── LDL cholesterol ──────────────────────────────────────────────────────
    "ldl":                   {"canonical": "ldl_cholesterol",   "label": "LDL Cholesterol",       "module": "cardiovascular"},
    "ldl_c":                 {"canonical": "ldl_cholesterol",   "label": "LDL Cholesterol",       "module": "cardiovascular"},
    "ldl_cholesterol":       {"canonical": "ldl_cholesterol",   "label": "LDL Cholesterol",       "module": "cardiovascular"},
    "low_density_lipoprotein": {"canonical": "ldl_cholesterol", "label": "LDL Cholesterol",      "module": "cardiovascular"},
    # ── HDL cholesterol ──────────────────────────────────────────────────────
    "hdl":                   {"canonical": "hdl_cholesterol",   "label": "HDL Cholesterol",       "module": "cardiovascular"},
    "hdl_c":                 {"canonical": "hdl_cholesterol",   "label": "HDL Cholesterol",       "module": "cardiovascular"},
    "hdl_cholesterol":       {"canonical": "hdl_cholesterol",   "label": "HDL Cholesterol",       "module": "cardiovascular"},
    "high_density_lipoprotein": {"canonical": "hdl_cholesterol", "label": "HDL Cholesterol",     "module": "cardiovascular"},
    # ── Triglycerides ────────────────────────────────────────────────────────
    "triglycerides":          {"canonical": "triglycerides",    "label": "Triglycerides",         "module": "cardiovascular"},
    "triglyceride":           {"canonical": "triglycerides",    "label": "Triglycerides",         "module": "cardiovascular"},
    "tg":                    {"canonical": "triglycerides",    "label": "Triglycerides",         "module": "cardiovascular"},
    "trigs":                 {"canonical": "triglycerides",    "label": "Triglycerides",         "module": "cardiovascular"},
    "vldl_tg":               {"canonical": "triglycerides",    "label": "Triglycerides",         "module": "cardiovascular"},
}


# Per-module notes emitted in labEvidenceAvailable.  Keyed by the "module"
# field in _LAB_CODE_MAPS so the note is always derived from the map, never
# hardcoded at the call site.
_LAB_MODULE_NOTES: dict[str, str] = {
    "diabetes": (
        "Detected but not used as a model input: the current RESEARCH_ONLY "
        "model uses only age and BMI. This value will be considered in a "
        "future model version that includes verified laboratory inputs."
    ),
    "cardiovascular": (
        "Detected but not currently used by any active model. Reserved for "
        "the future hypertension / cardiovascular module. Not used in any "
        "current calculation or scoring logic."
    ),
}


# Sanity ranges for diabetes-relevant lab values.
# Keyed by canonical name (matches _LAB_CODE_MAPS values) so all aliases for
# the same analyte share one definition.
# Values outside these bounds are physiologically implausible for a human
# report and most likely indicate a data-entry error, wrong unit, or a
# corrupted payload.  Out-of-range entries are excluded from
# labEvidenceAvailable and logged as warnings — never silently dropped,
# never included unchecked.
_LAB_SANITY_RANGES: dict[str, tuple[float, float]] = {
    # FBS / fasting plasma glucose: 50–400 mg/dL
    # Below 50 → severe hypoglycaemia (incompatible with a routine report);
    # above 400 → critical hyperglycaemia / likely unit mismatch (mmol/L ×18).
    "fasting_blood_sugar": (50.0, 400.0),
    # HbA1c: 3–18 %
    # Below 3 % → analytical artefact; above 18 % → extreme / incompatible
    # with survival without intensive care.
    "hba1c": (3.0, 18.0),
    # No range defined for cardiovascular analytes yet — those values are
    # accepted as-is until a cardiovascular module sets its own bounds.
}


def _scan_lab_observations(observations: list) -> list[dict]:
    """
    Scan a list of LabObservation objects and return only the verified entries
    whose code matches a recognised lab test from _LAB_CODE_MAPS AND whose
    value passes the physiological sanity range defined in _LAB_SANITY_RANGES.

    Currently recognised analyte groups:
      - Diabetes-relevant : FBS / fasting plasma glucose, HbA1c
      - Cardiovascular (reserved): total cholesterol, LDL, HDL, triglycerides

    Returns a list of dicts, one per matched + verified + in-range observation:
      { "code": <original>, "canonical": <str>, "label": <str>,
        "module": <str>, "value": <float>, "unit": <str>,
        "observedAt": <str>, "isVerified": True, "verifiedBy": <str|None>,
        "note": <str> }

    Entries that fail the sanity check are:
      - Excluded from the returned list (never included).
      - Logged as a WARNING with the original code and out-of-range value.
      - Never silently dropped (the warning is always emitted).

    The returned list is used ONLY for reporting (labEvidenceAvailable).
    It does NOT alter the feature vector passed to any model.
    """
    found: list[dict] = []
    for obs in observations:
        if not obs.userConfirmed:
            continue
        normalised = obs.code.lower().strip().replace("-", "_").replace(" ", "_")
        match = _LAB_CODE_MAPS.get(normalised)
        if not match:
            continue

        canonical = match["canonical"]
        module    = match["module"]

        # ── None / non-finite value guard ────────────────────────────────────
        # value is Optional[float]; null means the result is pending or the
        # upload was malformed.  Exclude with a warning — never crash, never
        # silently include.  This check must come before the range comparison
        # below, which would TypeError on None.
        if obs.value is None or not math.isfinite(obs.value):
            log.warning("LAB_VALUE_NON_NUMERIC_OR_MISSING")
            continue

        # ── Sanity-range check ────────────────────────────────────────────────
        # Only applied when a range is defined for this canonical name.
        # Analytes without an entry in _LAB_SANITY_RANGES are accepted as-is.
        bounds = _LAB_SANITY_RANGES.get(canonical)
        if bounds is not None:
            lo, hi = bounds
            if not (lo <= obs.value <= hi):
                log.warning("LAB_VALUE_OUTSIDE_PLAUSIBLE_RANGE")
                continue   # excluded, not silently dropped — warning was logged

        found.append({
            "code":       obs.code,
            "canonical":  canonical,
            "label":      match["label"],
            "module":     module,
            "value":      obs.value,
            "unit":       obs.unit,
            "observedAt": obs.observedAt,
            "isVerified": True,
            "verifiedBy": obs.verifiedBy,
            "source": obs.source,
            "plausibleRangePassed": True,
            "userConfirmed": obs.userConfirmed,
            "unitConfirmed": obs.unitConfirmed,
            "verifiedByClinician": obs.verifiedByClinician,
            "verificationStatus": obs.verificationStatus,
            "note":       _LAB_MODULE_NOTES.get(module, "Detected; usage not yet defined."),
        })
    return found



# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def get_health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "service": "health-intelligence",
        "process": "running",
        "model_installed": _model_installed,
        "message": (
            "Research model loaded (RESEARCH_ONLY). Not for clinical use."
            if _model_installed
            else "Service process is running. No approved research model is installed."
        ),
    }

@app.get("/ready")
def get_ready():
    return {
        "status": "ok",
        "ready": False,
        "reason": "APPROVED_MODEL_NOT_INSTALLED",
        "reasonCode": "APPROVED_MODEL_NOT_INSTALLED",
    }

@app.get("/models")
def get_models():
    return {
        "active_models": {
            "diabetes": {
                "status": "loaded" if _model_installed else "unloaded",
                "lifecycle_status": _model_metadata.get("lifecycle_status", "none"),
            }
        }
    }

@app.post("/v1/modules/diabetes/evaluate")
def evaluate_diabetes(context: HealthContext):
    # ------------------------------------------------------------------
    # Scan labObservations for verified lab values.
    # This runs in BOTH branches (model present or absent) so the
    # frontend always knows when a verified lab report was submitted.
    # The model's feature vector is NOT affected by this scan.
    # ------------------------------------------------------------------
    lab_evidence = _scan_lab_observations(context.labObservations)
    if lab_evidence:
        log.info("module=diabetes user_confirmed_lab_count=%d", len(lab_evidence))

    if _model is not None and _model_installed:
        try:
            import pandas as pd

            # A complete response requires a validated cutoff and its
            # contextual screeningSignal. Invalid threshold state must use
            # the same model-unavailable fail-safe as other load failures.
            active_cutoff = _validate_active_cutoff(_model_active_cutoff)

            a = context.assessment
            bmi = (
                a.weightKg / ((a.heightCm / 100.0) ** 2)
                if a.heightCm and a.weightKg
                else None
            )

            # ── Feature vector — age_years and bmi ONLY ────────────────────
            # The model (train_icmr.py) was updated to use exactly these two
            # predictors after feature-set comparison showed no PR-AUC gain
            # from adding waist_cm, systolic_bp, diastolic_bp, or sex.
            # The sklearn Pipeline (SimpleImputer inside) handles any NaN
            # values — no pre-inference median imputation is needed here.
            # FBS / HbA1c remain excluded: forbidden under the leakage policy.
            feature_row = {
                "age_years": float(a.age),
                "bmi":       float(bmi) if bmi is not None else float("nan"),
            }

            X_input = pd.DataFrame([feature_row])

            prob = float(_model.predict_proba(X_input)[0][1])

            # ── Screening signal — cutoff from metadata, never hardcoded ───
            # _model_active_cutoff is read from metadata["active_threshold"]
            # ["mean_cutoff"] at startup (currently 0.1206 for 75 % sensitivity
            # target). Missing or malformed threshold state is rejected before
            # inference and cannot produce an uncontextualized probability.
            screening_signal = (
                "elevated-screening-signal"
                if prob >= active_cutoff
                else "below-screening-threshold"
            )

            used    = [k for k, v in feature_row.items() if v == v]   # not NaN
            missing = [k for k, v in feature_row.items() if v != v]   # NaN

            response: dict = {
                "moduleId":             "diabetes-screening",
                "moduleVersion":        _model_metadata.get("training_date", "unassigned"),
                "status":               "completed",
                "resultType":           "screening-signal",
                "source":               "research-model",
                "evidenceSupport":      "research-only",
                "reasonCodes":          ["RESEARCH_ONLY_MODEL"],
                "screeningSignal":      screening_signal,
                "usedEvidence":         used,
                "missingEvidence":      missing,
                # Verified lab values found in the submission but not yet
                # used as model inputs (current model predates lab features).
                # Frontend can use this to show "uploaded report detected".
                "labEvidenceAvailable": lab_evidence,
                "limitations": [
                    "RESEARCH_ONLY: not validated for clinical use",
                    "Small sample — estimates may have high variance",
                    "No external validation cohort available",
                    "Regional sample — national representativeness not established",
                ],
                "nextSteps": [
                    "CONSULT_HEALTHCARE_PROVIDER",
                    "LABORATORY_CONFIRMATION_RECOMMENDED",
                ],
            }
            return response

        except Exception:
            log.warning("module=diabetes status=model-unavailable")

    # ------------------------------------------------------------------
    # Model-unavailable fallback — identical shape as before, always safe.
    # labEvidenceAvailable is still included so the frontend knows a
    # verified lab report was received even when the model is absent.
    # ------------------------------------------------------------------
    return {
        "moduleId":      "diabetes-screening",
        "moduleVersion": "unassigned",
        "status":        "model-unavailable",
        "resultType":    "screening-signal",
        "source":        "research-model",
        "evidenceSupport": "insufficient",
        "reasonCodes":   ["APPROVED_MODEL_NOT_INSTALLED"],
        "usedEvidence":  [],
        "missingEvidence": [],
        "labEvidenceAvailable": lab_evidence,
        "limitations": [
            "NO_APPROVED_MODEL_ARTIFACT",
            "RESEARCH_PIPELINE_PENDING",
        ],
        "nextSteps": [
            "CONTINUE_WITH_NON_ML_EVIDENCE_MODULES"
        ],
    }
