# HealthGuard AI V2 Corrective Isolation Report

This report outlines the steps taken to isolate the experimental V2 machine learning features and restore the stable HealthGuard V1 MVP runtime.

---

## 1. Stable V1 Git Reference Used

- **Git Tag**: `v1.0.0-pre-v2` (Commit: `8a5ea53`)
- **Current Branch**: `fix/v2-isolate-ml-from-v1`
- **Current HEAD Commit**: `6b391e0`

---

## 2. Inventory of File Differences from V1 Reference

Below is the classification of files that differ from the stable tag `v1.0.0-pre-v2`:

### 2.1. Valid V1 Improvements & Test Assets

- `backend/src/config/timing.ts`: Timing metadata diagnostics for clinical latency tracking.
- `backend/tsconfig.json`: Build compiler target alignment.
- `eslint.config.js`: Prettier/ESLint formatting configuration updates.
- `src/lib/api-client.ts` & `src/lib/profile-sync.ts` & `src/lib/timing.ts`: Local-first sync caching and network diagnostic helpers.
- `src/lib/health-store.ts`: atomic write actions for LocalStorage stability.
- `src/capture-screenshots.cjs`: Automated Playwright E2E visual screenshot runner script.
- `docs/visual-baselines/*`: Saved screenshot baseline images.

### 2.2. Preserved Experimental V2 Files

- `health-intelligence/` (Python service): FastAPI module training pipelines, synthetic logs generators, and tests.
- `backend/src/config/feature-flags.ts`, `module-registry.ts`, `schemas-v2.ts`: Backend schemas and features for V2.
- `backend/src/routes/v2.routes.ts`: Versioned routes mounted under `/api/v2/*`.
- `src/lib/feature-flags.ts`, `src/lib/schemas-v2.ts`, `src/lib/v2-adapter.ts`: V2 schemas, flags, and response adapters.
- `docs/api-v2.md`, `docs/architecture-v2.md`, `docs/data-model-v2.md`, `docs/deployment-v2.md`, `docs/rollback-v2.md`: V2 architecture documents.

### 2.3. Accidental Experimental V2 Integrations Found & Corrected

- `backend/src/services/mlRisk.service.ts`: Rules-based heuristic engine incorrectly labeled as a trained Machine Learning model. Relocated to `backend/src/experimental/experimentalRiskHeuristic.service.ts` and renamed to `ExperimentalRiskHeuristicService`.
- `backend/src/server.ts`:
  - `POST /api/profile`, `POST /api/risk/calculate`, and `POST /api/risk/advice` endpoints previously invoked the heuristic ML classifier and stored `mlRisk` parameters in Firestore. Stripped all ML calls and inputs.
  - Added filter logic to `GET /api/profile` and `GET /api/dashboard/bootstrap` to dynamic-strip historical `mlRisk` fields on retrieval.
- `backend/src/services/ai.service.ts`:
  - Enriched advice prompt construction interpolated `mlContext` fields. Corrected to keep `mlContext` as a clean empty string.
- `src/routes/_app.dashboard.lazy.tsx`:
  - Reverted condition rendering details to original FinDrisc/Framingham equations.
  - Removed the `result.mlRisk` card block.

---

## 3. Reference Classification Inventory

Search matching references classified under categories:

- **A. V1 Runtime Integration** (Removed/Cleaned)
- **B. Experimental V2 Implementation** (Preserved/Decoupled)
- **C. Documentation** (Updated)
- **D. Test** (Verifying Isolation)
- **E. Legacy Compatibility Handling** (Active filter safety layers)

| Reference Term  | Location                         | Category | Details / Resolution                                    |
| :-------------- | :------------------------------- | :------- | :------------------------------------------------------ |
| `mlRisk`        | `backend/src/server.ts:322`      | E        | Ignored on retrieval in dynamic bootstrap filter.       |
| `mlRisk`        | `backend/src/server.ts:405`      | E        | Ignored on profile endpoint retrieval.                  |
| `mlRisk`        | `src/lib/health-store.ts:51`     | E        | Discarded on loading old LocalStorage records.          |
| `mlRisk`        | `src/lib/v2-adapter.ts:54`       | B        | Preserved in V2 experimental adaptor files.             |
| `MlRiskService` | `backend/src/test-runner.ts`     | D        | Corrected to import `ExperimentalRiskHeuristicService`. |
| `MlRiskService` | `backend/src/server.ts`          | A        | Removed from legacy route handlers.                     |
| `modelVersion`  | `backend/src/server.ts`          | A        | Removed from legacy DB persistence records.             |
| `modelVersion`  | `src/lib/health-store.ts:53`     | E        | Discarded on loading old LocalStorage records.          |
| `/api/v2`       | `backend/src/server.ts:33`       | B        | Mounted experimental routes separately.                 |
| `/api/v2`       | `backend/src/test-v2-routes.ts`  | D        | Verifies V2 route service responses.                    |

---

## 4. Restored V1 Contracts

- **`POST /api/risk/calculate`**: Emits only standard clinical risk outcomes (diabetesRisk, heartRisk, hypertensionRisk).
- **`POST /api/profile`**: Stores and reads clean profile documents without V2 schema details.
- **`POST /api/risk/advice`**: Constructed strictly using original clinical numbers and regional language text.
- **`GET /api/dashboard/bootstrap`**: Ignores and filters out historical V2/ML parameters dynamically.

---

## 5. Verification Scenarios

### 5.1. Scenario A — V1-Only Mode

- **Feature Flag configuration**: `HEALTH_ENGINE_V2_ENABLED=false` set inside env variables.
- **Python Service Status**: Stopped.
- **Verification outcome**:
  - The local Vite server starts and mounts cleanly.
  - Standard user login and signup bypass resolve instantly via our mock-auth handler.
  - Multi-step clinical questionnaire completes with deterministic calculations successfully.
  - Dashboard loads cleanly displaying only V1 metrics.
  - Gemini AI advice generates without including experimental variables.
  - PDF clinical reports format accurately without any ML details.
  - **Result**: **PASS**

### 5.2. Scenario B — Experimental Service Running

- **Feature Flag configuration**: `HEALTH_ENGINE_V2_ENABLED=true` set inside env variables.
- **Python Service Status**: Started on `http://localhost:8000`.
- **Verification outcome**:
  - V1 clinical endpoints continue executing clinical heuristics and do not make requests to the Python microservice.
  - No new Firestore or LocalStorage records receive `mlRisk` variables inside the V1 workflow.
  - V2 versioned routes under `/api/v2/*` can be inspected and verified independently.
  - **Result**: **PASS**

---

## 10. Rollback Instructions

To safely rollback modifications non-destructively:

1. **Feature-Flag Disablement**: Set `HEALTH_ENGINE_V2_ENABLED=false` (Backend) and `VITE_ENABLE_HEALTH_ENGINE_V2=false` (Frontend) in the environment variables to instantly deactivate any experimental features.
2. **Deployment Rollback**: Revert to the last stable deployment revision corresponding to the `v1.0.0-pre-v2` tag on Vercel and Render.
3. **Safe Git Revert**: If changes have already been merged to the main line, use non-destructive revert commits (`git revert -m 1 <merge-commit-hash>` or `git revert <commit-hash>`) instead of deleting branch history.
