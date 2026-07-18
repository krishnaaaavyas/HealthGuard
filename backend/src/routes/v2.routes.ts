import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { db } from "../firebase-admin.js";
import {
  HealthAssessmentV2Schema,
  LabReportV2Schema,
  RecommendationV2Schema,
  RegionalContextV2Schema,
  HealthContextSchema,
  SafetyFlag,
  HealthModuleResult,
} from "../config/schemas-v2.js";
import { isBackendFeatureEnabled } from "../config/feature-flags.js";
import { diseaseModuleRegistry } from "../config/module-registry.js";

const router = Router();

// Helper to check if V2 is enabled
const isV2Enabled = () => {
  return isBackendFeatureEnabled("healthEngineV2Enabled");
};

// Error response when V2 is disabled
const v2DisabledResponse = (res: any) => {
  return res.status(503).json({
    success: false,
    error: "Health Engine V2 is currently disabled.",
    code: "HEALTH_ENGINE_V2_DISABLED",
  });
};

// GET /api/v2/health
router.get("/health", (_req, res) => {
  return res.json({
    status: "ok",
    version: "2.0.0",
    enabled: isV2Enabled(),
  });
});

// GET /api/v2/ready
router.get("/ready", (_req, res) => {
  return res.json({
    status: "ok",
    version: "2.0.0",
    enabled: isV2Enabled(),
  });
});

// 1. POST /api/v2/health-assessment
router.post("/health-assessment", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  // Ensure userId is present in body matching authenticated user
  if (!req.body.userId) {
    req.body.userId = uid;
  } else if (req.body.userId !== uid) {
    return res.status(403).json({ success: false, error: "Forbidden: User ID mismatch" });
  }

  const parsed = HealthContextSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: "Validation Error", details: parsed.error.format() });
  }

  const context = parsed.data;
  const assessment = context.assessment;

  // Deriving BMI safely
  let bmi = 0;
  if (assessment.heightCm > 0 && assessment.weightKg > 0) {
    bmi = assessment.weightKg / (assessment.heightCm / 100) ** 2;
  }
  if (!isFinite(bmi) || isNaN(bmi) || bmi < 0) {
    bmi = 0;
  }

  // Check red-flags
  const safetyFlags: SafetyFlag[] = [];
  if (assessment.systolicBP >= 180 || assessment.diastolicBP >= 120) {
    safetyFlags.push({
      flagType: "red-flag",
      moduleId: "hypertension",
      message: `Hypertensive emergency alert: Blood pressure measured at ${assessment.systolicBP}/${assessment.diastolicBP} mmHg. Seek immediate medical attention.`,
      clinicalActionRequired: true,
    });
  }
  if (
    assessment.fastingBloodSugar &&
    (assessment.fastingBloodSugar >= 250 || assessment.fastingBloodSugar <= 50)
  ) {
    safetyFlags.push({
      flagType: "red-flag",
      moduleId: "diabetes",
      message: `Glycemic emergency alert: Fasting blood sugar measured at ${assessment.fastingBloodSugar} mg/dL. Consult a physician immediately.`,
      clinicalActionRequired: true,
    });
  }
  const lowerSymptoms = (assessment.symptoms || "").toLowerCase();
  if (lowerSymptoms.includes("chest pain") || lowerSymptoms.includes("shortness of breath")) {
    safetyFlags.push({
      flagType: "red-flag",
      moduleId: "cardiovascular",
      message: `Cardiac symptom warning: "${assessment.symptoms}" indicates potentially critical cardiovascular distress. Seek emergency medical attention.`,
      clinicalActionRequired: true,
    });
  }

  // Run modules independently (partial failure handling)
  const moduleResults: HealthModuleResult[] = [];
  for (const moduleName of Object.keys(diseaseModuleRegistry)) {
    const module = diseaseModuleRegistry[moduleName];
    if (module.isEligible(context)) {
      try {
        const result = await module.evaluate(context);
        moduleResults.push(result);
      } catch (err: any) {
        moduleResults.push({
          moduleId: module.moduleId,
          moduleVersion: module.version,
          resultType: module.moduleId === "cardiovascular" ? "risk-score" : "risk-tier",
          status: "failed",
          evidenceCompleteness: 0,
          confidenceLevel: "insufficient",
          topContributors: [],
          protectiveFactors: [],
          missingInputs: [],
          recommendedActions: [],
          recommendedTests: [],
          safetyFlags: [
            {
              flagType: "data-anomaly",
              moduleId: module.moduleId,
              message: `Evaluation failed: ${err.message || String(err)}`,
              clinicalActionRequired: false,
            },
          ],
        });
      }
    }
  }

  try {
    const docRef = db.collection("assessmentsV2").doc(uid);
    const savePayload = {
      ...context,
      bmi,
      safetyFlags: [...safetyFlags, ...moduleResults.flatMap((r) => r.safetyFlags)],
      moduleResults,
      updatedAt: new Date().toISOString(),
    };
    await docRef.set(savePayload, { merge: true });

    return res.json({
      success: true,
      message: "V2 Health assessment evaluated and saved successfully.",
      data: savePayload,
    });
  } catch (err: any) {
    console.error("V2 health assessment save/evaluate database error:", err);
    return res.status(500).json({
      success: false,
      error: "Database Error: Failed to save V2 health assessment results",
    });
  }
});

