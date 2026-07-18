import { foodRules } from "../config/foodRules.js";

export interface NutritionFacts {
  sugarG?: number;
  sodiumMg?: number;
  transFatG?: number;
  saturatedFatG?: number;
}

export interface PersonalizedFoodResult {
  foodRiskCategory: "safe" | "moderate" | "avoid";
  personalizedFoodScore: number;
  diabetesImpact: number;
  hypertensionImpact: number;
  heartImpact: number;
  reasons: string[];
  betterAlternatives: string[];
}

export class FoodImpactService {
  /**
   * Helper to normalize ingredients text into clean tokens
   */
  static cleanIngredients(ingredients: string[]): string[] {
    return ingredients.map((ing) => ing.toLowerCase().trim());
  }

  /**
   * Parses nutrition facts from raw text or ingredients list if not explicitly provided
   */
  static parseNutritionFacts(ingredients: string[], rawText?: string): NutritionFacts {
    const facts: NutritionFacts = {};
    const textToSearch = (rawText || ingredients.join(", ")).toLowerCase();

    // Helper regex to extract values followed by g/mg
    const sugarMatch = textToSearch.match(
      /(?:sugar|sugars|sucrose)\s*(?:content|value|facts|info)?\s*:?\s*(\d+(?:\.\d+)?)\s*g/i,
    );
    if (sugarMatch) {
      facts.sugarG = parseFloat(sugarMatch[1]);
    }

    const sodiumMatch = textToSearch.match(/(?:sodium|salt)\s*:?\s*(\d+(?:\.\d+)?)\s*m?g/i);
    if (sodiumMatch) {
      const val = parseFloat(sodiumMatch[1]);
      if (textToSearch.includes("sodium") || textToSearch.match(/mg/i)) {
        facts.sodiumMg = val;
      } else {
        // "salt 1.2g" = 1.2 * 400 = 480mg sodium approx
        facts.sodiumMg = val * 400;
      }
    }

    const transFatMatch = textToSearch.match(
      /(?:trans\s*fat|trans-fat)\s*:?\s*(\d+(?:\.\d+)?)\s*g/i,
    );
    if (transFatMatch) {
      facts.transFatG = parseFloat(transFatMatch[1]);
    }

    const satFatMatch = textToSearch.match(
      /(?:saturated\s*fat|sat\s*fat)\s*:?\s*(\d+(?:\.\d+)?)\s*g/i,
    );
    if (satFatMatch) {
      facts.saturatedFatG = parseFloat(satFatMatch[1]);
    }

    // Secondary pass through ingredients list for numeric indicators (e.g. "high sugar 12g")
    if (facts.sugarG === undefined) {
      for (const ing of ingredients) {
        const m = ing.match(/(?:sugar|sugars)\s*(\d+(?:\.\d+)?)\s*g/i);
        if (m) {
          facts.sugarG = parseFloat(m[1]);
          break;
        }
      }
    }

    return facts;
  }

