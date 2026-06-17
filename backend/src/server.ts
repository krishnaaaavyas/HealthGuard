import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import { db } from "./firebase-admin.js";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.js";
import { RiskService } from "./services/risk.service.js";
import { SimulationService } from "./services/simulation.service.js";
import { AIService } from "./services/ai.service.js";
import { GuardrailsService } from "./services/guardrails.service.js";
import { ProgressService, type ProgressLog } from "./services/progress.service.js";
import { calculateActionImpacts } from "./services/actionImpact.service.js";
import { RiskDriverService } from "./services/riskDriver.service.js";
import { FoodImpactService } from "./services/foodImpact.service.js";
import { PredictionService } from "./services/prediction.service.js";
import { BehaviorService } from "./services/behavior.service.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON body parsing
app.use(cors({ origin: "*" }));
app.use(express.json());

// Zod schema for profile validation
const ProfileSchema = z.object({
  age: z.number().min(1).max(120),
  gender: z.enum(["male", "female", "other"]),
  heightCm: z.number().min(50).max(260),
  weightKg: z.number().min(10).max(400),
  smoking: z.enum(["never", "former", "current"]),
  exercise: z.enum(["none", "light", "moderate", "active"]),
  familyHistory: z.string().max(500).default(""),
  symptoms: z.string().max(1000).default(""),
  // Support fields from user specification
  height: z.number().min(50).max(260).optional(),
  weight: z.number().min(10).max(400).optional(),
  alcohol: z.enum(["never", "occasional", "heavy"]).optional().or(z.string().optional()),
  exerciseLevel: z.enum(["none", "light", "moderate", "active"]).optional(),
  diseases: z.string().max(1000).optional(),
  language: z.enum(["en", "hi", "gu"]).optional().default("en"),
  // Support frontend result/history syncing
  result: z.any().optional(),
  history: z.array(z.any()).optional(),
});

async function writeProgressLog(uid: string, profile: any, analysis: any) {
  try {
    const logsRef = db.collection("progressLogs");
    const latestSnapshotQuery = await logsRef
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!latestSnapshotQuery.empty) {
      const latestSnapshot = latestSnapshotQuery.docs[0].data();
      if (
        latestSnapshot.weight === profile.weightKg &&
        latestSnapshot.exercise === profile.exercise &&
        latestSnapshot.smoking === profile.smoking &&
        latestSnapshot.overallRisk === analysis.overallRisk
      ) {
        console.log(`Skipping progress log duplicate for user ${uid}`);
        return;
      }
    }

    const logRef = logsRef.doc();
    await logRef.set({
      userId: uid,
      weight: profile.weightKg,
      bmi: analysis.bmi,
      diabetesRisk: analysis.diabetesRisk.risk,
      heartRisk: analysis.heartRisk.risk,
      hypertensionRisk: analysis.hypertensionRisk.risk,
      overallRisk: analysis.overallRisk,
      smoking: profile.smoking,
      exercise: profile.exercise,
      createdAt: new Date().toISOString(),
    });
    console.log(`Successfully logged progress entry for user ${uid}`);
  } catch (err) {
    console.error("Error writing progress log snapshot:", err);
  }
}

// GET /health - basic health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// GET /api/profile - retrieve user profile
app.get("/api/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();

      let historyList: any[] = [];
      try {
        const logsSnap = await db
          .collection("progressLogs")
          .where("userId", "==", uid)
          .orderBy("createdAt", "asc")
          .get();

        if (!logsSnap.empty) {
          historyList = logsSnap.docs.map((doc: any) => {
            const log = doc.data();
            return {
              date: log.createdAt,
              overallScore: log.overallRisk,
              bmi: log.bmi,
              weightKg: log.weight,
              risks: {
                diabetes: log.diabetesRisk,
                heartDisease: log.heartRisk,
                hypertension: log.hypertensionRisk,
              },
              smoking: log.smoking,
              exercise: log.exercise,
            };
          });
        }
      } catch (historyErr) {
        console.warn(
          "Failed to query progress logs, using profile history field fallback:",
          historyErr,
        );
        historyList = data.history || [];
      }

      return res.json({
        profile: {
          age: data.age,
          gender: data.gender,
          heightCm: data.heightCm || data.height,
          weightKg: data.weightKg || data.weight,
          smoking: data.smoking,
          exercise: data.exercise || data.exerciseLevel,
          familyHistory: data.familyHistory,
          symptoms: data.symptoms,
          alcohol: data.alcohol || undefined,
          diseases: data.diseases || undefined,
        },
        result: data.result || null,
        history: historyList,
      });
    } else {
      return res.json({ profile: null, result: null, history: [] });
    }
  } catch (err: any) {
    console.error("Firestore fetch error:", err);
    return res.status(500).json({ error: "Database Error: Failed to fetch profile" });
  }
});

