import { RiskService, type UserProfile } from "./risk.service.js";

export interface SimulationModifications {
  weightKg?: number;
  exercise?: "none" | "light" | "moderate" | "active";
  smoking?: "never" | "former" | "current";
  alcohol?: string;
  sleepHours?: number;
}

export interface DiseaseComparison {
  current: number;
  projected: number;
}

export interface SimulationImpact {
  factor: string;
  contribution: number;
}

export interface SimulationResult {
  currentRisk: number;
  projectedRisk: number;
  reductionPercentage: number;
  estimatedHealthGain: "None" | "Mild" | "Moderate" | "Significant";
  comparison: {
    diabetes: DiseaseComparison;
    heart: DiseaseComparison;
    hypertension: DiseaseComparison;
  };
  impactAnalysis: SimulationImpact[];
}

export class SimulationService {
  /**
   * Run a temporary What-If simulation by applying modifications to a profile clone
   */
  static runSimulation(
    originalProfile: UserProfile,
    modifications: SimulationModifications,
  ): SimulationResult {
    // 1. Calculate baseline risks using current profile
    const baselineBmiAnalysis = RiskService.calculateBMI(
      originalProfile.heightCm,
      originalProfile.weightKg,
    );
    const baselineDiabetes = RiskService.calculateDiabetesRisk(
      originalProfile,
      baselineBmiAnalysis.bmi,
    ).risk;
    const baselineHeart = RiskService.calculateHeartRisk(
      originalProfile,
      baselineBmiAnalysis.bmi,
    ).risk;
    const baselineHypertension = RiskService.calculateHypertensionRisk(
      originalProfile,
      baselineBmiAnalysis.bmi,
    ).risk;
    const currentRisk = Math.round((baselineDiabetes + baselineHeart + baselineHypertension) / 3);

    // 2. Clone profile and apply modifications
    const simulatedProfile: UserProfile = {
      ...originalProfile,
    };

    if (modifications.weightKg !== undefined && modifications.weightKg > 0) {
      simulatedProfile.weightKg = modifications.weightKg;
    }
    if (modifications.exercise !== undefined) {
      simulatedProfile.exercise = modifications.exercise;
    }
    if (modifications.smoking !== undefined) {
      simulatedProfile.smoking = modifications.smoking;
    }
    if (modifications.alcohol !== undefined) {
      simulatedProfile.alcohol = modifications.alcohol;
    }

    // 3. Run Risk calculations on fully modified profile
    const simulatedBmiAnalysis = RiskService.calculateBMI(
      simulatedProfile.heightCm,
      simulatedProfile.weightKg,
    );
    let projectedDiabetes = RiskService.calculateDiabetesRisk(
      simulatedProfile,
      simulatedBmiAnalysis.bmi,
    ).risk;
    let projectedHeart = RiskService.calculateHeartRisk(
      simulatedProfile,
      simulatedBmiAnalysis.bmi,
    ).risk;
    let projectedHypertension = RiskService.calculateHypertensionRisk(
      simulatedProfile,
      simulatedBmiAnalysis.bmi,
    ).risk;

    // 4. Incorporate Sleep Hours simulation (if provided)
    // Baseline sleep is assumed to be 8 hours.
    // Sleep < 6 results in autonomic strain: +5% to diabetes, +7% to hypertension, +5% to heart
    if (modifications.sleepHours !== undefined) {
      if (modifications.sleepHours < 6) {
        projectedDiabetes = Math.min(100, projectedDiabetes + 5);
        projectedHeart = Math.min(100, projectedHeart + 5);
        projectedHypertension = Math.min(100, projectedHypertension + 7);
      }
    }

    const projectedRisk = Math.round(
      (projectedDiabetes + projectedHeart + projectedHypertension) / 3,
    );

    // 5. Calculate absolute and relative drops
    const absoluteDelta = currentRisk - projectedRisk;
    let reductionPercentage = 0;
    if (currentRisk > 0 && absoluteDelta > 0) {
      reductionPercentage = Number(((absoluteDelta / currentRisk) * 100).toFixed(1));
    }

    let estimatedHealthGain: "None" | "Mild" | "Moderate" | "Significant" = "None";
    if (absoluteDelta >= 15) {
      estimatedHealthGain = "Significant";
    } else if (absoluteDelta >= 7) {
      estimatedHealthGain = "Moderate";
    } else if (absoluteDelta >= 1) {
      estimatedHealthGain = "Mild";
    }

    // 6. Impact Analysis (Single-Variable Isolation Runs)
    const impactAnalysis: SimulationImpact[] = [];

    // Helper to run pipeline with a single change
    const runSingleMod = (mod: SimulationModifications): number => {
      const p = { ...originalProfile };
      if (mod.weightKg !== undefined) p.weightKg = mod.weightKg;
      if (mod.exercise !== undefined) p.exercise = mod.exercise;
      if (mod.smoking !== undefined) p.smoking = mod.smoking;
      if (mod.alcohol !== undefined) p.alcohol = mod.alcohol;

      const b = RiskService.calculateBMI(p.heightCm, p.weightKg).bmi;
      let d = RiskService.calculateDiabetesRisk(p, b).risk;
      let h = RiskService.calculateHeartRisk(p, b).risk;
      let ht = RiskService.calculateHypertensionRisk(p, b).risk;

      if (mod.sleepHours !== undefined && mod.sleepHours < 6) {
        d = Math.min(100, d + 5);
        h = Math.min(100, h + 5);
        ht = Math.min(100, ht + 7);
      }
      return Math.round((d + h + ht) / 3);
    };

    // Weight Impact
    if (
      modifications.weightKg !== undefined &&
      modifications.weightKg !== originalProfile.weightKg
    ) {
      const drop = runSingleMod({ weightKg: modifications.weightKg }) - currentRisk;
      if (drop !== 0) {
        const factor =
          modifications.weightKg < originalProfile.weightKg ? "Weight Reduction" : "Weight Gain";
        impactAnalysis.push({ factor, contribution: drop });
      }
    }

    // Exercise Impact
    if (
      modifications.exercise !== undefined &&
      modifications.exercise !== originalProfile.exercise
    ) {
      const drop = runSingleMod({ exercise: modifications.exercise }) - currentRisk;
      if (drop !== 0) {
        const factor =
          (originalProfile.exercise === "none" || originalProfile.exercise === "light") &&
          (modifications.exercise === "moderate" || modifications.exercise === "active")
            ? "Exercise Increase"
            : "Exercise Reduction";
        impactAnalysis.push({ factor, contribution: drop });
      }
    }

    // Smoking Impact
    if (modifications.smoking !== undefined && modifications.smoking !== originalProfile.smoking) {
      const drop = runSingleMod({ smoking: modifications.smoking }) - currentRisk;
      if (drop !== 0) {
        const factor =
          originalProfile.smoking === "current" && modifications.smoking === "never"
            ? "Smoking Cessation"
            : "Smoking Status Change";
        impactAnalysis.push({ factor, contribution: drop });
      }
    }

    // Alcohol Impact
    if (modifications.alcohol !== undefined && modifications.alcohol !== originalProfile.alcohol) {
      const drop = runSingleMod({ alcohol: modifications.alcohol }) - currentRisk;
      if (drop !== 0) {
        const factor = "Alcohol Habit Modification";
        impactAnalysis.push({ factor, contribution: drop });
      }
    }

    // Sleep Impact
    if (modifications.sleepHours !== undefined) {
      const drop = runSingleMod({ sleepHours: modifications.sleepHours }) - currentRisk;
      if (drop !== 0) {
        const factor =
          modifications.sleepHours < 6 ? "Insufficient Sleep Penalty" : "Optimized Sleep Duration";
        impactAnalysis.push({ factor, contribution: drop });
      }
    }

    // Sort by largest reduction (most negative contribution)
    impactAnalysis.sort((a, b) => a.contribution - b.contribution);

    return {
      currentRisk,
      projectedRisk,
      reductionPercentage,
      estimatedHealthGain,
      comparison: {
        diabetes: { current: baselineDiabetes, projected: projectedDiabetes },
        heart: { current: baselineHeart, projected: projectedHeart },
        hypertension: { current: baselineHypertension, projected: projectedHypertension },
      },
      impactAnalysis,
    };
  }
}
