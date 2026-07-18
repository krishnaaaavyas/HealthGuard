# HealthGuard AI 🛡️

**AI-Powered Preventive Health Awareness & Risk Assessment Portal**

HealthGuard AI is a modern, patient-first web application designed to help individuals evaluate their metabolic and cardiovascular risk factors before symptoms manifest. Leveraging **Gemini AI**, evidence-based clinical guidelines, and a beautiful, high-performance user interface, HealthGuard AI empowers users to identify chronic health risks (Type 2 Diabetes, Hypertension, and Heart Disease) in under 10 minutes and receive immediate, personalized, and actionable lifestyle guidance.

---

## 🌟 Key Features

### 📋 1. Guided One-Time Health Assessment

- **Smart Onboarding**: First-time users are automatically redirected to a multi-step health questionnaire on signup/login.
- **No Repetition**: Once completed, returning users skip directly to the dashboard.
- **Comprehensive Input**: Assessment covers age, gender, height, weight, smoking, exercise, alcohol, family history, and current symptoms.
- **Anytime Reassessment**: Users can update their profile and retake the assessment from the **Profile** page.

### 📊 2. Intelligent Risk Dashboard

- **Clinical Risk Calculation**: Computes scores using **FINDRISC** (Type 2 Diabetes) and **Framingham** (Heart Disease & Hypertension) equations for clinical transparency.
- **Action Impact Simulation**: Tests multiple realistic lifestyle changes and ranks them by impact. Users see _"Exercise 30 min/day can reduce your risk by 19%"_ with visual confidence metrics.
- **Risk Driver Breakdown**: Visualizes risk into weighted contributors (e.g., Sedentary Lifestyle 38%, BMI 27%) to help users understand _why_ their risk is high.
- **Progress Tracking**: Historical snapshots of risk progression over time.
- **Dynamic Journey Card**: Shows assessment completion status, recommended next step, and profile age.

### 🎮 3. Interactive Action Impact Explorer (Simulator)

- **What-If Analysis**: Simulate the effect of lifestyle changes before committing to them.
- **Ranked Interventions**: View all possible actions ranked by their potential to reduce risk.
- **Personalized Impact**: Each action is calculated specifically for the user's current profile and risk factors.

### 🍱 4. Personalized Action Plan

- **AI-Generated Plans**: Weekly meal and activity plans powered by Gemini AI.
- **Regional Cuisine**: Tailored to Indian vegetarian/non-vegetarian options based on user preference.
- **Fitness Adaptation**: Plans adjust to user's current fitness level and lifestyle.
- **Multilingual Support**: Available in **English, Hindi (हिन्दी), and Gujarati (ગુજરાતી)**.

### 🔍 5. Smart Food Scanner

- **Gemini Vision OCR**: Parses food packaging photos (drag-and-drop or live webcam) and extracts ingredients automatically.
- **Personalized Scoring**: Scores each food item against the user's specific risk profile — not generic nutrition advice.
- **Multi-Dimension Health Score**: Reports glycemic (Diabetes), vascular (Hypertension), and cardiac impact separately on a 1–10 scale.
- **Offline Fallback**: Keyword-based evaluator when API is unavailable.

### 📈 6. Progress Tracking

- **Historical Risk Snapshots**: View how your risk metrics change over time.
- **Trend Analysis**: Visual charts showing improvement or decline in key health metrics.
- **Milestone Celebration**: Track progress toward health goals.

### 📄 7. Clinician-Friendly PDF Reports

- **Professional Export**: Downloadable PDF health summaries via `jsPDF` with full risk profiles.
- **Hospital-Ready Format**: Formatted for sharing with healthcare providers or personal medical records.
- **Comprehensive Snapshots**: Includes assessment date, risk scores, drivers, and action recommendations.

### 🩺 8. Human Expert Review

- **Expert Consultation**: Users can request their health summary be reviewed by a clinical expert.
- **Real-Time Chat**: Real-time expert communication powered by **Firestore listeners** (with polling fallback).
- **Expert Portal**: `/expert-dashboard` shows pending patient requests with full risk snapshots and assessment details.
- **Mock Expert Mode**: Supports mock expert registration for development/demo environments.