// POST /api/profile - save user profile
app.post("/api/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = ProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const data = parsed.data;
    const docRef = db.collection("profiles").doc(uid);
    const existingDoc = await docRef.get();
    let existingResult = existingDoc.exists ? existingDoc.data()?.result : null;

    // Recalculate risk automatically when profile is updated
    const analysis = RiskService.analyze({
      age: data.age,
      gender: data.gender,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      smoking: data.smoking,
      exercise: data.exercise,
      familyHistory: data.familyHistory,
      symptoms: data.symptoms,
      alcohol: data.alcohol || null,
      diseases: data.diseases || null,
    });

    const updatedData: any = {
      age: data.age,
      gender: data.gender,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      height: data.height ?? data.heightCm,
      weight: data.weight ?? data.weightKg,
      smoking: data.smoking,
      exercise: data.exercise,
      exerciseLevel: data.exerciseLevel ?? data.exercise,
      familyHistory: data.familyHistory,
      symptoms: data.symptoms,
      alcohol: data.alcohol || null,
      diseases: data.diseases || null,
      result: {
        risk: {
          diabetes: analysis.diabetesRisk.risk,
          heartDisease: analysis.heartRisk.risk,
          hypertension: analysis.hypertensionRisk.risk,
        },
        rationale: existingResult?.rationale || analysis.rationale,
        dietPlan: existingResult?.dietPlan || analysis.dietPlan,
        exercisePlan: existingResult?.exercisePlan || analysis.exercisePlan,
        preventionTips: existingResult?.preventionTips || analysis.preventionTips,
        overallScore: analysis.overallRisk,
        overallRisk: analysis.overallRiskLabel,
        factors: analysis.factors,
        actionPriorities: analysis.actionPriorities,
        bmi: analysis.bmi,
      },
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(updatedData, { merge: true });

    // Write a progress snapshot in progressLogs collection
    await writeProgressLog(uid, data, analysis);

    // Also sync standard details in the collections for users
    const userRef = db.collection("users").doc(uid);
    await userRef.set(
      {
        uid,
        email: req.user?.email || null,
        name: req.user?.name || null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    // If result is present, write to assessments and progress collections
    if (data.result) {
      // Create a new assessment document in 'assessments' collection
      const assessmentRef = db.collection("assessments").doc();
      await assessmentRef.set({
        userId: uid,
        riskScores: data.result.risk || null,
        explanationFactors: data.result.rationale || null,
        createdAt: new Date().toISOString(),
      });

      // Create/update a progress entry in 'progress' collection
      const progressRef = db.collection("progress").doc();
      await progressRef.set({
        userId: uid,
        weight: data.weightKg,
        bmi: data.result.bmi || null,
        overallRisk: data.result.overallRisk || null,
        createdAt: new Date().toISOString(),
      });
    }

    let historyList: any[] = [];
    try {
      const logsSnap = await db
        .collection("progressLogs")
        .where("userId", "==", uid)
        .orderBy("createdAt", "asc")
        .get();

      if (!logsSnap.empty) {
        historyList = logsSnap.docs.map((doc: any) => {
          const log = doc.data();
          return {
            date: log.createdAt,
            overallScore: log.overallRisk,
            bmi: log.bmi,
            weightKg: log.weight,
            risks: {
              diabetes: log.diabetesRisk,
              heartDisease: log.heartRisk,
              hypertension: log.hypertensionRisk,
            },
            smoking: log.smoking,
            exercise: log.exercise,
          };
        });
      }
    } catch (historyErr) {
      console.warn("Failed to query progress logs inside profile POST response:", historyErr);
    }

    return res.json({
      success: true,
      profile: {
        age: updatedData.age,
        gender: updatedData.gender,
        heightCm: updatedData.heightCm,
        weightKg: updatedData.weightKg,
        smoking: updatedData.smoking,
        exercise: updatedData.exercise,
        familyHistory: updatedData.familyHistory,
        symptoms: updatedData.symptoms,
        alcohol: updatedData.alcohol || undefined,
        diseases: updatedData.diseases || undefined,
      },
      result: updatedData.result || null,
      history: historyList,
    });
  } catch (err: any) {
    console.error("Firestore write error:", err);
    return res.status(500).json({ error: "Database Error: Failed to save profile" });
  }
});

// POST /api/risk/calculate - perform clinical calculations and save assessments
app.post("/api/risk/calculate", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = ProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const data = parsed.data;
    // Call RiskService to perform all the clinical calculations
    const analysis = RiskService.analyze({
      age: data.age,
      gender: data.gender,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      smoking: data.smoking,
      exercise: data.exercise,
      familyHistory: data.familyHistory,
      symptoms: data.symptoms,
      alcohol: data.alcohol || null,
      diseases: data.diseases || null,
    });

    // Call AIService to get AI-enriched rationale and plans
    const enriched = await AIService.generateFullAdvice(
      uid,
      {
        age: data.age,
        gender: data.gender,
        heightCm: data.heightCm,
        weightKg: data.weightKg,
        smoking: data.smoking,
        exercise: data.exercise,
        familyHistory: data.familyHistory,
        symptoms: data.symptoms,
        alcohol: data.alcohol || null,
        diseases: data.diseases || null,
        language: data.language || "en",
      },
      {
        diabetes: analysis.diabetesRisk.risk,
        heart: analysis.heartRisk.risk,
        hypertension: analysis.hypertensionRisk.risk,
      },
    );

    // Merge enriched rationales and plans into analysis
    analysis.rationale = enriched.rationale;
    analysis.dietPlan = enriched.dietPlan;
    analysis.exercisePlan = enriched.exercisePlan;
    analysis.preventionTips = enriched.preventionTips;

    // Write assessment record in the 'assessments' collection
    const assessmentRef = db.collection("assessments").doc();
    const assessmentData = {
      userId: uid,
      bmi: analysis.bmi,
      bmiCategory: analysis.bmiCategory,
      diabetesRisk: {
        risk: analysis.diabetesRisk.risk,
        level: analysis.diabetesRisk.level,
        factors: analysis.diabetesRisk.factors,
      },
      heartRisk: {
        risk: analysis.heartRisk.risk,
        level: analysis.heartRisk.level,
        factors: analysis.heartRisk.factors,
      },
      hypertensionRisk: {
        risk: analysis.hypertensionRisk.risk,
        level: analysis.hypertensionRisk.level,
        factors: analysis.hypertensionRisk.factors,
      },
      overallRisk: analysis.overallRisk,
      overallRiskLabel: analysis.overallRiskLabel,
      factors: analysis.factors,
      actionPriorities: analysis.actionPriorities,
      createdAt: new Date().toISOString(),
    };
    await assessmentRef.set(assessmentData);

    // Save profile data (including enriched result object) in 'profiles/{uid}'
    const docRef = db.collection("profiles").doc(uid);
    const updatedProfile = {
      age: data.age,
      gender: data.gender,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      height: data.height ?? data.heightCm,
      weight: data.weight ?? data.weightKg,
      smoking: data.smoking,
      exercise: data.exercise,
      exerciseLevel: data.exerciseLevel ?? data.exercise,
      familyHistory: data.familyHistory,
      symptoms: data.symptoms,
      alcohol: data.alcohol || null,
      diseases: data.diseases || null,
      result: {
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
      },
      updatedAt: new Date().toISOString(),
    };
    await docRef.set(updatedProfile, { merge: true });

    // Write a progress snapshot in progressLogs collection (Assessment Completed)
    await writeProgressLog(uid, data, analysis);

    // Create/update a progress entry in 'progress' collection
    const progressRef = db.collection("progress").doc();
    await progressRef.set({
      userId: uid,
      weight: data.weightKg,
      bmi: analysis.bmi,
      overallRisk: analysis.overallRisk,
      createdAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      analysis,
      assessmentId: assessmentRef.id,
    });
  } catch (err: any) {
    console.error("Risk calculation API error:", err);
    return res.status(500).json({ error: "Calculation Error: Failed to compute health risks" });
  }
});

