import express from "express";
import { z } from "zod";
import {
  HealthContextSchema,
  AssessmentV2Schema,
  LabObservationSchema,
  HealthModuleResultSchema,
  HealthContext,
} from "./config/schemas-v2.js";
import { diseaseModuleRegistry } from "./config/module-registry.js";
import v2Routes from "./routes/v2.routes.js";
import { adaptV2ToLegacy } from "../../src/lib/v2-adapter.js";
import { hydrateHealthStore } from "../../src/lib/health-store.js";

async function testV2Schemas() {
  console.log("==================================================");
  console.log("HEALTHGUARD AI V2 SCHEMA & REGISTRATION INTEGRATION TESTS");
  console.log("==================================================");

  const app = express();
  app.use(express.json());
  app.use("/api/v2", v2Routes);

  const server = app.listen(0);
  const address: any = server.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api/v2`;

  class SkipTest extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SkipTest";
    }
  }

  let testsPassed = 0;
  let testsFailed = 0;
  let testsSkipped = 0;

  const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ Pass: ${name}`);
      testsPassed++;
    } catch (err: any) {
      if (err instanceof SkipTest || (err && err.name === "SkipTest")) {
        console.log(`⚠️ Skip: ${name} (${err.message})`);
        testsSkipped++;
      } else {
        console.error(`❌ Fail: ${name}`, err);
        testsFailed++;
      }
    }
  };

  const validAssessment = {
    age: 35,
    gender: "male",
    heightCm: 175,
    weightKg: 75,
    smoking: "never",
    exercise: "moderate",
    familyHistory: "None",
    symptoms: "None",
    alcohol: "never",
    sleepHours: 7,
    systolicBP: 120,
    diastolicBP: 80,
    heartRate: 72,
    fastingBloodSugar: 90,
    schemaVersion: "2.0.0",
  };

  const validContext = {
    userId: "test-user-123",
    assessment: validAssessment,
    labObservations: [
      {
        code: "HbA1c",
        value: 5.6,
        unit: "%",
        observedAt: new Date().toISOString(),
        isVerified: true,
        verifiedBy: "Mock Lab",
      },
    ],
    regionalContext: {
      language: "en",
      preferredDietaryType: "vegetarian",
      stateOrRegionCode: "IN",
      customRegionalRules: [],
      schemaVersion: "2.0.0",
    },
    schemaVersion: "2.0.0",
  };

  // 1. Zod validation - Valid inputs
  await runTest("Schemas - Valid HealthContext passes parsing", async () => {
    const parsed = HealthContextSchema.safeParse(validContext);
    if (!parsed.success) {
      throw new Error(`Failed to parse valid context: ${JSON.stringify(parsed.error.format())}`);
    }
  });

  // 2. Zod validation - Invalid unit check
  await runTest("Schemas - Empty unit fails validation", async () => {
    const invalid = {
      ...validContext,
      labObservations: [
        {
          code: "HbA1c",
          value: 5.6,
          unit: "",
          observedAt: new Date().toISOString(),
        },
      ],
    };
    const parsed = HealthContextSchema.safeParse(invalid);
    if (parsed.success) {
      throw new Error("Expected validation failure on empty unit, but it passed.");
    }
  });

  // 3. Zod validation - Negative values
  await runTest("Schemas - Negative biomarker value fails validation", async () => {
    const invalid = {
      ...validContext,
      labObservations: [
        {
          code: "HbA1c",
          value: -1.5,
          unit: "%",
          observedAt: new Date().toISOString(),
        },
      ],
    };
    const parsed = HealthContextSchema.safeParse(invalid);
    if (parsed.success) {
      throw new Error("Expected validation failure on negative biomarker, but it passed.");
    }
  });

  // 4. Zod validation - NaN and Infinite values
  await runTest("Schemas - NaN biomarker value fails validation", async () => {
    const invalid = {
      ...validContext,
      labObservations: [
        {
          code: "HbA1c",
          value: NaN,
          unit: "%",
          observedAt: new Date().toISOString(),
        },
      ],
    };
    const parsed = HealthContextSchema.safeParse(invalid);
    if (parsed.success) {
      throw new Error("Expected validation failure on NaN value, but it passed.");
    }
  });

  // 5. Registry - Module counts and availability check
  await runTest("Registry - Contains all 6 target modules", async () => {
    const requiredModules = [
      "diabetes",
      "hypertension",
      "cardiovascular",
      "kidney",
      "anaemia",
      "thyroid",
    ];
    for (const modId of requiredModules) {
      const mod = diseaseModuleRegistry[modId];
      if (!mod) {
        throw new Error(`Registry is missing module: ${modId}`);
      }
    }
  });

  // 6. E2E API - Feature Flag constraints
  await runTest("API - POST /health-assessment returns 503 when disabled", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "false";
    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(validContext),
    });
    if (res.status !== 503) {
      throw new Error(`Expected HTTP 503, got ${res.status}`);
    }
  });

  // 7. E2E API - V1 Fallback verification
  await runTest("API - POST /health-assessment falls back to legacy clinical scoring", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    process.env.FASTAPI_URL = "http://localhost:8999"; // invalid offline url to trigger fallback

    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(validContext),
    });

    if (res.status !== 200) {
      const text = await res.text();
      throw new Error(`Expected HTTP 200, got ${res.status}. Body: ${text}`);
    }

    const payload: any = await res.json();
    if (!payload.success) {
      throw new Error(`Expected success = true, got ${JSON.stringify(payload)}`);
    }

    // Verify derived BMI
    const derivedBmi = payload.data.bmi;
    const expectedBmi = 75 / (175 / 100) ** 2;
    if (Math.abs(derivedBmi - expectedBmi) > 0.01) {
      throw new Error(`Unexpected BMI: got ${derivedBmi}, expected ${expectedBmi}`);
    }

    // Verify fallback version indicator is set on saved result
    const diabetesResult = payload.data.moduleResults.find((r: any) => r.moduleId === "diabetes");
    if (!diabetesResult || diabetesResult.moduleVersion !== "1.0.0-legacy") {
      throw new Error(`Expected legacy module fallback, got: ${JSON.stringify(diabetesResult)}`);
    }
  });

  // 8. Compatibility Adapter
  await runTest("Adapter - adaptV2ToLegacy maps elements correctly", async () => {
    const mockV2Results: any[] = [
      {
        moduleId: "diabetes",
        moduleVersion: "2.0.0",
        resultType: "risk-tier",
        status: "completed",
        score: 65,
        riskTier: "moderate",
        evidenceCompleteness: 0.8,
        confidenceLevel: "moderately-supported",
        topContributors: [
          {
            factorId: "fastingBloodSugar",
            name: "Blood Sugar",
            impactValue: 15,
            description: "High fasting blood sugar",
          },
        ],
        protectiveFactors: [],
        missingInputs: [],
        recommendedActions: ["Limit carbs"],
        recommendedTests: [],
        safetyFlags: [],
      },
    ];

    const adapted = adaptV2ToLegacy(mockV2Results, 24.5);
    if (adapted.risk.diabetes !== 65) {
      throw new Error(`Expected diabetes risk 65, got ${adapted.risk.diabetes}`);
    }
  });

  // 9. Atomic Hydration
  await runTest("Hydration - hydrateHealthStore writes atomically", async () => {
    const storage: Record<string, string> = {};
    let eventsDispatched = 0;

    const mockWindow = {
      localStorage: {
        setItem(key: string, value: string) {
          storage[key] = value;
        },
        removeItem(key: string) {
          delete storage[key];
        },
      },
      dispatchEvent(event: any) {
        if (event && event.type === "hg:store" && event.detail?.key === "all") {
          eventsDispatched++;
        }
      },
    };

    (global as any).window = mockWindow;

    hydrateHealthStore({
      profile: {
        age: 40,
        gender: "female",
        heightCm: 160,
        weightKg: 60,
        smoking: "never",
        exercise: "active",
        familyHistory: "",
        symptoms: "",
      },
      result: {
        overallScore: 25,
        overallRisk: "Low",
        bmi: 23.4,
        risk: { diabetes: 10, heartDisease: 20, hypertension: 15 },
        rationale: { diabetes: "", heartDisease: "", hypertension: "" },
        dietPlan: "",
        exercisePlan: "",
        preventionTips: "",
      },
      history: [],
    });

    delete (global as any).window;

    if (!storage["hg.profile.v1"] || !storage["hg.result.v1"] || !storage["hg.history.v1"]) {
      throw new Error(`Missing expected localStorage keys.`);
    }

    if (eventsDispatched !== 1) {
      throw new Error(`Expected exactly 1 custom event dispatched, got ${eventsDispatched}`);
    }
  });

  // 10. E2E API - Live FastAPI evaluation
  await runTest("API - POST /health-assessment evaluates via live FastAPI service", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    process.env.FASTAPI_URL = "http://localhost:8000";

    let fastApiAvailable = false;
    try {
      const ping = await fetch("http://localhost:8000/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (ping.status === 200) {
        fastApiAvailable = true;
      }
    } catch {
      // Offline
    }

    if (!fastApiAvailable) {
      throw new SkipTest("FastAPI service is offline");
    }

    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(validContext),
    });

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    const payload: any = await res.json();
    const diabetesResult = payload.data.moduleResults.find((r: any) => r.moduleId === "diabetes");

    if (!diabetesResult || diabetesResult.moduleVersion !== "2.0.0") {
      throw new Error(`Expected V2 module results, got: ${JSON.stringify(diabetesResult)}`);
    }
  });

  server.close();
  console.log("==================================================");
  console.log(
    `TESTS COMPLETE: ${testsPassed} Passed, ${testsFailed} Failed, ${testsSkipped} Skipped`,
  );
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

testV2Schemas();
