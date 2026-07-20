# LASI Hypertension Modelling Protocol — Phase 0

## 1. Status and scope

This protocol defines the research question and governance boundaries for a
possible multimodel hypertension assessment module. It does not approve a
dataset mapping, target implementation, fitted model, decision threshold, API,
or deployment.

- **Internal target name:** `undiagnosed_elevated_bp_screening_target`
- **Target population:** Adults aged 45 and above within the supported LASI
  population.
- **Intended use:** Profile-based screening only when the user has no usable
  blood-pressure evidence, reports no hypertension diagnosis, and reports no
  antihypertensive medication.
- **Diagnostic status:** `diagnostic = false`
- **Lifecycle status:** Research protocol only. No model is approved.

The task is cross-sectional screening prioritisation. It is not a diagnosis,
future-incidence prediction, treatment recommendation, or substitute for a
validated blood-pressure measurement.

## 2. Preliminary target concept

The preliminary positive-target concept is an otherwise eligible respondent
without known or treated hypertension whose survey blood-pressure measurements
meet the approved elevated-BP criterion.

The preliminary criterion is:

> representative systolic BP >= 140 **or** representative diastolic BP >= 90

This numeric criterion does not complete the target definition. The exact LASI
representative-reading aggregation policy—such as which readings qualify,
handling of incomplete sequences, and how repeated readings are combined—must
be established through a later metadata and target-construction audit. It is
deliberately unresolved and is **not approved in Phase 0**. No LASI variable
names are asserted by this document.

## 3. Eligibility policy

A later target audit must exclude a respondent when any applicable condition
holds:

- known hypertension;
- reported antihypertensive medication;
- diagnosis or medication status is unknown when required by the approved
  target policy;
- insufficient valid BP measurements under the future aggregation policy; or
- age is outside the supported range.

Exclusion logic must be explicit and auditable. Missing diagnosis or medication
evidence must not silently become “no.” Invalid or incomplete measurements must
not be manufactured, clipped, or imputed to create target eligibility.

## 4. Predictor policy

Only realistic attributes that a user can enter without a clinical device,
laboratory test, uploaded report, or medical-record integration may be
considered for the profile model. Each candidate requires documented semantic
meaning, user-question fidelity, coding, missingness, leakage review, and
availability at inference time.

The following are forbidden profile predictors:

- systolic or diastolic BP;
- any BP-derived feature;
- hypertension diagnosis;
- antihypertensive medication;
- any target or target-derived label;
- post-diagnosis treatment, follow-up, or healthcare-utilisation variables;
- report text; and
- document-extracted BP observations.

Identifiers, splitting groups, survey-design fields, and survey weights are
also not profile predictors. Splitting groups may be used only for leakage-safe
evaluation; weights may be considered only in a separately reported
sensitivity analysis.

## 5. Data strategy

- LASI is the initial development source for the age-45-and-above scope.
- NFHS is reserved for later external validation and possible younger-adult
  expansion, subject to a separate semantic and governance audit.
- LASI and NFHS must not initially be pooled row-by-row. Differences in
  population, survey design, measurements, labels, and timing must first be
  assessed explicitly.

No claim of national representativeness, younger-adult validity, clinical
utility, or transportability follows from development performance in LASI.

## 6. Development governance

Any later development phase must use:

- grouped splitting appropriate to the audited survey structure;
- one deterministic locked test fold;
- no locked-test evaluation during model development or threshold selection;
- preprocessing fitted within training folds only;
- aggregate metrics and calibration summaries only;
- no row-level prediction exports;
- no direct identifiers in modelling outputs;
- no automatic final-model approval; and
- no automatic decision-threshold approval.

The locked fold may be described only through privacy-safe aggregate structure
until a separately approved final evaluation phase. Repeated inspection of it
is prohibited.

## 7. Candidate-model philosophy

Development should begin with conservative, interpretable models and a
`DummyClassifier`-style baseline. Broad hyperparameter searches, synthetic
resampling, and unnecessary complexity are out of scope initially.

Model comparison should prioritise, in order appropriate to the screening
task:

1. PR-AUC relative to prevalence and the dummy baseline;
2. calibration and Brier/log-loss behaviour;
3. fold stability under grouped validation;
4. subgroup behaviour and missingness sensitivity;
5. simplicity and operational robustness; and
6. referral burden at manually reviewed sensitivity targets.

ROC-AUC alone is insufficient. No classification cutoff should be inferred
from a default probability such as 0.5.

## 8. Rejection and downgrade policy

The profile model must be rejected, paused, or downgraded to a general
recommendation to obtain a BP measurement when it:

- provides little practical value beyond that general recommendation;
- is poorly calibrated or unstable across grouped folds;
- produces unacceptable referral burden for modest sensitivity gains;
- performs materially worse for important subgroups;
- depends on inputs users cannot supply reliably;
- cannot be externally validated; or
- creates a plausible risk of delaying direct BP measurement.

A weak profile model is not made acceptable by softer wording. The safe product
fallback is to recommend validated BP measurement, not to imply individualized
certainty.

## 9. Phase 0 exit checklist

- [x] Target name approved for subsequent audit work.
- [x] Intended profile-screening use approved.
- [x] Initial LASI age scope of 45+ approved.
- [x] Route precedence approved in the product safety contract.
- [x] Forbidden profile predictors approved.
- [x] Grouped splitting and locked-test policy approved.
- [x] Uploaded-report evidence separated from profile modelling.
- [x] Exact representative-BP aggregation intentionally deferred.
- [x] No training, locked-test evaluation, model selection, or deployment
  performed in Phase 0.

Passing this checklist authorises only the next audit phase. It does not
approve a target implementation, model, threshold, or user-facing release.
