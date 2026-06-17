export interface ProgressLog {
  userId: string;
  weight: number;
  bmi: number;
  diabetesRisk: number;
  heartRisk: number;
  hypertensionRisk: number;
  overallRisk: number;
  smoking: "never" | "former" | "current";
  exercise: "none" | "light" | "moderate" | "active";
  createdAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  type: "weight" | "risk" | "activity" | "smoking";
  createdAt: string;
}

const EXERCISE_SCORE = {
  none: 0,
  light: 1,
  moderate: 2,
  active: 3,
};

const EXERCISE_LABELS = {
  none: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
};

export class ProgressService {
  /**
   * Automatically detect milestones from historical logs sorted chronologically
   */
  static getMilestones(logs: ProgressLog[]): Milestone[] {
    const milestones: Milestone[] = [];
    if (logs.length < 2) {
      return milestones;
    }

    const baseline = logs[0];
    const latest = logs[logs.length - 1];

    // 1. Weight Loss Milestones (> 5kg)
    const weightChange = baseline.weight - latest.weight;
    if (weightChange >= 5) {
      milestones.push({
        id: `weight_loss_${latest.createdAt}`,
        title: `Lost ${weightChange.toFixed(1)}kg`,
        description: `🎉 Lost ${weightChange.toFixed(1)}kg Since First Assessment`,
        type: "weight",
        createdAt: latest.createdAt,
      });
    } else if (weightChange > 0 && weightChange < 5) {
      // Minor weight loss milestone for extra engagement
      milestones.push({
        id: `weight_loss_minor_${latest.createdAt}`,
        title: `Weight Reduced by ${weightChange.toFixed(1)}kg`,
        description: `👍 Lost ${weightChange.toFixed(1)}kg from baseline weight of ${baseline.weight}kg.`,
        type: "weight",
        createdAt: latest.createdAt,
      });
    }

    // 2. Risk Reduction Milestones (> 10% or >= 10 risk score points absolute reduction)
    // Check Diabetes Risk
    const diabetesChange = baseline.diabetesRisk - latest.diabetesRisk;
    if (diabetesChange >= 10) {
      milestones.push({
        id: `risk_reduction_diabetes_${latest.createdAt}`,
        title: `Diabetes Risk Reduced`,
        description: `🎉 Diabetes Risk Reduced By ${diabetesChange}%`,
        type: "risk",
        createdAt: latest.createdAt,
      });
    }

    // Check Heart/CVD Risk
    const heartChange = baseline.heartRisk - latest.heartRisk;
    if (heartChange >= 10) {
      milestones.push({
        id: `risk_reduction_heart_${latest.createdAt}`,
        title: `Heart Disease Risk Reduced`,
        description: `🎉 Cardiovascular Risk Reduced By ${heartChange}%`,
        type: "risk",
        createdAt: latest.createdAt,
      });
    }

    // Check Hypertension Risk
    const hyperChange = baseline.hypertensionRisk - latest.hypertensionRisk;
    if (hyperChange >= 10) {
      milestones.push({
        id: `risk_reduction_hyper_${latest.createdAt}`,
        title: `Hypertension Risk Reduced`,
        description: `🎉 Hypertension Risk Reduced By ${hyperChange}%`,
        type: "risk",
        createdAt: latest.createdAt,
      });
    }

    // Check Overall Risk
    const overallChange = baseline.overallRisk - latest.overallRisk;
    if (overallChange >= 10) {
      milestones.push({
        id: `risk_reduction_overall_${latest.createdAt}`,
        title: `Overall Health Score Improved`,
        description: `🎉 Overall Risk Reduced By ${overallChange}%`,
        type: "risk",
        createdAt: latest.createdAt,
      });
    }

    // 3. Activity Level Improved
    const baseAct = EXERCISE_SCORE[baseline.exercise] ?? 0;
    const latAct = EXERCISE_SCORE[latest.exercise] ?? 0;
    if (latAct > baseAct) {
      milestones.push({
        id: `activity_improved_${latest.createdAt}`,
        title: `Improved Activity Level`,
        description: `🎉 Exercise upgraded from ${EXERCISE_LABELS[baseline.exercise]} to ${EXERCISE_LABELS[latest.exercise]}!`,
        type: "activity",
        createdAt: latest.createdAt,
      });
    }

    // 4. Smoking Status Improved
    if (
      baseline.smoking === "current" &&
      (latest.smoking === "former" || latest.smoking === "never")
    ) {
      milestones.push({
        id: `smoking_status_${latest.createdAt}`,
        title: `Quit Smoking Progress`,
        description: `🎉 Successfully moved away from active smoking. Great lifestyle improvement!`,
        type: "smoking",
        createdAt: latest.createdAt,
      });
    }

    // Sort milestones by date descending
    return milestones.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
