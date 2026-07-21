export type RecommendationTimeline = "Today" | "This Week" | "This Month";

export interface ExplainedRecommendation {
  id: string;
  action: string;             // 1. What should the user do?
  why: string;                // 2. Why is it recommended?
  evidence: string[];         // 3. Which evidence triggered it? (Grounded in actual user data)
  expectedBenefit: string;    // 4. Expected benefit
  timeline: RecommendationTimeline; // 5. Timeline ("Today", "This Week", "This Month")
}

export interface ExplanationEngineInput {
  age?: number;
  gender?: string;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  exercise?: string; // "none" | "light" | "moderate" | "active"
  workoutDaysPerWeek?: number;
  smoking?: string;
  alcohol?: string;
  familyHistory?: string;
  symptoms?: string;
  systolic?: number;
  diastolic?: number;
  labObservations?: Array<{ code: string; value: number; unit?: string }>;
  fastingBloodSugar?: number;
  hba1c?: number;
  totalCholesterol?: number;
  ldl?: number;
  diabetesRiskCategory?: "low" | "moderate" | "high";
  hypertensionRiskCategory?: "low" | "moderate" | "high";
  missingEvidence?: string[];
  [key: string]: any;
}

const TIMELINE_WEIGHT: Record<RecommendationTimeline, number> = {
  Today: 3,
  "This Week": 2,
  "This Month": 1,
};

/**
 * Derives Grounded Recommendation Explanations.
 * Strictly enforces Top 3 Priorities Gating and 5 Mandatory Explanation Fields.
 */
