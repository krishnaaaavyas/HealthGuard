# LASI diabetes modelling-cohort policy

## Scope

The Phase 2 cohort builder creates a restricted modelling dataset for auditing
undiagnosed diabetes among LASI Wave 1 respondents aged 45 or older. It does
not train a model. LASI source files and generated participant-level cohorts
are restricted data and must remain outside Git.

The production command requires explicit paths to exactly these releases:

- `3_LASI_W1_Individual_v4.dta`
- `4_LASI_W1_Biomarker.dta`
- `LASI_Wave1_DBS-Dataset_v1_July2025_STATA.dta`

There is no synthetic fallback and no alternate dataset fallback. Raw inputs
and the output directory are rejected if they resolve inside this repository.

## Cohort and target

DBS is the base population. Biomarker and Individual records are joined on
`prim_key` with pandas `validate="one_to_one"`. Missing or duplicate keys,
unmatched DBS participants, many-to-many joins, and row expansion are fatal.

The primary cohort requires age at least 45, `ht003 == 2`, and a valid
nonnegative HbA1c measurement. The target is positive at HbA1c >= 6.5 and
negative below 6.5. Before writing anything, the production CLI requires the
approved totals of 50,865 records, 4,635 positives, and 46,230 negatives.
Records are never added or removed to manufacture these totals.

## Export and cleaning rules

The Parquet file contains only age, sex, calculated BMI, waist circumference,
systolic and diastolic blood pressure, the primary target, anonymous household
and SSU group IDs, state, India DBS weight, and the five documented quality
flags. It never contains raw identifiers, HbA1c, diagnosis evidence,
medication evidence, insulin evidence, or the excluded survey weights.

BMI is calculated from measured height and weight. Height outside 100–220 cm,
waist outside 40–200 cm, and calculated BMI outside 10–80 become missing.
Values are not clipped or imputed, and missing predictors do not exclude an
otherwise eligible participant. Height from 100 through 129.9 cm and age over
100 remain available with quality flags.

## Anonymous evaluation groups

Set `LASI_GROUP_SALT` to a private, high-entropy value in the local restricted
execution environment. The builder creates deterministic, namespaced
HMAC-SHA256 household and SSU group IDs. The salt and raw source identifiers
must never be logged, committed, included in manifests, or shared. The builder
also verifies household-to-SSU and SSU-to-state nesting and checks for group-ID
collisions.

Group IDs, state, and survey weight may be used for splitting and aggregate
evaluation. They must be forbidden as model predictors.

## Output handling

Only the following files are written to the explicit external output folder:

- `lasi_undiagnosed_diabetes_cohort.parquet`
- `lasi_diabetes_cohort_manifest.json`
- `lasi_diabetes_cohort_summary.json`

The manifest contains source basenames only, provenance, aggregate counts,
definitions, cleaning rules, software versions, the output schema, and the
Parquet SHA-256 checksum. The summary contains aggregate statistics only.
Neither file may contain absolute local paths, identifier values, the HMAC
salt, or participant rows. Generated files are not committed automatically
and must not be uploaded or cloud-synchronised without explicit approval.
