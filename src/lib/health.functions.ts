import { z } from "zod";
import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const InputSchema = z.object({
  age: z.number().min(1).max(120),
  gender: z.enum(["male", "female", "other"]),
  heightCm: z.number().min(50).max(260),
  weightKg: z.number().min(10).max(400),
  smoking: z.enum(["never", "former", "current"]),
  exercise: z.enum(["none", "light", "moderate", "active"]),
  familyHistory: z.string().max(500).default(""),
  symptoms: z.string().max(1000).default(""),
  language: z.enum(["en", "hi", "gu"]).default("en"),
});

const GeminiResultSchema = z.object({
  risk: z.object({
    diabetes: z.number().min(0).max(100),
    heartDisease: z.number().min(0).max(100),
    hypertension: z.number().min(0).max(100),
  }),
  rationale: z.object({
    diabetes: z.string(),
    heartDisease: z.string(),
    hypertension: z.string(),
  }),
  dietPlan: z.string(),
  exercisePlan: z.string(),
  preventionTips: z.string(),
});

const ResultSchema = GeminiResultSchema.extend({
  overallScore: z.number().min(0).max(100),
  overallRisk: z.enum(["Low", "Moderate", "High"]),
  factors: z.array(z.object({ name: z.string(), impact: z.number() })).optional(),
  actionPriorities: z
    .array(z.object({ action: z.string(), estimatedImpact: z.number() }))
    .optional(),
});

export type HealthResult = z.infer<typeof ResultSchema>;

const langName = {
  en: "English",
  hi: "Hindi (हिन्दी)",
  gu: "Gujarati (ગુજરાતી)",
} as const;

function computeScore(data: z.infer<typeof InputSchema>) {
  let score = 0;
  const bmi = data.weightKg / Math.pow(data.heightCm / 100, 2);
  if (bmi > 30) score += 20;
  if (data.smoking === "current") score += 15;
  if (data.familyHistory.trim().length > 0) score += 20;
  if (data.exercise === "none") score += 15;
  if (data.age > 45) score += 10;
  return score;
}

function riskLabel(score: number): "Low" | "Moderate" | "High" {
  if (score <= 25) return "Low";
  if (score <= 50) return "Moderate";
  return "High";
}

// Deterministic Clinical Calculators
export function calculateFINDRISC(data: {
  age: number;
  bmi: number;
  exercise: string;
  familyHistory: string;
}): { score: number; percentage: number } {
  let score = 0;
  // Age points
  if (data.age >= 45 && data.age <= 54) score += 2;
  else if (data.age >= 55 && data.age <= 64) score += 3;
  else if (data.age > 64) score += 4;

  // BMI points
  if (data.bmi >= 25 && data.bmi < 30) score += 1;
  else if (data.bmi >= 30) score += 3;

  // Exercise points
  if (data.exercise === "none" || data.exercise === "light") score += 2;

  // Family History points
  const fhLower = data.familyHistory.toLowerCase();
  if (fhLower.includes("diabet") || fhLower.includes("sugar")) {
    if (
      fhLower.includes("mother") ||
      fhLower.includes("father") ||
      fhLower.includes("parent") ||
      fhLower.includes("sibling") ||
      fhLower.includes("brother") ||
      fhLower.includes("sister")
    ) {
      score += 5; // First-degree relative
    } else {
      score += 3; // Second-degree relative
    }
  }

  // 15+ is considered high risk under FINDRISC. Let's map to clean percentage out of 100
  const percentage = Math.min(100, Math.round((score / 15) * 100));
  return { score, percentage };
}

export function calculateCVDRisk(data: {
  age: number;
  bmi: number;
  smoking: string;
  exercise: string;
  familyHistory: string;
}): { score: number; percentage: number } {
  let score = 0;

  // Age score points (Framingham metrics)
  if (data.age >= 35 && data.age <= 39) score += 2;
  else if (data.age >= 40 && data.age <= 44) score += 5;
  else if (data.age >= 45 && data.age <= 49) score += 7;
  else if (data.age >= 50 && data.age <= 54) score += 8;
  else if (data.age >= 55 && data.age <= 59) score += 10;
  else if (data.age >= 60) score += 12;

  // BMI
  if (data.bmi >= 25 && data.bmi < 30) score += 1;
  else if (data.bmi >= 30) score += 2;

  // Smoking
  if (data.smoking === "current") score += 4;

  // Exercise
  if (data.exercise === "none" || data.exercise === "light") score += 2;

  // Family History
  const fhLower = data.familyHistory.toLowerCase();
  if (
    fhLower.includes("heart") ||
    fhLower.includes("cardiac") ||
    fhLower.includes("stroke") ||
    fhLower.includes("coronary")
  ) {
    score += 3;
  }

  const percentage = Math.min(100, Math.round((score / 18) * 100));
  return { score, percentage };
}