// Zod schema for simulation inputs
const SimulationSchema = z.object({
  modifications: z.object({
    weightKg: z.number().min(10).max(400).optional(),
    exercise: z.enum(["none", "light", "moderate", "active"]).optional(),
    smoking: z.enum(["never", "former", "current"]).optional(),
    alcohol: z.string().optional(),
    sleepHours: z.number().min(2).max(18).optional(),
  }),
});

// POST /api/simulator - run temporary What-If scenario simulations
app.post("/api/simulator", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = SimulationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { modifications } = parsed.data;

    // Fetch the user's profile from profiles collection
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res
        .status(404)
        .json({ error: "Not Found: Please complete your health assessment profile first." });
    }

    const profileData = docSnap.data();

    // Call SimulationService
    const result = SimulationService.runSimulation(
      {
        age: profileData.age,
        gender: profileData.gender,
        heightCm: profileData.heightCm,
        weightKg: profileData.weightKg,
        smoking: profileData.smoking,
        exercise: profileData.exercise,
        familyHistory: profileData.familyHistory || "",
        symptoms: profileData.symptoms || "",
        alcohol: profileData.alcohol || null,
        diseases: profileData.diseases || null,
      },
      modifications,
    );

    // Save simulation query inside simulations collection in Firestore
    const simRef = db.collection("simulations").doc();
    await simRef.set({
      userId: uid,
      originalRisk: result.currentRisk,
      projectedRisk: result.projectedRisk,
      modifications,
      createdAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      ...result,
      simulationId: simRef.id,
    });
  } catch (err: any) {
    console.error("Simulation API error:", err);
    return res
      .status(500)
      .json({ error: "Simulation Error: Failed to calculate what-if projection" });
  }
});

// Zod schemas for AI Coach
const ExplainRiskSchema = z.object({
  riskScores: z.object({
    diabetes: z.number(),
    heart: z.number(),
    hypertension: z.number(),
  }),
  factors: z.array(
    z.object({
      factor: z.string(),
      impact: z.number(),
    }),
  ),
  language: z.string().optional().default("en"),
});

const DietPlanSchema = z.object({
  region: z.string(),
  dietType: z.string(),
  budget: z.string(),
  riskScores: z.object({
    diabetes: z.number(),
    heart: z.number(),
    hypertension: z.number(),
  }),
  language: z.string().optional().default("en"),
});

const FitnessPlanSchema = z.object({
  fitnessLevel: z.string(),
  riskScores: z.object({
    diabetes: z.number(),
    heart: z.number(),
    hypertension: z.number(),
  }),
  language: z.string().optional().default("en"),
});

const PreventionTipsSchema = z.object({
  riskScores: z.object({
    diabetes: z.number(),
    heart: z.number(),
    hypertension: z.number(),
  }),
  language: z.string().optional().default("en"),
});

const ExplainSimulationSchema = z.object({
  currentRisk: z.number(),
  projectedRisk: z.number(),
  changes: z.array(z.string()),
  language: z.string().optional().default("en"),
});

const ScannerAnalyzeSchema = z.object({
  contents: z.array(z.any()),
});

const FoodAnalyzeSchema = z.object({
  contents: z.array(z.any()).optional(),
  ingredients: z.array(z.string()).optional(),
  productName: z.string().optional(),
  language: z.string().optional().default("en"),
});

const ForecastSchema = z.object({
  actions: z.array(z.string()).default([]),
});

// POST /api/coach/explain - Explain risks in simple terms
app.post("/api/coach/explain", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = ExplainRiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { riskScores, factors, language } = parsed.data;
    const explanation = await AIService.explainRisks(uid, riskScores, factors, language);

    return res.json({ success: true, explanation });
  } catch (err: any) {
    console.error("Coach explain error:", err);
    return res.status(500).json({ error: "Coach Error: Failed to generate explanation" });
  }
});

