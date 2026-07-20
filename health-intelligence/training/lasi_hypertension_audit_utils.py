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
    candidates = []
    safe_columns = []
    canonical_by_column = {}
    for name in getattr(metadata, "column_names", []) or []:
        classification = classify_metadata(name, labels.get(name, "") or "")
        if classification is None:
            continue
        record = {
            **classification,
            "source_file": source.name,
            "source_column": str(name),
            "source_label": None if classification["role"] == "identifier" else str(labels.get(name, "") or ""),
            "data_type": str(types.get(name, "unknown")),
            "code_meanings": [] if classification["role"] == "identifier" else _code_meanings(metadata, name),
            "missing_and_special_codes": "requires_manual_codebook_review",
            "proposed_transformation": proposed_transformation(classification["canonical_name"]),
        }
        candidates.append(record)
        if classification["role"] != "identifier":
            safe_columns.append(name)
            canonical_by_column[name] = classification["canonical_name"]
    distributions: dict[str, Any] = {}
    missingness: dict[str, Any] = {}
    if safe_columns:
        frame, _ = reader(str(source), usecols=safe_columns, apply_value_formats=False)
        for name in sorted(safe_columns):
            if canonical_by_column[name] in {
                "repeated_systolic_bp", "repeated_diastolic_bp"
            }:
                distributions[f"{role}.{name}"] = "not_exported_raw_bp_measurement"
            else:
                distributions[f"{role}.{name}"] = aggregate_distribution(
                    frame[name], min_cell_count
                )
            missingness[f"{role}.{name}"] = {
                "row_count": int(len(frame)),
                "missing_count": suppress_count(int(frame[name].isna().sum()), min_cell_count),
            }
    return sorted(candidates, key=lambda item: (item["role"], item["source_column"])), distributions, missingness


def proposed_transformation(canonical: str) -> str:
    if canonical == "bmi":
        return "Use an approved BMI field or deterministically calculate from approved height and weight; do not guess units."
    if canonical in {"height", "weight"}:
        return "Confirm units and validity metadata; inputs may support deterministic BMI calculation."
    if canonical in {"repeated_systolic_bp", "repeated_diastolic_bp"}:
        return "Target evidence only; representative-reading aggregation intentionally unresolved."
    return "Preserve documented codes; transformation requires manual semantic and codebook approval."


def build_bundle(
    source_results: list[tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]],
    source_basenames: list[str],
    codebook_basenames: list[str],
    min_cell_count: int,
) -> dict[str, Any]:
    candidates = [record for result, _, _ in source_results for record in result]
    distributions = {key: value for _, values, _ in source_results for key, value in values.items()}
    missingness = {key: value for _, _, values in source_results for key, value in values.items()}
    target = [item for item in candidates if item["role"] in {"target_construction", "eligibility"}]
    predictors = [item for item in candidates if item["role"] == "predictor"]
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
    write_bundle(bundle, output_dir)
    return bundle
