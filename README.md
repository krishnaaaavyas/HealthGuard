# HealthGuard — Evidence-Aware Preventive Health Intelligence

HealthGuard is an evidence-aware preventive health intelligence platform that combines clinically validated risk screening, laboratory report analysis, and personalized preventive guidance to help users understand and reduce long-term health risks.

The platform brings together a React application, a secure Node/Express API, Firebase services, and a Python/FastAPI health-intelligence service. Screening results are presented with evidence context and safety-oriented limitations; they are not diagnoses.

## Project Overview

HealthGuard supports a preventive-health journey from account creation and structured assessment through risk review, action planning, progress tracking, report generation, and optional expert review.

The current implementation includes two complementary screening layers:

- Deterministic clinical risk calculations used by the existing application flow.
- Independently deployable diabetes and hypertension screening modules served by the Python health-intelligence service and integrated through backend-controlled orchestration.

The backend preserves safety routing precedence. Urgent evidence is handled before known-condition context, measured evidence, profile screening, or general prevention guidance. Model failures produce controlled unavailable states and do not silently substitute clinical conclusions.

## Features

- **User Authentication** — Firebase-backed registration, login, session handling, and protected application routes.
- **Preventive Health Assessment** — Structured collection of age, body measurements, lifestyle factors, family history, and symptoms.
- **Diabetes Risk Screening** — Evidence-aware screening using the established application calculation and an independently managed FastAPI model module.
- **Hypertension Risk Screening** — Safety-routed screening awareness that distinguishes urgent measurements, known-condition management, measurement verification, and eligible profile screening.
- **Blood Report Upload and OCR** — Controlled JPEG, PNG, WebP, and PDF intake with size, signature, MIME, and image-dimension validation before Gemini-assisted extraction.
- **Personalized Risk Dashboard** — Risk summaries, contributing factors, action priorities, and preventive context.
- **Evidence-Aware Recommendations** — Deterministic guidance and Gemini-assisted plans protected by validation and clinical-language guardrails.
- **Progress Tracking** — Historical health and risk snapshots with trend views.
- **Health Reports** — Downloadable summaries for personal reference or discussion with a healthcare professional.
- **Expert Review Module** — Authenticated review requests and expert-user messaging.
- **Secure Backend Architecture** — Explicit CORS controls, rate limiting, request IDs, body limits, upload validation, Firebase token verification, and production-safe mock-feature controls.

## Architecture

```text
React Frontend
        │
        ▼
Node / Express Backend
        │
        ▼
FastAPI Health Intelligence
        │
        ▼
Clinical Screening Models
```

The frontend, backend, and health-intelligence components are independently deployable services:

- The **frontend** owns user interaction, authenticated navigation, dashboard presentation, and report views.
- The **Node/Express backend** owns authentication enforcement, persistence, Gemini integration, security controls, legacy risk APIs, and Health Engine orchestration.
- The **FastAPI health-intelligence service** validates model artifacts and exposes isolated diabetes and hypertension evaluation modules.
- Screening artifacts remain outside normal source-control workflows and are loaded through controlled runtime configuration.

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router and React Query
- Firebase client SDK

### Backend

- Node.js
- Express
- TypeScript
- Firebase Admin SDK and Firestore
- Gemini API
- Zod validation

### Health Intelligence

- Python
- FastAPI
- scikit-learn
- Joblib
- pandas and NumPy

### Deployment

- Render Static Site for the frontend
- Render Web Service for the Node/Express backend
- Render Web Service for the FastAPI health-intelligence service

## Project Structure

```text
.
├── src/                         # React frontend
│   ├── components/              # Shared UI and application components
│   ├── contexts/                # Authentication and shared state
│   ├── lib/                     # API clients, persistence, and utilities
│   └── routes/                  # TanStack application routes
├── backend/
│   └── src/
│       ├── config/              # Runtime schemas, flags, and module registry
│       ├── middleware/          # Authentication and security middleware
│       ├── modules/             # Health Engine orchestration modules
│       ├── routes/              # Versioned and expert-review routes
│       └── services/            # Risk, AI, upload, and persistence services
├── health-intelligence/
│   ├── app/                     # FastAPI service and health modules
│   ├── models/                  # Local/runtime model artifact location
│   ├── tests/                   # Python tests using safe fixtures
│   └── training/                # Auditing, validation, and training tooling
├── docs/                        # Architecture, data, model, and safety documentation
├── e2e/                         # Playwright end-to-end tests
├── scripts/                     # Repository and restricted-data checks
└── tests/                       # Repository-level tests
```

## Installation

### Prerequisites

- Node.js 18 or newer
- npm
- Python 3.11 or a compatible supported Python environment
- Firebase project configuration for authenticated cloud operation
- Gemini API credentials for enabled AI-assisted features
- Approved model artifacts when running model-backed health modules

### Install dependencies

```bash
# Frontend
npm install

# Backend
cd backend
npm install
cd ..

# Health intelligence
python -m venv .venv
./.venv/Scripts/python -m pip install -r health-intelligence/requirements.txt
```