// POST /api/coach/diet - Personalized Diet Planner
app.post("/api/coach/diet", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = DietPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { region, dietType, budget, riskScores, language } = parsed.data;

    // Fetch user profile to construct snaps
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Profile required." });
    }

    const profileData = docSnap.data();
    const dietPlan = await AIService.generateDietPlan(
      uid,
      {
        age: profileData.age,
        gender: profileData.gender,
        heightCm: profileData.heightCm,
        weightKg: profileData.weightKg,
        smoking: profileData.smoking,
        exercise: profileData.exercise,
        familyHistory: profileData.familyHistory || "",
        symptoms: profileData.symptoms || "",
        alcohol: profileData.alcohol || undefined,
        diseases: profileData.diseases || undefined,
        language: language,
      },
      region,
      dietType,
      budget,
      riskScores,
    );

    return res.json({ success: true, dietPlan });
  } catch (err: any) {
    console.error("Coach diet error:", err);
    return res.status(500).json({ error: "Coach Error: Failed to generate diet plan" });
  }
});

// POST /api/coach/fitness - Personalized Fitness Planner
app.post("/api/coach/fitness", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = FitnessPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { fitnessLevel, riskScores, language } = parsed.data;

    // Fetch user profile to construct snaps
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Profile required." });
    }

    const profileData = docSnap.data();
    const fitnessPlan = await AIService.generateFitnessPlan(
      uid,
      {
        age: profileData.age,
        gender: profileData.gender,
        heightCm: profileData.heightCm,
        weightKg: profileData.weightKg,
        smoking: profileData.smoking,
        exercise: profileData.exercise,
        familyHistory: profileData.familyHistory || "",
        symptoms: profileData.symptoms || "",
        alcohol: profileData.alcohol || undefined,
        diseases: profileData.diseases || undefined,
        language: language,
      },
      fitnessLevel,
      riskScores,
    );

    return res.json({ success: true, fitnessPlan });
  } catch (err: any) {
    console.error("Coach fitness error:", err);
    return res.status(500).json({ error: "Coach Error: Failed to generate fitness plan" });
  }
});

// POST /api/coach/prevention - Prevention Tips
app.post("/api/coach/prevention", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = PreventionTipsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { riskScores, language } = parsed.data;

    // Fetch user profile
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Profile required." });
    }

    const profileData = docSnap.data();
    const preventionTips = await AIService.generatePreventionTips(
      uid,
      {
        age: profileData.age,
        gender: profileData.gender,
        heightCm: profileData.heightCm,
        weightKg: profileData.weightKg,
        smoking: profileData.smoking,
        exercise: profileData.exercise,
        familyHistory: profileData.familyHistory || "",
        symptoms: profileData.symptoms || "",
        alcohol: profileData.alcohol || undefined,
        diseases: profileData.diseases || undefined,
        language: language,
      },
      riskScores,
    );

    return res.json({ success: true, preventionTips });
  } catch (err: any) {
    console.error("Coach prevention error:", err);
    return res.status(500).json({ error: "Coach Error: Failed to generate prevention tips" });
  }
});

// POST /api/coach/explain-simulation - Explain simulation drops
app.post("/api/coach/explain-simulation", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = ExplainSimulationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { currentRisk, projectedRisk, changes, language } = parsed.data;
    const explanation = await AIService.explainSimulation(
      uid,
      currentRisk,
      projectedRisk,
      changes,
      language,
    );

    return res.json({ success: true, explanation });
  } catch (err: any) {
    console.error("Coach simulation explain error:", err);
    return res.status(500).json({ error: "Coach Error: Failed to explain simulation" });
  }
});

