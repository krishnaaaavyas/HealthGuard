import { RiskService, type UserProfile } from "./risk.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Action Templates
// ─────────────────────────────────────────────────────────────────────────────

interface ActionModifications {
  weightDelta?: number;
  exercise?: UserProfile["exercise"];
  smoking?: UserProfile["smoking"];
  alcohol?: string;
  sleepHours?: number;
  symptoms?: string;
}

interface ActionTemplate {
  id: string;
  title: string;
  category: string;
  icon: string;
  modifications: ActionModifications;
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: "exercise_30_min",
    title: "Exercise 30 min/day",
    category: "activity",
    icon: "🏃",
    modifications: { exercise: "moderate" },
  },
  {
    id: "lose_5kg",
    title: "Lose 5 kg",
    category: "weight",
    icon: "⚖️",
    modifications: { weightDelta: -5 },
  },
  {
    id: "improve_sleep",
    title: "Sleep 7–8 hours nightly",
    category: "sleep",
    icon: "😴",
    modifications: { sleepHours: 7.5 },
  },
  {
    id: "quit_smoking",
    title: "Quit smoking",
    category: "tobacco",
    icon: "🚭",
    modifications: { smoking: "never" },
  },
  {
    id: "reduce_alcohol",
    title: "Reduce alcohol intake",
    category: "alcohol",
    icon: "🧃",
    modifications: { alcohol: "never" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Safety / Relevance Filter
// ─────────────────────────────────────────────────────────────────────────────

function isActionApplicable(
  profile: UserProfile & { sleepHours?: number },
  action: ActionTemplate,
): boolean {
  if (action.id === "quit_smoking") {
    // Only suggest if the user currently smokes
    return profile.smoking === "current";
  }

  if (action.id === "improve_sleep") {
    const sleep = profile.sleepHours ?? 0;
    // Skip if they already sleep 7–8 hours
    if (sleep >= 7 && sleep <= 8) return false;
    return true;
  }

  if (action.id === "lose_5kg") {
    const heightM = profile.heightCm / 100;
    const bmi = profile.weightKg / (heightM * heightM);
    // Skip for normal or underweight BMI < 23
    if (bmi < 23) return false;
    return true;
  }

  if (action.id === "exercise_30_min") {
    // Skip if already moderately active or more
    return profile.exercise === "none" || profile.exercise === "light";
  }

  if (action.id === "reduce_alcohol") {
    const alc = (profile.alcohol || "").toLowerCase();
    // Skip if already abstaining
    return !alc.includes("never") && !alc.includes("none") && alc.length > 0;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply a Single Action to a Cloned Profile
// ─────────────────────────────────────────────────────────────────────────────

function applyActionToProfile(
  profile: UserProfile & { sleepHours?: number },
  action: ActionTemplate,
): UserProfile & { sleepHours?: number } {
  // Deep clone — never mutate the original
  const mod = JSON.parse(JSON.stringify(profile)) as UserProfile & { sleepHours?: number };

  const { modifications: m } = action;

  if (typeof m.weightDelta === "number") {
    mod.weightKg = Math.max(35, profile.weightKg + m.weightDelta);
  }
  if (m.exercise !== undefined) {
    mod.exercise = m.exercise;
  }
  if (m.smoking !== undefined) {
    mod.smoking = m.smoking;
  }
  if (m.alcohol !== undefined) {
    mod.alcohol = m.alcohol;
  }
  if (typeof m.sleepHours === "number") {
    mod.sleepHours = m.sleepHours;
  }
  if (m.symptoms !== undefined) {
    mod.symptoms = m.symptoms;
  }

  return mod;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Risk Summary (re-uses RiskService without AI)
// ─────────────────────────────────────────────────────────────────────────────

function quickRisk(profile: UserProfile) {
  const analysis = RiskService.analyze(profile);
  return {
    overall: analysis.overallRisk,
    diabetes: analysis.diabetesRisk.risk,
    heart: analysis.heartRisk.risk,
    hypertension: analysis.hypertensionRisk.risk,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionImpact {
  id: string;
  title: string;
  category: string;
  icon: string;
  currentRisk: number;
  projectedRisk: number;
  absoluteReduction: number;
  relativeReduction: number;
  conditionImpact: {
    diabetes: number;
    heart: number;
    hypertension: number;
  };
}

export function calculateActionImpacts(
  profile: UserProfile & { sleepHours?: number },
): ActionImpact[] {
  const current = quickRisk(profile);

  const applicableActions = ACTION_TEMPLATES.filter((a) => isActionApplicable(profile, a));

  const results: ActionImpact[] = applicableActions.map((action) => {
    const modifiedProfile = applyActionToProfile(profile, action);
    const projected = quickRisk(modifiedProfile);

    const absoluteReduction = Math.round(current.overall - projected.overall);
    const relativeReduction =
      current.overall > 0 ? Math.round((absoluteReduction / current.overall) * 100) : 0;

    return {
      id: action.id,
      title: action.title,
      category: action.category,
      icon: action.icon,
      currentRisk: current.overall,
      projectedRisk: projected.overall,
      absoluteReduction,
      relativeReduction,
      conditionImpact: {
        diabetes: Math.round(current.diabetes - projected.diabetes),
        heart: Math.round(current.heart - projected.heart),
        hypertension: Math.round(current.hypertension - projected.hypertension),
      },
    };
  });

  // Keep only actions that actually help; sort by biggest reduction first
  return results
    .filter((item) => item.absoluteReduction > 0)
    .sort((a, b) => b.absoluteReduction - a.absoluteReduction);
}