On macOS or Linux, activate or invoke the virtual environment using its `bin` directory instead of `Scripts`.

## Environment Variables

Never commit real credentials. Use local environment files or the deployment platform's secret manager.

### Frontend

Common frontend settings include:

```env
VITE_API_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=replace-with-local-value
VITE_FIREBASE_AUTH_DOMAIN=replace-with-local-value
VITE_FIREBASE_PROJECT_ID=replace-with-local-value
VITE_FIREBASE_STORAGE_BUCKET=replace-with-local-value
VITE_FIREBASE_MESSAGING_SENDER_ID=replace-with-local-value
VITE_FIREBASE_APP_ID=replace-with-local-value
```

### Node/Express backend

Start from [`backend/.env.example`](backend/.env.example). Important settings include:

```env
NODE_ENV=development
PORT=5000
CORS_ALLOWED_ORIGINS=http://localhost:5173
FASTAPI_URL=http://localhost:8000
GEMINI_API_KEY=replace-with-local-secret
HEALTH_ENGINE_V2_ENABLED=false
HEALTH_ENGINE_V2_SHADOW_ENABLED=false
HEALTH_MODULE_TIMEOUT_MS=5000
GEMINI_LAB_PROCESSING_ENABLED=true
REQUIRE_EXTERNAL_PROCESSING_CONSENT=false
```

Firebase Admin credentials, rate limits, upload limits, and production consent requirements must also be configured for the target environment. Mock authentication and mock expert registration must remain disabled in production.

### FastAPI health intelligence

The health-intelligence service uses runtime model directories and integrity-checked artifacts. Relevant configuration includes:

```env
HYPERTENSION_MODEL_DIR=C:/path/outside-the-repository/to/approved-artifacts
```

Do not place private model packages, raw clinical datasets, participant-level exports, or credentials in Git.

## Local Development

Run the frontend and Node backend together:

```bash
npm run dev:all
```

Or run all three services separately:

```bash
# Terminal 1: frontend
npm run dev

# Terminal 2: Node/Express backend
cd backend
npm run dev

# Terminal 3: FastAPI health intelligence
cd health-intelligence
../.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Local defaults:

- Frontend: `http://localhost:5173`
- Node/Express backend: `http://localhost:5000`
- FastAPI health intelligence: `http://localhost:8000`

## Testing

```bash
# Frontend and backend test command
npm test

# Backend suite only
cd backend
npm test

# Python suite
cd health-intelligence
../.venv/Scripts/python -m pytest tests -q

# End-to-end browser flow
cd ..
npm run test:e2e

# Production frontend build
npm run build
```

The repository also includes restricted-data checks. Tests and examples must use synthetic fixtures and must not include real patient or participant-level records.

## Deployment

HealthGuard is deployed as three Render services:

1. **Frontend — Render Static Site**
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Configure `VITE_API_URL` and Firebase client variables at build time.

2. **Backend — Render Web Service**
   - Root directory: `backend`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Configure allowed frontend origins, Firebase Admin credentials, Gemini settings, rate limits, upload limits, consent requirements, and the FastAPI service URL.

3. **Health Intelligence — Render Web Service**
   - Root directory: `health-intelligence`
   - Install dependencies from `requirements.txt`.
   - Start FastAPI with Uvicorn using the platform-provided port.
   - Mount or securely provide approved model artifacts and configure their runtime directory.

Production deployments must not use wildcard CORS, development authentication, mock expert routes, placeholder credentials, or unverified model artifacts.

## Security and Privacy

- Raw or restricted health datasets remain outside Git.
- Participant-level derived cohorts and predictions must not be committed or shared.
- Uploaded report bytes are validated in memory and are not persisted by the upload-processing route.
- Laboratory report contents and medical values must not be written to application logs.
- External AI processing can require explicit consent in production.
- Model artifacts remain private until explicitly approved for distribution.
- Only aggregate, privacy-reviewed research outputs may be shared.

See [`docs/data-security/restricted-data-policy.md`](docs/data-security/restricted-data-policy.md) for repository-specific restricted-data controls.

## Clinical Disclaimer

HealthGuard provides preventive-health education and screening support. Its scores, screening signals, model outputs, laboratory extraction results, and recommendations are **not medical diagnoses** and must not be used as a substitute for professional clinical judgment.

Users should consult a qualified healthcare professional for interpretation of health information, confirmatory testing, diagnosis, treatment, medication decisions, or urgent concerns. If symptoms or measurements suggest a possible emergency, seek immediate medical assistance through the appropriate local service.

## Contributing

Keep changes focused, tested, and consistent with the repository's clinical-safety and restricted-data policies. Before opening a pull request:

```bash
npm run build
npm test
cd backend && npm run build && npm test
```

Never include secrets, real patient records, restricted research data, local absolute paths, or unapproved model artifacts in a contribution.

## License

This repository does not currently include a license file. Unless a license is added by the repository owner, do not assume permission to copy, redistribute, or reuse the software outside the terms explicitly provided by the owner.

---

HealthGuard is built to make preventive-health information clearer, safer, and more actionable while preserving the boundary between screening support and medical diagnosis.