### 🛡️ 9. Post-Generation Safety Guardrails

- **AI Claim Validation**: Regex/word-matching validator on all AI recommendations.
- **Diagnosis Redaction**: Automatically redacts diagnosis assertions and drug prescription language.
- **Educational Content Only**: Keeps all content strictly educational and non-clinical.

---

## 🛠️ Tech Stack & Architecture

### Frontend

| Layer     | Technology                             |
| --------- | -------------------------------------- |
| Framework | Vite + React 19 + TypeScript           |
| Routing   | TanStack Router (file-based)           |
| Styling   | Tailwind CSS v4 + Radix UI primitives  |
| Charts    | Recharts                               |
| Reports   | jsPDF                                  |
| Auth / DB | Firebase client SDK (Auth + Firestore) |

### Backend (`/backend`)

| Layer      | Technology                            |
| ---------- | ------------------------------------- |
| Server     | Express.js + TypeScript (`tsx watch`) |
| Auth       | Firebase Admin SDK (+ mock fallback)  |
| AI         | Gemini API `gemini-2.5-flash`         |
| Validation | Zod                                   |

---

## ⚡ Performance Optimization & Local-First Architecture

HealthGuard AI features a premium, production-grade performance architecture engineered to ensure a sub-second Time-to-Interactive (TTI) and bulletproof offline resilience:

### 1. Local-First Architecture (`PendingSyncQueue`)

- **Instant Flow**: Submitting the health assessment calculates risk metrics locally, updates UI context, and redirects the user to the dashboard instantly.
- **Background Pipeline**: Profile synchronizations, Firestore writes, and AI advice generation run concurrently in the background using `profileSyncService`.
- **Offline Recovery**: If network connection is lost, updates are held in `hg.pending-sync.v1` and automatically synchronized when the browser detects a restore of internet connectivity (`online` events).

### 2. Consolidated Dashboard Bootstrap Endpoint

- **Unified Query**: Replaced 5 sequential REST calls with a single consolidated `GET /api/dashboard/bootstrap` endpoint.
- **Concurrent Execution**: Queries user state, expert reviews, and nudges in parallel via `Promise.all`.
- **Dynamic Calculation**: Attributes risk drivers and ranks action priorities on-the-fly, completely bypassing Gemini API dependencies for initial dashboard load.

### 3. Decoupled AI Pipeline & Hashing Cache

- **Decoupled API**: Clinical calculation (`POST /api/risk/calculate`) is separated from AI guidance (`POST /api/risk/advice`), allowing the app to respond in under 100ms.
- **Snapshot Cache**: Generates a 64-bit payload hash for the profile state. If the profile has not changed, the app retrieves the cached clinical recommendation from Firestore in under 200ms, saving Gemini API resources.

### 4. Advanced Bundle Optimization & Route Splitting

- **Route-level Chunking**: Split all main views (Dashboard, Scanner, Progress, Expert Review, Assessment, Report) into dynamically imported TanStack Router lazy routes (`.lazy.tsx` files).
- **On-Demand Imports**: Dynamically loads heavy modules like `jsPDF` only when the user clicks "Download Report".
- **Result**: Reduced the initial JS bundle payload size from **2.3 MB** to **586 kB** (a 75% reduction).

---

## 📂 Project Structure

