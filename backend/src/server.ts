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
import expertReviewRoutes from "./routes/expertReview.routes.js";
import v2Routes from "./routes/v2.routes.js";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON body parsing
app.use(cors({ origin: "*" }));
app.use(express.json());

// Mount Expert Review Routes
app.use("/api/expert-review", expertReviewRoutes);

// Mount V2 Versioned Routes
app.use("/api/v2", v2Routes);

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
  labObservations: z.array(z.any()).optional(),
  bloodReportOnly: z.boolean().optional(),
  // Phase 1 Workout Personalization
  fitnessGoal: z.string().optional(),
  fitnessLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  sittingHours: z.number().optional(),
  medicalConditions: z.array(z.string()).optional(),
  workoutDaysPerWeek: z.number().optional(),
  workoutDuration: z.number().optional(),
  exerciseLocation: z.enum(["home", "gym", "outdoor"]).optional(),
  equipment: z.enum(["none", "bands", "dumbbells", "gym"]).optional(),
  // Phase 1 Diet Personalization
  dietType: z.enum(["vegetarian", "eggetarian", "non-vegetarian", "vegan", "jain", "satvik", "no-onion-garlic"]).optional(),
  lactoseIntolerant: z.boolean().optional(),
  foodAllergies: z.string().optional(),
  regionalCuisine: z.string().optional(),
  budget: z.enum(["low", "medium", "flexible"]).optional(),
  cookingTime: z.number().optional(),
  mealTiming: z.string().optional(),
  weightGoal: z.enum(["lose", "gain", "maintain"]).optional(),
  // Extra Assessment Questions
  sleepHours: z.string().optional(),
  stressLevel: z.enum(["low", "medium", "high"]).optional(),
  waterIntake: z.string().optional(),
  occupation: z.string().optional(),
  tobaccoUse: z.string().optional(),
  excludedFoods: z.array(z.string()).optional(),
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
        console.log("module=progress-log status=duplicate-skipped");
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
    console.log("module=progress-log status=saved");
  } catch (err) {
    console.error("Error writing progress log snapshot:", err);
  }
}

// GET /health - basic health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", version: "1.0.0", timestamp: new Date().toISOString() });
});

// GET /api/user/status - check assessment status
app.get("/api/user/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (userSnap.exists) {
      const data = userSnap.data();
      return res.json({
        hasCompletedAssessment: !!data?.hasCompletedAssessment,
        assessmentCompletedAt: data?.assessmentCompletedAt || null,
        lastAssessmentUpdate: data?.lastAssessmentUpdate || null,
      });
    }

    // Fallback if user doc doesn't exist yet but profile does
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const hasProfile = profileSnap.exists && !!profileSnap.data()?.result;
    return res.json({
      hasCompletedAssessment: hasProfile,
      assessmentCompletedAt: hasProfile ? profileSnap.data()?.updatedAt : null,
      lastAssessmentUpdate: hasProfile ? profileSnap.data()?.updatedAt : null,
    });
  } catch (err) {
    console.error("Error fetching user status:", err);
    return res.status(500).json({ error: "Database Error" });
  }
});