// POST /api/scanner/analyze & POST /api/food/analyze - Multimodal Ingredient Scanner backend routes
app.post(
  ["/api/scanner/analyze", "/api/food/analyze"],
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(400).json({ error: "Bad Request: Missing User UID" });
    }

    try {
      const parsed = FoodAnalyzeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
      }

      const { contents, ingredients, productName } = parsed.data;

      // Fetch user profile
      const profileRef = db.collection("profiles").doc(uid);
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists) {
        return res
          .status(404)
          .json({ error: "Not Found: Profile is required to personalize food decision analysis" });
      }

      const profileData = profileSnap.data()!;
      const profile = {
        age: profileData.age,
        gender: profileData.gender,
        heightCm: profileData.heightCm || profileData.height,
        weightKg: profileData.weightKg || profileData.weight,
        smoking: profileData.smoking,
        exercise: profileData.exercise || profileData.exerciseLevel,
        familyHistory: profileData.familyHistory || "",
        symptoms: profileData.symptoms || "",
        alcohol: profileData.alcohol || null,
        diseases: profileData.diseases || null,
      };

      // Calculate risk scores and priorities
      const riskAnalysis = RiskService.analyze(profile);
      const driverAnalysis = RiskDriverService.analyzeRiskDrivers(profile);
      const topDrivers = driverAnalysis.topDrivers;
      const actionPriorities = riskAnalysis.actionPriorities;

      const risks = {
        diabetes: riskAnalysis.diabetesRisk.risk,
        heart: riskAnalysis.heartRisk.risk,
        hypertension: riskAnalysis.hypertensionRisk.risk,
      };

      let result: any = null;
      const key = process.env.GEMINI_API_KEY;

      if (
        contents &&
        contents.length > 0 &&
        key &&
        key !== "YOUR_GEMINI_API_KEY" &&
        !key.includes("placeholder")
      ) {
        // Run Multimodal Gemini Scanner with profile data
        const model = "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

        const userRiskText = `User Risks:
- Type 2 Diabetes Risk: ${risks.diabetes}%
- Heart Disease Risk: ${risks.heart}%
- Hypertension Risk: ${risks.hypertension}%

User Top Drivers:
${topDrivers.map((d) => `- ${d.factor} (${d.contribution}%)`).join("\n")}

User Action Priorities:
${actionPriorities.map((p) => `- ${p.action}`).join("\n")}
`;

        const personalizedPrompt = `Analyze this food ingredient label or list.
First, extract the product name and list of ingredients.
Then, cross-reference the ingredients with the following user health profile to assess personalized impacts:
${userRiskText}

Provide:
1. "name": The brand/product name.
2. "goodIngredients": Beneficial ingredients present.
3. "watchOut": Concerning ingredients / additives.
4. "diabetesImpact": How the ingredients impact Type 2 Diabetes (mention glycemic index, starch, sugars if applicable).
5. "bloodPressureImpact": How the ingredients impact vascular health / blood pressure (mention sodium/salt content if applicable).
6. "heartHealthImpact": How the ingredients impact heart health / cholesterol (mention palm oil, trans fats, saturated fats if applicable).
7. "recommendation": A personalized clinical advice explaining the food's impact on THIS user's specific health profile. E.g. "Because your diabetes risk is elevated and sugar is one of your top drivers..." Focus on their highest risk areas. If the food contains ingredients conflicting with their action priorities, explicitly state the conflict.
8. "alternatives": An array of 3 healthy regional Indian alternatives suitable for this user's profile.
9. "rawText": The raw extracted ingredients text.
`;

        // Construct request contents
        const geminiContents = JSON.parse(JSON.stringify(contents));
        let promptInserted = false;
        for (const part of geminiContents) {
          if (part.parts) {
            for (const p of part.parts) {
              if (p.text && p.text.toLowerCase().includes("ingredients")) {
                p.text = personalizedPrompt;
                promptInserted = true;
              }
            }
          }
        }
        if (!promptInserted) {
          geminiContents.push({
            role: "user",
            parts: [{ text: personalizedPrompt }],
          });
        }

        const geminiResp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: geminiContents,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  goodIngredients: { type: "array", items: { type: "string" } },
                  watchOut: { type: "array", items: { type: "string" } },
                  diabetesImpact: { type: "string" },
                  bloodPressureImpact: { type: "string" },
                  heartHealthImpact: { type: "string" },
                  recommendation: { type: "string" },
                  alternatives: { type: "array", items: { type: "string" } },
                  rawText: { type: "string" },
                },
                required: [
                  "name",
                  "goodIngredients",
                  "watchOut",
                  "diabetesImpact",
                  "bloodPressureImpact",
                  "heartHealthImpact",
                  "recommendation",
                  "alternatives",
                  "rawText",
                ],
              },
              temperature: 0.2,
            },
          }),
        });

        if (geminiResp.ok) {
          const geminiJson: any = await geminiResp.json();
          const geminiText =
            geminiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ??
            "";
          if (geminiText) {
            result = JSON.parse(geminiText);
          }
        } else {
          const errText = await geminiResp.text();
          console.warn("Gemini scanner call failed, falling back to deterministic:", errText);
        }
      }

      // Fallback or deterministic post-processing
      const foodName = result?.name || productName || "Unknown Product";
      const ingreds = result?.watchOut || ingredients || [];

      const deterministic = FoodImpactService.analyze(foodName, ingreds, risks, actionPriorities);

      if (!result) {
        // Fully deterministic fallback output
        result = {
          name: foodName,
          goodIngredients: [],
          watchOut: ingreds,
          diabetesImpact:
            deterministic.diabetesImpact > 0
              ? `Contains ingredients with high glycemic or diabetic concerns. Total impact score: +${deterministic.diabetesImpact}`
              : "Low glycemic impact. No immediate diabetes concern.",
          bloodPressureImpact:
            deterministic.hypertensionImpact > 0
              ? `Contains high sodium or vasoconstrictive agents. Total vascular impact score: +${deterministic.hypertensionImpact}`
              : "Low sodium impact. Low blood pressure concern.",
          heartHealthImpact:
            deterministic.heartImpact > 0
              ? `Contains saturated fats, trans fats, or palm oils. Total cardiovascular impact score: +${deterministic.heartImpact}`
              : "Low saturated fats. Favorable for heart health.",
          recommendation: deterministic.conflict.conflicts
            ? `${deterministic.conflict.message} Consuming this product frequently is not recommended.`
            : `This food has a personalized score of ${deterministic.personalizedScore}/10 for you. ${deterministic.personalizedScore >= 8 ? "Highly suitable for daily inclusion." : "Consume in moderation."}`,
          alternatives: deterministic.alternatives,
          rawText: ingreds.join(", "),
        };
      }

      // Sanitize values
      result.diabetesImpact = GuardrailsService.sanitizeText(result.diabetesImpact);
      result.bloodPressureImpact = GuardrailsService.sanitizeText(result.bloodPressureImpact);
      result.heartHealthImpact = GuardrailsService.sanitizeText(result.heartHealthImpact);
      result.recommendation = GuardrailsService.sanitizeText(result.recommendation);

      // Merge deterministic scores and conflicts
      result.score = deterministic.personalizedScore; // keep score field aligned for old frontend calls
      result.foodScore = deterministic.foodScore;
      result.personalizedScore = deterministic.personalizedScore;
      result.riskLevel = deterministic.riskLevel;
      result.conflict = deterministic.conflict;
      result.recommendations = [result.recommendation];

      result.diabetesImpactPoints = deterministic.diabetesImpact;
      result.hypertensionImpactPoints = deterministic.hypertensionImpact;
      result.heartImpactPoints = deterministic.heartImpact;

      // Save scan to Firestore 'foodScans' collection
      try {
        const scanRef = db.collection("foodScans").doc();
        await scanRef.set({
          userId: uid,
          productName: result.name,
          ingredients: result.watchOut,
          foodScore: result.foodScore,
          personalizedScore: result.personalizedScore,
          riskLevel: result.riskLevel,
          createdAt: new Date().toISOString(),
          alternatives: result.alternatives,
          recommendation: result.recommendation,
        });
      } catch (saveErr) {
        console.warn("Failed to save food scan to Firestore:", saveErr);
      }

      return res.json(result);
    } catch (err: any) {
      console.error("Food analyze API error:", err);
      return res
        .status(500)
        .json({ error: "Internal Server Error: Failed to analyze food impact" });
    }
  },
);

