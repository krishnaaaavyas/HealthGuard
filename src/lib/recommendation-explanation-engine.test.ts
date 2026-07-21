import { describe, it, expect } from "vitest";
import {
  generateExplainedRecommendations,
  type ExplainedRecommendation,
} from "./recommendation-explanation-engine";

describe("Recommendation Explanation Engine", () => {
  it("enforces Top 3 Priorities Gating (returns at most 3 items)", () => {
    const output = generateExplainedRecommendations({
      exercise: "none",
      systolic: 145,
      diastolic: 95,
      fastingBloodSugar: 125,
      smoking: "current",
      alcohol: "heavy",
      heightCm: 170,
      weightKg: 95,
      symptoms: "dizziness",
      missingEvidence: ["missing blood pressure reading"],
    });

    expect(output.length).toBeLessThanOrEqual(3);
    expect(output.length).toBe(3);
  });

  it("strictly contains all 5 mandatory explanation fields on every recommendation", () => {
    const output = generateExplainedRecommendations({
      exercise: "none",
      systolic: 138,
      diastolic: 88,
    });

    expect(output.length).toBeGreaterThan(0);

    output.forEach((rec) => {
      // 1. What should the user do?
      expect(typeof rec.action).toBe("string");
      expect(rec.action.length).toBeGreaterThan(0);

      // 2. Why is it recommended?
      expect(typeof rec.why).toBe("string");
      expect(rec.why.length).toBeGreaterThan(0);

      // 3. Which evidence triggered it?
      expect(Array.isArray(rec.evidence)).toBe(true);
      expect(rec.evidence.length).toBeGreaterThan(0);

      // 4. Expected benefit
      expect(typeof rec.expectedBenefit).toBe("string");
      expect(rec.expectedBenefit.length).toBeGreaterThan(0);

      // 5. Timeline ("Today", "This Week", "This Month")
      expect(["Today", "This Week", "This Month"]).toContain(rec.timeline);
    });
  });

  it("matches Example 1: Physical Activity recommendation for sedentary users", () => {
    const output = generateExplainedRecommendations({
      exercise: "none",
      diabetesRiskCategory: "moderate",
    });

    const walkRec = output.find((r) => r.id === "walk-20-min");
    expect(walkRec).toBeDefined();
    expect(walkRec?.action).toBe("Walk 20 minutes");
    expect(walkRec?.why).toBe("Low physical activity.");
    expect(walkRec?.evidence).toContain("Sedentary lifestyle.");
    expect(walkRec?.expectedBenefit).toBe("Improves diabetes screening.");
    expect(walkRec?.timeline).toBe("Today");
  });

  it("matches Example 2: Salt reduction recommendation for hypertensive users", () => {
    const output = generateExplainedRecommendations({
      hypertensionRiskCategory: "moderate",
      systolic: 138,
      diastolic: 88,
    });

    const saltRec = output.find((r) => r.id === "reduce-salt");
    expect(saltRec).toBeDefined();
    expect(saltRec?.action).toBe("Reduce salt");
    expect(saltRec?.why).toBe("Elevated hypertension screening.");
    expect(saltRec?.evidence).toContain("Blood pressure 138/88 mmHg evidence.");
    expect(saltRec?.expectedBenefit).toBe("Supports blood pressure management.");
    expect(saltRec?.timeline).toBe("This Week");
  });

  it("safeguard: never invents evidence (only includes evidence grounded in user data)", () => {
    // Non-smoker, non-drinker, normal BMI, optimal BP
    const output = generateExplainedRecommendations({
      exercise: "none",
      smoking: "never",
      alcohol: "never",
      systolic: 115,
      diastolic: 75,
      bmi: 22,
    });

    output.forEach((rec) => {
      rec.evidence.forEach((ev) => {
        expect(ev).not.toContain("smoker");
        expect(ev).not.toContain("alcohol");
        expect(ev).not.toContain("obesity");
        expect(ev).not.toContain("elevated BP");
      });
    });
  });

  it("guarantees 100% deterministic non-LLM execution for identical inputs", () => {
    const input = {
      exercise: "none",
      systolic: 140,
      diastolic: 90,
      fastingBloodSugar: 110,
    };

    const run1 = generateExplainedRecommendations(input);
    const run2 = generateExplainedRecommendations(input);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });
});
