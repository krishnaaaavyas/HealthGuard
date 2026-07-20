"""Synthetic-only tests for the secure LASI modelling-cohort builder."""

import json
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from training import build_lasi_diabetes_cohort as builder


@pytest.fixture
def synthetic_frames():
    keys = [f"FIXTURE-KEY-{i}" for i in range(8)]
    individual = pd.DataFrame({
        "prim_key": keys,
        "hhid": ["HH-A", "HH-A", "HH-B", "HH-C", "HH-D", "HH-E", "HH-F", "HH-G"],
        "ssuid": ["SSU-1", "SSU-1", "SSU-1", "SSU-2", "SSU-2", "SSU-3", "SSU-3", "SSU-3"],
        "dm003": [1, 2, 1, 2, 1, 2, 1, 2],
        "dm005": [45, 55, 60, 44, 70, 80, 101, 50],
        "ht003": [2, 2, 1, 2, 2, 2, None, 2],
        "stateindividualweight": [1.0] * 8,
    })
    biomarker = pd.DataFrame({
        "prim_key": keys,
        "state": [1, 1, 1, 2, 2, 3, 3, 3],
        "bm017": [120, None, 130, 125, 140, 150, 160, 110],
        "bm018": [80, 81, 82, 83, 84, 85, 86, 70],
        "bm067": [170, 129, 165, 175, 99, 221, 160, 170],
        "bm071": [70, 50, 65, 75, 60, 70, 55, 68],
        "bm076": [80, 40, 90, 95, 39, 201, 100, 200],
    })
    dbs = pd.DataFrame({
        "prim_key": keys,
        "hba1c": [6.499, 6.5, 7.0, 7.0, 5.5, None, 8.0, -1.0],
        "indiadbsweight": [1.0] * 8,
        "statedbsweight": [2.0] * 8,
    })
    return individual, biomarker, dbs


def build(synthetic_frames):
    return builder.construct_cohort(
        *synthetic_frames, salt="fixture-only-secret", enforce_expected_counts=False
    )


def test_target_boundary_and_eligibility(synthetic_frames):
    cohort, counts = build(synthetic_frames)
    assert counts == {"total": 3, "positive": 1, "negative": 2}
    assert cohort["target_undiagnosed_diabetes"].tolist() == [0, 1, 0]


def test_known_underage_and_missing_target_evidence_are_excluded(synthetic_frames):
    cohort, _ = build(synthetic_frames)
    assert len(cohort) == 3
    assert 44 not in cohort["age"].tolist()
    assert 60 not in cohort["age"].tolist()  # diagnosed participant
    assert 80 not in cohort["age"].tolist()  # missing HbA1c
    assert 101 not in cohort["age"].tolist()  # missing diagnosis
    assert 50 not in cohort["age"].tolist()  # negative HbA1c


def test_missing_predictors_do_not_remove_eligible_rows(synthetic_frames):
    cohort, _ = build(synthetic_frames)
    row = cohort.loc[cohort["age"].eq(55)].iloc[0]
    assert pd.isna(row["systolic_bp"])
    assert len(cohort) == 3


def test_cleaning_flags_invalid_values_without_clipping(synthetic_frames):
    cohort, _ = build(synthetic_frames)
    short_valid = cohort.loc[cohort["age"].eq(55)].iloc[0]
    invalid = cohort.loc[cohort["age"].eq(70)].iloc[0]
    normal = cohort.loc[cohort["age"].eq(45)].iloc[0]

    assert short_valid["flag_height_100_to_129"]
    assert not short_valid["flag_height_invalid"]
    assert pd.notna(short_valid["bmi"])
    assert invalid["flag_height_invalid"] and invalid["flag_waist_invalid"]
    assert pd.isna(invalid["bmi"]) and pd.isna(invalid["waist_cm"])
    assert normal["waist_cm"] == 80
    assert normal["systolic_bp"] == 120


def test_anonymous_group_ids_are_deterministic_and_namespaced():
    first = builder.anonymous_group_id("HH-A", "salt", "household")
    again = builder.anonymous_group_id("HH-A", "salt", "household")
    different = builder.anonymous_group_id("HH-B", "salt", "household")
    other_namespace = builder.anonymous_group_id("HH-A", "salt", "ssu")
    assert first == again
    assert len(first) == 64
    assert len({first, different, other_namespace}) == 3


def test_export_schema_excludes_identifiers_and_target_evidence(synthetic_frames):
    cohort, _ = build(synthetic_frames)
    assert list(cohort.columns) == builder.OUTPUT_SCHEMA
    assert not set(builder.EXCLUDED_COLUMNS) & set(cohort.columns)
    combined = " ".join(map(str, cohort.astype(str).to_numpy().ravel()))
    assert "FIXTURE-KEY" not in combined
    assert "HH-A" not in combined
    assert "SSU-1" not in combined


