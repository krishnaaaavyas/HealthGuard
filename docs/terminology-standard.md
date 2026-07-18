# Terminology and Clinical-Safety Copy Standards (Phase A4)

To maintain educational honesty and clinical safety, all developer-facing and user-facing copy in the HealthGuard platform must adhere to the following terminology guidelines.

## 1. Banned Terminology & Claims

The following phrases are strictly **BANNED** from all titles, UI labels, buttons, metadata descriptions, Gemini prompts, emails, and documentation:

- **Diagnosis / Diagnostic**: Never represent the app as diagnostic or claiming clinical accuracy.
- **Disease Probability / Chance of Disease**: Never represent score percentages as calibrated probabilities of developing a condition.
- **Clinically Validated / Hospital-Ready / Production-Grade**: Do not imply the application has undergone clinical trials, validation, or is ready for use in a hospital/clinical setting.
- **Guaranteed Risk Reduction**: Never claim that modifications in lifestyle guarantee a reduction in actual biological disease onset or imply a causal relationship.
- **Model Confidence (without validation)**: Never assert a statistical percentage confidence for projections without clinical data calibration.

---

## 2. Mandatory Approved Vocabulary

Use the following phrases to describe the system's outputs, assessments, and models:

| Banned Term | Required Replacement | Description |
| :--- | :--- | :--- |
| `Risk / Risk Score` | `Screening Index` | Describe condition results as a screening index ratio (e.g., `75/100`). |
| `Risk Category / Risk Level` | `Screening Tier` | Use `Screening Tier` (Low, Moderate, Elevated). |
| `Risk Calculation / Diagnostic Assessment` | `Preventive-Health Assessment` | Describe the questionnaire as a lifestyle preventive-health assessment. |
| `Risk Drivers` | `Factors associated with the score` | Describe inputs affecting the score as associated factors. |
| `Risk reduction / Causal prevention` | `Estimated change in the screening index` | Describe simulated benefits as estimated changes in the score index. |
| `Risk Projection / Forecast` | `Mathematical trend projection` | Describe timeline graphs as trend projections assuming the entered trend continues. |
| `Medical Advice / Action Plan` | `Educational Guidance` | Explicitly state that plans are for educational guidance and lifestyle awareness. |

---

## 3. Mandatory Disclaimer Footer

Every view, screen, or PDF document that renders a screening index must include the following footer or disclaimer:

> *“HealthGuard provides educational health screening indices based on self-reported lifestyle and demographic parameters. It does not diagnose, treat, cure, or prevent any clinical condition. Projections are mathematical trends and do not guarantee biological outcomes. Users must consult qualified healthcare professionals for medical advice and clinical testing.”*
