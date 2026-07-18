import { db } from "../firebase-admin.js";
import { GuardrailsService } from "./guardrails.service.js";
import { RiskService, type UserProfile } from "./risk.service.js";
import { RiskDriverService } from "./riskDriver.service.js";
import crypto from "crypto";
import { z } from "zod";

const FullAdviceSchema = z.object({
  risk: z.object({
    diabetes: z.number(),
    heartDisease: z.number(),
    hypertension: z.number(),
  }),
  rationale: z.object({
    diabetes: z.string(),
    heartDisease: z.string(),
    hypertension: z.string(),
  }),
  dietPlan: z.string(),
  exercisePlan: z.string(),
  preventionTips: z.string(),
});

const langName: Record<string, string> = {
  en: "English",
  hi: "Hindi (हिन्दी)",
  gu: "Gujarati (ગુજરાતી)",
};

export interface CachedRecommendation {
  userId: string;
  type: string;
  content: any;
  snapshotHash: string;
  profileSnapshot: {
    age: number;
    gender: string;
    heightCm: number;
    weightKg: number;
    smoking: string;
    exercise: string;
    familyHistory: string;
    symptoms: string;
    alcohol?: string;
    diseases?: string;
    language: string;
    region?: string;
    dietType?: string;
    budget?: string;
    fitnessLevel?: string;
  };
  createdAt: string;
}

export class AIService {
  private static getApiKey(): string | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "YOUR_GEMINI_API_KEY" || key.includes("placeholder")) {
      return null;
    }
    return key;
  }

  /**
   * Helper to generate SHA-256 hash of snapshot profile configurations deterministically
   */
  private static getSnapshotHash(snapshot: any): string {
    const sorted = Object.keys(snapshot)
      .sort()
      .reduce((acc: any, key) => {
        acc[key] = snapshot[key];
        return acc;
      }, {});
    return crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  }

  /**
   * Helper to make raw fetch requests to Gemini API
   */
  private static async callGemini(
    prompt: string,
    responseSchema?: any,
    timeoutMs = 20000,
  ): Promise<string> {
    const key = this.getApiKey();
    if (!key) {
      throw new Error("Gemini API key is not configured.");
    }

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

    const body: any = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
      },
    };

    if (responseSchema) {
      body.generationConfig.responseMimeType = "application/json";
      body.generationConfig.responseSchema = responseSchema;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.status === 429) {
        throw new Error("Gemini API rate limit exceeded (429).");
      }
      if (resp.status >= 500) {
        throw new Error(`Gemini API upstream server error (${resp.status}).`);
      }
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini API returned error ${resp.status}: ${errText}`);
      }

      const json: any = await resp.json();
      const text =
        json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      return text;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(`Gemini API request timed out after ${timeoutMs}ms.`);
      }
      throw err;
    }
  }

  /**
   * Get cached recommendation from Firestore
   */
  private static async getCached(
    userId: string,
    type: string,
    currentSnapshot: any,
  ): Promise<any | null> {
    try {
      const docRef = db.collection("aiRecommendations").doc(`${userId}_${type}`);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const data = docSnap.data();
        const currentHash = this.getSnapshotHash(currentSnapshot);
        if (data && data.snapshotHash === currentHash) {
          console.log(`Cache hit for user ${userId}, type: ${type}`);
          return data.content;
        }
      }
    } catch (err) {
      console.warn("Error reading recommendation cache:", err);
    }
    return null;
  }

  /**
   * Save recommendation to Firestore cache
   */
  private static async saveCache(
    userId: string,
    type: string,
    content: any,
    snapshot: any,
  ): Promise<void> {
    try {
      const docRef = db.collection("aiRecommendations").doc(`${userId}_${type}`);
      const snapshotHash = this.getSnapshotHash(snapshot);
      await docRef.set({
        userId,
        type,
        content,
        snapshotHash,
        profileSnapshot: snapshot,
        createdAt: new Date().toISOString(),
      });
      console.log(`Cache saved for user ${userId}, type: ${type}`);
    } catch (err) {
      console.warn("Error writing recommendation cache:", err);
    }
  }

  /**
   * Generate Full Advice (explains risks, diet plan, exercise plan, and prevention tips)
   */
  static async generateFullAdvice(
    userId: string,
    profile: UserProfile & { language: string },
    scores: { diabetes: number; heart: number; hypertension: number },
  ): Promise<any> {
    const snapshot = {
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      smoking: profile.smoking,
      exercise: profile.exercise,
      familyHistory: profile.familyHistory,
      symptoms: profile.symptoms,
      alcohol: profile.alcohol || undefined,
      diseases: profile.diseases || undefined,
      language: profile.language,
    };

    // Check Cache
    const cached = await this.getCached(userId, "full_advice", snapshot);
    if (cached) return cached;

    // Check Gemini key
    const key = this.getApiKey();
    if (!key) {
      console.warn("Gemini API Key missing. Falling back to deterministic advice.");
      const fallback = RiskService.generateDeterministicPlans(profile, scores);
      return {
        risk: {
          diabetes: scores.diabetes,
          heartDisease: scores.heart,
          hypertension: scores.hypertension,
        },
        ...fallback,
      };
    }

    const driverResult = RiskDriverService.analyzeRiskDrivers(profile);
    const topDriversStr = driverResult.topDrivers
      .map((td) => `- ${td.factor} (${td.contribution}% contribution)`)
      .join("\n");


    const targetLang = langName[profile.language] || "English";
    const prompt = `You are a clinical wellness coach explaining health assessments.