```
healthguard-ai/
├── src/
│   ├── components/
│   │   ├── ui/                          # Radix UI primitives (50+ components)
│   │   ├── marketing/
│   │   │   ├── site-header.tsx          # Landing page header
│   │   │   └── site-footer.tsx          # Landing page footer
│   │   ├── app-sidebar.tsx              # Navigation sidebar: Dashboard, Scanner, Action Plan, Progress, Expert Review, Profile
│   │   └── language-switcher.tsx        # EN / HI / GU language selector
│   ├── contexts/
│   │   └── auth-context.tsx             # Firebase auth state + backend API sync
│   ├── hooks/
│   │   └── use-mobile.tsx               # Responsive design helper
│   ├── lib/
│   │   ├── firebase.ts                  # Firebase client config + fallback mode
│   │   ├── health-store.ts              # LocalStorage persistence + cloud sync
│   │   ├── health.functions.ts          # Gemini API integration + validation
│   │   ├── i18n.ts                      # Multi-language support (EN / HI / GU)
│   │   └── utils.ts                     # Utility functions
│   └── routes/
│       ├── __root.tsx                   # Root layout
│       ├── _app.tsx                     # Auth guard + onboarding redirect
│       ├── _app.assessment.tsx          # Multi-step health questionnaire
│       ├── _app.dashboard.tsx           # Main risk dashboard with impacts & drivers
│       ├── _app.simulator.tsx           # What-if action impact explorer
│       ├── _app.scanner.tsx             # Food label OCR scanner (drag-drop + webcam)
│       ├── _app.action-plan.tsx         # AI-generated lifestyle plans
│       ├── _app.progress.tsx            # Historical risk tracking + trends
│       ├── _app.report.tsx              # PDF report generation
│       ├── _app.expert-review.tsx       # Expert consultation request + real-time chat
│       ├── _app.profile.tsx             # User profile + reassessment
│       ├── expert-dashboard.tsx         # Expert (clinician) portal for review requests
│       ├── index.tsx                    # Marketing landing page
│       ├── login.tsx                    # User login
│       ├── signup.tsx                   # User registration
│       ├── forgot-password.tsx          # Password recovery
│       ├── about.tsx                    # About page
│       ├── clinical-sources.tsx         # Clinical evidence references
│       ├── contact.tsx                  # Contact page
│       └── privacy.tsx                  # Privacy policy
├── backend/
│   └── src/
│       ├── server.ts                    # Express server + REST routes
│       ├── firebase-admin.ts            # Firebase Admin SDK + mock fallback
│       ├── config/
│       │   ├── foodRules.ts             # Food category rules
│       │   ├── projectionRules.ts       # Risk projection formulas
│       │   └── riskFactors.ts           # Risk factor definitions
│       ├── middleware/
│       │   ├── auth.ts                  # Firebase token verification (real + mock)
│       │   └── requireExpert.ts         # Expert role validation
│       ├── routes/
│       │   └── expertReview.routes.ts   # Expert API endpoints
│       └── services/
│           ├── risk.service.ts          # FINDRISC + Framingham risk equations
│           ├── actionImpact.service.ts  # What-if simulation engine
│           ├── riskDriver.service.ts    # Risk factor attribution analysis
│           ├── foodImpact.service.ts    # Personalized food scoring
│           ├── ai.service.ts            # Gemini API integration (plans + coaching)
│           ├── behavior.service.ts      # Behavioral intervention logic
│           ├── prediction.service.ts    # Risk projection over time
│           ├── simulation.service.ts    # Intervention simulation
│           ├── guardrails.service.ts    # AI content safety validation
│           └── progress.service.ts      # Historical snapshot logging
├── components.json                      # UI component registry
├── .env                                 # Frontend: VITE_FIREBASE_* + VITE_API_URL
├── backend/.env                         # Backend: GEMINI_API_KEY + FIREBASE_SA_KEY_PATH (optional)
├── vite.config.ts                       # Vite configuration
├── tsconfig.json                        # TypeScript frontend config
├── backend/tsconfig.json                # TypeScript backend config
├── eslint.config.js                     # ESLint rules
├── firebase.json                        # Firebase deployment config
├── firestore.rules                      # Firestore security rules
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ and npm
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/) (free tier available)
- (Optional) Firebase project credentials for cloud persistence and auth

### 1. Clone and Install Dependencies

```bash
# Root directory (frontend)
npm install

# Backend
cd backend && npm install && cd ..
```

### 2. Configure Environment Variables

#### Frontend (Root `.env`)

Create a `.env` file in the root directory:

```env
# Firebase configuration (get these from Firebase Console)
VITE_FIREBASE_API_KEY="your-firebase-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"

# API endpoint
VITE_API_URL="http://localhost:5000"
```

#### Backend (`backend/.env`)

Create `.env` in the backend directory:

```env
# Gemini API key (get from https://aistudio.google.com/)
GEMINI_API_KEY="your-gemini-api-key"

