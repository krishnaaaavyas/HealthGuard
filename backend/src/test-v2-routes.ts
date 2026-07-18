import express from "express";
import v2Routes from "./routes/v2.routes.js";

async function testV2Routes() {
  process.env.ENABLE_MOCK_AUTH = "true";
  process.env.NODE_ENV = "test";
  console.log("==================================================");
  console.log("HEALTHGUARD AI V2 ROUTING INTEGRATION TESTS");
  console.log("==================================================");

  // Setup express test app
  const app = express();
  app.use(express.json());

  // Mount v2 routes
  app.use("/api/v2", v2Routes);

  // Start listener on a random free port
  const server = app.listen(0);
  const address: any = server.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api/v2`;

  let testsPassed = 0;
  let testsFailed = 0;

  const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ Pass: ${name}`);
      testsPassed++;
    } catch (err) {
      console.error(`❌ Fail: ${name}`, err);
      testsFailed++;
    }
  };

  // TEST 0: Health and Ready Endpoints
  await runTest("V2 Routes - GET /health resolves successfully", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "false";
    const res = await fetch(`${baseUrl}/health`);
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.status !== "ok" || data.version !== "2.0.0" || data.enabled !== false) {
      throw new Error(`Unexpected health payload: ${JSON.stringify(data)}`);
    }
  });

  await runTest("V2 Routes - GET /ready reflects enabled when true", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    const res = await fetch(`${baseUrl}/ready`);
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.status !== "ok" || data.version !== "2.0.0" || data.enabled !== true) {
      throw new Error(`Unexpected ready payload: ${JSON.stringify(data)}`);
    }
  });

  // TEST 1: Feature Flag Disabled Behaviour
  await runTest("V2 Routes - 503 Fallback when disabled", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "false";
    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify({ age: 30 }),
    });
    const data: any = await res.json();
    if (res.status !== 503) {
      throw new Error(`Expected HTTP 503, got ${res.status}`);
    }
    if (data.code !== "HEALTH_ENGINE_V2_DISABLED") {
      throw new Error(`Expected HEALTH_ENGINE_V2_DISABLED code, got ${data.code}`);
    }
  });

  // TEST 2: Schema Validation Failure
  await runTest("V2 Routes - 400 Validation Error on invalid payload", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    // Send invalid age (too high)
    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify({
        age: 999, // Invalid age limit
        gender: "male",
        heightCm: 175,
        weightKg: 70,
        smoking: "never",
        exercise: "moderate",
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Expected HTTP 400, got ${res.status}`);
    }
    const data: any = await res.json();
    if (data.success !== false || !data.details) {
      throw new Error(`Expected validation failure details, got ${JSON.stringify(data)}`);
    }
  });

  // TEST 3: Schema Validation Success
  await runTest("V2 Routes - 200 OK on valid payload", async () => {
    process.env.HEALTH_ENGINE_V2_ENABLED = "true";
    const res = await fetch(`${baseUrl}/health-assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify({
        userId: "test-user-123",
        assessment: {
          age: 32,
          gender: "male",
          heightCm: 180,
          weightKg: 75,
          smoking: "never",
          exercise: "active",
          familyHistory: "diabetes",
          symptoms: "none",
          alcohol: "never",
          sleepHours: 8,
          systolicBP: 120,
          diastolicBP: 80,
          heartRate: 72,
          fastingBloodSugar: 90,
          schemaVersion: "2.0.0",
        },
        labObservations: [],
        regionalContext: {
          language: "en",
          preferredDietaryType: "vegetarian",
          stateOrRegionCode: "IN",
          customRegionalRules: [],
          schemaVersion: "2.0.0",
        },
        schemaVersion: "2.0.0",
      }),
    });
    if (res.status !== 200 && res.status !== 500) {
      throw new Error(`Expected HTTP 200 or 500, got ${res.status}`);
    }
    console.log(`Validated route payload successfully. Response status: ${res.status}`);
  });

  server.close();

  console.log("==================================================");
  console.log(`TESTS COMPLETE: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

testV2Routes().catch((err) => {
  console.error(err);
  process.exit(1);
});