We have run clinical models (FINDRISC for Diabetes, Framingham for CVD and Hypertension) and got:
- Type 2 Diabetes Risk: ${scores.diabetes}%
- Heart Disease/CVD Risk: ${scores.heart}%
- Hypertension Risk: ${scores.hypertension}%

Primary Risk Drivers:
${topDriversStr || "None identified"}

Risk Composition:
- Modifiable Lifestyle Factors: ${driverResult.modifiableRisk}%
- Non-modifiable Fixed Factors: ${driverResult.nonModifiableRisk}%

Explain rationales for these risk scores based on demographic profile, family history, and symptoms. Focus on explaining these actual risk drivers and how addressing modifiable lifestyle risk drivers can help reduce overall health risk.
Create a customized regional diet plan (e.g., Indian foods if target language is Hindi/Gujarati).
Create a customized exercise plan.
Provide prevention tips.

CRITICAL RULE: For each plan/advice section (dietPlan, exercisePlan, preventionTips), the output MUST be extremely brief. Limit each output to a maximum of: 3 bullet points, 1 actionable next step, and 1 short physiological reason. Do NOT write long essays or general nutrition/training phases. Replace verbose descriptions with concise cards/bullets.

Do NOT override the computed risk percentages. Return exactly the score percentages provided in this response schema:
{
  "risk": {
    "diabetes": ${scores.diabetes},
    "heartDisease": ${scores.heart},
    "hypertension": ${scores.hypertension}
  }
}

Do NOT provide medical diagnosis or imply clinical certainty. Keep descriptions educational.
User profile:
- Age: ${profile.age}
- Gender: ${profile.gender}
- Height: ${profile.heightCm} cm
- Weight: ${profile.weightKg} kg
- Smoking: ${profile.smoking}
- Exercise: ${profile.exercise}
- Family History: ${profile.familyHistory || "none"}
- Symptoms: ${profile.symptoms || "none"}