// GET /api/dashboard/bootstrap - consolidate dashboard data retrieval
app.get("/api/dashboard/bootstrap", requireAuth, async (req: AuthenticatedRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    // Execute Firestore queries in parallel
    const [profileSnap, userSnap, expertReviewSnap, coachNudgeSnap] = await Promise.all([
      db
        .collection("profiles")
        .doc(uid)
        .get()
        .catch((err: any) => {
          console.error("Bootstrap: error fetching profile:", err);
          return { exists: false, data: () => null };
        }),
      db
        .collection("users")
        .doc(uid)
        .get()
        .catch((err: any) => {
          console.error("Bootstrap: error fetching user:", err);
          return { exists: false, data: () => null };
        }),
      db
        .collection("expertReviewRequests")
        .where("userId", "==", uid)
        .get()
        .catch((err: any) => {
          console.error("Bootstrap: error fetching expert reviews:", err);
          return { empty: true, docs: [] };
        }),
      db
        .collection("coachingNudges")
        .where("userId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get()
        .catch((err: any) => {
          console.error("Bootstrap: error fetching coaching nudges:", err);
          return { empty: true, docs: [] };
        }),
    ]);

    const profileData = profileSnap.exists ? profileSnap.data() : null;
    const userData = userSnap.exists ? userSnap.data() : null;

    // User status object
    let userStatusObj: any = null;
    if (userSnap.exists) {
      userStatusObj = {
        hasCompletedAssessment: !!userData?.hasCompletedAssessment,
        assessmentCompletedAt: userData?.assessmentCompletedAt || null,
        lastAssessmentUpdate: userData?.lastAssessmentUpdate || null,
      };
    } else {
      const hasProfile = profileSnap.exists && !!profileData?.result;
      userStatusObj = {
        hasCompletedAssessment: hasProfile,
        assessmentCompletedAt: hasProfile ? profileData?.updatedAt : null,
        lastAssessmentUpdate: hasProfile ? profileData?.updatedAt : null,
      };
    }

    // Expert review request status
    let expertReviewObj: any = { requests: [] };
    if (!expertReviewSnap.empty) {
      const requests = expertReviewSnap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));
      requests.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      expertReviewObj = { success: true, requests };
    }

    // Coach Nudge
    let coachNudgeObj: any = null;
    if (!coachNudgeSnap.empty) {
      const nudge = coachNudgeSnap.docs[0].data();
      coachNudgeObj = {
        signalType: nudge.signalType,
        insight: nudge.insight,
        message: nudge.message,
        nextAction: nudge.nextAction,
        encouragement: nudge.encouragement,
        createdAt: nudge.createdAt,
      };
    } else {
      // Default deterministic nudge
      coachNudgeObj = {
        signalType: "risk_improved",
        insight: "Your habits are currently well-balanced. Keep maintaining your daily routines!",
        message: "Keep up the excellent lifestyle choices.",
        nextAction: "Continue tracking your progress regularly.",
        encouragement: "Great job!",
        createdAt: new Date().toISOString(),
      };
    }

    // Default parameters for calculations if profile is missing
    const profileInput = {
      age: profileData?.age || 35,
      gender: profileData?.gender || "male",
      heightCm: profileData?.heightCm || profileData?.height || 170,
      weightKg: profileData?.weightKg || profileData?.weight || 72,
      smoking: profileData?.smoking || "never",
      exercise: profileData?.exercise || profileData?.exerciseLevel || "none",
      familyHistory: profileData?.familyHistory || "",
      symptoms: profileData?.symptoms || "",
      alcohol: profileData?.alcohol || null,
      diseases: profileData?.diseases || null,
    };

    // Calculate action impacts and risk drivers on-the-fly dynamically (avoid Gemini)
    let actionImpactsList: any[] = [];
    try {
      const recommendedActions = calculateActionImpacts(profileInput);
      actionImpactsList = recommendedActions.slice(0, 3);
    } catch (err) {
      console.error("Bootstrap: error calculating action impacts:", err);
    }

    let riskDriversList: any[] = [];
    try {
      const driverResult = RiskDriverService.analyzeRiskDrivers(profileInput);
      riskDriversList = driverResult.topDrivers;
    } catch (err) {
      console.error("Bootstrap: error analyzing risk drivers:", err);
    }

    // Profile History fallback logic
    let historyList: any[] = [];
    if (profileData) {
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
        console.warn("Bootstrap: history fallback error:", historyErr);
        historyList = profileData.history || [];
      }
    }

    const responsePayload = {
      success: true,
      profile: profileData
        ? {
            age: profileData.age,
            gender: profileData.gender,
            heightCm: profileData.heightCm || profileData.height,
            weightKg: profileData.weightKg || profileData.weight,
            smoking: profileData.smoking,
            exercise: profileData.exercise || profileData.exerciseLevel,
            familyHistory: profileData.familyHistory,
            symptoms: profileData.symptoms,
            alcohol: profileData.alcohol || undefined,
            diseases: profileData.diseases || undefined,
            language: profileData.language || "en",
          }
        : null,
      result: profileData?.result
        ? (() => {
            const { mlRisk: _ignored, ...filtered } = profileData.result;
            return filtered;
          })()
        : null,
      history: historyList,
      userStatus: userStatusObj,
      riskDrivers: riskDriversList,
      actionImpacts: actionImpactsList,
      expertReview: expertReviewObj,
      coachNudge: coachNudgeObj,
    };

    return res.json(responsePayload);
  } catch (err) {
    console.error("Dashboard bootstrap endpoint error:", err);
    return res.status(500).json({ error: "Bootstrap Error: Failed to gather dashboard data" });
  }
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
          language: data.language || "en",
          labObservations: data.labObservations || [],
          bloodReportOnly: data.bloodReportOnly || false,
        },
        result: data.result
          ? (() => {
              const { mlRisk: _ignored, ...filtered } = data.result;
              return filtered;
            })()
          : null,
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
      language: data.language || "en",
      labObservations: data.labObservations || [],
      bloodReportOnly: data.bloodReportOnly || false,
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
    const userSnap = await userRef.get();
    const existingUser = userSnap.exists ? userSnap.data() : null;
    const now = new Date().toISOString();
    const assessmentCompletedAt = existingUser?.assessmentCompletedAt || now;

    await userRef.set(
      {
        uid,
        email: req.user?.email || existingUser?.email || null,
        name: req.user?.name || existingUser?.name || existingUser?.displayName || null,
        displayName: req.user?.name || existingUser?.displayName || existingUser?.name || null,
        hasCompletedAssessment: true,
        assessmentCompletedAt,
        lastAssessmentUpdate: now,
        updatedAt: now,
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

    // Generate immediate deterministic fallback plans (extremely fast)
    const deterministic = RiskService.generateDeterministicPlans(
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
      },
      {
        diabetes: analysis.diabetesRisk.risk,
        heart: analysis.heartRisk.risk,
        hypertension: analysis.hypertensionRisk.risk,
      },
    );

    // Merge deterministic rationales and plans into analysis
    analysis.rationale = deterministic.rationale;
    analysis.dietPlan = deterministic.dietPlan;
    analysis.exercisePlan = deterministic.exercisePlan;
    analysis.preventionTips = deterministic.preventionTips;

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
      labObservations: data.labObservations || [],
      bloodReportOnly: data.bloodReportOnly || false,
      createdAt: new Date().toISOString(),
    };
    await assessmentRef.set(assessmentData);

    // Save profile data (with deterministic result object) in 'profiles/{uid}'
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
      language: data.language || "en",
      labObservations: data.labObservations || [],
      bloodReportOnly: data.bloodReportOnly || false,
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
        isAiEnriched: false, // Flag indicating AI enrichment is pending
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

    (analysis as any).isAiEnriched = false;

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

