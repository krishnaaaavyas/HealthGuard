"""Shared privacy controls for LASI hypertension aggregate audits."""

from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Callable

import numpy as np
import pandas as pd


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_DATA_FILES = {
    "individual": "3_LASI_W1_Individual_v4.dta",
    "biomarker": "4_LASI_W1_Biomarker.dta",
}
CODEBOOK_EXTENSIONS = {".csv", ".json", ".xlsx", ".xls", ".pdf", ".docx"}
OUTPUT_FILENAMES = {
    "lasi_hypertension_variable_candidates.json",
    "lasi_hypertension_target_candidates.json",
    "lasi_hypertension_predictor_candidates.json",
    "lasi_hypertension_code_distributions.json",
    "lasi_hypertension_missingness_summary.json",
    "lasi_hypertension_audit_manifest.json",
}

DIRECT_IDENTIFIER = re.compile(
    r"\b(name|address|phone|mobile|email|respondent id|participant id|person id|"
    r"household id|precise location|latitude|longitude|prim[ _]key|hhid|ssuid)\b|"
    r"(?:^|_)(?:prim_key|hhid|ssuid)(?:$|_)",
    re.I,
)
RULES = [
    ("repeated_systolic_bp", "target_construction", r"\bsystolic\b.*\b(reading|measurement|blood pressure|bp)\b|\b(reading|measurement)\b.*\bsystolic\b"),
    ("repeated_diastolic_bp", "target_construction", r"\bdiastolic\b.*\b(reading|measurement|blood pressure|bp)\b|\b(reading|measurement)\b.*\bdiastolic\b"),
    ("bp_measurement_validity", "target_construction", r"\b(blood pressure|bp)\b.*\b(valid|complete|completion|attempt|successful)\b"),
    ("previous_hypertension_diagnosis", "eligibility", r"\b(hypertension|high blood pressure)\b.*\b(diagnos|doctor|told|history)\b|\bdiagnos\w*\b.*\b(hypertension|high blood pressure)\b"),
    ("antihypertensive_medication", "eligibility", r"\b(hypertension|blood pressure)\b.*\b(medicat\w*|treatment|drug|tablet)\b|\b(medicat\w*|treatment|drug)\b.*\b(hypertension|blood pressure)\b"),
    ("family_history_hypertension", "predictor", r"\bfamily history\b.*\b(hypertension|high blood pressure)\b|\b(hypertension|high blood pressure)\b.*\b(father|mother|parent|sibling|family)\b"),
    ("physical_activity_category", "predictor", r"\b(physical activity|vigorous activity|moderate activity|exercise frequency|walking frequency|inactive|sedentary)\b"),
    ("smoking_category", "predictor", r"\b(smoking|smoker|tobacco use|cigarette)\b"),
    ("survey_weight", "survey_design", r"\bsurvey weight\b|(?:^|_)weight(?:$|_)"),
    ("splitting_group", "survey_design", r"\b(psu|ssu|cluster|household group|sampling unit)\b"),
    ("age", "predictor", r"\b(age|age of respondent|respondent age)\b"),
    ("sex", "predictor", r"\b(sex|gender|respondent sex)\b"),
    ("height", "predictor", r"\bheight\b"),
    ("weight", "predictor", r"\bweight\b"),
    ("bmi", "predictor", r"\b(body mass index|bmi)\b"),
]
ALLOWED_PROFILE_CANONICAL = {
    "age", "sex", "height", "weight", "bmi", "family_history_hypertension",
    "physical_activity_category", "smoking_category",
}
FORBIDDEN_PROFILE_ROLES = {"target_construction", "eligibility", "survey_design", "identifier"}

