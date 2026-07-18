process.env.NODE_ENV = "test";
process.env.ENABLE_MOCK_AUTH = "true";

const { app } = await import("./server.js");
const { AIService } = await import("./services/ai.service.js");

async function testV1Invariance() {
  console.log("==================================================");
  console.log("HEALTHGUARD AI V1 INVARIANCE & ISOLATION TESTS");
  console.log("==================================================");

  // Set mock API key to force AI service to call Gemini API
  process.env.GEMINI_API_KEY = "mock-key-for-test";

  // Mock global fetch to capture prompts sent to Gemini
  let capturedPrompt = "";
  const originalFetch = global.fetch;
  global.fetch = async (url: any, options: any) => {
    const urlStr = typeof url === "string" ? url : (url.url || "");
    if (urlStr.includes("generativelanguage.googleapis.com")) {
      const body = JSON.parse(options.body);
      capturedPrompt = body.contents[0].parts[0].text;
      
      // Return a valid mock Gemini response matching FullAdviceSchema
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      risk: { diabetes: 10, heartDisease: 20, hypertension: 15 },
                      rationale: {
                        diabetes: "Low risk due to age.",
                        heartDisease: "Healthy heart indicators.",
                        hypertension: "Vascular readings within range.",
                      },
                      dietPlan: "Custom regional diet plan.",
                      exercisePlan: "Cardio workout routine.",
                      preventionTips: "Monitor blood pressure weekly.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as any;
    }
    return originalFetch(url, options);
  };

  // Start listener on a random free port
  const server = app.listen(0);
  const address: any = server.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

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

  const testPayload = {
    age: 45,
    gender: "female" as const,
    heightCm: 170,
    weightKg: 86.7,
    smoking: "never" as const,
    exercise: "none" as const,
    familyHistory: "Diabetes in mother",
    symptoms: "fatigue",
    alcohol: "occasional",
    diseases: "None",
    language: "en",
  };

  // TEST 1: POST /api/risk/calculate ignores & strips mlRisk
  await runTest("calculate route does not contain mlRisk", async () => {
    const res = await fetch(`${baseUrl}/api/risk/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(testPayload),
    });
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.analysis.mlRisk !== undefined) {
      throw new Error("Found mlRisk field in calculate response payload!");
    }
    if (!data.analysis.diabetesRisk || !data.analysis.heartRisk) {
      throw new Error("Missing original V1 clinical risk results!");
    }
  });

  // TEST 2: POST /api/profile ignores & strips mlRisk
  await runTest("profile save route does not store or return mlRisk", async () => {
    const res = await fetch(`${baseUrl}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(testPayload),
    });
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.profile && data.profile.mlRisk !== undefined) {
      throw new Error("Found mlRisk field in saved profile response!");
    }
  });

  // TEST 3: GET /api/profile filters historical mlRisk
  await runTest("profile fetch filters historical mlRisk", async () => {
    const res = await fetch(`${baseUrl}/api/profile`, {
      method: "GET",
      headers: {
        Authorization: "Bearer mock-uid-test-user-123",
      },
    });
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.result && data.result.mlRisk !== undefined) {
      throw new Error("Found mlRisk field in returned profile result!");
    }
  });

  // TEST 4: GET /api/dashboard/bootstrap filters historical mlRisk
  await runTest("bootstrap endpoint filters historical mlRisk", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/bootstrap`, {
      method: "GET",
      headers: {
        Authorization: "Bearer mock-uid-test-user-123",
      },
    });
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.result && data.result.mlRisk !== undefined) {
      throw new Error("Found mlRisk field in bootstrap result object!");
    }
  });

  // TEST 5: Advice route has no mlRisk & captures/validates prompt
  await runTest("advice route does not return mlRisk", async () => {
    const res = await fetch(`${baseUrl}/api/risk/advice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-test-user-123",
      },
      body: JSON.stringify(testPayload),
    });
    const data: any = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (data.advice && data.advice.mlRisk !== undefined) {
      throw new Error("Found mlRisk field in advice response payload!");
    }
  });

  // TEST 6: Assert captured Gemini prompt has no experimental ML terms
  await runTest("Gemini - Prompt contains V1 sections and excludes experimental ML context", async () => {
    if (!capturedPrompt) {
      throw new Error("Gemini prompt was not captured/intercepted!");
    }
    if (!capturedPrompt.includes("FINDRISC") || !capturedPrompt.includes("Framingham")) {
      throw new Error("Expected prompt to preserve standard V1 clinical modules");
    }
    if (capturedPrompt.includes("mlRisk") || capturedPrompt.includes("confidence")) {
      throw new Error("Experimental V2 ML variables leaked into Gemini prompt!");
    }
  });

  // Restore fetch and close server
  global.fetch = originalFetch;
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

testV1Invariance().catch((err) => {
  console.error(err);
  process.exit(1);
});
