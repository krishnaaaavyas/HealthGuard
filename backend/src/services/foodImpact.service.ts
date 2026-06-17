import { foodRules } from "../config/foodRules.js";
import { type UserProfile } from "./risk.service.js";

export interface FoodImpactResult {
  foodScore: number;
  personalizedScore: number;
  riskLevel: "Low" | "Moderate" | "High";
  diabetesImpact: number;
  hypertensionImpact: number;
  heartImpact: number;
  alternatives: string[];
  conflict: {
    conflicts: boolean;
    message: string;
  };
}

export class FoodImpactService {
  /**
   * Helper to normalize ingredients text into clean tokens
   */
  static cleanIngredients(ingredients: string[]): string[] {
    return ingredients.map((ing) => ing.toLowerCase().trim());
  }

  /**
   * Sum up raw condition impacts based on ingredients matches
   */
  static calculateFoodImpact(ingredients: string[]): {
    diabetesImpact: number;
    hypertensionImpact: number;
    heartImpact: number;
  } {
    let diabetesImpact = 0;
    let hypertensionImpact = 0;
    let heartImpact = 0;

    const cleaned = this.cleanIngredients(ingredients);

    cleaned.forEach((ing) => {
      // Find rules that match or are part of this ingredient
      Object.keys(foodRules).forEach((ruleKey) => {
        if (ing.includes(ruleKey) || ruleKey.includes(ing)) {
          const rule = foodRules[ruleKey];
          diabetesImpact += rule.diabetesImpact;
          hypertensionImpact += rule.hypertensionImpact;
          heartImpact += rule.heartImpact;
        }
      });
    });

    return {
      diabetesImpact,
      hypertensionImpact,
      heartImpact,
    };
  }

  /**
   * Calculate overall food score and deduct personalized score based on user risk
   */
  static calculatePersonalizedScores(
    foodImpact: { diabetesImpact: number; hypertensionImpact: number; heartImpact: number },
    risks: { diabetes: number; heart: number; hypertension: number },
  ): { foodScore: number; personalizedScore: number; riskLevel: "Low" | "Moderate" | "High" } {
    const maxImpact = Math.max(
      foodImpact.diabetesImpact,
      foodImpact.hypertensionImpact,
      foodImpact.heartImpact,
    );

    // Base food score deduction
    let foodScore = 10 - Math.min(9, maxImpact / 3);
    foodScore = Math.max(1, Math.min(10, Math.round(foodScore)));

    // Personalized deductions based on user risk profile
    const diabetesRiskFactor = (risks.diabetes || 0) / 100;
    const heartRiskFactor = (risks.heart || 0) / 100;
    const hypertensionRiskFactor = (risks.hypertension || 0) / 100;

    const diabetesDeduction = (foodImpact.diabetesImpact / 10) * diabetesRiskFactor * 3.5;
    const heartDeduction = (foodImpact.heartImpact / 10) * heartRiskFactor * 3.5;
    const hypertensionDeduction =
      (foodImpact.hypertensionImpact / 10) * hypertensionRiskFactor * 3.5;

    let personalizedScore = Math.round(
      foodScore - (diabetesDeduction + heartDeduction + hypertensionDeduction),
    );
    personalizedScore = Math.max(1, Math.min(foodScore, personalizedScore));

    const riskLevel: "Low" | "Moderate" | "High" =
      personalizedScore >= 8 ? "Low" : personalizedScore >= 5 ? "Moderate" : "High";

    return {
      foodScore,
      personalizedScore,
      riskLevel,
    };
  }