def test_invalid_household_to_ssu_nesting_fails(synthetic_frames):
    individual, biomarker, dbs = synthetic_frames
    individual.loc[1, "ssuid"] = "SSU-OTHER"
    with pytest.raises(ValueError, match="household-to-SSU"):
        build((individual, biomarker, dbs))


def test_invalid_ssu_to_state_nesting_fails(synthetic_frames):
    individual, biomarker, dbs = synthetic_frames
    biomarker.loc[1, "state"] = 9
    with pytest.raises(ValueError, match="SSU-to-state"):
        build((individual, biomarker, dbs))


def test_duplicate_key_and_row_expansion_fail(synthetic_frames):
    individual, biomarker, dbs = synthetic_frames
    dbs.loc[1, "prim_key"] = dbs.loc[0, "prim_key"]
    with pytest.raises(ValueError, match="duplicate"):
        build((individual, biomarker, dbs))
    with pytest.raises(ValueError, match="Row expansion rejected"):
        builder.reject_row_expansion(2, 3, "fixture")


def test_unmatched_dbs_participant_fails(synthetic_frames):
    individual, biomarker, dbs = synthetic_frames
    biomarker = biomarker.iloc[:-1].copy()
    with pytest.raises(ValueError, match="unmatched DBS"):
        build((individual, biomarker, dbs))


def test_expected_count_mismatch_fails_loudly(synthetic_frames):
    with pytest.raises(ValueError, match="Expected aggregate count check failed"):
        builder.construct_cohort(
            *synthetic_frames, salt="fixture-only-secret", enforce_expected_counts=True
        )


def test_missing_group_salt_fails(synthetic_frames):
    with pytest.raises(ValueError, match="LASI_GROUP_SALT"):
        builder.construct_cohort(*synthetic_frames, salt="", enforce_expected_counts=False)


def test_repository_path_guards(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setattr(builder, "REPOSITORY_ROOT", repo)
    outside = tmp_path / "external"
    outside.mkdir()
    safe_paths = {role: outside / name for role, name in builder.EXPECTED_FILENAMES.items()}
    with pytest.raises(ValueError, match="Output directory"):
        builder.validate_external_paths(safe_paths, repo / "generated")
    unsafe = dict(safe_paths)
    unsafe["dbs"] = repo / builder.EXPECTED_FILENAMES["dbs"]
    with pytest.raises(ValueError, match="raw input"):
        builder.validate_external_paths(unsafe, outside / "output")


def test_only_approved_columns_are_read(tmp_path):
    fake = tmp_path / "fake.dta"
    fake.touch()
    metadata = SimpleNamespace(
        column_names=builder.APPROVED_COLUMNS["dbs"] + ["secret_notes"]
    )
    calls = []

    def reader(path, **kwargs):
        calls.append(kwargs)
        if kwargs.get("metadataonly"):
            return pd.DataFrame(), metadata
        return pd.DataFrame({column: [1] for column in kwargs["usecols"]}), metadata

    frame = builder.read_approved_columns(fake, "dbs", reader=reader)
    assert calls[1]["usecols"] == builder.APPROVED_COLUMNS["dbs"]
    assert list(frame) == builder.APPROVED_COLUMNS["dbs"]


def test_outputs_are_secure_and_manifests_have_no_absolute_paths(
    tmp_path, synthetic_frames
):
    pytest.importorskip("pyarrow")
    cohort, counts = build(synthetic_frames)
    output = tmp_path / "secure-output"
    sources = {
        role: tmp_path / "restricted" / name
        for role, name in builder.EXPECTED_FILENAMES.items()
    }
    builder.write_outputs(
        cohort, counts, output, sources,
        {"individual": 8, "biomarker": 8, "dbs": 8},
    )
    assert {path.name for path in output.iterdir()} == set(builder.OUTPUT_FILES.values())
    exported = pd.read_parquet(output / builder.OUTPUT_FILES["cohort"])
    assert list(exported) == builder.OUTPUT_SCHEMA
    manifest_text = (output / builder.OUTPUT_FILES["manifest"]).read_text()
    manifest = json.loads(manifest_text)
    assert manifest["contains_raw_identifiers"] is False
    assert manifest["contains_target_defining_variables"] is False
    assert manifest["contains_synthetic_training_records"] is False
    assert str(tmp_path.resolve()) not in manifest_text
    assert set(manifest["source_files"].values()) == set(builder.EXPECTED_FILENAMES.values())


def test_production_cli_requires_all_real_paths_and_has_no_fallback(monkeypatch):
    monkeypatch.setattr("sys.argv", ["builder"])
    with pytest.raises(SystemExit):
        builder.parse_args()
    source = Path(builder.__file__).read_text(encoding="utf-8").lower()
    assert "synthetic fallback" not in source
    assert "generate_synthetic" not in source
