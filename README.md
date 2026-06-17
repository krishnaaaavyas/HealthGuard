# HealthGuard AI 🛡️

### AI-Powered Preventive Health Awareness & Risk Assessment Portal

HealthGuard AI is a modern, patient-first web application designed to help individuals evaluate their metabolic and cardiovascular risk factors before symptoms manifest. Leveraging **Gemini AI**, evidence-based clinical guidelines, and a beautiful, high-performance user interface, HealthGuard AI empowers users to identify chronic health risks (Type 2 Diabetes, Hypertension, and Heart Disease) in under 10 minutes and receive immediate, regionalized, and actionable lifestyle guidance.

---

## 🌟 Key Features

### 📋 1. On-Device Clinical Assessment

- A 10-minute questionnaire mapping demographic and physical parameters (age, gender, height, weight, smoking habits, exercise, family history, and symptoms).
- Client-side data safety: all assessments are stored securely in local storage or synced optionally with **Firebase**.

### 📊 2. Interactive Risk Dashboard

- **Clinical Risk Math**: Computes scores using established deterministic equations (**FINDRISC** for Type 2 Diabetes and **Framingham General Cardiovascular Risk** index for Heart Disease and Hypertension) for maximum accuracy and clinical transparency.
- **Vibrant Risk Visualizations**: Incorporates clean, responsive radial bar charts and longitudinal trend projections powered by **Recharts**.
- **Progress Logs**: Allows tracking of body weight, BMI, and overall scores over time.

### 🍱 3. Bespoke Diet & Activity Plans

- Generates weekly customized meal plans tailored to regional cuisine preferences (e.g., Indian Vegetarian / Non-Vegetarian) and available in multiple languages (**English, Hindi, Gujarati**).
- Recommends structured physical activity plans based on current fitness level (**Beginner / Intermediate / Advanced**).

### 🔍 4. Smart Ingredient Scanner