  /**
   * Return healthier Indian alternatives based on item name and impacts
   */
  static suggestAlternatives(
    productName: string,
    foodImpact: { diabetesImpact: number; hypertensionImpact: number; heartImpact: number },
  ): string[] {
    const nameLower = productName.toLowerCase();

    // Direct product matches
    if (nameLower.includes("maggi") || nameLower.includes("noodle")) {
      return ["Vegetable Poha", "Roasted Chana", "Oats Upma"];
    }
    if (
      nameLower.includes("coke") ||
      nameLower.includes("cola") ||
      nameLower.includes("soda") ||
      nameLower.includes("pepsi")
    ) {
      return ["Lemon Water (Nimbu Pani)", "Coconut Water", "Buttermilk (Chaas)"];
    }
    if (
      nameLower.includes("chip") ||
      nameLower.includes("kurkure") ||
      nameLower.includes("potato")
    ) {
      return ["Roasted Makhana", "Baked Beetroot Chips", "Unsalted Almonds"];
    }
    if (nameLower.includes("yogurt") || nameLower.includes("dahi")) {
      return ["Plain Homemade Yogurt", "Buttermilk (Chaas)"];
    }
    if (
      nameLower.includes("chana") ||
      nameLower.includes("chickpea") ||
      nameLower.includes("roasted")
    ) {
      return ["Sprouted Moong Salad", "Steamed Dhokla"];
    }

    // Category matches based on highest concern
    const maxVal = Math.max(
      foodImpact.diabetesImpact,
      foodImpact.hypertensionImpact,
      foodImpact.heartImpact,
    );
    if (maxVal > 0) {
      if (maxVal === foodImpact.diabetesImpact) {
        return ["Roasted Chana", "Sprouted Moong Salad", "Almonds"];
      }
      if (maxVal === foodImpact.hypertensionImpact) {
        return ["Plain Homemade Yogurt", "Unsalted Peanuts", "Oats Upma"];
      }
      if (maxVal === foodImpact.heartImpact) {
        return ["Walnuts", "Fruit Salad", "Vegetable Poha"];
      }
    }

    return ["Roasted Makhana", "Cucumber Slices", "Sprouted Moong"];
  }

  /**
   * Check if scanned ingredients conflict with highest-impact goals
   */
  static checkConflicts(
    ingredients: string[],
    actionPriorities: Array<{ action: string; estimatedImpact: number }>,
  ): { conflicts: boolean; message: string } {
    const cleaned = this.cleanIngredients(ingredients);
    const hasPriority = (keywords: string[]) => {
      return actionPriorities.some((p) => keywords.some((k) => p.action.toLowerCase().includes(k)));
    };

    const hasIngredient = (keywords: string[]) => {
      return cleaned.some((ing) => keywords.some((k) => ing.includes(k) || k.includes(ing)));
    };

    // 1. Weight loss conflict
    if (hasPriority(["lose", "weight", "bmi", "kilos", "kg"])) {
      if (
        hasIngredient([
          "sugar",
          "syrup",
          "maida",
          "refined_flour",
          "trans_fat",
          "palm_oil",
          "ghee",
          "butter",
        ])
      ) {
        return {
          conflicts: true,
          message:
            "This food conflicts with your highest-impact health goal to lose weight and achieve a healthy BMI.",
        };
      }
    }

    // 2. Alcohol conflict
    if (hasPriority(["alcohol", "drinking", "drink"])) {
      if (hasIngredient(["alcohol", "beer", "wine", "whiskey", "rum", "liqueur", "ethanol"])) {
        return {
          conflicts: true,
          message: "This food conflicts with your health goal to limit alcohol consumption.",
        };
      }
    }

    // 3. Hypertension / Blood Pressure conflict
    if (hasPriority(["sodium", "salt", "bp", "blood pressure", "hypertension"])) {
      if (hasIngredient(["salt", "sodium", "msg", "monosodium"])) {
        return {
          conflicts: true,
          message:
            "This food conflicts with your health goal to manage blood pressure by restricting sodium.",
        };
      }
    }

    return {
      conflicts: false,
      message: "",
    };
  }

  /**
   * Run the full deterministic Food Impact analysis pipeline
   */
  static analyze(
    productName: string,
    ingredients: string[],
    risks: { diabetes: number; heart: number; hypertension: number },
    actionPriorities: Array<{ action: string; estimatedImpact: number }>,
  ): FoodImpactResult {
    const foodImpact = this.calculateFoodImpact(ingredients);
    const scores = this.calculatePersonalizedScores(foodImpact, risks);
    const alternatives = this.suggestAlternatives(productName, foodImpact);
    const conflict = this.checkConflicts(ingredients, actionPriorities);

    return {
      foodScore: scores.foodScore,
      personalizedScore: scores.personalizedScore,
      riskLevel: scores.riskLevel,
      diabetesImpact: foodImpact.diabetesImpact,
      hypertensionImpact: foodImpact.hypertensionImpact,
      heartImpact: foodImpact.heartImpact,
      alternatives,
      conflict,
    };
  }
}