// GET /api/food/recent - Fetch user's most recent food scan
app.get("/api/food/recent", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const scansSnap = await db
      .collection("foodScans")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (scansSnap.empty) {
      return res.json({ success: true, scan: null });
    }

    const scan = scansSnap.docs[0].data();
    return res.json({
      success: true,
      scan: {
        productName: scan.productName,
        personalizedScore: scan.personalizedScore,
        foodScore: scan.foodScore,
        riskLevel: scan.riskLevel,
        createdAt: scan.createdAt,
        alternatives: scan.alternatives,
        recommendation: scan.recommendation,
      },
    });
  } catch (err: any) {
    console.error("Recent food scan API error:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to fetch recent scan" });
  }
});

// POST /api/predictions/forecast - Generate 30/90/180 day risk projection
app.post("/api/predictions/forecast", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = ForecastSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { actions } = parsed.data;

    // Fetch user profile
    const profileRef = db.collection("profiles").doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      return res.status(404).json({ error: "Not Found: Profile is required to run forecasts" });
    }

    const profileData = profileSnap.data()!;
    const profile = {
      age: profileData.age,
      gender: profileData.gender,
      heightCm: profileData.heightCm || profileData.height,
      weightKg: profileData.weightKg || profileData.weight,
      smoking: profileData.smoking,
      exercise: profileData.exercise || profileData.exerciseLevel,
      familyHistory: profileData.familyHistory || "",
      symptoms: profileData.symptoms || "",
      alcohol: profileData.alcohol || null,
      diseases: profileData.diseases || null,
    };

    // Fetch progress logs count to determine prediction confidence
    let logsCount = 0;
    try {
      const logsSnap = await db.collection("progressLogs").where("userId", "==", uid).get();
      logsCount = logsSnap.size;
    } catch (logErr) {
      console.warn("Failed to retrieve progress logs for forecasting:", logErr);
    }

    // Call PredictionService to generate the forecast
    const forecastResult = PredictionService.generateForecast(profile, actions, logsCount);

    // Call Gemini to explain the forecast trajectory
    const currentRisk = forecastResult.currentRisk;
    const forecast = {
      days30: forecastResult.days30.risk,
      days90: forecastResult.days90.risk,
      days180: forecastResult.days180.risk,
    };

    const language = profileData.language || "en";
    const explanation = await AIService.explainForecast(
      uid,
      currentRisk,
      forecast,
      actions,
      language,
    );

    const fullResult = {
      success: true,
      ...forecastResult,
      explanation,
    };

    // Save forecast to Firestore 'forecasts' collection
    try {
      const forecastRef = db.collection("forecasts").doc();
      await forecastRef.set({
        userId: uid,
        currentRisk: fullResult.currentRisk,
        forecast: {
          days30: fullResult.days30,
          days90: fullResult.days90,
          days180: fullResult.days180,
        },
        actions,
        explanation: fullResult.explanation,
        createdAt: new Date().toISOString(),
      });
    } catch (saveErr) {
      console.warn("Failed to save forecast record to Firestore:", saveErr);
    }

    return res.json(fullResult);
  } catch (err: any) {
    console.error("Forecast API error:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to generate forecast" });
  }
});