# Authoritative, manually approved registry. Broad keyword discovery below is
# exploratory only and must never mutate or extend this mapping.
AUTHORITATIVE_MAPPING = {
    "age": {"source_role": "individual", "columns": ("dm005",), "role": "predictor"},
    "sex": {"source_role": "individual", "columns": ("dm003",), "role": "predictor"},
    "height_cm": {"source_role": "biomarker", "columns": ("bm067",), "role": "predictor"},
    "weight_kg": {"source_role": "biomarker", "columns": ("bm071",), "role": "predictor"},
    "bmi": {"source_role": "biomarker", "columns": ("bm067", "bm071"), "role": "predictor", "derived": True},
    "family_history_hypertension": {
        "source_role": "individual",
        "columns": ("fm303s1", "fm303s2", "fm303s3", "fm303s4", "fm303s5"),
        "role": "predictor",
    },
    "physical_activity_category": {
        "source_role": "individual", "columns": ("hb211", "hb213"),
        "role": "predictor",
    },
    "smoking_category": {
        "source_role": "individual", "columns": ("hb001", "hb003", "hb003_a"),
        "role": "predictor",
    },
    "height_weight_quality": {
        "source_role": "biomarker",
        "columns": ("bm066", "bm068", "bm069", "bm072", "bm073", "bm074"),
        "role": "quality",
    },
    "previous_hypertension_diagnosis": {
        "source_role": "individual", "columns": ("ht002",), "role": "eligibility",
    },
    "current_hypertension_medication": {
        "source_role": "individual", "columns": ("ht002c",), "role": "eligibility",
    },
    "systolic_1": {"source_role": "biomarker", "columns": ("bm006",), "role": "target_construction"},
    "diastolic_1": {"source_role": "biomarker", "columns": ("bm007",), "role": "target_construction"},
    "systolic_2": {"source_role": "biomarker", "columns": ("bm010",), "role": "target_construction"},
    "diastolic_2": {"source_role": "biomarker", "columns": ("bm011",), "role": "target_construction"},
    "systolic_3": {"source_role": "biomarker", "columns": ("bm014",), "role": "target_construction"},
    "diastolic_3": {"source_role": "biomarker", "columns": ("bm015",), "role": "target_construction"},
    "provided_last_two_systolic_average": {
        "source_role": "biomarker", "columns": ("bm017",), "role": "target_construction",
    },
    "provided_last_two_diastolic_average": {
        "source_role": "biomarker", "columns": ("bm018",), "role": "target_construction",
    },
    "bp_consent": {"source_role": "biomarker", "columns": ("bm001",), "role": "quality"},
    "recent_pre_measurement_activity": {"source_role": "biomarker", "columns": ("bm002",), "role": "quality"},
    "arm_used": {"source_role": "biomarker", "columns": ("bm020",), "role": "quality"},
    "respondent_position": {"source_role": "biomarker", "columns": ("bm021",), "role": "quality"},
    "bp_measurement_compliance": {"source_role": "biomarker", "columns": ("bm022",), "role": "quality"},
    "national_weight": {
        "source_role": "individual", "columns": ("indiaindividualweight",),
        "role": "survey_design",
    },
    "state_weight": {
        "source_role": "individual", "columns": ("stateindividualweight",),
        "role": "survey_design",
    },
    "cluster_group_source": {
        "source_role": "individual", "columns": ("ssuid",), "role": "survey_design",
    },
    "household_group_source": {
        "source_role": "individual", "columns": ("hhid",), "role": "survey_design",
    },
    "private_join_key": {
        "source_role": "individual", "columns": ("prim_key",), "role": "identifier",
    },
}

APPROVED_PRODUCTION_PREDICTORS = {
    "age", "sex", "height_cm", "weight_kg", "bmi",
    "family_history_hypertension", "physical_activity_category",
    "smoking_category",
}

APPROVED_TARGET_RECORDS = {
    "systolic_1", "diastolic_1", "systolic_2", "diastolic_2",
    "systolic_3", "diastolic_3", "provided_last_two_systolic_average",
    "provided_last_two_diastolic_average", "previous_hypertension_diagnosis",
    "current_hypertension_medication", "bp_consent",
    "recent_pre_measurement_activity", "arm_used", "respondent_position",
    "bp_measurement_compliance",
}

