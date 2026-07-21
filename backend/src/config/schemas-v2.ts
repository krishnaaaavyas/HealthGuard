import { z } from "zod";

// V2 Health Assessment Schema (extending demo physiological parameters)
export const HealthAssessmentV2Schema = z.object({
  age: z.number().min(1).max(120),
  gender: z.enum(["male", "female", "other"]),
  heightCm: z.number().min(50).max(260),
  weightKg: z.number().min(10).max(400),
  smoking: z.enum(["never", "former", "current"]),
  exercise: z.enum(["none", "light", "moderate", "active"]),
  familyHistory: z.string().max(500).default(""),
  symptoms: z.string().max(1000).default(""),
  alcohol: z.enum(["never", "occasional", "heavy"]).default("never"),
  sleepHours: z.number().min(2).max(18).default(7),
  systolicBP: z.number().min(70).max(220).optional(),
  diastolicBP: z.number().min(40).max(130).optional(),
  heartRate: z.number().min(30).max(200).optional(),
  fastingBloodSugar: z.number().min(50).max(400).optional(),
  schemaVersion: z.string().default("2.0"),
});

// V2 Laboratory Reports & Biomarkers Schema
export const LabReportV2Schema = z.object({
  reportId: z.string(),
  uploadDate: z.string().datetime(),
  bloodSugarHbA1c: z.number().min(3).max(18).optional(),
  totalCholesterol: z.number().min(80).max(500).optional(),
  hdlCholesterol: z.number().min(10).max(120).optional(),
  ldlCholesterol: z.number().min(30).max(300).optional(),
  triglycerides: z.number().min(30).max(1000).optional(),
  vitaminD3: z.number().min(5).max(150).optional(),
  vitaminB12: z.number().min(50).max(2000).optional(),
  thyroidTSH: z.number().min(0.01).max(50).optional(),
  isVerified: z.boolean().default(false),
  verifiedBy: z.string().optional(),
  schemaVersion: z.string().default("2.0"),
});

// V2 Recommendations Schema (Diet, Exercise, Action plan)
export const RecommendationV2Schema = z.object({
  assessmentId: z.string(),
  riskCategory: z.enum(["low", "moderate", "high"]),
  diseaseSpecificRisks: z.object({
    diabetesRiskPercent: z.number().min(0).max(100),
    heartDiseaseRiskPercent: z.number().min(0).max(100),
    hypertensionRiskPercent: z.number().min(0).max(100),
  }),
  dietPlanRegional: z.object({
    cuisinePreference: z.string(),
    dailyMeals: z.array(z.string()),
    keyExclusions: z.array(z.string()),
  }),
  fitnessRoutine: z.object({
    exercises: z.array(z.string()),
    frequencyWeekly: z.number().min(1).max(7),
    durationMinutesPerSession: z.number().min(10).max(180),
  }),
  clinicalReferralNeeded: z.boolean().default(false),
  physicianGuidanceNotes: z.string().max(2000).default(""),
  schemaVersion: z.string().default("2.0"),
});

// V2 Regional Context Schema
export const RegionalContextV2Schema = z.object({
  language: z.enum(["en", "hi", "gu"]),
  preferredDietaryType: z.enum(["vegetarian", "non-vegetarian", "vegan"]),
  stateOrRegionCode: z.string().max(10).default("IN"),
  customRegionalRules: z.array(z.string()).default([]),
  schemaVersion: z.string().default("2.0"),
});

export type HealthAssessmentV2 = z.infer<typeof HealthAssessmentV2Schema>;
export type LabReportV2 = z.infer<typeof LabReportV2Schema>;
export type RecommendationV2 = z.infer<typeof RecommendationV2Schema>;
export type RegionalContextV2 = z.infer<typeof RegionalContextV2Schema>;

// Shared V2 Zod contracts and validators

export const LabObservationSchema = z.object({
  code: z.string().min(1),
  value: z
    .number()
    .finite()
    .refine((val) => val >= 0, { message: "Biomarker values must be positive" }),
  unit: z.string().min(1),
  observedAt: z.string().datetime(),
  isVerified: z.boolean().default(false),
  verifiedBy: z.string().optional(),
  source: z.enum(["ocr", "manual", "report", "unknown"]).optional(),
  userConfirmed: z.boolean().optional(),
  unitConfirmed: z.boolean().optional(),
  verifiedByClinician: z.boolean().optional(),
  extractionConfidence: z.number().min(0).max(1).optional(),
  verificationStatus: z.enum(["unreviewed", "user-confirmed", "clinician-verified"]).optional(),
}).transform((observation) => {
  const code = observation.code.toLowerCase().replace(/[\s-]+/g, "_");
  const ranges: Record<string, [number, number]> = {
    fbs: [50, 400], fasting_glucose: [50, 400], fasting_blood_sugar: [50, 400],
    hba1c: [3, 18], hb_a1c: [3, 18], a1c: [3, 18],
  };
  const range = ranges[code];
  const plausibleRangePassed = range
    ? observation.value >= range[0] && observation.value <= range[1]
    : Number.isFinite(observation.value) && observation.value >= 0;
  const userConfirmed = observation.userConfirmed ?? observation.isVerified;
  const verifiedByClinician = observation.verifiedByClinician === true;
  return {
    ...observation,
    source: observation.source ?? "unknown" as const,
    plausibleRangePassed,
    userConfirmed,
    unitConfirmed: observation.unitConfirmed ?? false,
    verifiedByClinician,
    verificationStatus: verifiedByClinician
      ? "clinician-verified" as const
      : userConfirmed
        ? "user-confirmed" as const
        : "unreviewed" as const,
  };
});

