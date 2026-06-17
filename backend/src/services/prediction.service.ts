import { RiskService, type UserProfile } from "./risk.service.js";
import { projectionRules } from "../config/projectionRules.js";

export interface ForecastInterval {
  risk: number;
  confidence: "Low" | "Moderate" | "High";
  projectedWeightKg?: number;
  projectedExercise?: string;
  projectedSmoking?: string;
}

export interface PredictionForecastResult {
  currentRisk: number;
  days30: ForecastInterval;
  days90: ForecastInterval;
  days180: ForecastInterval;
}

export class PredictionService {
  /**
   * Run risk projection pipeline based on selected user actions.
   */
  static generateForecast(
    profile: UserProfile,
    selectedActions: string[],
    progressLogsCount: number = 0,
  ): PredictionForecastResult {
    // 1. Calculate current base risk
    const currentAnalysis = RiskService.analyze(profile);
    const currentRisk = currentAnalysis.overallRisk;

    // 2. Clone profile for each target duration
    const profile30 = { ...profile };
    const profile90 = { ...profile };
    const profile180 = { ...profile };

    // 3. Assess assumptions to apply
    let hasExercise = false;
    let hasSmoking = false;
    let hasAlcohol = false;
    let hasWeightLoss = false;

    selectedActions.forEach((act) => {
      const lower = act.toLowerCase();
      if (lower.includes("exercise") || lower.includes("activity") || lower.includes("workout")) {
        hasExercise = true;
      }
      if (lower.includes("smoke") || lower.includes("quitting") || lower.includes("tobacco")) {
        hasSmoking = true;
      }
      if (lower.includes("alcohol") || lower.includes("limit alcohol") || lower.includes("drink")) {
        hasAlcohol = true;
      }
      if (
        lower.includes("lose") ||
        lower.includes("weight") ||
        lower.includes("bmi") ||
        lower.includes("kilograms") ||
        lower.includes("kg")
      ) {
        hasWeightLoss = true;
      }
    });

    // Apply exercise assumptions
    if (hasExercise) {
      profile30.exercise = projectionRules.exercise_30_min.days30.exercise;
      profile90.exercise = projectionRules.exercise_30_min.days90.exercise;
      profile180.exercise = projectionRules.exercise_30_min.days180.exercise;
    }

    // Apply smoking assumptions
    if (hasSmoking) {
      profile30.smoking = projectionRules.quit_smoking.days30.smoking;
      profile90.smoking = projectionRules.quit_smoking.days90.smoking;
      profile180.smoking = projectionRules.quit_smoking.days180.smoking;
    }

    // Apply alcohol assumptions
    if (hasAlcohol) {
      profile30.alcohol = projectionRules.limit_alcohol.days30.alcohol;
      profile90.alcohol = projectionRules.limit_alcohol.days90.alcohol;
      profile180.alcohol = projectionRules.limit_alcohol.days180.alcohol;
    }

    // Apply weight loss assumptions
    if (hasWeightLoss) {
      const heightCm = profile.heightCm || 170;
      const currentBmi = profile.weightKg / Math.pow(heightCm / 100, 2);
      if (currentBmi >= 25) {
        // Normal BMI target weight (BMI 23)
        const targetWeight = Math.round(23 * Math.pow(heightCm / 100, 2));
        const kgsToLose = Math.max(0, profile.weightKg - targetWeight);

        if (kgsToLose > 0) {
          const lose30 = Math.min(kgsToLose, Math.max(1, Math.round(kgsToLose * 0.2)));
          const lose90 = Math.min(kgsToLose, Math.max(2, Math.round(kgsToLose * 0.6)));

          profile30.weightKg = Math.round(profile.weightKg - lose30);
          profile90.weightKg = Math.round(profile.weightKg - lose90);
          profile180.weightKg = targetWeight;
        }
      }
    }

    // 4. Recalculate risks using RiskEngine
    const analysis30 = RiskService.analyze(profile30);
    const analysis90 = RiskService.analyze(profile90);
    const analysis180 = RiskService.analyze(profile180);

    // 5. Determine confidence levels
    // Confidence is higher when there is more progress history and fewer heavy assumptions
    const numAssumptions =
      (hasExercise ? 1 : 0) + (hasSmoking ? 1 : 0) + (hasAlcohol ? 1 : 0) + (hasWeightLoss ? 1 : 0);

    const calculateConfidence = (daysAhead: number): "Low" | "Moderate" | "High" => {
      let score = 0;

      // Data quality
      if (profile.familyHistory && profile.familyHistory.length > 5) score += 1;
      if (profile.symptoms && profile.symptoms.length > 5) score += 1;

      // Logs count
      if (progressLogsCount >= 3) score += 2;
      else if (progressLogsCount >= 1) score += 1;

      // Deduct for too many speculative assumptions
      if (numAssumptions > 2) score -= 1;

      // Time horizon decay
      if (daysAhead === 90) score -= 0.5;
      if (daysAhead === 180) score -= 1.5;

      if (score >= 2.5) return "High";
      if (score >= 0.5) return "Moderate";
      return "Low";
    };

    return {
      currentRisk,
      days30: {
        risk: analysis30.overallRisk,
        confidence: calculateConfidence(30),
        projectedWeightKg: profile30.weightKg,
        projectedExercise: profile30.exercise,
        projectedSmoking: profile30.smoking,
      },
      days90: {
        risk: analysis90.overallRisk,
        confidence: calculateConfidence(90),
        projectedWeightKg: profile90.weightKg,
        projectedExercise: profile90.exercise,
        projectedSmoking: profile90.smoking,
      },
      days180: {
        risk: analysis180.overallRisk,
        confidence: calculateConfidence(180),
        projectedWeightKg: profile180.weightKg,
        projectedExercise: profile180.exercise,
        projectedSmoking: profile180.smoking,
      },
    };
  }
}