EXPLICITLY_REJECTED_PREDICTOR_COLUMNS = {
    "bm006", "bm007", "bm010", "bm011", "bm014", "bm015", "bm017", "bm018",
    "ht002", "ht002c", "bm066", "bm068", "bm069", "bm072", "bm073", "bm074",
    "indiaindividualweight", "stateindividualweight", "hhid", "ssuid", "prim_key",
    "fm303s6", "fm303s7", "hb212", "hb214", "hb215", "hb216",
    "es010_1", "es010_2", "es010_3", "es010_4", "es010_5", "es010_6", "ee010a",
}


def authoritative_columns() -> set[str]:
    return {
        column for mapping in AUTHORITATIVE_MAPPING.values()
        for column in mapping["columns"]
    }


def predictor_source_columns() -> set[str]:
    return {
        column for canonical, mapping in AUTHORITATIVE_MAPPING.items()
        if canonical in APPROVED_PRODUCTION_PREDICTORS
        for column in mapping["columns"]
    }


def derive_family_history(frame: pd.DataFrame) -> pd.Series:
    columns = list(AUTHORITATIVE_MAPPING["family_history_hypertension"]["columns"])
    values = frame[columns].apply(pd.to_numeric, errors="coerce")
    result = pd.Series(pd.NA, index=frame.index, dtype="Int8")
    result.loc[values.eq(1).any(axis=1)] = 1
    result.loc[values.isin([0, 1]).all(axis=1) & ~values.eq(1).any(axis=1)] = 0
    return result


def derive_physical_activity(frame: pd.DataFrame) -> pd.Series:
    vigorous = pd.to_numeric(frame["hb211"], errors="coerce")
    moderate = pd.to_numeric(frame["hb213"], errors="coerce")
    result = pd.Series(pd.NA, index=frame.index, dtype="string")
    result.loc[vigorous.isin([1, 2]) | moderate.eq(1)] = "high"
    unresolved = result.isna()
    result.loc[unresolved & (vigorous.eq(3) | moderate.isin([2, 3]))] = "moderate"
    unresolved = result.isna()
    result.loc[unresolved & vigorous.isin([4, 5]) & moderate.isin([4, 5])] = "low"
    return result


