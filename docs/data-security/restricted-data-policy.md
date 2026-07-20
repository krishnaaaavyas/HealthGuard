# Restricted Data Policy

HealthGuard treats participant-level health and research data as restricted by
default. This policy applies to developers, automated agents, local tools, and
CI workflows.

## Storage and Git

- Raw research datasets stay outside Git and outside the repository.
- Derived participant-level cohorts also stay outside Git, including joined,
  cleaned, feature-level, prediction, and evaluation datasets.
- Restricted working directories must remain local and access-controlled.
- Ignore rules are a defense in depth measure, not permission to place raw or
  derived records inside the repository.
- The restricted-data checker is read-only. It does not delete files or change
  Git tracking state; any remediation must be reviewed and performed manually.

## Agent and collaboration boundaries

- Agents never receive raw participant records, sample rows, identifier values,
  or participant-level exports.
- Only aggregate reports that have been reviewed for disclosure risk may be
  shared with agents, collaborators, or repository tooling.
- Approved variable names, schemas, labels, aggregate counts, and privacy-safe
  synthetic fixtures may be used for implementation and testing.

## Models and outputs

- Model artifacts, serialized pipelines, prediction files, and evaluation
  outputs remain private until explicitly approved through governance review.
- Model predictions and participant-level scores must not be committed.
- Approval to use aggregate audit results does not imply approval to publish a
  trained model or its outputs.

## Transfer and synchronisation

- No automatic upload, backup, cloud synchronisation, or third-party transfer
  of raw data, derived cohorts, model artifacts, predictions, or evaluations is
  permitted.
- External restricted-data locations must never be traversed by repository
  scanners. Users run data-specific audits locally with explicit paths under
  their own authorised environment.

## Required checks

Run one of the following before review or commit:

```powershell
.\.venv\Scripts\python.exe scripts\check_restricted_data.py --tracked
.\.venv\Scripts\python.exe scripts\check_restricted_data.py --staged
.\.venv\Scripts\python.exe scripts\check_restricted_data.py --directory .
```

Any failure must be reviewed manually. Do not automatically delete, untrack,
upload, or relocate files in response to a checker result.