// GET /api/coach/behavior - Fetch active behavioral coaching nudge
app.get("/api/coach/behavior", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    // 1. Fetch user history collections (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [logsSnap, simsSnap, scansSnap] = await Promise.all([
      db.collection("progressLogs").where("userId", "==", uid).get(),
      db.collection("simulations").where("userId", "==", uid).get(),
      db.collection("foodScans").where("userId", "==", uid).get(),
    ]);

    const progressLogs = logsSnap.docs.map((doc: any) => doc.data());
    const simulations = simsSnap.docs.map((doc: any) => doc.data());
    const foodScans = scansSnap.docs.map((doc: any) => doc.data());

    // 2. Run behavior signals analyzer
    const signals = BehaviorService.analyzeBehavior({ progressLogs, simulations, foodScans });

    // 3. Prioritize signals
    const priorityOrder = [
      "risk_stagnant_30_days",
      "simulates_but_no_progress",
      "repeated_high_sugar_scans",
      "missed_progress_logging",
      "risk_improved",
    ];

    let activeSignal: any = null;
    for (const type of priorityOrder) {
      const found = signals.find((s) => s.type === type);
      if (found) {
        activeSignal = found;
        break;
      }
    }

    // Default signal if none are active
    if (!activeSignal) {
      activeSignal = {
        type: "risk_improved",
        severity: "positive",
        insight: "Your habits are currently well-balanced. Keep maintaining your daily routines!",
      };
    }

    // 4. Retrieve user profile details for coach context
    const profileRef = db.collection("profiles").doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      return res
        .status(404)
        .json({ error: "Profile required to analyze behavioral coaching context" });
    }

    const profileData = profileSnap.data()!;
    const profile = {
      age: profileData.age,
      gender: profileData.gender,
      heightCm: profileData.heightCm || profileData.height,
      weightKg: profileData.weightKg || profileData.weight,
      smoking: profileData.smoking,
      exercise: profileData.exercise || profileData.exerciseLevel,
      familyHistory: profileData.familyHistory || "",
      symptoms: profileData.symptoms || "",
      alcohol: profileData.alcohol || null,
      diseases: profileData.diseases || null,
    };

    // Calculate risk scores and drivers
    const riskAnalysis = RiskService.analyze(profile);
    const driverAnalysis = RiskDriverService.analyzeRiskDrivers(profile);
    const actionPriorities = riskAnalysis.actionPriorities;

    // 5. Generate AI Nudge message
    const language = profileData.language || "en";
    const nudge = await AIService.generateCoachingNudge(
      uid,
      profile,
      driverAnalysis.topDrivers,
      actionPriorities,
      activeSignal,
      language,
    );

    const result = {
      success: true,
      nudge: {
        signalType: activeSignal.type,
        insight: activeSignal.insight,
        message: nudge.message,
        nextAction: nudge.nextAction,
        encouragement: nudge.encouragement,
        createdAt: new Date().toISOString(),
      },
    };

    // 6. Save Nudge to Firestore 'coachingNudges'
    try {
      const nudgeRef = db.collection("coachingNudges").doc();
      await nudgeRef.set({
        userId: uid,
        signalType: result.nudge.signalType,
        insight: result.nudge.insight,
        message: result.nudge.message,
        nextAction: result.nudge.nextAction,
        encouragement: result.nudge.encouragement,
        createdAt: result.nudge.createdAt,
        status: "active",
      });
    } catch (saveErr) {
      console.warn("Failed to log coaching nudge to database:", saveErr);
    }

    return res.json(result);
  } catch (err: any) {
    console.error("Behavior Coach API error:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error: Failed to analyze behavior signals" });
  }
});

// GET /api/progress/history - fetch user progress logs
app.get("/api/progress/history", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const logsSnap = await db
      .collection("progressLogs")
      .where("userId", "==", uid)
      .orderBy("createdAt", "asc")
      .get();

    const historyList = logsSnap.docs.map((doc: any) => {
      const log = doc.data();
      return {
        date: log.createdAt,
        overallScore: log.overallRisk,
        bmi: log.bmi,
        weightKg: log.weight,
        risks: {
          diabetes: log.diabetesRisk,
          heartDisease: log.heartRisk,
          hypertension: log.hypertensionRisk,
        },
        smoking: log.smoking,
        exercise: log.exercise,
      };
    });

    return res.json({ success: true, history: historyList });
  } catch (err: any) {
    console.error("Failed to fetch progress history:", err);
    return res.status(500).json({ error: "Database Error: Failed to fetch progress history" });
  }
});

const ProgressLogInputSchema = z.object({
  weightKg: z.number().min(10).max(400),
});

// POST /api/progress/log - manual weight logging & risk recalculation
app.post("/api/progress/log", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const parsed = ProgressLogInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation Error", details: parsed.error.format() });
    }

    const { weightKg } = parsed.data;

    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Profile required to log weight." });
    }

    const profileData = docSnap.data();

    // Recalculate risks using updated weight
    const updatedProfileInput = {
      age: profileData.age,
      gender: profileData.gender,
      heightCm: profileData.heightCm,
      weightKg: weightKg,
      smoking: profileData.smoking,
      exercise: profileData.exercise,
      familyHistory: profileData.familyHistory || "",
      symptoms: profileData.symptoms || "",
      alcohol: profileData.alcohol || null,
      diseases: profileData.diseases || null,
    };

    const analysis = RiskService.analyze(updatedProfileInput);

    // Update profile (merge weight & recalculation results, preserve AI plans)
    const updatedProfile = {
      ...profileData,
      weightKg: weightKg,
      weight: weightKg,
      result: {
        risk: {
          diabetes: analysis.diabetesRisk.risk,
          heartDisease: analysis.heartRisk.risk,
          hypertension: analysis.hypertensionRisk.risk,
        },
        rationale: profileData.result?.rationale || analysis.rationale,
        dietPlan: profileData.result?.dietPlan || analysis.dietPlan,
        exercisePlan: profileData.result?.exercisePlan || analysis.exercisePlan,
        preventionTips: profileData.result?.preventionTips || analysis.preventionTips,
        overallScore: analysis.overallRisk,
        overallRisk: analysis.overallRiskLabel,
        factors: analysis.factors,
        actionPriorities: analysis.actionPriorities,
        bmi: analysis.bmi,
      },
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(updatedProfile, { merge: true });

    // Write a progress snapshot in progressLogs collection
    await writeProgressLog(uid, updatedProfileInput, analysis);

    // Fetch and return the updated history logs array
    const logsSnap = await db
      .collection("progressLogs")
      .where("userId", "==", uid)
      .orderBy("createdAt", "asc")
      .get();

    const historyList = logsSnap.docs.map((doc: any) => {
      const log = doc.data();
      return {
        date: log.createdAt,
        overallScore: log.overallRisk,
        bmi: log.bmi,
        weightKg: log.weight,
        risks: {
          diabetes: log.diabetesRisk,
          heartDisease: log.heartRisk,
          hypertension: log.hypertensionRisk,
        },
        smoking: log.smoking,
        exercise: log.exercise,
      };
    });

    return res.json({
      success: true,
      profile: {
        age: updatedProfile.age,
        gender: updatedProfile.gender,
        heightCm: updatedProfile.heightCm,
        weightKg: updatedProfile.weightKg,
        smoking: updatedProfile.smoking,
        exercise: updatedProfile.exercise,
        familyHistory: updatedProfile.familyHistory,
        symptoms: updatedProfile.symptoms,
        alcohol: updatedProfile.alcohol || undefined,
        diseases: updatedProfile.diseases || undefined,
      },
      result: updatedProfile.result,
      history: historyList,
    });
  } catch (err: any) {
    console.error("Manual weight logging API error:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to log weight progress" });
  }
});