export function generateExplainedRecommendations(input: ExplanationEngineInput): ExplainedRecommendation[] {
  const candidates: ExplainedRecommendation[] = [];
  const p = input || {};

  // Compute BMI if missing
  let bmi = p.bmi;
  if (!bmi && typeof p.heightCm === "number" && p.heightCm > 0 && typeof p.weightKg === "number" && p.weightKg > 0) {
    bmi = Number((p.weightKg / Math.pow(p.heightCm / 100, 2)).toFixed(1));
  }

  const labs = p.labObservations || [];
  const fastingGlucose = p.fastingBloodSugar ?? labs.find((l) => l.code === "fastingBloodSugar")?.value;
  const hba1cVal = p.hba1c ?? labs.find((l) => l.code === "HbA1c")?.value;
  const isDiabeticRisk =
    p.diabetesRiskCategory === "high" ||
    p.diabetesRiskCategory === "moderate" ||
    (typeof fastingGlucose === "number" && fastingGlucose >= 100) ||
    (typeof hba1cVal === "number" && hba1cVal >= 5.7);

  const isHypertensiveRisk =
    p.hypertensionRiskCategory === "high" ||
    p.hypertensionRiskCategory === "moderate" ||
    (typeof p.systolic === "number" && p.systolic >= 130) ||
    (typeof p.diastolic === "number" && p.diastolic >= 85);

  const isSedentary = p.exercise === "none" || p.workoutDaysPerWeek === 0;

  // ─────────────────────────────────────────────────────────────
  // Rule 1: Physical Activity (Walk 20 minutes)
  // Triggered when sedentary or low physical activity
  // ─────────────────────────────────────────────────────────────
  if (isSedentary || p.exercise === "light") {
    const evidenceList: string[] = [];
    if (isSedentary) evidenceList.push("Sedentary lifestyle.");
    else evidenceList.push("Light physical activity level.");

    if (isDiabeticRisk) evidenceList.push("Diabetes screening risk.");

    candidates.push({
      id: "walk-20-min",
      action: "Walk 20 minutes",
      why: "Low physical activity.",
      evidence: evidenceList,
      expectedBenefit: isDiabeticRisk ? "Improves diabetes screening." : "Establishes baseline cardiovascular fitness.",
      timeline: "Today",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 2: Salt / Sodium Reduction (Reduce salt)
  // Triggered when hypertension screening or elevated BP is present
  // ─────────────────────────────────────────────────────────────
  if (isHypertensiveRisk) {
    const evidenceList: string[] = [];
    if (typeof p.systolic === "number" && typeof p.diastolic === "number") {
      evidenceList.push(`Blood pressure ${p.systolic}/${p.diastolic} mmHg evidence.`);
    } else {
      evidenceList.push("Blood pressure evidence.");
    }

    if (p.hypertensionRiskCategory) {
      evidenceList.push(`${p.hypertensionRiskCategory} hypertension screening.`);
    }

    candidates.push({
      id: "reduce-salt",
      action: "Reduce salt",
      why: "Elevated hypertension screening.",
      evidence: evidenceList,
      expectedBenefit: "Supports blood pressure management.",
      timeline: "This Week",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 3: Glycemic Control (Switch to low-glycemic fiber meals)
  // Triggered when glucose or prediabetes screening is elevated
  // ─────────────────────────────────────────────────────────────
  if (isDiabeticRisk) {
    const evidenceList: string[] = [];
    if (fastingGlucose) evidenceList.push(`Fasting blood sugar ${fastingGlucose} mg/dL.`);
    if (hba1cVal) evidenceList.push(`HbA1c ${hba1cVal}%.`);
    if (p.diabetesRiskCategory) evidenceList.push(`${p.diabetesRiskCategory} diabetes screening.`);

    candidates.push({
      id: "low-glycemic-meals",
      action: "Switch to low-glycemic fiber meals",
      why: "Elevated diabetes risk or glucose screening markers.",
      evidence: evidenceList,
      expectedBenefit: "Moderates glucose spikes and enhances insulin sensitivity.",
      timeline: "Today",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 4: Tobacco Cessation (Stop tobacco smoking)
  // Triggered ONLY if current smoker
  // ─────────────────────────────────────────────────────────────
  if (p.smoking === "current") {
    candidates.push({
      id: "stop-smoking",
      action: "Stop tobacco smoking",
      why: "Current tobacco use elevates vascular and cardiac risk.",
      evidence: ["Current smoker status."],
      expectedBenefit: "Reduces arterial stiffness and cardiac event risk.",
      timeline: "Today",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 5: Weight Optimization (Follow a structured caloric deficit)
  // Triggered ONLY if BMI >= 25
  // ─────────────────────────────────────────────────────────────
  if (bmi && bmi >= 25) {
    const isObese = bmi >= 30;
    candidates.push({
      id: "calorie-deficit",
      action: "Follow a structured caloric deficit",
      why: "BMI in overweight or obesity range.",
      evidence: [`BMI ${bmi} (${isObese ? "Class I/II Obesity" : "Overweight"}).`],
      expectedBenefit: "Reduces systemic arterial strain and insulin resistance.",
      timeline: "This Month",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 6: Alcohol Moderation (Limit alcohol consumption)
  // Triggered ONLY if regular or heavy drinker
  // ─────────────────────────────────────────────────────────────
  if (p.alcohol === "regular" || p.alcohol === "heavy") {
    candidates.push({
      id: "moderate-alcohol",
      action: "Limit alcohol consumption",
      why: "Regular alcohol consumption contributes to BP fluctuations.",
      evidence: [`${p.alcohol} alcohol consumption.`],
      expectedBenefit: "Lowers blood pressure variability.",
      timeline: "This Week",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 7: Symptom Clinical Review
  // Triggered ONLY if symptoms reported
  // ─────────────────────────────────────────────────────────────
  if (p.symptoms && typeof p.symptoms === "string" && p.symptoms.trim().length > 0) {
    candidates.push({
      id: "symptom-review",
      action: "Consult a physician for reported symptoms",
      why: "Reported symptoms require clinical evaluation.",
      evidence: [`Reported symptoms: ${p.symptoms}.`],
      expectedBenefit: "Evaluates underlying physiological triggers.",
      timeline: "Today",
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 8: Complete Missing Evidence
  // Triggered ONLY if missing evidence exists
  // ─────────────────────────────────────────────────────────────
  const missing = p.missingEvidence || [];
  const needsBp = !p.systolic && !p.diastolic;
  if (missing.length > 0 || needsBp) {
    const evidenceList: string[] = [];
    if (needsBp) evidenceList.push("Missing blood pressure reading.");
    missing.forEach((item) => {
      if (!evidenceList.includes(item)) evidenceList.push(item);
    });

    candidates.push({
      id: "complete-missing-evidence",
      action: "Record missing blood pressure and lab readings",
      why: "Incomplete physiological profile reduces assessment confidence.",
      evidence: evidenceList,
      expectedBenefit: "Increases clinical evidence confidence.",
      timeline: "This Week",
    });
  }

  // Sort candidates by timeline urgency: Today (3) > This Week (2) > This Month (1)
  candidates.sort((a, b) => TIMELINE_WEIGHT[b.timeline] - TIMELINE_WEIGHT[a.timeline]);

  // TOP 3 PRIORITIES GATING (Strict Constraint)
  return candidates.slice(0, 3);
}
