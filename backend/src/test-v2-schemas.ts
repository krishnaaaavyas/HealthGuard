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
  process.env.ENABLE_MOCK_AUTH = "true";
  process.env.NODE_ENV = "test";
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

  await runTest("Schemas - Legacy verification is user-confirmed only", async () => {
    const parsed = LabObservationSchema.parse({
      code: "HbA1c", value: 5.6, unit: "%",
      observedAt: new Date().toISOString(), isVerified: true, verifiedBy: "user",
    });
    if (!parsed.userConfirmed || parsed.verifiedByClinician) {
      throw new Error("Legacy verification was incorrectly promoted to clinician verification");
    }
    if (parsed.source !== "unknown" || parsed.verificationStatus !== "user-confirmed") {
      throw new Error("Legacy observation normalization is incorrect");
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

  await runTest("API - Emergency safety override invokes zero disease modules", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    let evaluateCalls = 0;
    const originals = Object.values(diseaseModuleRegistry).map((module) => module.evaluate);
    Object.values(diseaseModuleRegistry).forEach((module) => {
      module.evaluate = async (...args: any[]) => {
        evaluateCalls++;
        return originals[0](args[0]);
      };
    });
    try {
      const emergency = {
        ...validContext,
        assessment: { ...validAssessment, systolicBP: 190 },
      };
      const res = await fetch(`${baseUrl}/health-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mock-uid-test-user-123" },
        body: JSON.stringify(emergency),
      });
      const payload: any = await res.json();
      if (evaluateCalls !== 0) throw new Error(`Expected zero module calls, got ${evaluateCalls}`);
      if (payload.data.routingDecision !== "emergency-safety-override") {
        throw new Error("Emergency routing decision missing");
      }
      if (!Array.isArray(payload.data.moduleResults) || payload.data.moduleResults.length !== 0) {
        throw new Error("Emergency response contains screening module results");
      }
    } finally {
      Object.values(diseaseModuleRegistry).forEach((module, index) => {
        module.evaluate = originals[index];
      });
    }
  });

  // Setup Mock FastAPI server
  const mockFastApiApp = express();
  mockFastApiApp.use(express.json());

  let mockFastApiResponseStatus = 200;
  let mockFastApiResponseData: any = {};
  let mockFastApiDelay = 0;
  let lastReceivedFastApiBody: any = null;

  mockFastApiApp.post("/v1/modules/diabetes/evaluate", async (req, res) => {
    lastReceivedFastApiBody = req.body;
    if (mockFastApiDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, mockFastApiDelay));
    }
    res.status(mockFastApiResponseStatus).json(mockFastApiResponseData);
  });

  const fastApiServer = mockFastApiApp.listen(0);
  const fastApiPort = (fastApiServer.address() as any).port;
  process.env.FASTAPI_URL = `http://localhost:${fastApiPort}`;

  // 7. E2E API - FastAPI Timeout produces model-unavailable
  await runTest("API - POST /health-assessment returns model-unavailable on FastAPI timeout", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    mockFastApiResponseStatus = 200;
    mockFastApiResponseData = {
      moduleId: "diabetes-screening",
      moduleVersion: "2.0.0",
      resultType: "screening-signal",
      status: "completed",
      screeningProbability: 0.42,
      screeningSignal: "below-screening-threshold",
      score: 65,
      evidenceCompleteness: 0.8,
      confidenceLevel: "preliminary",
      topContributors: [],
      protectiveFactors: [],
      missingInputs: [],
      recommendedActions: [],
      recommendedTests: [],
      safetyFlags: [],
    };
    mockFastApiDelay = 6000; // greater than 5s timeout

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
    const diabetesResult = payload.data.moduleResults.find((r: any) => r.moduleId === "diabetes-screening");
    if (!diabetesResult || diabetesResult.status !== "model-unavailable") {
      throw new Error(`Expected status model-unavailable, got: ${JSON.stringify(diabetesResult)}`);
    }
    if (diabetesResult.score !== undefined || diabetesResult.riskTier !== undefined) {
      throw new Error(`Expected no score or risk tier on unavailable module, got: ${JSON.stringify(diabetesResult)}`);
    }
  });

  // 8. E2E API - FastAPI 500 produces model-unavailable
  await runTest("API - POST /health-assessment returns model-unavailable on FastAPI 500", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    mockFastApiResponseStatus = 500;
    mockFastApiDelay = 0;

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
    const diabetesResult = payload.data.moduleResults.find((r: any) => r.moduleId === "diabetes-screening");
    if (!diabetesResult || diabetesResult.status !== "model-unavailable") {
      throw new Error(`Expected status model-unavailable, got: ${JSON.stringify(diabetesResult)}`);
    }
  });

  // 9. E2E API - Invalid model JSON response is rejected
  await runTest("API - POST /health-assessment returns model-unavailable on invalid FastAPI JSON/schema", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    mockFastApiResponseStatus = 200;
    mockFastApiResponseData = { invalidKey: "invalidValue" }; // Invalid response schema

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
    const diabetesResult = payload.data.moduleResults.find((r: any) => r.moduleId === "diabetes-screening");
    if (!diabetesResult || diabetesResult.status !== "model-unavailable") {
      throw new Error(`Expected status model-unavailable, got: ${JSON.stringify(diabetesResult)}`);
    }
  });

  // 10. E2E API - Missing glucose/BP remains missing and no assumed defaults are inserted
  await runTest("API - Missing physiological variables remain missing with no defaults", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    mockFastApiResponseStatus = 200;
    mockFastApiResponseData = {
      moduleId: "diabetes-screening",
      moduleVersion: "2.0.0",
      resultType: "screening-signal",
      status: "completed",
      screeningProbability: 0.42,
      screeningSignal: "below-screening-threshold",
      score: 30,
      evidenceCompleteness: 0.5,
      confidenceLevel: "preliminary",
      topContributors: [],
      protectiveFactors: [],
      missingInputs: [],
      recommendedActions: [],
      recommendedTests: [],
      safetyFlags: [],
    };

    const sparseAssessment = {
      age: 35,
      gender: "male" as const,
      heightCm: 175,
      weightKg: 75,
      smoking: "never" as const,
      exercise: "moderate" as const,
      familyHistory: "None",
      symptoms: "None",
      alcohol: "never" as const,
      sleepHours: 7,
      schemaVersion: "2.0.0",
    }; // fastingBloodSugar, systolicBP, diastolicBP, heartRate are completely omitted

    const sparseContext = {
      userId: "test-user-123",
      assessment: sparseAssessment,
      labObservations: [],
      regionalContext: {
        language: "en" as const,
        preferredDietaryType: "vegetarian" as const,
        stateOrRegionCode: "IN",
        customRegionalRules: [],
        schemaVersion: "2.0.0",
      },
      schemaVersion: "2.0.0",
    };

    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(sparseContext),
    });

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    if (!lastReceivedFastApiBody) {
      throw new Error("FastAPI did not receive evaluation payload");
    }

    const sentAssessment = lastReceivedFastApiBody.assessment;
    if (
      sentAssessment.fastingBloodSugar !== undefined ||
      sentAssessment.systolicBP !== undefined ||
      sentAssessment.diastolicBP !== undefined ||
      sentAssessment.heartRate !== undefined
    ) {
      throw new Error(`Fabricated default physiological variables were sent: ${JSON.stringify(sentAssessment)}`);
    }

    const payload: any = await res.json();
    if (JSON.stringify(payload).includes("screeningProbability")) {
      throw new Error("Internal screening probability leaked into Express response or saved document");
    }
    const savedAssessment = payload.data.assessment;
    if (
      savedAssessment.fastingBloodSugar !== undefined ||
      savedAssessment.systolicBP !== undefined ||
      savedAssessment.diastolicBP !== undefined ||
      savedAssessment.heartRate !== undefined
    ) {
      throw new Error(`Assumed defaults were saved in result: ${JSON.stringify(savedAssessment)}`);
    }
  });

  // 10b. E2E API - Hypertensive emergency check combinations
  await runTest("API - Hypertensive emergency safety flag check combinations", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    mockFastApiResponseStatus = 200;
    mockFastApiResponseData = {
      moduleId: "diabetes-screening",
      moduleVersion: "2.0.0",
      resultType: "screening-signal",
      status: "completed",
      score: 30,
      evidenceCompleteness: 0.5,
      confidenceLevel: "preliminary",
      topContributors: [],
      protectiveFactors: [],
      missingInputs: [],
      recommendedActions: [],
      recommendedTests: [],
      safetyFlags: [],
    };

    const runBPTest = async (systolic?: number, diastolic?: number) => {
      const contextPayload = {
        userId: "test-user-123",
        assessment: {
          age: 35,
          gender: "male" as const,
          heightCm: 175,
          weightKg: 75,
          smoking: "never" as const,
          exercise: "moderate" as const,
          familyHistory: "None",
          symptoms: "None",
          alcohol: "never" as const,
          sleepHours: 7,
          systolicBP: systolic,
          diastolicBP: diastolic,
          schemaVersion: "2.0.0",
        },
        labObservations: [],
        regionalContext: {
          language: "en" as const,
          preferredDietaryType: "vegetarian" as const,
          stateOrRegionCode: "IN",
          customRegionalRules: [],
          schemaVersion: "2.0.0",
        },
        schemaVersion: "2.0.0",
      };

      const res = await fetch(`${baseUrl}/health-assessment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mock-uid-test-user-123",
        },
        body: JSON.stringify(contextPayload),
      });

      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200, got ${res.status}`);
      }

      const payload: any = await res.json();
      return payload.data.safetyFlags.find((f: any) => f.moduleId === "hypertension" && f.flagType === "red-flag");
    };

    // 1. Both BP values absent
    const flagAbsent = await runBPTest(undefined, undefined);
    if (flagAbsent) {
      throw new Error(`Expected no red-flag for absent BP values, got: ${JSON.stringify(flagAbsent)}`);
    }

    // 2. Normal supplied values (120/80)
    const flagNormal = await runBPTest(120, 80);
    if (flagNormal) {
      throw new Error(`Expected no red-flag for normal BP, got: ${JSON.stringify(flagNormal)}`);
    }

    // 3. Systolic only - normal (130)
    const flagSysOnlyNormal = await runBPTest(130, undefined);
    if (flagSysOnlyNormal) {
      throw new Error(`Expected no red-flag for normal systolic-only BP, got: ${JSON.stringify(flagSysOnlyNormal)}`);
    }

    // 4. Systolic only - emergency (185)
    const flagSysOnlyEmergency = await runBPTest(185, undefined);
    if (!flagSysOnlyEmergency || flagSysOnlyEmergency.message.includes("185")) {
      throw new Error(`Expected systolic emergency flag, got: ${JSON.stringify(flagSysOnlyEmergency)}`);
    }

    // 5. Diastolic only - normal (85)
    const flagDiaOnlyNormal = await runBPTest(undefined, 85);
    if (flagDiaOnlyNormal) {
      throw new Error(`Expected no red-flag for normal diastolic-only BP, got: ${JSON.stringify(flagDiaOnlyNormal)}`);
    }

    // 6. Diastolic only - emergency (125)
    const flagDiaOnlyEmergency = await runBPTest(undefined, 125);
    if (!flagDiaOnlyEmergency || flagDiaOnlyEmergency.message.includes("125")) {
      throw new Error(`Expected diastolic emergency flag, got: ${JSON.stringify(flagDiaOnlyEmergency)}`);
    }

    // 7. Both emergency (185/125)
    const flagBothEmergency = await runBPTest(185, 125);
    if (!flagBothEmergency || flagBothEmergency.message.includes("185/125")) {
      throw new Error(`Expected BP emergency flag for both high, got: ${JSON.stringify(flagBothEmergency)}`);
    }
  });

  // 11. Compatibility Adapter
  await runTest("Adapter - adaptV2ToLegacy maps elements correctly", async () => {
    const mockV2Results: any[] = [
      {
        moduleId: "diabetes-screening",
        moduleVersion: "2.0.0",
        resultType: "screening-signal",
        status: "completed",
        score: 65,
        evidenceCompleteness: 0.8,
        confidenceLevel: "preliminary",
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
      {
        moduleId: "hypertension",
        moduleVersion: "2.0.0",
        resultType: "screening-signal",
        status: "model-unavailable",
        evidenceCompleteness: 0,
        confidenceLevel: "insufficient",
        topContributors: [],
        protectiveFactors: [],
        missingInputs: [],
        recommendedActions: [],
        recommendedTests: [],
        safetyFlags: [],
      }
    ];

    const adapted = adaptV2ToLegacy(mockV2Results, 24.5);
    if (adapted.risk.diabetes !== 65) {
      throw new Error(`Expected diabetes risk 65, got ${adapted.risk.diabetes}`);
    }
    if (adapted.risk.hypertension !== undefined) {
      throw new Error(`Expected hypertension risk to be undefined, got ${adapted.risk.hypertension}`);
    }
    if ((adapted as any).mlRisk !== undefined) {
      throw new Error(`Expected legacy mlRisk field to not be exposed, got ${JSON.stringify((adapted as any).mlRisk)}`);
    }
  });

  // 12. Atomic Hydration
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

    if (
      !storage["hg.profile.v1:guest"] ||
      !storage["hg.result.v1:guest"] ||
      !storage["hg.history.v1:guest"]
    ) {
      throw new Error(`Missing expected localStorage keys.`);
    }

    if (eventsDispatched !== 1) {
      throw new Error(`Expected exactly 1 custom event dispatched, got ${eventsDispatched}`);
    }
  });

  server.close();
  fastApiServer.close();
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