# Optional: Firebase service account for cloud persistence
# FIREBASE_SA_KEY_PATH="./service-account.json"
```

> **💡 Note**: Without Firebase service account credentials, the backend automatically falls back to **in-memory mock storage**. This is perfect for local development and demos — all user data is preserved during the session but not persisted to the cloud.

### 3. Start Development Servers

**Run both servers at once (recommended)**:

```bash
npm run dev:all
```

Opens:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:5000](http://localhost:5000)

**Or run them separately**:

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend
cd backend && npm run dev
```

### 4. First-Time User Flow

1. Visit [http://localhost:5173](http://localhost:5173)
2. **Sign up** with email (or **Log in** if you already have an account)
3. Complete the one-time **Health Assessment** (you'll be redirected automatically)
4. Land on your personalized **Dashboard** featuring:
   - Your risk scores (FINDRISC for Diabetes, Framingham for Heart Disease)
   - Key risk drivers (what contributes most to your risk)
   - Action impacts (what lifestyle changes help most)

### 5. Production Build

```bash
# Frontend
npm run build
npm run preview  # Test production build locally

# Backend
cd backend && npm run build
npm start        # Run production server
```

---

## 🔑 Key Technologies

### Frontend Stack

- **Vite** — Lightning-fast build tool
- **React 19** — UI framework
- **TypeScript** — Type safety
- **TanStack Router** — File-based routing (Next.js-like DX)
- **Tailwind CSS v4** — Utility-first styling
- **Radix UI** — Accessible component primitives
- **Recharts** — Interactive charts for risk visualization
- **React Query** — Server state management
- **jsPDF** — PDF report generation
- **Firebase Client SDK** — Auth + Firestore (with fallback)

### Backend Stack

- **Express.js** — REST API server
- **TypeScript** — Type safety
- **Firebase Admin SDK** — User auth + database (with mock fallback)
- **Gemini API** — AI coaching + plan generation
- **Zod** — Runtime validation
- **CORS** — Cross-origin request handling

### Clinical Algorithms

- **FINDRISC** — Type 2 Diabetes risk (2007 Finnish study)
- **Framingham** — Cardiovascular & Heart Disease risk (30-year prospective cohort)
- **Custom Drivers** — Weighted factor analysis for explainability

---

## 🗺️ Development Phases (V1 Baseline)

| Phase        | Description                                                | Status      |
| ------------ | ---------------------------------------------------------- | ----------- |
| **Phase 1**  | Vite + React 19 + TanStack Router + Tailwind v4 foundation | ✅ Complete |
| **Phase 2**  | Multimodal Food Scanner (Gemini Vision OCR + webcam)       | ✅ Complete |
| **Phase 3**  | Clinical Calibration (FINDRISC + Framingham equations)     | ✅ Complete |
| **Phase 4**  | Safety Guardrails (AI claim + prescription validation)     | ✅ Complete |
| **Phase 5**  | Backend Foundation + Firestore Migration                   | ✅ Complete |
| **Phase 6**  | Action Impact Engine (ranked lifestyle interventions)      | ✅ Complete |
| **Phase 7**  | Risk Driver Analysis (explainable factor contributions)    | ✅ Complete |
| **Phase 8**  | Food Intelligence (personalized food–risk connection)      | ✅ Complete |
| **Phase 9**  | UX Cleanup (dashboard focus + sidebar simplification)      | ✅ Complete |
| **Phase 10** | Expert Review (human clinical review + real-time chat)     | ✅ Complete |
| **Phase 11** | Guided Onboarding (one-time assessment + smart redirects)  | ✅ Complete |

---

## 🚀 HealthGuard AI V2 Roadmap

HealthGuard V2 introduces an advanced health-intelligence system supporting detailed biomarker screening, laboratory reports parsing, and localized regional contexts.

### V2 Phases

- **Phase 0: Baseline, Safety Net & Compatibility** | **Status: ✅ Complete**
- **Phase 1: Lab Reports OCR & Biomarker Parsing** | Status: 📅 Scheduled
- **Phase 2: ML-Powered Cardiovascular Risk Models** | Status: 📅 Scheduled
- **Phase 3: Localized Regional Context Engine** | Status: 📅 Scheduled

### Feature-Flag Configurations

All V2 capabilities reside behind environment variables and are disabled by default:

- **Frontend (`.env`)**: `VITE_ENABLE_HEALTH_ENGINE_V2=false`
- **Backend (`backend/.env`)**: `HEALTH_ENGINE_V2_ENABLED=false`

To enable V2 features for testing, change their values to `true` in your local environment files.

### V2 Documentation References

- [V2 Architecture Design](file:///c:/Users/admin/Documents/Hackathons%20ig/HealthGuard%20AI/docs/architecture-v2.md)
- [V2 Testing & Baseline Verification](file:///c:/Users/admin/Documents/Hackathons%20ig/HealthGuard%20AI/docs/testing.md)
- [V2 Rollback Procedures & Legacy Verification](file:///c:/Users/admin/Documents/Hackathons%20ig/HealthGuard%20AI/docs/rollback-v2.md)
- [V2 Data Models](file:///c:/Users/admin/Documents/Hackathons%20ig/HealthGuard%20AI/docs/data-model-v2.md)
- [V2 API Specifications](file:///c:/Users/admin/Documents/Hackathons%20ig/HealthGuard%20AI/docs/api-v2.md)

---

## 🔌 API Endpoints

### Authentication

- `POST /auth/register` — Create new user account
- `POST /auth/login` — User login
- `POST /auth/logout` — User logout

### Health Assessment

- `POST /health/assessment` — Submit health questionnaire
- `GET /health/assessment/:userId` — Get user's assessment data
- `PUT /health/assessment/:userId` — Update existing assessment

### Risk Calculation

- `POST /health/risk/calculate` — Calculate FINDRISC & Framingham scores
- `POST /health/actions/impact` — Simulate action impacts on risk
- `POST /health/risk/drivers` — Analyze risk factor contributions

### Food Scanning

- `POST /food/scan` — OCR analyze food packaging image
- `POST /food/impact` — Score food against user's risk profile

### Action Plans

- `POST /plans/generate` — Generate personalized action plan
- `GET /plans/:userId` — Retrieve user's plan

### Expert Review

- `POST /expert/request` — Request expert review
- `GET /expert/requests` — Get pending expert requests (expert only)
- `POST /expert/chat/:requestId` — Send expert message
- `GET /expert/chat/:requestId` — Retrieve chat history

### Progress & History

- `POST /health/progress/snapshot` — Log progress snapshot
- `GET /health/progress/:userId` — Get historical snapshots

---

## 📱 Feature Highlights

### 🎯 What Makes HealthGuard AI Different

1. **Evidence-Based**: Uses FINDRISC (2007) and Framingham (30-year cohort) equations, not guesswork.

2. **Personalized**: Every recommendation — from food scores to action impacts — is calculated for YOUR specific risk profile.

3. **Explainable**: Risk drivers show exactly which factors matter most for you (e.g., "Sedentary Lifestyle 38%").

4. **Safe**: AI-generated content is validated against clinical guardrails to prevent diagnosis claims or inappropriate medication advice.

5. **Accessible**:
   - Three language support (English, Hindi, Gujarati)
   - Regional cuisine preferences (Indian veg/non-veg)
   - Zero upfront medical knowledge required

6. **Real Expert Access**: Not just an AI chatbot — users can request review by real clinicians with full health context.

7. **Offline Ready**: Local storage fallback + mock backend means it works even without Firebase credentials during development.

---

## 🧪 Testing

### Running Tests

```bash
# Frontend linting
npm run lint

# Format code
npm run format

# Backend linting
cd backend && npm run lint
```

### Manual Testing Checklist

- [ ] Sign up → Assessment → Dashboard flow
- [ ] Food scanner with various food items
- [ ] Action impact simulator (verify calculations)
- [ ] Action plan generation (check language/cuisine)
- [ ] Expert review request + chat
- [ ] PDF report download
- [ ] Progress tracking over multiple assessments
- [ ] All three languages (EN, HI, GU)

---

## 🐛 Troubleshooting

### Issue: "API_URL is undefined"

**Solution**: Ensure `VITE_API_URL` is set in `.env` and the backend is running on port 5000.

### Issue: "Gemini API returns 403 Forbidden"

**Solution**: Verify your `GEMINI_API_KEY` in `backend/.env` is valid and not a placeholder.

### Issue: "Firebase config error"

**Solution**: Either:

- Set all `VITE_FIREBASE_*` environment variables correctly, OR
- Leave them empty to use mock fallback (recommended for local dev)

### Issue: "Changes don't reflect in production build"

**Solution**:

```bash
npm run build  # Clear dist/ and rebuild
npm run preview  # Test locally before deploying
```

### Issue: "Firestore security rules blocking requests"

**Solution**: Check `firestore.rules` — ensure your rules allow read/write for authenticated users.

---

## 📚 Architecture Decisions

### Why TanStack Router?

File-based routing with Next.js-like DX, but with more control and zero server requirements.

### Why Gemini API?

- Multimodal (vision + text)
- JSON schema support for reliable structured responses
- Generous free tier
- No authentication complexity (just API key)

### Why FINDRISC + Framingham?

- Peer-reviewed, widely used in clinics
- Well-calibrated thresholds
- Transparent calculation formulas
- Non-proprietary (can be audited)

### Why Firebase?

- Auth is battle-tested
- Firestore is real-time (great for expert chat)
- Authentication is simple (no JWT complexity)
- Scaling is automatic
- **But**: Can run entirely offline with mock fallback

### Why Express + TypeScript backend?

- Lightweight and familiar
- Full type safety with TypeScript
- Easy to add new routes and services
- Good for microservices

---

## 🤝 Contributing

We welcome contributions! Please:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes** and test thoroughly
4. **Run linting**: `npm run lint && npm run format`
5. **Commit with clear messages**: `git commit -m "Add feature: description"`
6. **Push and open a Pull Request**

### Code Style

- TypeScript for everything (no `.js` in src/)
- Prettier for formatting
- ESLint for linting
- Component naming: PascalCase
- Utility functions: camelCase
- Constants: UPPER_SNAKE_CASE

---

## 📄 License

HealthGuard AI is open source and available under the MIT License.

---

## 🙏 Acknowledgments

- **FINDRISC**: Lindström et al., 2007 (Finnish Type 2 Diabetes Risk Score)
- **Framingham**: Framingham Heart Study
- **UI Components**: Radix UI + shadcn/ui
- **Icons**: Lucide React
- **AI**: Google Gemini API

---

## 📞 Support & Community

- **Issues**: [GitHub Issues](https://github.com/yourusername/healthguard-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/healthguard-ai/discussions)
- **Email**: support@healthguard-ai.com
- **Twitter**: [@HealthGuardAI](https://twitter.com/healthguardai)

---

## Experimental Health Intelligence V2

The V2 machine-learning pipeline is currently under development and is not connected to the production V1 user flow.

The stable V1 MVP continues to use its existing risk-assessment and Gemini recommendation architecture.

V2 code is isolated behind backend boundaries and disabled by default. No V2 result is shown to users or stored in V1 profile documents.

### Key Architecture Boundaries:

- **Feature Flags**:
  - `HEALTH_ENGINE_V2_ENABLED=false` (Backend)
  - `VITE_ENABLE_HEALTH_ENGINE_V2=false` (Frontend)
- **FastAPI Python Service**:
  - Located in `health-intelligence/`
  - Runs on port 8000
  - V1 backend calls it only if enabled via feature flags. Otherwise, it uses V1 clinical scoring.

---

## 🎯 Future Roadmap

- [ ] **Wearable Integration**: Sync with Fitbit, Apple Health, Google Fit
- [ ] **Medication Checker**: Drug interaction warnings
- [ ] **Doctor Portal**: Clinicians can view all patients + send recommendations
- [ ] **Genomic Risk**: Add genetic testing data
- [ ] **Longitudinal Predictions**: 5/10/20-year projections
- [ ] **Multi-Language Support**: Add more languages
- [ ] **Mobile App**: React Native version
- [ ] **Blockchain**: Secure health record sharing

---

**Made with ❤️ for preventive health.**