// GET /api/progress/review - fetch AI reviews, milestones and trend calculations
app.get("/api/progress/review", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const logsSnap = await db
      .collection("progressLogs")
      .where("userId", "==", uid)
      .orderBy("createdAt", "asc")
      .get();

    if (logsSnap.empty) {
      return res.json({
        success: true,
        review:
          "No progress history logs found yet. Complete your first assessment questionnaire and log your weight periodically to track progress!",
        coaching:
          "Establish a baseline: complete your health assessment profile and start tracking your changes.",
        milestones: [],
        trends: {
          weightChange: 0,
          overallRiskChange: 0,
          diabetesRiskChange: 0,
          heartRiskChange: 0,
          hypertensionRiskChange: 0,
        },
      });
    }

    const logs = logsSnap.docs.map((d: any) => d.data() as ProgressLog);

    // Detect milestones
    const milestones = ProgressService.getMilestones(logs);

    // Fetch profile to read language preference
    const profileRef = db.collection("profiles").doc(uid);
    const profileSnap = await profileRef.get();
    const profileData = profileSnap.exists ? profileSnap.data() : null;
    const language = profileData?.language || "en";

    // Calculate trends
    const firstLog = logs[0];
    const latestLog = logs[logs.length - 1];

    const trends = {
      weightChange: latestLog.weight - firstLog.weight,
      overallRiskChange: latestLog.overallRisk - firstLog.overallRisk,
      diabetesRiskChange: latestLog.diabetesRisk - firstLog.diabetesRisk,
      heartRiskChange: latestLog.heartRisk - firstLog.heartRisk,
      hypertensionRiskChange: latestLog.hypertensionRisk - firstLog.hypertensionRisk,
    };

    // Generate AI narrative review & adapted coaching Focus Areas / Maintain Habits
    const reviewResult = await AIService.generateProgressReview(uid, logs, language);

    return res.json({
      success: true,
      review: reviewResult.review,
      coaching: reviewResult.coaching,
      milestones,
      trends,
    });
  } catch (err: any) {
    console.error("Progress review API error:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error: Failed to generate progress review" });
  }
});

// POST /api/actions/impact - Action Impact Engine
app.post("/api/actions/impact", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    // Fetch saved profile from Firestore / MockFirestore
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        error: "Not Found: Complete a health assessment first.",
      });
    }

    const profileData = docSnap.data();

    const profile = {
      age: profileData.age,
      gender: profileData.gender,
      heightCm: profileData.heightCm || profileData.height,
      weightKg: profileData.weightKg || profileData.weight,
      smoking: profileData.smoking,
      exercise: profileData.exercise || profileData.exerciseLevel,
      familyHistory: profileData.familyHistory || "",
      symptoms: profileData.symptoms || "",
      alcohol: profileData.alcohol || null,
      diseases: profileData.diseases || null,
      sleepHours: profileData.sleepHours ?? 0,
    };

    const recommendedActions = calculateActionImpacts(profile);

    // Cache latest ranking in actionImpacts/{uid}
    try {
      const cacheRef = db.collection("actionImpacts").doc(uid);
      await cacheRef.set({
        userId: uid,
        recommendedActions,
        calculatedAt: new Date().toISOString(),
      });
    } catch (cacheErr) {
      console.warn("Failed to cache action impacts:", cacheErr);
    }

    return res.json({
      success: true,
      data: { recommendedActions },
    });
  } catch (err: any) {
    console.error("Action Impact API error:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error: Failed to calculate action impacts" });
  }
});

// GET /api/risk/drivers - Calculate and explain risk drivers
app.get("/api/risk/drivers", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const docRef = db.collection("profiles").doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res
        .status(404)
        .json({ error: "Not Found: Profile is required to calculate risk drivers" });
    }

    const profileData = docSnap.data()!;
    const profile = {
      age: profileData.age,
      gender: profileData.gender,
      heightCm: profileData.heightCm || profileData.height,
      weightKg: profileData.weightKg || profileData.weight,
      smoking: profileData.smoking,
      exercise: profileData.exercise || profileData.exerciseLevel,
      familyHistory: profileData.familyHistory || "",
      symptoms: profileData.symptoms || "",
      alcohol: profileData.alcohol || null,
      diseases: profileData.diseases || null,
    };

    const driverResult = RiskDriverService.analyzeRiskDrivers(profile);

    // Save to Firestore 'riskDrivers' collection
    try {
      const cacheRef = db.collection("riskDrivers").doc(uid);
      await cacheRef.set({
        userId: uid,
        topDrivers: driverResult.topDrivers,
        modifiableRisk: driverResult.modifiableRisk,
        nonModifiableRisk: driverResult.nonModifiableRisk,
        calculatedAt: new Date().toISOString(),
      });
    } catch (cacheErr) {
      console.warn("Failed to save risk drivers to Firestore:", cacheErr);
    }

    return res.json({
      success: true,
      data: driverResult,
    });
  } catch (err: any) {
    console.error("Risk drivers API error:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to analyze risk drivers" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`HealthGuard AI Express backend running on http://localhost:${PORT}`);
});