Target Language: Respond ENTIRELY in ${targetLang}. Use clean markdown with headings for dietPlan, exercisePlan, and preventionTips. Return strictly JSON matching the response schema.`;

    const schema = {
      type: "object",
      properties: {
        risk: {
          type: "object",
          properties: {
            diabetes: { type: "integer" },
            heartDisease: { type: "integer" },
            hypertension: { type: "integer" },
          },
          required: ["diabetes", "heartDisease", "hypertension"],
        },
        rationale: {
          type: "object",
          properties: {
            diabetes: { type: "string" },
            heartDisease: { type: "string" },
            hypertension: { type: "string" },
          },
          required: ["diabetes", "heartDisease", "hypertension"],
        },
        dietPlan: { type: "string" },
        exercisePlan: { type: "string" },
        preventionTips: { type: "string" },
      },
      required: ["risk", "rationale", "dietPlan", "exercisePlan", "preventionTips"],
    };

    try {
      const text = await this.callGemini(prompt, schema);
      const parsed = JSON.parse(text);

      // Validate schema via Zod
      FullAdviceSchema.parse(parsed);

      // Sanitize AI outputs via Guardrails
      parsed.rationale.diabetes = GuardrailsService.sanitizeText(parsed.rationale.diabetes);
      parsed.rationale.heartDisease = GuardrailsService.sanitizeText(parsed.rationale.heartDisease);
      parsed.rationale.hypertension = GuardrailsService.sanitizeText(parsed.rationale.hypertension);
      parsed.dietPlan = GuardrailsService.sanitizeText(parsed.dietPlan);
      parsed.exercisePlan = GuardrailsService.sanitizeText(parsed.exercisePlan);
      parsed.preventionTips = GuardrailsService.sanitizeText(parsed.preventionTips);

      // Save to cache
      await this.saveCache(userId, "full_advice", parsed, snapshot);
      return parsed;
    } catch (err) {
      console.error("Gemini generation failed. Using deterministic fallback.", err);
      const fallback = RiskService.generateDeterministicPlans(profile, scores);
      return {
        risk: {
          diabetes: scores.diabetes,
          heartDisease: scores.heart,
          hypertension: scores.hypertension,
        },
        ...fallback,
      };
    }
  }

  /**
   * Explains Risk Scores and factors in simple language
   */
  static async explainRisks(
    userId: string,
    riskScores: { diabetes: number; heart: number; hypertension: number },
    factors: Array<{ factor: string; impact: number }>,
    language: string,
  ): Promise<string> {
    const snapshot = {
      diabetes: riskScores.diabetes,
      heart: riskScores.heart,
      hypertension: riskScores.hypertension,
      factorsCount: factors.length,
      language,
    };

    const cached = await this.getCached(userId, "explanation", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      return `Your health assessment indicates risk scores: Diabetes: ${riskScores.diabetes}%, Heart: ${riskScores.heart}%, Hypertension: ${riskScores.hypertension}%. Key contributing factors: ${factors.map((f) => `${f.factor} (impact: ${f.impact}%)`).join(", ")}. Consult your physician.`;
    }

    const targetLang = langName[language] || "English";
    const prompt = `Explain the following chronic health risk results in simple, layperson language.
- Diabetes Risk: ${riskScores.diabetes}%
- Cardiovascular Risk: ${riskScores.heart}%
- Hypertension Risk: ${riskScores.hypertension}%

Contributing risk factors:
${JSON.stringify(factors)}

Avoid clinical diagnosis, prescription drugs, or fear-based language. Emphasize education and risk modification.
CRITICAL RULE: Output should be extremely brief. Limit your response to a maximum of: 3 bullets, 1 next action, and 1 short reason. Do NOT write long essays.
Respond entirely in ${targetLang}.`;

    try {
      const text = await this.callGemini(prompt);
      const sanitized = GuardrailsService.sanitizeText(text);
      await this.saveCache(userId, "explanation", sanitized, snapshot);
      return sanitized;
    } catch (err) {
      console.error("Failed to generate risk explanation:", err);
      return "Unable to retrieve AI explanation at this time. Please consult your physician.";
    }
  }

  /**
   * Explains simulation drops
   */
  static async explainSimulation(
    userId: string,
    currentRisk: number,
    projectedRisk: number,
    changes: string[],
    language: string,
  ): Promise<string> {
    const snapshot = {
      currentRisk,
      projectedRisk,
      changes: changes.join(","),
      language,
    };

    const cached = await this.getCached(userId, "simulation_explanation", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      return `Modifying parameters [${changes.join(", ")}] reduced estimated overall score from ${currentRisk}% to ${projectedRisk}% (Absolute improvement: ${currentRisk - projectedRisk}%).`;
    }

    const targetLang = langName[language] || "English";
    const prompt = `Explain why making the following lifestyle modifications: ${changes.join(", ")}