// POST /api/risk/advice - generate and cache AI advice on top of clinical calculation
app.post("/api/risk/advice", requireAuth, async (req: AuthenticatedRequest, res) => {
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

    // Run clinical calculations briefly to get clean scores for prompt
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

    // Call AIService (which uses AbortController & 20s timeout)
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

    // Save the enriched advice to the profile in Firestore
    const docRef = db.collection("profiles").doc(uid);
    const updatedProfile = {
      result: {
        risk: {
          diabetes: analysis.diabetesRisk.risk,
          heartDisease: analysis.heartRisk.risk,
          hypertension: analysis.hypertensionRisk.risk,
        },
        rationale: enriched.rationale,
        dietPlan: enriched.dietPlan,
        exercisePlan: enriched.exercisePlan,
        preventionTips: enriched.preventionTips,
        overallScore: analysis.overallRisk,
        overallRisk: analysis.overallRiskLabel,
        factors: analysis.factors,
        actionPriorities: analysis.actionPriorities,
        bmi: analysis.bmi,
        isAiEnriched: true,
      },
      updatedAt: new Date().toISOString(),
    };
    await docRef.set(updatedProfile, { merge: true });

    return res.json({
      success: true,
      advice: {
        rationale: enriched.rationale,
        dietPlan: enriched.dietPlan,
        exercisePlan: enriched.exercisePlan,
        preventionTips: enriched.preventionTips,
        isAiEnriched: true,
      },
    });
  } catch (err: any) {
    console.error("AI Advice API error:", err);
    return res.status(500).json({ error: "Advice Error: Failed to generate AI recommendations" });
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
        language: language as "en" | "hi" | "gu",
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
        language: language as "en" | "hi" | "gu",
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
        language: language as "en" | "hi" | "gu",
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

      // Extract and analyze nutrition facts deterministically
      const parsedNutrition = FoodImpactService.parseNutritionFacts(ingreds, result?.rawText);
      const deterministic = FoodImpactService.analyzePersonalizedFood(
        ingreds,
        parsedNutrition,
        risks,
        topDrivers.map((d) => d.factor),
      );

      // Generate Gemini explanation narrative if key is configured
      let geminiExplanation: string | undefined = undefined;
      if (key && key !== "YOUR_GEMINI_API_KEY" && !key.includes("placeholder")) {
        try {
          const model = "gemini-2.5-flash";
          const explainUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

          const explainPrompt = `You are a clinical nutrition auditor for HealthGuard AI.
We have calculated the following personalized food analysis for this user:
User Risks:
- Type 2 Diabetes Risk: ${risks.diabetes}%
- Heart Disease Risk: ${risks.heart}%
- Hypertension Risk: ${risks.hypertension}%

Calculated Food Assessment for "${foodName}":
- Personalized Food Score: ${deterministic.personalizedFoodScore}/10
- Risk Category: ${deterministic.foodRiskCategory}
- Glycemic (Diabetes) Impact Score: ${deterministic.diabetesImpact} points
- Vascular (Hypertension) Impact Score: ${deterministic.hypertensionImpact} points
- Cardiac (Heart) Impact Score: ${deterministic.heartImpact} points
- Reasons: ${deterministic.reasons.join("; ")}
- Better Alternatives: ${deterministic.betterAlternatives.join(", ")}

Please write a supportive, personalized explanation of these computed results in natural language.
Describe how the ingredients affect the user's specific health risks (diabetes, hypertension, heart disease) based on the computed impact points.
Explain the reasons why this product is categorized as "${deterministic.foodRiskCategory}" with a personalized score of ${deterministic.personalizedFoodScore}/10.

CRITICAL SAFETY RULES:
- Include the statement: "This is an estimated risk analysis based on your provided data, for awareness and lifestyle guidance only."
- Avoid any definitive clinical diagnosis, guaranteed disease prediction, or medical prescription.
- Do not suggest specific prescription drugs.
`;

          const explainResp = await fetch(explainUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: explainPrompt }] }],
              generationConfig: {
                temperature: 0.2,
              },
            }),
          });

          if (explainResp.ok) {
            const explainJson: any = await explainResp.json();
            const explainText =
              explainJson?.candidates?.[0]?.content?.parts
                ?.map((p: any) => p.text ?? "")
                .join("") ?? "";
            if (explainText) {
              geminiExplanation = GuardrailsService.sanitizeText(explainText);
            }
          }
        } catch (explainErr) {
          console.warn(
            "Failed to generate Gemini explanation narrative, falling back:",
            explainErr,
          );
        }
      }

      const responsePayload = {
        name: foodName,
        goodIngredients: result?.goodIngredients || [],
        watchOut: ingreds,
        foodRiskCategory: deterministic.foodRiskCategory,
        personalizedFoodScore: deterministic.personalizedFoodScore,
        diabetesImpact: deterministic.diabetesImpact,
        hypertensionImpact: deterministic.hypertensionImpact,
        heartImpact: deterministic.heartImpact,
        reasons: deterministic.reasons,
        betterAlternatives: deterministic.betterAlternatives,
        geminiExplanation: geminiExplanation || null,
        // for backward compatibility
        score: deterministic.personalizedFoodScore,
        foodScore: 10,
        personalizedScore: deterministic.personalizedFoodScore,
        riskLevel:
          deterministic.foodRiskCategory === "safe"
            ? "Low"
            : deterministic.foodRiskCategory === "moderate"
              ? "Moderate"
              : "High",
        recommendation: geminiExplanation || deterministic.reasons.join(" "),
        recommendations: [geminiExplanation || deterministic.reasons.join(" ")],
        alternatives: deterministic.betterAlternatives,
        diabetesImpactPoints: deterministic.diabetesImpact,
        hypertensionImpactPoints: deterministic.hypertensionImpact,
        heartImpactPoints: deterministic.heartImpact,
        conflict: {
          conflicts: deterministic.foodRiskCategory === "avoid",
          message:
            deterministic.foodRiskCategory === "avoid"
              ? "This food conflicts with your health goals."
              : "",
        },
      };

      // Save scan to Firestore 'foodScans' collection
      try {
        const scanRef = db.collection("foodScans").doc();
        await scanRef.set({
          userId: uid,
          productName: foodName,
          ingredients: ingreds,
          foodScore: 10,
          personalizedFoodScore: deterministic.personalizedFoodScore,
          foodRiskCategory: deterministic.foodRiskCategory,
          diabetesImpact: deterministic.diabetesImpact,
          hypertensionImpact: deterministic.hypertensionImpact,
          heartImpact: deterministic.heartImpact,
          reasons: deterministic.reasons,
          betterAlternatives: deterministic.betterAlternatives,
          geminiExplanation: geminiExplanation || null,
          createdAt: new Date().toISOString(),
        });
      } catch (saveErr) {
        console.warn("Failed to save food scan to Firestore:", saveErr);
      }

      return res.json(responsePayload);
    } catch (err: any) {
      console.error("Food analyze API error:", err);
      return res
        .status(500)
        .json({ error: "Internal Server Error: Failed to analyze food impact" });
    }
  },
);