def derive_smoking(frame: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    ever = pd.to_numeric(frame["hb001"], errors="coerce")
    product = pd.to_numeric(frame["hb003"], errors="coerce")
    current = pd.to_numeric(frame["hb003_a"], errors="coerce")
    category = pd.Series(pd.NA, index=frame.index, dtype="string")
    category.loc[ever.eq(2)] = "never"
    combustible = ever.eq(1) & product.isin([1, 3])
    category.loc[combustible & current.eq(1)] = "current"
    category.loc[combustible & current.eq(2)] = "former"
    smokeless_only = pd.Series(pd.NA, index=frame.index, dtype="boolean")
    known_product = ever.eq(1) & product.notna()
    smokeless_only.loc[ever.eq(2) | combustible] = False
    smokeless_only.loc[known_product & ~product.isin([1, 3])] = True
    return category, smokeless_only


def diagnosis_eligibility(series: pd.Series) -> pd.Series:
    diagnosis = pd.to_numeric(series, errors="coerce")
    result = pd.Series(pd.NA, index=series.index, dtype="boolean")
    result.loc[diagnosis.eq(1)] = False
    result.loc[diagnosis.eq(2)] = True
    return result


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def validate_roots(data_root: Path, codebook_root: Path, output_dir: Path) -> None:
    for label, path in (("data-root", data_root), ("codebook-root", codebook_root)):
        if is_within(path, REPOSITORY_ROOT):
            raise ValueError(f"{label} must be outside the Git worktree")
        if not path.is_dir():
            raise FileNotFoundError(f"{label} is unavailable")
    if is_within(output_dir, REPOSITORY_ROOT):
        raise ValueError("output-dir must be outside the Git worktree")
    if output_dir.resolve() == data_root.resolve() or is_within(output_dir, data_root):
        raise ValueError("output-dir must not equal or be nested under data-root")


def resolve_sources(data_root: Path, codebook_root: Path) -> tuple[dict[str, Path], list[str]]:
    sources = {}
    for role, basename in EXPECTED_DATA_FILES.items():
        matches = list(data_root.rglob(basename))
        if len(matches) != 1:
            raise FileNotFoundError(f"Required {role} source could not be resolved uniquely")
        sources[role] = matches[0]
    codebooks = sorted(
        path for path in codebook_root.rglob("*")
        if path.is_file() and path.suffix.lower() in CODEBOOK_EXTENSIONS
    )
    if not codebooks:
        raise FileNotFoundError("Required codebook source could not be resolved")
    return sources, [path.name for path in codebooks]


def classify_metadata(name: str, label: str) -> dict[str, Any] | None:
    text = f"{name.replace('_', ' ')} {label}".strip()
    if re.search(r"\bage at marriage\b", text, re.I):
        return None
    if DIRECT_IDENTIFIER.search(text):
        return {
            "canonical_name": "direct_identifier_candidate", "role": "identifier",
            "available_from_healthguard_users": False,
            "allowed_in_profile_model": False,
            "leakage_rationale": "Direct identifiers are prohibited from audit distributions and modelling.",
            "manual_approval_status": "prohibited",
        }
    for canonical, role, pattern in RULES:
        if re.search(pattern, text, re.I):
            allowed = role == "predictor" and canonical in ALLOWED_PROFILE_CANONICAL
            rationale = (
                "Realistic user-entered profile candidate; semantic and coding approval remains manual."
                if allowed else
                "Reserved for target construction, eligibility, grouping, or survey analysis; forbidden as a profile predictor."
            )
            return {
                "canonical_name": canonical, "role": role,
                "available_from_healthguard_users": allowed,
                "allowed_in_profile_model": allowed,
                "leakage_rationale": rationale,
                "manual_approval_status": "requires_manual_review",
            }
    return None


def suppression_marker(min_cell_count: int) -> str:
    return f"SUPPRESSED_BELOW_{min_cell_count}"


def suppress_count(count: int, min_cell_count: int) -> int | str:
    if count == 0:
        return 0
    return count if count >= min_cell_count else suppression_marker(min_cell_count)


def _safe_scalar(value: Any) -> str:
    if pd.isna(value):
        return "missing"
    return str(value)


def aggregate_distribution(series: pd.Series, min_cell_count: int) -> dict[str, Any]:
    counts = series.value_counts(dropna=False)
    return {
        _safe_scalar(code): suppress_count(int(count), min_cell_count)
        for code, count in sorted(counts.items(), key=lambda item: _safe_scalar(item[0]))
    }


def _code_meanings(metadata: Any, name: str) -> list[dict[str, str]]:
    mappings = getattr(metadata, "variable_value_labels", {}) or {}
    values = mappings.get(name, {})
    if not isinstance(values, dict):
        return []
    return [
        {"code": str(code), "meaning": str(meaning)}
        for code, meaning in sorted(values.items(), key=lambda item: str(item[0]))
    ]


def discover_file(
    source: Path,
    role: str,
    min_cell_count: int,
    reader: Callable[..., tuple[pd.DataFrame, Any]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    if reader is None:
        import pyreadstat
        reader = pyreadstat.read_dta
    _, metadata = reader(str(source), metadataonly=True)
    labels = getattr(metadata, "column_names_to_labels", {}) or {}
    types = getattr(metadata, "readstat_variable_types", {}) or {}
    available = set(getattr(metadata, "column_names", []) or [])
    candidates = []
    safe_columns: list[str] = []
    canonical_by_column = {}
    for canonical, mapping in AUTHORITATIVE_MAPPING.items():
        if mapping["source_role"] != role:
            continue
        columns = list(mapping["columns"])
        if not set(columns).issubset(available):
            continue
        mapping_role = mapping["role"]
        allowed = canonical in APPROVED_PRODUCTION_PREDICTORS
        identifier = mapping_role == "identifier"
        record = {
            "canonical_name": canonical,
            "source_file": source.name,
            "source_columns": columns,
            "source_labels": [] if identifier else [str(labels.get(name, "") or "") for name in columns],
            "role": mapping_role,
            "derived": bool(mapping.get("derived", len(columns) > 1 and allowed)),
            "data_types": [str(types.get(name, "unknown")) for name in columns],
            "code_meanings": {} if identifier else {
                name: _code_meanings(metadata, name) for name in columns
            },
            "missing_and_special_codes": "requires_manual_codebook_review",
            "proposed_transformation": proposed_transformation(canonical),
            "available_from_healthguard_users": allowed,
            "allowed_in_profile_model": allowed,
            "leakage_rationale": (
                "Approved user-collectable profile concept; source coding and missingness remain auditable."
                if allowed else
                "Reserved for target construction, eligibility, quality, survey design, grouping, or private joining."
            ),
            "manual_approval_status": "approved",
        }
        candidates.append(record)
        if not identifier:
            for name in columns:
                if name not in safe_columns:
                    safe_columns.append(name)
                canonical_by_column[name] = canonical
    distributions: dict[str, Any] = {}
    missingness: dict[str, Any] = {}
    if safe_columns:
        frame, _ = reader(str(source), usecols=safe_columns, apply_value_formats=False)
        for name in sorted(safe_columns):
            if AUTHORITATIVE_MAPPING[canonical_by_column[name]]["role"] == "target_construction":
                distributions[f"{role}.{name}"] = "not_exported_raw_bp_measurement"
            else:
                distributions[f"{role}.{name}"] = aggregate_distribution(
                    frame[name], min_cell_count
                )
            missingness[f"{role}.{name}"] = {
                "row_count": int(len(frame)),
                "missing_count": suppress_count(int(frame[name].isna().sum()), min_cell_count),
            }
    return sorted(candidates, key=lambda item: (item["role"], item["canonical_name"])), distributions, missingness


def proposed_transformation(canonical: str) -> str:
    if canonical == "bmi":
        return "Use an approved BMI field or deterministically calculate from approved height and weight; do not guess units."
    if canonical in {"height_cm", "weight_kg"}:
        return "Confirm units and validity metadata; inputs may support deterministic BMI calculation."
    if canonical.startswith("systolic_") or canonical.startswith("diastolic_") or canonical.startswith("provided_last_two_"):
        return "Target evidence only; representative-reading aggregation intentionally unresolved."
    if canonical == "family_history_hypertension":
        return "1 if any fm303s1-fm303s5 equals 1; 0 only when all five are known 0; otherwise unknown."
    if canonical == "physical_activity_category":
        return "high: hb211 in {1,2} or hb213=1; moderate: hb211=3 or hb213 in {2,3}; low: both in {4,5}; otherwise unknown."
    if canonical == "smoking_category":
        return "never/current/former per approved hb001, hb003 and hb003_a rules; smokeless-only retained only as context."
    if canonical == "previous_hypertension_diagnosis":
        return "ht002=1 excluded; ht002=2 diagnosis-eligible; otherwise unknown."
    if canonical == "current_hypertension_medication":
        return "Eligibility-only; do not require nonmissing ht002c when ht002=2 because it may be structurally skipped."
    return "Preserve documented codes; transformation requires manual semantic and codebook approval."


def _canonical_records(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Return one authoritative record per canonical name, failing on ambiguity."""
    records: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        name = candidate["canonical_name"]
        if name in records:
            raise RuntimeError(f"Duplicate authoritative mapping emitted for {name}")
        records[name] = candidate
    return records


def build_bundle(
    source_results: list[tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]],
    source_basenames: list[str],
    codebook_basenames: list[str],
    min_cell_count: int,
) -> dict[str, Any]:
    candidates = [record for result, _, _ in source_results for record in result]
    distributions = {key: value for _, values, _ in source_results for key, value in values.items()}
    missingness = {key: value for _, _, values in source_results for key, value in values.items()}
    records = _canonical_records(candidates)
    predictors = [records[name] for name in sorted(APPROVED_PRODUCTION_PREDICTORS) if name in records]
    target = [records[name] for name in sorted(APPROVED_TARGET_RECORDS) if name in records]
    return {
        "lasi_hypertension_variable_candidates.json": {
            "aggregate_metadata_only": True, "candidates": candidates,
        },
        "lasi_hypertension_target_candidates.json": {
            "target_name": "undiagnosed_elevated_bp_screening_target",
            "target_constructed": False,
            "representative_bp_aggregation_approved": False,
            "candidates": target,
        },
        "lasi_hypertension_predictor_candidates.json": {
            "predictor_allowlist_policy": "realistic user-entered profile attributes only",
            "candidates": predictors,
        },
        "lasi_hypertension_code_distributions.json": {
            "aggregate_only": True, "distributions": distributions,
        },
        "lasi_hypertension_missingness_summary.json": {
            "aggregate_only": True, "variables": missingness,
        },
        "lasi_hypertension_audit_manifest.json": {
            "source_files": sorted(source_basenames),
            "codebook_files": sorted(codebook_basenames),
            "participant_level_exported": False,
            "absolute_paths_exported": False,
            "direct_identifier_values_exported": False,
            "raw_bp_values_exported": False,
            "small_cell_suppression_applied": True,
            "minimum_cell_count": min_cell_count,
            "model_trained": False,
            "cohort_created": False,
            "locked_test_created": False,
            "locked_test_evaluated": False,
        },
    }


def write_bundle(bundle: dict[str, Any], output_dir: Path) -> None:
    if set(bundle) != OUTPUT_FILENAMES:
        raise RuntimeError("Unexpected hypertension audit output schema")
    for payload in bundle.values():
        if contains_row_like_array(payload):
            raise RuntimeError("Participant-level row-like arrays are forbidden")
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename in sorted(bundle):
        (output_dir / filename).write_text(
            json.dumps(bundle[filename], indent=2, sort_keys=True), encoding="utf-8"
        )


def validate_official_candidate_sets(bundle: dict[str, Any]) -> None:
    predictors = bundle["lasi_hypertension_predictor_candidates.json"]["candidates"]
    targets = bundle["lasi_hypertension_target_candidates.json"]["candidates"]
    predictor_names = {item["canonical_name"] for item in predictors}
    target_names = {item["canonical_name"] for item in targets}
    if len(predictors) != 8 or predictor_names != APPROVED_PRODUCTION_PREDICTORS:
        raise RuntimeError("Approved predictor metadata is incomplete; no audit output written")
    if len(targets) != len(APPROVED_TARGET_RECORDS) or target_names != APPROVED_TARGET_RECORDS:
        raise RuntimeError("Approved target/eligibility/quality metadata is incomplete; no audit output written")


def contains_row_like_array(value: Any) -> bool:
    if isinstance(value, dict):
        return any(contains_row_like_array(item) for item in value.values())
    if isinstance(value, list):
        if value and all(isinstance(item, dict) for item in value):
            keys = set().union(*(item.keys() for item in value))
            if {"row_index", "participant_id", "prim_key"} & keys:
                return True
        return any(contains_row_like_array(item) for item in value)
    return False


def has_absolute_path(value: Any) -> bool:
    if isinstance(value, dict):
        return any(has_absolute_path(key) or has_absolute_path(item) for key, item in value.items())
    if isinstance(value, list):
        return any(has_absolute_path(item) for item in value)
    if not isinstance(value, str):
        return False
    return bool(re.match(r"^[A-Za-z]:[\\/]", value)) or (
        value.startswith("/") and PurePosixPath(value).is_absolute()
    ) or PureWindowsPath(value).is_absolute()


def execute_audit(
    data_root: Path,
    codebook_root: Path,
    output_dir: Path,
    min_cell_count: int,
) -> dict[str, Any]:
    if min_cell_count < 2:
        raise ValueError("min-cell-count must be at least 2 to guarantee suppression")
    validate_roots(data_root, codebook_root, output_dir)
    sources, codebooks = resolve_sources(data_root, codebook_root)
    results = [
        discover_file(path, role, min_cell_count)
        for role, path in sorted(sources.items())
    ]
    bundle = build_bundle(
        results, [path.name for path in sources.values()], codebooks,
        min_cell_count,
    )
    validate_official_candidate_sets(bundle)
    write_bundle(bundle, output_dir)
    return bundle
