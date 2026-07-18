# Scoring Limitations & Custom Screening Logic (Phase A4)

This document provides transparent, clinical-safety documentation regarding the mathematical equations, parameters, and limitations of the scoring engines utilized in HealthGuard.

## 1. Type 2 Diabetes Screening Logic

### Relationship to FINDRISC
Our diabetes screening logic is **inspired by** selected Finnish Diabetes Risk Score (FINDRISC) factors, but it **does not implement the exact validated FINDRISC equation**.

### Deviations & Simplified Heuristics
- **Missing Parameters**: The validated FINDRISC questionnaire requires waist circumference measurements, daily antihypertensive medication history, and history of high blood glucose. These are not requested by the active questionnaire.
- **Physical Activity**: The validated FINDRISC score requires daily exercise of at least 30 minutes. The application simplifies this to a general category frequency selection.
- **Weight/BMI Scoring**: The validated FINDRISC assigns explicit points based on specific BMI categories ($<25$, $25-30$, $>30$). Our scoring applies linear increments based on the calculated BMI.
- **Output Representation**: The validated FINDRISC score ranges from 0 to 26, representing a calibrated 10-year probability of drug-treated diabetes. Our system returns an application-generated screening index out of 100.

---

## 2. Cardiovascular Screening Logic

### Relationship to Framingham criteria
Our cardiovascular screening logic is **inspired by** selected Framingham Heart Study risk factors, but it **does not implement the exact validated Framingham Risk Score multivariate equations**.

### Deviations & Simplified Heuristics
- **No Multivariate Cox Hazard Models**: The validated Framingham equations use complex logarithmic regression models based on gender-specific coefficients (integrating age, total cholesterol, HDL, systolic blood pressure, smoking, and diabetes). The application uses a simple linear point system.
- **Missing Biomarkers**: Systolic blood pressure values, total cholesterol, and HDL cholesterol measurements are missing from the baseline V1 questionnaire.
- **Hypertension Simplified**: The hypertension screening score is derived solely from age, smoking, family history, exercise, and BMI, rather than clinical blood pressure metrics.

---

## 3. Overall Screening Index

- **Heuristic Summation**: The Overall Screening Index is a simple heuristic sum of the three underlying screening domain scores (Diabetes, Heart Disease, Hypertension), clamping at a maximum of 80.
- **Not a Hazard Score**: It has no representation in clinical literature, does not measure absolute mortality risk, and is not a universal medical risk index. It is strictly a relative lifestyle wellness score.