// POST /api/lab-report/analyze - Extract lab values from uploaded report
app.post(
  "/api/lab-report/analyze",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(400).json({ error: "Bad Request: Missing User UID" });
    }

    try {
      const { contents } = req.body;
      if (!contents || !Array.isArray(contents)) {
        return res.status(400).json({ error: "Bad Request: Missing contents array" });
      }

      let result: any = null;
      const key = process.env.GEMINI_API_KEY;
      const extractionUnavailable = () => res.status(503).json({
        status: "extraction-unavailable",
        reasonCode: "OCR_SERVICE_UNAVAILABLE",
        biomarkers: {},
        manualEntryRequired: true,
        message: "Automatic extraction is unavailable. Enter or review the values manually.",
      });

      if (
        key &&
        key !== "YOUR_GEMINI_API_KEY" &&
        !key.includes("placeholder")
      ) {
        const model = "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

        const labPrompt = `You are a clinical laboratory data extraction system. Analyze the provided lab report image or document.
Extract the following biomarkers if present, including their numeric value and unit. Do not guess values.
Biomarkers to look for:
1. fastingBloodSugar (fasting blood glucose, FBS)
2. HbA1c (Glycated hemoglobin, A1c)
3. totalCholesterol
4. ldl (LDL Cholesterol)
5. hdl (HDL Cholesterol)
6. triglycerides

Also extract the report date/test date if visible.

Return strictly valid JSON matching the requested schema.`;

        // Update parts
        const geminiContents = JSON.parse(JSON.stringify(contents));
        geminiContents.push({
          role: "user",
          parts: [{ text: labPrompt }],
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
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
                  fastingBloodSugar: {
                    type: "object",
                    properties: {
                      value: { type: "number" },
                      unit: { type: "string" }
                    }
                  },
                  HbA1c: {
                    type: "object",
                    properties: {
                      value: { type: "number" },
                      unit: { type: "string" }
                    }
                  },
                  totalCholesterol: {
                    type: "object",
                    properties: {
                      value: { type: "number" },
                      unit: { type: "string" }
                    }
                  },
                  ldl: {
                    type: "object",
                    properties: {
                      value: { type: "number" },
                      unit: { type: "string" }
                    }
                  },
                  hdl: {
                    type: "object",
                    properties: {
                      value: { type: "number" },
                      unit: { type: "string" }
                    }
                  },
                  triglycerides: {
                    type: "object",
                    properties: {
                      value: { type: "number" },
                      unit: { type: "string" }
                    }
                  },
                  reportDate: {
                    type: "string",
                    description: "Date of the report in YYYY-MM-DD format if visible"
                  }
                }
              },
              temperature: 0.1,
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (geminiResp.ok) {
          const geminiJson: any = await geminiResp.json();
          const geminiText =
            geminiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ??
            "";
          if (geminiText) {
            result = JSON.parse(geminiText);
          }
        } else {
          console.warn("module=lab-extraction status=upstream-unavailable");
        }
      }

      if (!result) {
        return extractionUnavailable();
      }

      const biomarkerKeys = [
        "fastingBloodSugar", "HbA1c", "totalCholesterol", "ldl", "hdl", "triglycerides",
      ];
      if (typeof result !== "object" || Array.isArray(result)) {
        return extractionUnavailable();
      }
      for (const name of biomarkerKeys) {
        if (!(name in result)) continue;
        const biomarker = result[name];
        if (
          !biomarker || typeof biomarker !== "object" ||
          typeof biomarker.value !== "number" || !Number.isFinite(biomarker.value) ||
          typeof biomarker.unit !== "string" || biomarker.unit.trim() === ""
        ) {
          console.warn("module=lab-extraction status=invalid-biomarker-schema");
          return extractionUnavailable();
        }
      }
      const extractedKeys = biomarkerKeys.filter((name) => name in result);
      if (extractedKeys.length === 0) return extractionUnavailable();
      if (result.reportDate !== undefined && typeof result.reportDate !== "string") {
        return extractionUnavailable();
      }
      return res.json({ ...result, status: "extracted" });
    } catch {
      console.warn("module=lab-extraction status=extraction-unavailable");
      return res.status(503).json({
        status: "extraction-unavailable",
        reasonCode: "OCR_SERVICE_UNAVAILABLE",
        biomarkers: {},
        manualEntryRequired: true,
        message: "Automatic extraction is unavailable. Enter or review the values manually.",
      });
    }
  }
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

    // Calculate progress predictions & store in Firestore when status is ready
    let predictionResult: any = {
      status: "insufficient_data",
      message: "Add more progress logs to unlock prediction.",
    };
    try {
      predictionResult = PredictionService.predictProgressRisk(logs);
      if (predictionResult.status === "ready") {
        const predRef = db.collection("progressPredictions").doc();
        await predRef.set({
          userId: uid,
          trend: predictionResult.trend,
          predictedRisk30Days: predictionResult.predictedRisk30Days,
          predictedRisk90Days: predictionResult.predictedRisk90Days,
          confidence: predictionResult.confidence,
          reasons: predictionResult.reasons,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (predErr) {
      console.error("Progress prediction calculation failed:", predErr);
    }

    return res.json({
      success: true,
      review: reviewResult.review,
      coaching: reviewResult.coaching,
      milestones,
      trends,
      prediction: predictionResult,
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
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`HealthGuard AI Express backend running on http://localhost:${PORT}`);
  });
}