- **Gemini Multimodal OCR**: Captures food packaging photos (via drag-and-drop or **live webcam capture**) and uses Gemini's vision capability to isolate and parse standard ingredients.
- **Health Score (1–10)**: Analyzes healthy vs. concerning chemical additives, presenting detailed glycemic (Diabetes), vascular (Hypertension), and cardiac impacts.
- Includes popular preset profiles for local context (e.g., _Maggi Noodles, Coca-Cola, Lay's Chips, Amul Dahi, Roasted Chana_).
- Offline fallback keyword evaluator checks ingredients locally if connection or API is unavailable.

### 📄 5. Clinician-Friendly Reports

- Generates clean, downloadable PDF summaries using `jsPDF` that users can print, email, or upload to their hospital patient portals.

### 🛡️ 6. Post-Generation Safety Guardrails

- Runs a real-time regex/word-matching validator on all AI recommendations to detect and redact potential diagnosis assertions or specific pharmaceutical drug prescriptions, ensuring the advice remains educational and safe.

### 🔄 7. What-If Health Decision Simulator

- **Transient Projections**: Allows users to simulate lifestyle modifications (target weight, sleep hours, fitness frequency, smoking status, alcohol habits) and view estimated drops in chronic condition risks instantly.
- **Explainable Delta Analytics**: Isolates individual factor contributions, highlights condition-level risk deltas, and stores simulation query parameters inside Firestore `simulations` collection for future analysis.
- **Proactive Dashboard Widgets**: Displays potential risk drops dynamically inside the main dashboard Summary tab.

---

## 🛠️ Tech Stack & Architecture

### Frontend Core

- **Vite & React 19**: Lightning-fast, modern component structure.
- **TypeScript**: Full static typing for safety and robust refactoring.
- **TanStack Router**: Scalable, file-based routing.
- **Tailwind CSS v4**: Beautiful, utility-first styling with smooth micro-animations.
- **Radix UI Primitives**: Accessible UI components.

### AI & Backend Integration

- **Gemini API (`gemini-2.5-flash`)**: Used for structured, multilingual content generation matching rigorous Zod validation schemas.
- **Firebase Core & Firestore**: Secure customer login (Google Auth / Email) and cloud storage sync.
- **Recharts**: Advanced data visualization library.
- **i18n Dictionary**: Multi-lingual dictionary supporting localized translations in Hindi and Gujarati.

---

## 📂 Project Structure

```
healthguard-ai/
├── src/
│   ├── components/
│   │   ├── ui/               # Radix UI primitives (sidebar, buttons, etc.)
│   │   ├── marketing/        # Header, footer, and landing page elements
│   │   ├── app-sidebar.tsx   # Portal sidebar navigation
│   │   └── language-switcher.tsx # Localized translation switcher
│   ├── contexts/
│   │   └── auth-context.tsx  # Firebase login & verification state
│   ├── hooks/
│   │   └── use-mobile.tsx    # Mobile responsiveness hooks
│   ├── lib/
│   │   ├── firebase.ts       # Firebase config and local fallbacks
│   │   ├── health-store.ts   # LocalStorage & sync helper functions
│   │   ├── health.functions.ts # Gemini API integration & schema validations
│   │   └── i18n.ts           # Translation dictionaries (EN, HI, GU)
│   ├── routes/
│   │   ├── _app.tsx          # Main authenticated layout routing wrapper
│   │   ├── _app.dashboard.tsx # Dashboard, charts, plans, and logging
│   │   ├── _app.assessment.tsx# Multi-step demographic questionnaire
│   │   ├── _app.scanner.tsx  # Food label ingredient analyzer
│   │   ├── _app.report.tsx   # PDF download & medical details
│   │   ├── index.tsx         # Landing marketing page
│   │   └── __root.tsx        # Application root context and boundary shell
│   ├── styles.css            # Base Tailwind and visual variable system
│   └── main.tsx              # React mounting entrypoint
├── public/                   # Static assets & media
├── package.json              # Dependency manifests
├── vite.config.ts            # Vite & TanStack Router configurations
└── tsconfig.json             # TypeScript compile options
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- A Gemini API Key from Google AI Studio.

### Installation

1. Clone the repository and navigate to the directory:

   ```bash
   cd healthguard-ai
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure your Environment Variables:
   Create a `.env` file in the root directory (or copy the existing template) and fill in your Gemini API key:

   ```env
   VITE_GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"
   ```

4. Start the local development server:

   ```bash
   npm run dev
   ```

5. Build the application for production:
   ```bash
   npm run build
   ```

### Running the Backend

The Express backend service resides in the `/backend` folder.

1. Navigate to the backend directory and install backend dependencies:

   ```bash
   cd backend
   npm install
   ```

2. Start the backend development server:
   ```bash
   npm run dev
   ```

The backend server runs on `http://localhost:5000`. By default, it operates in a frictionless mock storage mode if no Firebase Credentials (`service-account.json`) are present, using an in-memory database and local unverified JWT decoding.

---

## 🛠️ Execution Progress & Phases

We are executing the productionization of HealthGuard AI in structured phases. Here is the current progress:

| Phase        | Description                                                     | Status           |
| ------------ | --------------------------------------------------------------- | ---------------- |
| **Phase 1**  | Vite, React 19, TanStack routing, and Tailwind v4 core setup    | **Completed** ✅ |
| **Phase 2**  | Multimodal Scanner (Vision OCR API) & Native Webcam Integration | **Completed** ✅ |
| **Phase 3**  | Clinical Calibration (FINDRISC & Framingham equations)          | **Completed** ✅ |
| **Phase 4**  | Safety Guardrails (AI claims and prescription validation)       | **Completed** ✅ |
| **Phase 5**  | Code Quality & Linter Optimization                              | **Completed** ✅ |
| **Phase 6**  | Backend Foundation & Firestore Migration                        | **Completed** ✅ |
| **Phase 7**  | Clinical Risk Engine & Explainability System                    | **Completed** ✅ |
| **Phase 8**  | What-If Simulator (Health Decision Engine)                      | **Completed** ✅ |
| **Phase 9**  | AI Health Coach (Personalized Intelligence Layer)               | **Completed** ✅ |
| **Phase 10** | Progress Intelligence & Longitudinal Health Tracking            | **Completed** ✅ |

---

## 🗺️ Roadmap & Next Steps

Next is the deployment, localization refinement, and testing of user engagement metrics.