reduced the user's estimated chronic overall health risk score from ${currentRisk}% to ${projectedRisk}% (Absolute drop of ${currentRisk - projectedRisk}%).
Explain the physiological benefits (e.g. cardiac workload, arterial pressure, insulin sensitivity) briefly.
Keep the language simple, encouraging, and educational. Do not promise specific clinical diagnostics.
CRITICAL RULE: Output should be extremely brief. Limit your response to a maximum of: 3 bullets, 1 next action, and 1 short reason. Do NOT write long essays.
Respond entirely in ${targetLang}.`;

    try {
      const text = await this.callGemini(prompt);
      const sanitized = GuardrailsService.sanitizeText(text);
      await this.saveCache(userId, "simulation_explanation", sanitized, snapshot);
      return sanitized;
    } catch (err) {
      console.error("Failed to generate simulation explanation:", err);
      return `These changes [${changes.join(", ")}] lead to a projected overall risk score improvement of ${currentRisk - projectedRisk}%.`;
    }
  }

  /**
   * Generates Diet Plan based on culture, budget, preferences, and risks
   */
  static async generateDietPlan(
    userId: string,
    profile: UserProfile & { language: string },
    region: string,
    dietType: string,
    budget: string,
    riskScores: { diabetes: number; heart: number; hypertension: number },
  ): Promise<string> {
    const snapshot = {
      age: profile.age,
      gender: profile.gender,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      region,
      dietType,
      budget,
      language: profile.language,
      diabetes: riskScores.diabetes,
      heart: riskScores.heart,
      hypertension: riskScores.hypertension,
    };

    const cached = await this.getCached(userId, "diet", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      return RiskService.generateDeterministicPlans(profile, {
        diabetes: riskScores.diabetes,
        heart: riskScores.heart,
        hypertension: riskScores.hypertension,
      }).dietPlan;
    }

    const targetLang = langName[profile.language] || "English";
    const prompt = `Generate a personalized weekly dietary meal plan.
- Demographics: ${profile.age} years, ${profile.gender}, BMI: ${(profile.weightKg / Math.pow(profile.heightCm / 100, 2)).toFixed(1)}
- Risk profile: Diabetes: ${riskScores.diabetes}%, Heart: ${riskScores.heart}%, Hypertension: ${riskScores.hypertension}%
- Regional preference: ${region}
- Diet type: ${dietType}
- Budget constraint: ${budget}

Provide structured breakfast, lunch, snack, and dinner meal suggestions. Incorporate ingredients matching the regional preference. Avoid prescribing medical treatments.
CRITICAL RULE: Output should be extremely brief. Limit any advice to a maximum of: 3 bullets, 1 next action, and 1 short reason. Do NOT write long essays.
Respond entirely in ${targetLang} in clear markdown.`;

    try {
      const text = await this.callGemini(prompt);
      const sanitized = GuardrailsService.sanitizeText(text);
      await this.saveCache(userId, "diet", sanitized, snapshot);
      return sanitized;
    } catch (err) {
      console.error("Failed to generate diet plan:", err);
      return "Unable to retrieve AI diet plan at this time.";
    }
  }

  /**
   * Generates Fitness Plan based on fitnessLevel and risks
   */
  static async generateFitnessPlan(
    userId: string,
    profile: UserProfile & { language: string },
    fitnessLevel: string,
    riskScores: { diabetes: number; heart: number; hypertension: number },
  ): Promise<string> {
    const snapshot = {
      age: profile.age,
      gender: profile.gender,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      fitnessLevel,
      language: profile.language,
      diabetes: riskScores.diabetes,
      heart: riskScores.heart,
      hypertension: riskScores.hypertension,
    };

    const cached = await this.getCached(userId, "fitness", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      return RiskService.generateDeterministicPlans(profile, {
        diabetes: riskScores.diabetes,
        heart: riskScores.heart,
        hypertension: riskScores.hypertension,
      }).exercisePlan;
    }

    const targetLang = langName[profile.language] || "English";
    const prompt = `Generate a structured weekly physical training fitness plan.
- Profile: ${profile.age} years old, ${profile.gender}, current exercise profile: ${profile.exercise}
- Target fitness level: ${fitnessLevel}
- Risk profile: Diabetes: ${riskScores.diabetes}%, Heart: ${riskScores.heart}%, Hypertension: ${riskScores.hypertension}%

Include schedule tables, walking parameters, mobility stretches, and strength training. Restrict difficulty if risk scores are high or user is beginner.
CRITICAL RULE: Output should be extremely brief. Limit advice to a maximum of: 3 bullets, 1 next action, and 1 short reason. Do NOT write long essays.
Respond entirely in ${targetLang} in clear markdown.`;

    try {
      const text = await this.callGemini(prompt);
      const sanitized = GuardrailsService.sanitizeText(text);
      await this.saveCache(userId, "fitness", sanitized, snapshot);
      return sanitized;
    } catch (err) {
      console.error("Failed to generate fitness plan:", err);
      return "Unable to retrieve AI fitness plan at this time.";
    }
  }

  /**
   * Generates Prevention tips
   */
  static async generatePreventionTips(
    userId: string,
    profile: UserProfile & { language: string },
    riskScores: { diabetes: number; heart: number; hypertension: number },
  ): Promise<string> {
    const snapshot = {
      age: profile.age,
      gender: profile.gender,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      smoking: profile.smoking,
      exercise: profile.exercise,
      language: profile.language,
      diabetes: riskScores.diabetes,
      heart: riskScores.heart,
      hypertension: riskScores.hypertension,
    };

    const cached = await this.getCached(userId, "prevention", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      return RiskService.generateDeterministicPlans(profile, {
        diabetes: riskScores.diabetes,
        heart: riskScores.heart,
        hypertension: riskScores.hypertension,
      }).preventionTips;
    }

    const targetLang = langName[profile.language] || "English";
    const prompt = `Generate structured, actionable prevention strategies based on:
- Age: ${profile.age}, Gender: ${profile.gender}
- Lifestyle: Smoking: ${profile.smoking}, Exercise: ${profile.exercise}
- Risk Scores: Diabetes: ${riskScores.diabetes}%, Heart: ${riskScores.heart}%, Hypertension: ${riskScores.hypertension}%

Format as bullet points with concrete actions (e.g. "Reduce sugar sweetened tea" instead of "Lose weight").
CRITICAL RULE: Output should be extremely brief. Limit advice to a maximum of: 3 bullets, 1 next action, and 1 short reason. Do NOT write long essays.
Respond entirely in ${targetLang} in clear markdown.`;

    try {
      const text = await this.callGemini(prompt);
      const sanitized = GuardrailsService.sanitizeText(text);
      await this.saveCache(userId, "prevention", sanitized, snapshot);
      return sanitized;
    } catch (err) {
      console.error("Failed to generate prevention tips:", err);
      return "Unable to retrieve AI prevention recommendations.";
    }
  }

  /**
   * Generates a progress review summary and adapted coaching advice
   */
  static async generateProgressReview(
    userId: string,
    logs: any[],
    language: string,
  ): Promise<{ review: string; coaching: string }> {
    if (logs.length < 2) {
      return {
        review:
          "You have completed your first assessment! Keep logging your weight and physical habits over time to view personalized progress reviews.",
        coaching:
          "Maintain your current plan, check back regularly, and record your weight to build a detailed progress tracking history.",
      };
    }

    const first = logs[0];
    const latest = logs[logs.length - 1];

    // Find a log from roughly 30 days ago to make monthly comparisons
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyLog = logs.find((l) => new Date(l.createdAt) >= thirtyDaysAgo) || first;

    const snapshot = {
      logsCount: logs.length,
      latestDate: latest.createdAt,
      language,
    };

    const cached = await this.getCached(userId, "progress_review", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    const targetLang = langName[language] || "English";

    // Prepare deterministic fallback in case Gemini is offline/unconfigured
    const weightDiff = first.weight - latest.weight;
    const overallRiskDiff = first.overallRisk - latest.overallRisk;
    const fallbackReview = `Over the last ${logs.length > 2 ? "tracking period" : "assessments"}, your overall health risk score changed from ${first.overallRisk}% to ${latest.overallRisk}% (an improvement of ${overallRiskDiff}%). Your weight changed from ${first.weight}kg to ${latest.weight}kg (a change of ${-weightDiff.toFixed(1)}kg).`;
    const fallbackCoaching =
      overallRiskDiff >= 0
        ? "Great job! Maintain your current habits, focusing on consistent daily exercise and balanced meal sizes to sustain this progress."
        : "We suggest prioritizing your focus areas. Reduce high-calorie snacks, log meals, and gradually increase your physical exercise sessions.";

    if (!key) {
      return {
        review: fallbackReview,
        coaching: fallbackCoaching,
      };
    }

    // Prepare the list of logs for the prompt
    const logDetails = logs.map((l) => ({
      date: new Date(l.createdAt).toLocaleDateString(),
      weight: l.weight,
      bmi: l.bmi,
      diabetesRisk: l.diabetesRisk,
      heartRisk: l.heartRisk,
      hypertensionRisk: l.hypertensionRisk,
      overallRisk: l.overallRisk,
      exercise: l.exercise,
      smoking: l.smoking,
    }));

    const prompt = `You are a clinical wellness progress analyst. Analyze the user's health metrics history:
${JSON.stringify(logDetails)}

