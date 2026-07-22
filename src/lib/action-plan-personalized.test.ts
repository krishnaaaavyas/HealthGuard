import { describe, it, expect } from "vitest";
import { generateDietPlan, isMealConstraintCompliant, REUSABLE_MEAL_CATALOG } from "./diet-engine";
import { generateWorkoutPlan, isExerciseContraindicated } from "./workout-engine";
import { generateHealthPriorities } from "./priority-engine";
import { generateExplainedRecommendations } from "./recommendation-explanation-engine";

describe("Dynamic Action Plan & Engine Personalization Suite", () => {
  it("changes diet strategy and workout choices when BMI changes from normal to obese", () => {
    const normalInput = { age: 30, bmi: 22, heightCm: 175, weightKg: 67, activity: "moderate" };
    const obeseInput = { age: 30, bmi: 32, heightCm: 170, weightKg: 93, activity: "none" };

    const normalDiet = generateDietPlan(normalInput);
    const obeseDiet = generateDietPlan(obeseInput);

    expect(normalDiet.strategy).toBe("Balanced Wellness");
    expect(obeseDiet.strategy).toBe("Calorie Deficit");
    expect(obeseDiet.strategyReason.toLowerCase()).toContain("deficit");

    const normalWorkout = generateWorkoutPlan(normalInput);
    const obeseWorkout = generateWorkoutPlan(obeseInput);

    expect(normalWorkout.weeks.week1[0].exercise).toContain("Walking");
    expect(obeseWorkout.weeks.week1[0].exercise).toContain("Cycling");
  });

  it("changes workout duration, frequency, and reasons when physical activity changes", () => {
    const sedentaryInput = { age: 40, bmi: 24, activity: "none", workoutDaysPerWeek: 0 };
    const activeInput = { age: 40, bmi: 24, activity: "active", workoutDaysPerWeek: 5 };

    const sedentaryWorkout = generateWorkoutPlan(sedentaryInput);
    const activeWorkout = generateWorkoutPlan(activeInput);

    expect(sedentaryWorkout.weeks.week1[0].reason).toBe("Low reported physical activity.");
    expect(sedentaryWorkout.weeks.week1[0].duration).toBe("15 min");

    expect(activeWorkout.weeks.week1[0].duration).toBe("25 min");
    expect(activeWorkout.weeks.week1[0].reason).not.toBe("Low reported physical activity.");
  });

  it("changes diet strategy to Low Glycemic when diabetes screening risk is high", () => {
    const lowRiskInput = { age: 45, bmi: 23, diabetesRiskCategory: "low" as const };
    const highRiskInput = { age: 45, bmi: 23, diabetesRiskCategory: "high" as const, hba1c: 6.2 };

    const lowDiet = generateDietPlan(lowRiskInput);
    const highDiet = generateDietPlan(highRiskInput);

    expect(lowDiet.strategy).toBe("Balanced Wellness");
    expect(highDiet.strategy).toBe("Low Glycemic");
    expect(highDiet.strategyReason).toContain("glycemic");
  });

  it("changes diet strategy to Low Sodium when hypertension screening risk is high", () => {
    const lowRiskInput = { age: 50, bmi: 24, hypertensionRiskCategory: "low" as const };
    const highRiskInput = { age: 50, bmi: 24, hypertensionRiskCategory: "high" as const, systolic: 145 };

    const lowDiet = generateDietPlan(lowRiskInput);
    const highDiet = generateDietPlan(highRiskInput);

    expect(lowDiet.strategy).toBe("Balanced Wellness");
    expect(highDiet.strategy).toBe("Low Sodium");
    expect(highDiet.strategyReason).toContain("sodium");
  });

  it("strictly enforces dietary preferences (vegetarian vs vegan vs Jain)", () => {
    const paneerMeal = REUSABLE_MEAL_CATALOG.find((m) => m.name.includes("Paneer"))!;
    const onionMeal = REUSABLE_MEAL_CATALOG.find((m) => m.contains.includes("onion"))!;

    expect(isMealConstraintCompliant(paneerMeal, { dietType: "vegetarian" })).toBe(true);
    expect(isMealConstraintCompliant(paneerMeal, { dietType: "vegan" })).toBe(false);

    expect(isMealConstraintCompliant(onionMeal, { dietType: "vegetarian" })).toBe(true);
    expect(isMealConstraintCompliant(onionMeal, { dietType: "jain" })).toBe(false);
  });

  it("generates weekly meal variation across Mon-Sun without static identical repetition", () => {
    const input = { age: 35, bmi: 24, dietType: "vegetarian" };
    const plan = generateDietPlan(input);

    const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const breakfastNames = weekdays.map((day) => plan.weeklyPlan[day].breakfast.meal);

    // Verify breakfast meals are not all identical
    const uniqueBreakfasts = new Set(breakfastNames);
    expect(uniqueBreakfasts.size).toBeGreaterThan(1);
  });

  it("generates progressive 4-week workout plan featuring Walking, Mobility, Resistance, and Balance", () => {
    const input = { age: 35, bmi: 24, activity: "none" };
    const workout = generateWorkoutPlan(input);

    // Week 1: Aerobic Base (Walking)
    expect(workout.weeks.week1[0].exercise).toContain("Walking");

    // Week 2: Aerobic + Mobility
    const w2Exercises = workout.weeks.week2.map((e) => e.exercise);
    expect(w2Exercises.some((name) => name.toLowerCase().includes("mobility") || name.toLowerCase().includes("yoga"))).toBe(true);

    // Week 3: Aerobic + Resistance
    const w3Exercises = workout.weeks.week3.map((e) => e.exercise);
    expect(w3Exercises.some((name) => name.toLowerCase().includes("resistance") || name.toLowerCase().includes("squats"))).toBe(true);

    // Week 4: Aerobic + Resistance + Balance
    const w4Exercises = workout.weeks.week4.map((e) => e.exercise);
    expect(w4Exercises.some((name) => name.toLowerCase().includes("balance") || name.toLowerCase().includes("stability"))).toBe(true);
  });

  it("triggers safety contraindication when severe symptoms or acute blood pressure are present", () => {
    const unsafeSymptoms = { symptoms: "chest pain and shortness of breath" };
    const unsafeBP = { systolic: 185, diastolic: 115 };

    const checkSx = isExerciseContraindicated(unsafeSymptoms);
    expect(checkSx.contraindicated).toBe(true);

    const checkBP = isExerciseContraindicated(unsafeBP);
    expect(checkBP.contraindicated).toBe(true);

    const workout = generateWorkoutPlan(unsafeSymptoms);
    expect(workout.status).toBe("contraindicated");
    expect(workout.weeks.week1[0].exercise).toBe("No safe exercise recommendation available.");
  });

  it("exposes reason, evidence, expectedBenefit, and timeline in top explained recommendations", () => {
    const input = {
      age: 45,
      bmi: 31,
      activity: "none",
      diabetesRiskCategory: "high" as const,
    };

    const explainedRecs = generateExplainedRecommendations(input);
    expect(explainedRecs.length).toBeGreaterThan(0);
    expect(explainedRecs.length).toBeLessThanOrEqual(3);

    const first = explainedRecs[0];
    expect(first).toHaveProperty("action");
    expect(first).toHaveProperty("why");
    expect(first).toHaveProperty("evidence");
    expect(first).toHaveProperty("expectedBenefit");
    expect(first).toHaveProperty("timeline");
  });
});