export function calculateHypertensionRisk(data: {
  age: number;
  bmi: number;
  exercise: string;
  familyHistory: string;
  symptoms: string;
}): { score: number; percentage: number } {
  let score = 0;

  // Age
  if (data.age > 45) score += 2;
  if (data.age > 60) score += 2;

  // BMI
  if (data.bmi >= 25 && data.bmi < 30) score += 1;
  else if (data.bmi >= 30) score += 3;

  // Exercise
  if (data.exercise === "none" || data.exercise === "light") score += 2;

  // Family History
  const fhLower = data.familyHistory.toLowerCase();
  if (
    fhLower.includes("bp") ||
    fhLower.includes("hypertension") ||
    fhLower.includes("blood pressure") ||
    fhLower.includes("pressure")
  ) {
    score += 3;
  }

  // Symptoms
  const sxLower = data.symptoms.toLowerCase();
  if (
    sxLower.includes("headache") ||
    sxLower.includes("dizz") ||
    sxLower.includes("tinnitus") ||
    sxLower.includes("vision")
  ) {
    score += 2;
  }

  const percentage = Math.min(100, Math.round((score / 10) * 100));
  return { score, percentage };
}

// JSON schema for Gemini structured output (subset of OpenAPI)
const responseSchema = {
  type: "object",
  properties: {
    risk: {
      type: "object",
      properties: {
        diabetes: { type: "number" },
        heartDisease: { type: "number" },
        hypertension: { type: "number" },
      },
      required: ["diabetes", "heartDisease", "hypertension"],
    },
    rationale: {
      type: "object",
      properties: {
        diabetes: { type: "string" },
        heartDisease: { type: "string" },
        hypertension: { type: "string" },
      },
      required: ["diabetes", "heartDisease", "hypertension"],
    },
    dietPlan: { type: "string" },
    exercisePlan: { type: "string" },
    preventionTips: { type: "string" },
  },
  required: ["risk", "rationale", "dietPlan", "exercisePlan", "preventionTips"],
};

function sanitizeResultText(text: string): string {
  let cleaned = text;

  // 1. Redact specific prescription drugs (case-insensitive)
  const medications = [
    "metformin",
    "insulin",
    "lisinopril",
    "atorvastatin",
    "statin",
    "statins",
    "amlodipine",
    "beta-blocker",
    "beta-blockers",
    "metoprolol",
    "losartan",
    "glipizide",
    "ibuprofen",
    "aspirin",
  ];

  medications.forEach((med) => {
    const regex = new RegExp(`\\b${med}\\b`, "gi");
    cleaned = cleaned.replace(
      regex,
      "[medication reference redacted; please consult your physician for clinical prescriptions]",
    );
  });

  // 2. Adjust definite diagnostic assertions
  const diagnosticPhrases = [
    {
      phrase: "you have diabetes",
      replacement: "your profile suggests elevated diabetes markers",
    },
    {
      phrase: "you are diagnosed with",
      replacement: "your profile indicates risk patterns associated with",
    },
    {
      phrase: "we diagnose you with",
      replacement: "risk estimation suggests indicators of",
    },
    {
      phrase: "you have hypertension",
      replacement: "your profile suggests elevated vascular markers",
    },
    {
      phrase: "you have cardiovascular disease",
      replacement: "your profile suggests cardiovascular risk markers",
    },
  ];

  diagnosticPhrases.forEach(({ phrase, replacement }) => {
    const regex = new RegExp(phrase, "gi");
    cleaned = cleaned.replace(regex, replacement);
  });

  return cleaned;
}