Demographics comparison:
- Baseline (earliest): Weight: ${first.weight}kg, BMI: ${first.bmi.toFixed(1)}, Exercise: ${first.exercise}, Smoking: ${first.smoking}, Overall Risk Score: ${first.overallRisk}%
- Latest (current): Weight: ${latest.weight}kg, BMI: ${latest.bmi.toFixed(1)}, Exercise: ${latest.exercise}, Smoking: ${latest.smoking}, Overall Risk Score: ${latest.overallRisk}%
- 30-Day Ago Reference (if available): Weight: ${monthlyLog.weight}kg, Overall Risk Score: ${monthlyLog.overallRisk}%

Write a personalized Progress Review narrative and an Adapted Coaching Advice statement based on this history:
1. Progress Review: Summarize the changes (weight, BMI, risk scores) briefly. Pinpoint the biggest lifestyle contributor.
2. Adapted Coaching Advice: Suggest actionable modifications.

Avoid prescribing medical diagnostics or specific pharmaceutical drugs. Keep it encouraging, professional, and patient-first.

CRITICAL RULE: Each output string ("review" and "coaching") MUST be extremely brief: a maximum of 3 bullet points, 1 next action, and 1 short reason.

Respond strictly in JSON using this schema:
{
  "review": "A brief summary of progress written directly to the user in target language (max 3 bullets, 1 next action, 1 short reason).",
  "coaching": "A brief Adapted lifestyle action plan in target language (max 3 bullets, 1 next action, 1 short reason)."
}

Target Language: Respond ENTIRELY in ${targetLang}.`;

    const schema = {
      type: "object",
      properties: {
        review: { type: "string" },
        coaching: { type: "string" },
      },
      required: ["review", "coaching"],
    };

    try {
      const text = await this.callGemini(prompt, schema);
      const parsed = JSON.parse(text);

      parsed.review = GuardrailsService.sanitizeText(parsed.review);
      parsed.coaching = GuardrailsService.sanitizeText(parsed.coaching);

      await this.saveCache(userId, "progress_review", parsed, snapshot);
      return parsed;
    } catch (err) {
      console.error("Failed to generate AI progress review, using fallback:", err);
      return {
        review: fallbackReview,
        coaching: fallbackCoaching,
      };
    }
  }

  /**
   * Explains forecast trajectory based on actions
   */
  static async explainForecast(
    userId: string,
    currentRisk: number,
    forecast: { days30: number; days90: number; days180: number },
    actions: string[],
    language: string,
  ): Promise<string> {
    const snapshot = {
      currentRisk,
      forecast: `${forecast.days30},${forecast.days90},${forecast.days180}`,
      actions: actions.join(","),
      language,
    };

    const cached = await this.getCached(userId, "forecast_explanation", snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      return `If maintained consistently, your lifestyle improvements (${actions.join(", ")}) are projected to reduce your overall risk from ${currentRisk}% to ${forecast.days90}% in 90 days, and to ${forecast.days180}% in 180 days.`;
    }

    const targetLang = langName[language] || "English";
    const prompt = `You are a clinical wellness coach. Explain the projected risk forecast trajectory to the user in a encouraging way.
Current Overall Risk: ${currentRisk}%
Forecasted Risk:
- 30 Days: ${forecast.days30}%
- 90 Days: ${forecast.days90}%
- 180 Days: ${forecast.days180}%

Selected Improvement Actions:
${actions.map((a) => `- ${a}`).join("\n")}