  /**
   * Run the personalized food analysis pipeline with deterministic rules
   */
  static analyzePersonalizedFood(
    ingredients: string[],
    nutritionFacts: NutritionFacts | undefined,
    userRisks: { diabetes: number; heart: number; hypertension: number },
    userRiskDrivers: string[] = [],
  ): PersonalizedFoodResult {
    const cleaned = this.cleanIngredients(ingredients);

    // Parse nutrition facts if undefined or partially filled
    const parsedFacts = this.parseNutritionFacts(ingredients);
    const facts = { ...parsedFacts, ...nutritionFacts };

    let baseDiabetesImpact = 0;
    let baseHypertensionImpact = 0;
    let baseHeartImpact = 0;

    const reasons: string[] = [];

    // Evaluate ingredients against rules config
    cleaned.forEach((ing) => {
      Object.keys(foodRules).forEach((ruleKey) => {
        if (ing.includes(ruleKey) || ruleKey.includes(ing)) {
          const rule = foodRules[ruleKey];
          baseDiabetesImpact += rule.diabetesImpact;
          baseHypertensionImpact += rule.hypertensionImpact;
          baseHeartImpact += rule.heartImpact;
        }
      });
    });

    // Evaluate nutrition facts thresholds
    if (facts.sugarG !== undefined) {
      if (facts.sugarG > 15) {
        baseDiabetesImpact += 6;
      } else if (facts.sugarG > 5) {
        baseDiabetesImpact += 3;
      }
    } else {
      // Fallback: check if ingredients array contains sugar keywords
      const hasSugar = cleaned.some(
        (ing) => ing.includes("sugar") || ing.includes("syrup") || ing.includes("sucrose"),
      );
      if (hasSugar) {
        baseDiabetesImpact += 4;
      }
    }

    if (facts.sodiumMg !== undefined) {
      if (facts.sodiumMg > 400) {
        baseHypertensionImpact += 6;
      } else if (facts.sodiumMg > 150) {
        baseHypertensionImpact += 3;
      }
    } else {
      const hasSalt = cleaned.some(
        (ing) => ing.includes("salt") || ing.includes("sodium") || ing.includes("msg"),
      );
      if (hasSalt) {
        baseHypertensionImpact += 4;
      }
    }

    if (facts.transFatG !== undefined && facts.transFatG > 0.5) {
      baseHeartImpact += 8;
    }
    if (facts.saturatedFatG !== undefined) {
      if (facts.saturatedFatG > 5) {
        baseHeartImpact += 6;
      } else if (facts.saturatedFatG > 2) {
        baseHeartImpact += 3;
      }
    } else {
      const hasBadFats = cleaned.some(
        (ing) => ing.includes("palm") || ing.includes("hydrogenated") || ing.includes("trans"),
      );
      if (hasBadFats) {
        baseHeartImpact += 5;
      }
    }

    // Apply risk scaling factors: scaling deductions based on user risk profiles
    // Multiplier goes up to 2.5x for 100% risk, 1.75x for 50% risk, etc.
    const diabetesMultiplier = 1 + (userRisks.diabetes / 100) * 1.5;
    const hypertensionMultiplier = 1 + (userRisks.hypertension / 100) * 1.5;
    const heartMultiplier = 1 + (userRisks.heart / 100) * 1.5;

    const diabetesImpact = Math.round(baseDiabetesImpact * diabetesMultiplier);
    const hypertensionImpact = Math.round(baseHypertensionImpact * hypertensionMultiplier);
    const heartImpact = Math.round(baseHeartImpact * heartMultiplier);

    // Calculate personalized food score out of 10
    // Deduct points based on the highest scaled impact
    const maxImpact = Math.max(diabetesImpact, hypertensionImpact, heartImpact);

    // Calculate deductions
    let scoreDeduction = 0;
    if (maxImpact > 0) {
      scoreDeduction = Math.min(9, maxImpact / 4);
    }

    let personalizedFoodScore = Math.round(10 - scoreDeduction);
    personalizedFoodScore = Math.max(1, Math.min(10, personalizedFoodScore));

    // Determine category based on final score
    let foodRiskCategory: "safe" | "moderate" | "avoid" = "safe";
    if (personalizedFoodScore >= 8) {
      foodRiskCategory = "safe";
    } else if (personalizedFoodScore >= 5) {
      foodRiskCategory = "moderate";
    } else {
      foodRiskCategory = "avoid";
    }

    // Generate explainable reasons
    if (baseDiabetesImpact > 0) {
      if (userRisks.diabetes > 40) {
        reasons.push(
          `Contains glycemic drivers which pose higher concern due to your estimated diabetes screening index of ${userRisks.diabetes}/100.`,
        );
      } else {
        reasons.push(
          "Contains added sugars or simple starches which can affect blood glucose levels.",
        );
      }
    }

    if (baseHypertensionImpact > 0) {
      if (userRisks.hypertension > 40) {
        reasons.push(
          `High sodium or salt content poses vascular load, highly critical for your estimated hypertension screening index of ${userRisks.hypertension}/100.`,
        );
      } else {
        reasons.push("Contains added sodium/salt which can lead to fluid retention.");
      }
    }

    if (baseHeartImpact > 0) {
      if (userRisks.heart > 40) {
        reasons.push(
          `Saturated fats or palm oil indicators increase cardiovascular load, significant for your heart screening index of ${userRisks.heart}/100.`,
        );
      } else {
        reasons.push(
          "Contains saturated lipids or vegetable oils which can affect LDL cholesterol profiles.",
        );
      }
    }

    if (reasons.length === 0) {
      reasons.push(
        "Contains clean, nutrient-dense ingredients with no significant glycemic, vascular, or lipid hazards.",
      );
    }

    // Suggest regional Indian alternatives based on ingredients or product category
    const betterAlternatives = this.suggestAlternatives(ingredients.join(" "), {
      diabetesImpact: baseDiabetesImpact,
      hypertensionImpact: baseHypertensionImpact,
      heartImpact: baseHeartImpact,
    });

    return {
      foodRiskCategory,
      personalizedFoodScore,
      diabetesImpact,
      hypertensionImpact,
      heartImpact,
      reasons,
      betterAlternatives,
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
   * Keeps backward-compatibility for other legacy callers
   */
  static analyze(
    productName: string,
    ingredients: string[],
    risks: { diabetes: number; heart: number; hypertension: number },
    actionPriorities: Array<{ action: string; estimatedImpact: number }>,
  ) {
    const res = this.analyzePersonalizedFood(ingredients, undefined, risks);
    return {
      foodScore: 10,
      personalizedScore: res.personalizedFoodScore,
      riskLevel:
        res.foodRiskCategory === "safe"
          ? "Low"
          : res.foodRiskCategory === "moderate"
            ? "Moderate"
            : "High",
      diabetesImpact: res.diabetesImpact,
      hypertensionImpact: res.hypertensionImpact,
      heartImpact: res.heartImpact,
      alternatives: res.betterAlternatives,
      conflict: {
        conflicts: res.foodRiskCategory === "avoid",
        message:
          res.foodRiskCategory === "avoid" ? "This food conflicts with your health goals." : "",
      },
    };
  }
}
