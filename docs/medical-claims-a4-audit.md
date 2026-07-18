# Medical Claims and Terminology Audit (Phase A4)

This audit documents all problematic clinical claims, risk probability expressions, and validated scoring representations discovered in the codebase, along with approved educational replacements.

## Terminology Mapping Table

| Original Phrase | Approved Replacement | Location / File | Rationale |
| :--- | :--- | :--- | :--- |
| `Personalized Health Risk Assessment` | `Personalized Preventive-Health Assessment` | `index.html` | Avoids implying clinical risk diagnosis. |
| `disease risk scoring` | `lifestyle screening index scoring` | `index.html` | Softens claim to educational screening. |
| `Calculated using FINDRISC and cardiovascular risk scoring models.` | `Calculated using custom screening logic inspired by selected FINDRISC and cardiovascular risk factors.` | `src/lib/i18n.ts` | Honest about custom implementation deviations. |
| `Uses FINDRISC (2007) and Framingham (30-year cohort) equations` | `Uses custom screening logic inspired by FINDRISC and Framingham risk factors` | `README.md` | Prevents claims of exact validated equation usage. |
| `Lifestyle Risk Scores` | `Lifestyle Screening Indices` | `src/lib/i18n.ts` | Moves from diagnostic risk to educational index. |
| `Overall Risk Score` | `Overall Screening Index` | `src/lib/i18n.ts`, UI files | Establishes overall heuristic sum profile. |
| `Overall Risk` | `Overall Screening Index` | `src/lib/i18n.ts` | Corrects overall category title. |
| `Risk Level` | `Screening Tier` | `src/lib/i18n.ts` | Avoids claiming clinical severity metrics. |
| `Overall risk score reduced by...` | `Overall screening index changed by...` | `src/lib/i18n.ts` | Eliminates guaranteed health outcomes. |
| `We have run clinical models (FINDRISC for Diabetes, Framingham for CVD and Hypertension)` | `We have run custom screening logic (inspired by selected FINDRISC factors for Diabetes, and custom cardiovascular screening logic using selected Framingham risk factors for CVD and Hypertension)` | `ai.service.ts` | Corrects Gemini system instructions. |
| `Diabetes Risk / Heart Disease Risk / Hypertension Risk` | `Diabetes screening index / Heart Disease screening index / Hypertension screening index` | Rationales, UI files | Corrects per-condition labeling. |
| `High` risk category | `Elevated` | `src/lib/i18n.ts`, Rationales | Standardizes elevated category. |
| `Causation / Guaranteed prevention` | `Estimated change in the HealthGuard screening index` | `src/routes/_app.simulator.lazy.tsx` | Avoids biological causation claims in simulator. |
| `95% confidence projection` | `Mathematical trend projection (assumes current trend continues)` | `src/routes/_app.progress.lazy.tsx` | Removes statistical certainty without validation. |
| `diagnose, treat, cure...` (implied capabilities) | `educational guidelines, screening indices` | README.md, UI | Corrects marketing/privacy assertions to match real behavior. |

---

## Detailed File Audits

### 1. `index.html`
- **Wording**: `Personalized Health Risk Assessment` (line 6)
  - *Correction*: `Personalized Preventive-Health Assessment`
- **Wording**: `Get personalized disease risk scoring, diet, fitness, and prevention plans` (line 9)
  - *Correction*: `Get application-generated lifestyle screening indices, diet, fitness, and prevention plans based on selected evidence-based wellness guidelines`
- **Wording**: `AI-powered disease risk scoring and personalized health plans.` (line 14)
  - *Correction*: `AI-powered lifestyle screening indices and personalized health plans.`

### 2. `src/lib/i18n.ts`
- **Wording**: `riskScores: { en: "Lifestyle Risk Scores", ... }` (line 251)
  - *Correction*: `Lifestyle Screening Indices`
- **Wording**: `overallRisk: { en: "Overall Risk", ... }` (line 282)
  - *Correction*: `Overall Screening Index`
- **Wording**: `riskDashboard: { en: "Risk Dashboard", ... }` (line 329)
  - *Correction*: `Preventive-Health Dashboard`
- **Wording**: `calculatedUsingModels: { en: "Calculated using FINDRISC and cardiovascular risk scoring models." }` (line 1263)
  - *Correction*: `Calculated using custom screening logic inspired by selected FINDRISC and cardiovascular risk factors.`
- **Wording**: `high: { en: "High", ... }` (line 279)
  - *Correction*: `Elevated` (for English, and equivalents in other languages).

### 3. `src/routes/_app.dashboard.lazy.tsx`
- **Wording**: `Risk Dashboard` (card titles & PDF headings)
  - *Correction*: `Preventive-Health Dashboard` / `Overall Screening Index`
- **Wording**: `Per-condition risk` (PDF)
  - *Correction*: `Per-condition screening index`
- **Wording**: Card results displaying e.g. `Diabetes` with `%`
  - *Correction*: Represent as `/100` screening index ratio, and include an educational limitations footnote block.

### 4. `src/routes/_app.simulator.lazy.tsx`
- **Wording**: `See how much you can reduce your clinical risk profile by committing to key lifestyle habits.` (Simulator description)
  - *Correction*: `See the estimated change in your HealthGuard screening index by simulating key lifestyle habit modifications.`
- **Wording**: `Estimated Risk Reduction / risk drop`
  - *Correction*: `Estimated change in the HealthGuard screening index`

### 5. `src/routes/_app.progress.lazy.tsx`
- **Wording**: Charts and projections showing confidence labels or forecasting absolute risk.
  - *Correction*: Wording updated to "mathematical trend projection (assumes current trend continues)" with all confidence values removed.

### 6. `backend/src/services/ai.service.ts` (Gemini Prompts)
- **Wording**: System prompts presenting custom scores as probabilities, diagnosing conditions, or claiming clinical certainty.
  - *Correction*: Standardize system prompts to describe scores as screening indices and restrict generated advice from diagnosing/prescribing.

### 7. `README.md`
- **Wording**: Representing equations as exact validated engines.
  - *Correction*: Document scoring limitations and use custom scoring inspired by standard factors.