Explain the physiological mechanism of these improvements briefly. Keep it simple and motivational. Do NOT make definite diagnostics or prescribe medications.
CRITICAL RULE: Output should be extremely brief. Limit explanation to a maximum of: 3 bullets, 1 next action, and 1 short reason. Do NOT write long essays.
Respond entirely in ${targetLang}.`;

    try {
      const text = await this.callGemini(prompt);
      const sanitized = GuardrailsService.sanitizeText(text);
      await this.saveCache(userId, "forecast_explanation", sanitized, snapshot);
      return sanitized;
    } catch (err) {
      console.error("Failed to generate forecast explanation:", err);
      return `If maintained consistently, these improvements are projected to reduce your risk over the next three to six months.`;
    }
  }

  /**
   * Generate an AI Coach nudge based on user risk profiles, drivers, actions, and behavioral signals.
   */
  static async generateCoachingNudge(
    userId: string,
    profile: UserProfile,
    riskDrivers: any[],
    actionImpacts: any[],
    signal: { type: string; insight: string },
    language: string,
  ): Promise<{ message: string; nextAction: string; encouragement: string }> {
    const snapshot = {
      profileAge: profile.age,
      profileWeight: profile.weightKg,
      signalType: signal.type,
      driversCount: riskDrivers.length,
      actionsCount: actionImpacts.length,
      language,
    };

    const cached = await this.getCached(userId, `nudge_${signal.type}`, snapshot);
    if (cached) return cached;

    const key = this.getApiKey();
    if (!key) {
      // Deterministic fallback response based on signal type
      let message =
        "Keep tracking your daily parameters to protect your vascular and metabolic health.";
      let nextAction = "Log your weight or log a physical activity today.";
      let encouragement = "Every small step counts towards a healthier you!";

      if (signal.type === "risk_stagnant_30_days") {
        message =
          "Your overall risk score hasn't moved much this month. Let's identify minor tweaks in your diet or activity that could unlock more progress.";
        nextAction = "Schedule a 15-minute brisk walk after dinner.";
        encouragement = "Plateaus are normal; consistency will eventually trigger positive change!";
      } else if (signal.type === "risk_improved") {
        message =
          "Fantastic job! Your risk score has dropped, which shows your dedication to physical activity and dietary control is paying off.";
        nextAction = "Continue your current workout streak and log your parameters.";
        encouragement = "You're building life-changing habits, keep the momentum going!";
      } else if (signal.type === "repeated_high_sugar_scans") {
        message =
          "Your recent food scans include several products containing elevated sugars, sodium, or saturated fats which conflict with your goals.";
        nextAction = "Replace sweet beverages with fresh coconut water or buttermilk.";
        encouragement = "Making mindful swaps is the easiest way to lower cardiovascular stress!";
      } else if (signal.type === "simulates_but_no_progress") {
        message =
          "You've successfully explored several What-If improvement plans, proving you are motivated to change. Now let's turn those goals into active habits.";
        nextAction = "Log your weight and take a 10-minute walk today to start.";
        encouragement = "Action cures hesitation. Start today, no matter how small!";
      } else if (signal.type === "missed_progress_logging") {
        message =
          "It has been over two weeks since your last health check-in. Consistent tracking is key to knowing where your health is heading.";
        nextAction = "Take 30 seconds to log your weight and symptoms.";
        encouragement = "We're here to guide you, let's get back on track!";
      }

      return { message, nextAction, encouragement };
    }

    const targetLang = langName[language] || "English";
    const prompt = `You are an empathetic, clinical AI health coach. Generate a short, highly personalized coaching nudge based on the following:
User Profile: Age ${profile.age}, Gender ${profile.gender}, Weight ${profile.weightKg}kg.
Active Risk Drivers: ${JSON.stringify(riskDrivers)}
Recommended Actions: ${JSON.stringify(actionImpacts)}
Behavioral Signal Detected: "${signal.insight}" (Signal Type: ${signal.type})

Generate exactly three fields:
1. "message": One short coaching message (1-2 sentences) directly addressing the behavioral signal and explaining why it matters for their specific risk profile.
2. "nextAction": A very specific, micro-actionable next step.
3. "encouragement": A warm, encouraging sign-off line (1 sentence).

Avoid prescription drugs, definitive medical diagnostics, or long essays. Keep the entire tone concise and direct.
CRITICAL RULE: The message must be extremely brief. Explain why it matters as 1 short reason and output max 3 bullet points if needed. Next action must be a single step.

Respond strictly in JSON matching the schema:
{
  "message": "...",
  "nextAction": "...",
  "encouragement": "..."
}
Respond ENTIRELY in ${targetLang}.`;

    const schema = {
      type: "object",
      properties: {
        message: { type: "string" },
        nextAction: { type: "string" },
        encouragement: { type: "string" },
      },
      required: ["message", "nextAction", "encouragement"],
    };

    try {
      const text = await this.callGemini(prompt, schema);
      const parsed = JSON.parse(text);

      parsed.message = GuardrailsService.sanitizeText(parsed.message);
      parsed.nextAction = GuardrailsService.sanitizeText(parsed.nextAction);
      parsed.encouragement = GuardrailsService.sanitizeText(parsed.encouragement);

      await this.saveCache(userId, `nudge_${signal.type}`, parsed, snapshot);
      return parsed;
    } catch (err) {
      console.error("Failed to generate AI coaching nudge:", err);
      return {
        message: `Your behavior signals: ${signal.insight}`,
        nextAction: "Perform one recommended health improvement action today.",
        encouragement: "Stay consistent on your wellness journey!",
      };
    }
  }
}
