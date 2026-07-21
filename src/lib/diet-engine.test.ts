import { describe, it, expect } from "vitest";
import {
  generateDietPlan,
  selectDietStrategy,
  isMealConstraintCompliant,
  FALLBACK_MEAL,
  type MealTemplate,
} from "./diet-engine";

describe("Deterministic Diet Recommendation Engine", () => {
  it("selects Strategy first: Prediabetes / Diabetes -> Low Glycemic", () => {
    const output = generateDietPlan({
      fastingBloodSugar: 115,
      hba1c: 6.1,
      diabetesRiskCategory: "moderate",
    });

    expect(output.strategy).toBe("Low Glycemic");
    expect(output.strategyReason).toContain("glycemic screening");
  });

  it("selects Strategy first: Hypertension -> Low Sodium", () => {
    const output = generateDietPlan({
      systolic: 138,
      diastolic: 88,
      hypertensionRiskCategory: "moderate",
    });

    expect(output.strategy).toBe("Low Sodium");
    expect(output.strategyReason).toContain("blood pressure readings");
  });

  it("selects Strategy first: High BMI -> Calorie Deficit", () => {
    const output = generateDietPlan({
      heightCm: 170,
      weightKg: 85, // BMI 29.4
    });

    expect(output.strategy).toBe("Calorie Deficit");
    expect(output.strategyReason).toContain("overweight/obesity range");
  });

  it("selects Strategy first: High Cholesterol -> Heart-Healthy", () => {
    const output = generateDietPlan({
      totalCholesterol: 220,
      ldl: 140,
    });

    expect(output.strategy).toBe("Heart-Healthy / Lipid Control");
    expect(output.strategyReason).toContain("lipid panel markers");
  });

  it("selects Strategy first: Default -> Balanced Wellness", () => {
    const output = generateDietPlan({});
    expect(output.strategy).toBe("Balanced Wellness");
  });

  it("never violates vegetarian dietary preference", () => {
    const output = generateDietPlan({
      dietType: "vegetarian",
    });

    const mealsList = [
      output.meals.breakfast.meal,
      output.meals.lunch.meal,
      output.meals.snacks.meal,
      output.meals.dinner.meal,
    ];

    mealsList.forEach((m) => {
      const lower = m.toLowerCase();
      expect(lower).not.toContain("chicken");
      expect(lower).not.toContain("fish");
      expect(lower).not.toContain("egg");
      expect(lower).not.toContain("meat");
    });
  });

  it("never violates vegan dietary preference (excludes all dairy and eggs)", () => {
    const output = generateDietPlan({
      dietType: "vegan",
    });

    const mealsList = [
      output.meals.breakfast.meal,
      output.meals.lunch.meal,
      output.meals.snacks.meal,
      output.meals.dinner.meal,
    ];

    mealsList.forEach((m) => {
      const lower = m.toLowerCase();
      expect(lower).not.toContain("paneer");
      expect(lower).not.toContain("curd");
      expect(lower).not.toContain("milk");
      expect(lower).not.toContain("cheese");
      expect(lower).not.toContain("ghee");
      expect(lower).not.toContain("egg");
      expect(lower).not.toContain("chicken");
      expect(lower).not.toContain("fish");
    });
  });

  it("never violates Jain dietary preference (excludes onion, garlic, and root vegetables)", () => {
    const output = generateDietPlan({
      dietType: "jain",
    });

    const mealsList = [
      output.meals.breakfast.meal,
      output.meals.lunch.meal,
      output.meals.snacks.meal,
      output.meals.dinner.meal,
    ];

    mealsList.forEach((m) => {
      const lower = m.toLowerCase();
      expect(lower).not.toContain("onion");
      expect(lower).not.toContain("garlic");
    });
  });

  it("never violates allergies or user food exclusions", () => {
    const output = generateDietPlan({
      dietType: "vegetarian",
      allergies: ["peanuts", "gluten"],
      excludedFoods: ["soy"],
    });

    const mealsList = [
      output.meals.breakfast.meal,
      output.meals.lunch.meal,
      output.meals.snacks.meal,
      output.meals.dinner.meal,
    ];

    mealsList.forEach((m) => {
      const lower = m.toLowerCase();
      expect(lower).not.toContain("tofu");
      expect(lower).not.toContain("soya");
      expect(lower).not.toContain("peanuts");
    });
  });

  it("returns 'No safe meal available.' fallback when constraints eliminate all meal choices", () => {
    const impossibleConstraintsInput = {
      dietType: "vegan",
      lactoseIntolerant: true,
      allergies: ["gluten", "soy", "peanuts"],
      excludedFoods: [
        "oats",
        "chilla",
        "dosa",
        "chaat",
        "dal",
        "khichdi",
        "makhana",
        "chana",
        "sabzi",
        "roti",
        "rice",
        "upma",
        "thepla",
      ],
    };

    const output = generateDietPlan(impossibleConstraintsInput);

    expect(output.meals.breakfast.meal).toBe("No safe meal available.");
    expect(output.meals.breakfast.reason).toBe("Constraints restrict all available options.");
    expect(output.meals.breakfast.expectedBenefit).toBe("Consult a dietitian for custom options.");

    expect(output.meals.lunch.meal).toBe("No safe meal available.");
    expect(output.meals.snacks.meal).toBe("No safe meal available.");
    expect(output.meals.dinner.meal).toBe("No safe meal available.");
  });

  it("ensures every meal recommendation strictly includes meal, reason, and expectedBenefit", () => {
    const output = generateDietPlan({
      fastingBloodSugar: 110,
      dietType: "vegetarian",
    });

    const courses = [output.meals.breakfast, output.meals.lunch, output.meals.snacks, output.meals.dinner];

    courses.forEach((c) => {
      expect(typeof c.meal).toBe("string");
      expect(c.meal.length).toBeGreaterThan(0);
      expect(typeof c.reason).toBe("string");
      expect(c.reason.length).toBeGreaterThan(5);
      expect(typeof c.expectedBenefit).toBe("string");
      expect(c.expectedBenefit.length).toBeGreaterThan(5);
    });
  });

  it("guarantees 100% deterministic non-LLM execution for identical inputs", () => {
    const input = {
      fastingBloodSugar: 125,
      systolic: 135,
      dietType: "vegetarian",
      excludedFoods: ["onion"],
    };

    const run1 = generateDietPlan(input);
    const run2 = generateDietPlan(input);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });
});