export async function assessHealth({ data }: { data: z.infer<typeof InputSchema> }) {
  const validatedData = InputSchema.parse(data);

  // 1. Get Firebase ID token if user is signed in
  let idToken = "mock-uid-guest";
  try {
    if (auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn("Failed to retrieve ID token, using mock-uid-guest", err);
  }

  // 2. Fetch clinical risk calculations (which enriches with AI Coach advice) from backend API
  const riskResp = await fetch(`${API_URL}/api/risk/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(validatedData),
  });

  if (!riskResp.ok) {
    const errorText = await riskResp.text();
    console.error("Backend risk calculation failed:", riskResp.status, errorText);
    throw new Error(`Risk calculation API error: ${riskResp.status}`);
  }

  const resJson = await riskResp.json();
  if (!resJson.success || !resJson.analysis) {
    throw new Error("Risk calculation API returned unsuccessful response");
  }

  const analysis = resJson.analysis;

  return {
    risk: {
      diabetes: analysis.diabetesRisk.risk,
      heartDisease: analysis.heartRisk.risk,
      hypertension: analysis.hypertensionRisk.risk,
    },
    rationale: analysis.rationale,
    dietPlan: analysis.dietPlan,
    exercisePlan: analysis.exercisePlan,
    preventionTips: analysis.preventionTips,
    overallScore: analysis.overallRisk,
    overallRisk: analysis.overallRiskLabel,
    factors: analysis.factors,
    actionPriorities: analysis.actionPriorities,
    bmi: analysis.bmi,
  };
}

// ==========================================
// Phase 2: Multimodal Ingredient Scanner API
// ==========================================

export const IngredientReportSchema = z.object({
  name: z.string(),
  score: z.number().min(1).max(10),
  goodIngredients: z.array(z.string()),
  watchOut: z.array(z.string()),
  diabetesImpact: z.string(),
  bloodPressureImpact: z.string(),
  heartHealthImpact: z.string(),
  recommendation: z.string(),
  rawText: z.string(),
  foodScore: z.number().optional(),
  personalizedScore: z.number().optional(),
  riskLevel: z.enum(["Low", "Moderate", "High"]).optional(),
  conflict: z
    .object({
      conflicts: z.boolean(),
      message: z.string(),
    })
    .optional(),
  recommendations: z.array(z.string()).optional(),
  diabetesImpactPoints: z.number().optional(),
  hypertensionImpactPoints: z.number().optional(),
  heartImpactPoints: z.number().optional(),
  foodRiskCategory: z.enum(["safe", "moderate", "avoid"]).optional(),
  personalizedFoodScore: z.number().optional(),
  reasons: z.array(z.string()).optional(),
  betterAlternatives: z.array(z.string()).optional(),
  geminiExplanation: z.string().nullable().optional(),
});

export type IngredientReport = z.infer<typeof IngredientReportSchema>;

const SCANNER_PROMPT = `You are a clinical nutrition auditor. Analyze the ingredients list from the provided food label photo or text description. 
Perform the following:
1. Standardize and list the product/brand name.
2. Determine a wellness health score (1 to 10), where 10 is extremely clean and beneficial, and 1 is highly processed and hazardous.
3. Identify clean and beneficial ingredients (e.g. whole grains, herbs, vegetables, pulses).
4. Identify concerning ingredients and additives (e.g. high sodium, palm oil, MSG, trans fats, high fructose corn syrup, artificial sweeteners, colorings).
5. Explain the exact metabolic glycemic impact (diabetes risk), blood pressure impact (vascular strain), and heart health impact (cardiovascular lipid changes) of the product.
6. Provide a localized clinical recommendation.
7. Transcribe the raw text of the ingredients found.

Return strictly valid JSON matching the requested schema.`;

export async function assessIngredientsImage({
  base64Image,
  mimeType,
}: {
  base64Image: string;
  mimeType: string;
}): Promise<IngredientReport> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: SCANNER_PROMPT },
      ],
    },
  ];

  let idToken = "mock-uid-guest";
  try {
    if (auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn("Failed to retrieve ID token", err);
  }

  const response = await fetch(`${API_URL}/api/scanner/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ contents }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Scanner API request failed");
  }

  const result = await response.json();
  return IngredientReportSchema.parse(result);
}

export async function assessIngredientsText({
  rawText,
}: {
  rawText: string;
}): Promise<IngredientReport> {
  const contents = [
    {
      role: "user",
      parts: [{ text: `Ingredients: ${rawText}` }, { text: SCANNER_PROMPT }],
    },
  ];

  let idToken = "mock-uid-guest";
  try {
    if (auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn("Failed to retrieve ID token", err);
  }

  const response = await fetch(`${API_URL}/api/scanner/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ contents }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Scanner API request failed");
  }

  const result = await response.json();
  return IngredientReportSchema.parse(result);
}