export const RiskContributorSchema = z.object({
  factorId: z.string(),
  name: z.string(),
  impactValue: z.number(),
  description: z.string(),
});

export const TestRecommendationSchema = z.object({
  testCode: z.string(),
  testName: z.string(),
  priority: z.enum(["routine", "urgent", "critical"]),
  rationale: z.string(),
});

export const SafetyFlagSchema = z.object({
  flagType: z.enum(["red-flag", "contraindication", "data-anomaly"]),
  moduleId: z.string(),
  message: z.string(),
  clinicalActionRequired: z.boolean().default(false),
});

export const HealthModuleResultSchema = z.object({
  moduleId: z.string(),
  moduleVersion: z.string(),
  resultType: z.enum([
    "screening-signal",
    "measured-status",
    "lab-pattern",
    "screening-awareness",
    "context-only",
    // Retain backward-compatible parsing:
    "risk-score",
    "risk-tier",
    "screening-eligibility",
    "referral-priority",
  ]),
  status: z.enum([
    "completed",
    "insufficient-information",
    "outside-intended-population",
    "conflicting-evidence",
    "measurement-requires-verification",
    "model-unavailable",
    "failed",
    // Retain backward-compatible parsing:
    "insufficient-data",
    "unavailable",
  ]),
  score: z.number().min(0).max(100).optional(),
  riskTier: z.enum(["lower", "moderate", "elevated"]).optional(),
  screeningSignal: z.enum([
    "elevated-screening-signal",
    "below-screening-threshold",
  ]).optional(),
  evidenceCompleteness: z.number().min(0).max(1),
  confidenceLevel: z.enum([
    "insufficient",
    "preliminary",
    "moderately-supported",
    "strongly-supported",
  ]),
  topContributors: z.array(RiskContributorSchema),
  protectiveFactors: z.array(RiskContributorSchema),
  missingInputs: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  recommendedTests: z.array(TestRecommendationSchema),
  safetyFlags: z.array(SafetyFlagSchema),
  experimentalModelUsed: z.boolean().optional(),

  // New V2 fields:
  source: z.enum(["research-model", "clinical-rule", "verified-lab", "regional-dataset"]).optional(),
  evidenceSupport: z.enum(["insufficient", "preliminary", "supported"]).optional(),
  reasonCodes: z.array(z.string()).optional(),
  usedEvidence: z.array(z.string()).optional(),
  missingEvidence: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
});

export const RegionalContextSchema = z.object({
  language: z.enum(["en", "hi", "gu"]),
  preferredDietaryType: z.enum(["vegetarian", "non-vegetarian", "vegan"]),
  stateOrRegionCode: z.string().max(10).default("IN"),
  customRegionalRules: z.array(z.string()).default([]),
  schemaVersion: z.string().default("2.0.0"),
});

export const HealthContextSchema = z.object({
  userId: z.string(),
  assessment: z.object({
    age: z.number().min(1).max(120),
    gender: z.enum(["male", "female", "other"]),
    heightCm: z.number().min(50).max(260),
    weightKg: z.number().min(10).max(400),
    smoking: z.enum(["never", "former", "current"]),
    exercise: z.enum(["none", "light", "moderate", "active"]),
    familyHistory: z.string().max(500).default(""),
    symptoms: z.string().max(1000).default(""),
    alcohol: z.enum(["never", "occasional", "heavy"]).default("never"),
    sleepHours: z.number().min(2).max(18).default(7),
    systolicBP: z.number().min(70).max(220).optional(),
    diastolicBP: z.number().min(40).max(130).optional(),
    heartRate: z.number().min(30).max(200).optional(),
    fastingBloodSugar: z.number().min(50).max(400).optional(),
    schemaVersion: z.string().default("2.0.0"),
  }),
  labObservations: z.array(LabObservationSchema).default([]),
  regionalContext: RegionalContextSchema,
  schemaVersion: z.string().default("2.0.0"),
});

export const ModelArtifactManifestSchema = z.object({
  modelId: z.string(),
  modelVersion: z.string(),
  lifecycleStatus: z.enum(["RESEARCH_ONLY", "VALIDATION_CANDIDATE", "APPROVED_PRODUCTION", "RETIRED"]),
  datasetId: z.string(),
  datasetFingerprint: z.string(),
  targetDefinition: z.string(),
  featureList: z.array(z.string()),
  forbiddenFeatureList: z.array(z.string()),
  trainingTimestamp: z.string().datetime(),
  evaluationDesign: z.string(),
  limitations: z.array(z.string()),
  artifactChecksum: z.string(),
});

export type LabObservation = z.infer<typeof LabObservationSchema>;
export type RiskContributor = z.infer<typeof RiskContributorSchema>;
export type TestRecommendation = z.infer<typeof TestRecommendationSchema>;
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;
export type HealthModuleResult = z.infer<typeof HealthModuleResultSchema>;
export type RegionalContext = z.infer<typeof RegionalContextSchema>;
export type HealthContext = z.infer<typeof HealthContextSchema>;
export type ModelArtifactManifest = z.infer<typeof ModelArtifactManifestSchema>;