// GET /api/v2/health-assessment
router.get("/health-assessment", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const docSnap = await db.collection("assessmentsV2").doc(uid).get();
    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: "V2 Health assessment not found" });
    }
    return res.json({ success: true, data: docSnap.data() });
  } catch (err: any) {
    console.error("V2 health assessment get error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to retrieve V2 health assessment" });
  }
});

// 2. POST /api/v2/lab-reports
router.post("/lab-reports", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const parsed = LabReportV2Schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: "Validation Error", details: parsed.error.format() });
  }

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const data = parsed.data;
    const docRef = db.collection("labReportsV2").doc(data.reportId);
    await docRef.set({
      ...data,
      userId: uid,
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "V2 Lab report saved successfully.", data });
  } catch (err: any) {
    console.error("V2 lab report save error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to save V2 lab report" });
  }
});

// GET /api/v2/lab-reports
router.get("/lab-reports", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const snapshot = await db.collection("labReportsV2").where("userId", "==", uid).get();
    const reports = snapshot.docs.map((doc: any) => doc.data());
    return res.json({ success: true, data: reports });
  } catch (err: any) {
    console.error("V2 lab reports get error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to retrieve V2 lab reports" });
  }
});

// 3. POST /api/v2/recommendations
router.post("/recommendations", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const parsed = RecommendationV2Schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: "Validation Error", details: parsed.error.format() });
  }

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const data = parsed.data;
    const docRef = db.collection("recommendationsV2").doc(data.assessmentId);
    await docRef.set({
      ...data,
      userId: uid,
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "V2 Recommendation saved successfully.", data });
  } catch (err: any) {
    console.error("V2 recommendation save error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to save V2 recommendation" });
  }
});

// GET /api/v2/recommendations
router.get("/recommendations", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const snapshot = await db.collection("recommendationsV2").where("userId", "==", uid).get();
    const recs = snapshot.docs.map((doc: any) => doc.data());
    return res.json({ success: true, data: recs });
  } catch (err: any) {
    console.error("V2 recommendations get error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to retrieve V2 recommendations" });
  }
});

// 4. POST /api/v2/regional-context
router.post("/regional-context", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const parsed = RegionalContextV2Schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: "Validation Error", details: parsed.error.format() });
  }

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const data = parsed.data;
    const docRef = db.collection("regionalContextV2").doc(uid);
    await docRef.set({
      ...data,
      userId: uid,
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "V2 Regional context saved successfully.", data });
  } catch (err: any) {
    console.error("V2 regional context save error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to save V2 regional context" });
  }
});

// GET /api/v2/regional-context
router.get("/regional-context", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!isV2Enabled()) return v2DisabledResponse(res);

  const uid = req.user?.uid;
  if (!uid) return res.status(400).json({ success: false, error: "Missing User UID" });

  try {
    const docSnap = await db.collection("regionalContextV2").doc(uid).get();
    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: "V2 Regional context not found" });
    }
    return res.json({ success: true, data: docSnap.data() });
  } catch (err: any) {
    console.error("V2 regional context get error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Database Error: Failed to retrieve V2 regional context" });
  }
});

export default router;
