# LASI undiagnosed-diabetes model-development policy

## Phase 3A scope

Phase 3A compares conservative candidate models using only the validated,
private LASI undiagnosed-diabetes cohort. It does not access raw LASI files,
the former ICMR model, or any ICMR artifacts. It does not select a threshold,
evaluate the locked test fold, save a fitted model, or export predictions.

The production CLI requires explicit cohort, manifest, independent validation
report, external output directory, and random-seed arguments. There is no
fallback dataset or synthetic production mode.

## Required validation

Before fitting anything, the program requires a passing independent validation
report, real-LASI provenance and privacy declarations, an exact Parquet
checksum, the approved ordered cohort schema, no forbidden columns, and the
approved 50,865 total records with 4,635 positives and 46,230 negatives. A
failure stops the run safely.

The sole target is `target_undiagnosed_diabetes`. The feature allowlists are:

- Set A: age and BMI.
- Set B: age, BMI, and sex.
- Set C: Set B plus squared age, squared BMI, and their interaction.

Set C transformations are produced after median imputation inside the sklearn
pipeline. Waist circumference, blood pressure, state, survey weight, group
IDs, quality flags, all targets, target evidence, and raw identifiers are
forbidden predictors. SSU group is used only for splitting; state and India DBS
weight are reserved for later aggregate evaluation and sensitivity work.

## Splitting and preprocessing

A shuffled five-fold `StratifiedGroupKFold` uses SSU as the group. Fold zero is
reserved as the locked test set. Only its row, target, and unique-SSU counts are
reported; its records are never passed to a model in Phase 3A.

The remaining development records undergo a second shuffled five-fold
`StratifiedGroupKFold` using a deterministic seed derived from the CLI seed.
Each fold verifies that train and validation SSUs are disjoint. Median numeric
imputation, most-frequent sex imputation, unknown-safe one-hot encoding, and
logistic scaling all remain inside pipelines fitted after splitting.

## Model comparison

The experiment evaluates a prior dummy baseline and, for each feature set, L2
logistic regression, a depth-three decision tree, and restricted histogram
gradient boosting. Configurations are fixed and conservative. The primary run
uses no class balancing, synthetic sampling, deep learning, or broad parameter
search.

Fold-level aggregate metrics are ROC-AUC, PR-AUC, Brier score, and log loss.
Each configuration reports mean, sample standard deviation, minimum, and
maximum. Aggregate calibration bins contain counts, mean predicted
probabilities, and observed rates only. Comparison priority is PR-AUC,
calibration and Brier score, ROC-AUC, stability, then simplicity.

## Private outputs

Exactly five files are written to the explicit directory outside Git:

- `lasi_development_split_summary.json`
- `lasi_development_model_comparison.json`
- `lasi_development_fold_metrics.csv`
- `lasi_development_calibration_summary.json`
- `lasi_development_run_manifest.json`

They contain aggregate structures and metrics only. They exclude participant
records, group values, fold assignments, row-level predictions, absolute local
paths, and model artifacts. Outputs are not committed automatically.
