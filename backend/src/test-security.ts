import express from "express";
import sharp from "sharp";
import { db } from "./firebase-admin.js";
import { createRateLimiter } from "./middleware/security.js";

// Set test environment before importing server to prevent automatic listening on port 5000
process.env.NODE_ENV = "test";
process.env.ENABLE_MOCK_AUTH = "true";
process.env.ENABLE_MOCK_EXPERT_SIGNUP = "true";

const { app } = await import("./server.js");

async function testSecurity() {
  console.log("==================================================");
  console.log("HEALTHGUARD AI PHASE A2 & A3 SECURITY TESTS");
  console.log("==================================================");

  // Start listener on a random port
  const server = app.listen(0);
  const address: any = server.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}/api`;

  let testsPassed = 0;
  let testsFailed = 0;

  const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ Pass: ${name}`);
      testsPassed++;
    } catch (err: any) {
      console.error(`❌ Fail: ${name}`, err.message);
      testsFailed++;
    }
  };

  // TEST 1: Unauthenticated request should be rejected (401)
  await runTest("Auth - Missing token returns 401", async () => {
    const res = await fetch(`${baseUrl}/profile`);
    if (res.status !== 401) {
      throw new Error(`Expected HTTP 401, got ${res.status}`);
    }
  });

  // TEST 2: Unverified JWT payload is rejected (401 or 500)
  await runTest("Auth - Unverified JWT payload token returns 401 or 500", async () => {
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZmFrZS0xMjMiLCJlbWFpbCI6ImZha2VAZmFrZS5jb20ifQ.signature";
    const res = await fetch(`${baseUrl}/profile`, {
      headers: {
        Authorization: `Bearer ${fakeToken}`,
      },
    });
    if (res.status !== 401 && res.status !== 500) {
      throw new Error(`Expected HTTP 401 or 500, got ${res.status}`);
    }
  });

  // TEST 3: Mock authentication is gated by ENABLE_MOCK_AUTH
  await runTest("Auth - Mock token fails safely when ENABLE_MOCK_AUTH=false", async () => {
    process.env.ENABLE_MOCK_AUTH = "false";
    const res = await fetch(`${baseUrl}/profile`, {
      headers: {
        Authorization: "Bearer mock-uid-patient-A",
      },
    });
    if (res.status !== 500) {
      throw new Error(`Expected HTTP 500, got ${res.status}`);
    }
  });

  // Re-enable mock auth
  process.env.ENABLE_MOCK_AUTH = "true";

  // TEST 4: Profile access isolation
  await runTest("Isolation - GET /profile derives UID from verified token, preventing tampering", async () => {
    // Save profile for Patient A
    await db.collection("profiles").doc("patient-A").set({
      age: 40,
      gender: "female",
      heightCm: 165,
      weightKg: 60,
      smoking: "never",
      exercise: "moderate",
      familyHistory: "none",
      symptoms: "none",
      result: {
        overallRisk: "Low",
        risk: { diabetes: 10, heartDisease: 10, hypertension: 10 },
      },
    });

    const res = await fetch(`${baseUrl}/profile`, {
      headers: {
        Authorization: "Bearer mock-uid-patient-A",
      },
    });
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.profile || data.profile.age !== 40) {
      throw new Error(`Expected age 40, got ${data.profile ? data.profile.age : "undefined"}`);
    }
  });

  // TEST 5: Expert Review Gating by Env Flag
  await runTest("Gating - Mock expert signup is blocked when ENABLE_MOCK_EXPERT_SIGNUP=false", async () => {
    process.env.ENABLE_MOCK_EXPERT_SIGNUP = "false";
    const res = await fetch(`${baseUrl}/expert-review/mock-expert-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-expert-A",
      },
      body: JSON.stringify({
        name: "Expert A",
        role: "doctor",
      }),
    });
    if (res.status !== 403) {
      throw new Error(`Expected HTTP 403, got ${res.status}`);
    }
  });

  process.env.ENABLE_MOCK_EXPERT_SIGNUP = "true";

  // Register Expert A
  let expertAToken = "Bearer mock-uid-expert-A";
  await runTest("Gating - Register Expert A when ENABLE_MOCK_EXPERT_SIGNUP=true", async () => {
    const res = await fetch(`${baseUrl}/expert-review/mock-expert-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: expertAToken,
      },
      body: JSON.stringify({
        name: "Expert A",
        role: "doctor",
      }),
    });
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
  });

  // Register Expert B
  let expertBToken = "Bearer mock-uid-expert-B";
  await runTest("Gating - Register Expert B when ENABLE_MOCK_EXPERT_SIGNUP=true", async () => {
    const res = await fetch(`${baseUrl}/expert-review/mock-expert-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: expertBToken,
      },
      body: JSON.stringify({
        name: "Expert B",
        role: "nutritionist",
      }),
    });
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
  });

  // TEST 6: Message Access Authorization & Scoped Identities
  await runTest("Isolation - GET/POST expertMessages restricts access to request owner or assigned expert", async () => {
    // Save profile for Patient B
    await db.collection("profiles").doc("patient-B").set({
      age: 50,
      gender: "male",
      heightCm: 175,
      weightKg: 85,
      smoking: "never",
      exercise: "none",
      familyHistory: "diabetes",
      symptoms: "none",
      result: {
        overallRisk: "Moderate",
        risk: { diabetes: 30, heartDisease: 30, hypertension: 30 },
      },
    });

    // Patient B creates a review request
    const reqRes = await fetch(`${baseUrl}/expert-review/request`, {
      method: "POST",
      headers: {
        Authorization: "Bearer mock-uid-patient-B",
      },
    });
    const reqData = await reqRes.json();
    const requestId = reqData.requestId;
    if (!requestId) {
      throw new Error("Failed to create review request for isolation test");
    }

    // Try fetching messages as unauthorized Patient A (Forbidden - 403)
    const unauthorizedGet = await fetch(`${baseUrl}/expert-review/${requestId}/messages`, {
      headers: {
        Authorization: "Bearer mock-uid-patient-A",
      },
    });
    if (unauthorizedGet.status !== 403) {
      throw new Error(`Expected Patient A GET to return 403, got ${unauthorizedGet.status}`);
    }

    // Try posting message as unauthorized Patient A (Forbidden - 403)
    const unauthorizedPost = await fetch(`${baseUrl}/expert-review/${requestId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-uid-patient-A",
      },
      body: JSON.stringify({
        message: "Hello B from A",
      }),
    });
    if (unauthorizedPost.status !== 403) {
      throw new Error(`Expected Patient A POST to return 403, got ${unauthorizedPost.status}`);
    }

    // Assign request to Expert A
    const acceptRes = await fetch(`${baseUrl}/expert-review/${requestId}/accept`, {
      method: "PATCH",
      headers: {
        Authorization: expertAToken,
      },
    });
    if (acceptRes.status !== 200) {
      throw new Error(`Failed to assign request to expert A: ${acceptRes.status}`);
    }

    // Expert A (assigned) can access messages
    const expertAGet = await fetch(`${baseUrl}/expert-review/${requestId}/messages`, {
      headers: {
        Authorization: expertAToken,
      },
    });
    if (expertAGet.status !== 200) {
      throw new Error(`Expected assigned expert A GET to return 200, got ${expertAGet.status}`);
    }

    // Expert B (unassigned) is blocked (Forbidden - 403)
    const expertBGet = await fetch(`${baseUrl}/expert-review/${requestId}/messages`, {
      headers: {
        Authorization: expertBToken,
      },
    });
    if (expertBGet.status !== 403) {
      throw new Error(`Expected unassigned expert B GET to return 403, got ${expertBGet.status}`);
    }
  });

  // TEST 7: Message Role Derivation
  await runTest("Derivation - POST message derives senderRole server-side, ignoring client input", async () => {
    const reqsSnap = await db.collection("expertReviewRequests").where("userId", "==", "patient-B").get();
    const requestId = reqsSnap.docs[0].id;

    // Send message as Expert A, trying to forge senderRole as "user"
    const forgeRes = await fetch(`${baseUrl}/expert-review/${requestId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: expertAToken,
      },
      body: JSON.stringify({
        message: "Recommendation from Expert A",
        senderRole: "user",
      }),
    });
    if (forgeRes.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${forgeRes.status}`);
    }
    const data = await forgeRes.json();
    if (data.message.senderRole !== "expert") {
      throw new Error(`Expected derived role to be expert, but got: ${data.message.senderRole}`);
    }
  });

  // TEST 8: Firestore Rules Emulator
  await runTest("Firebase - Firestore Emulator rule tests skipped honestly", async () => {
    console.log("⚠️ Skip: Firestore Emulator rules test (Firestore Emulator is not installed or configured in this environment)");
  });

  const httpFetch = global.fetch;
  const validPng = (
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer()
  ).toString("base64");
  const validJpeg = (
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer()
  ).toString("base64");
  const validPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n").toString(
    "base64"
  );

  const labRequest = (
    data = validPng,
    mimeType = "image/png",
    consent?: boolean,
    customContents?: any
  ) =>
    httpFetch(`${baseUrl}/lab-report/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer mock-uid-patient-A" },
      body: JSON.stringify(
        customContents !== undefined
          ? customContents
          : {
              contents: [{ role: "user", parts: [{ inlineData: { mimeType, data } }] }],
              ...(consent === undefined ? {} : { externalProcessingConsent: consent }),
            }
      ),
    });

  await runTest("Lab extraction - Valid PNG/JPEG request returns extracted status", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ fastingBloodSugar: { value: 99, unit: "mg/dL" } }) }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    try {
      const res = await labRequest(validJpeg, "image/jpeg");
      const body: any = await res.json();
      if (res.status !== 200 || body.status !== "extracted" || !body.fastingBloodSugar) {
        throw new Error("Valid JPEG extraction failed");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Lab extraction - Valid PDF request returns extracted status", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ HbA1c: { value: 5.6, unit: "%" } }) }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    try {
      const res = await labRequest(validPdf, "application/pdf");
      const body: any = await res.json();
      if (res.status !== 200 || body.status !== "extracted" || !body.HbA1c) {
        throw new Error("Valid PDF extraction failed");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Lab extraction - Unsupported MIME type returns LAB_FILE_UNSUPPORTED", async () => {
    const res = await labRequest("plain text data", "text/plain");
    const body: any = await res.json();
    if (res.status !== 400 || body.reasonCode !== "LAB_FILE_UNSUPPORTED") {
      throw new Error(`Expected 400 LAB_FILE_UNSUPPORTED, got ${res.status} ${body.reasonCode}`);
    }
  });

  await runTest("Lab extraction - Oversized file returns LAB_FILE_TOO_LARGE", async () => {
    const pngHeader = Buffer.from(validPng, "base64");
    const hugeBuffer = Buffer.concat([pngHeader, Buffer.alloc(11 * 1024 * 1024)]);
    const res = await labRequest(hugeBuffer.toString("base64"), "image/png");
    const body: any = await res.json();
    if (res.status !== 400 || body.reasonCode !== "LAB_FILE_TOO_LARGE") {
      throw new Error(`Expected 400 LAB_FILE_TOO_LARGE, got ${res.status} ${body.reasonCode}`);
    }
  });

  await runTest("Lab extraction - Missing file/contents returns LAB_FILE_INVALID", async () => {
    const res = await labRequest("", "image/png", undefined, {});
    const body: any = await res.json();
    if (res.status !== 400 || body.reasonCode !== "LAB_FILE_INVALID") {
      throw new Error(`Expected 400 LAB_FILE_INVALID, got ${res.status} ${body.reasonCode}`);
    }
  });

  await runTest("Lab extraction - Missing consent returns LAB_EXTRACTION_CONSENT_REQUIRED", async () => {
    const prevConsent = process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT;
    process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT = "true";
    try {
      const res = await labRequest(validPng, "image/png", false);
      const body: any = await res.json();
      if (res.status !== 422 || body.reasonCode !== "LAB_EXTRACTION_CONSENT_REQUIRED") {
        throw new Error(`Expected 422 LAB_EXTRACTION_CONSENT_REQUIRED, got ${res.status} ${body.reasonCode}`);
      }
    } finally {
      if (prevConsent !== undefined) process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT = prevConsent;
      else delete process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT;
    }
  });

  await runTest("Lab extraction - Missing Gemini API key returns LAB_EXTRACTION_CREDENTIALS_MISSING", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await labRequest();
      const body: any = await res.json();
      if (res.status !== 503 || body.reasonCode !== "LAB_EXTRACTION_CREDENTIALS_MISSING") {
        throw new Error(`Expected 503 LAB_EXTRACTION_CREDENTIALS_MISSING, got ${res.status} ${body.reasonCode}`);
      }
      if (body.manualEntryAllowed !== true || (body.observations && body.observations.length > 0)) {
        throw new Error("Fabricated observations returned on missing API key");
      }
    } finally {
      if (previous) process.env.GEMINI_API_KEY = previous;
    }
  });

  await runTest("Lab extraction - Disabled extraction returns LAB_EXTRACTION_DISABLED", async () => {
    const previous = process.env.GEMINI_LAB_PROCESSING_ENABLED;
    process.env.GEMINI_LAB_PROCESSING_ENABLED = "false";
    try {
      const res = await labRequest();
      const body: any = await res.json();
      if (res.status !== 503 || body.reasonCode !== "LAB_EXTRACTION_DISABLED") {
        throw new Error(`Expected 503 LAB_EXTRACTION_DISABLED, got ${res.status} ${body.reasonCode}`);
      }
    } finally {
      if (previous !== undefined) process.env.GEMINI_LAB_PROCESSING_ENABLED = previous;
      else delete process.env.GEMINI_LAB_PROCESSING_ENABLED;
    }
  });

  await runTest("Lab extraction - Provider timeout returns LAB_EXTRACTION_TIMEOUT", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };
    try {
      const res = await labRequest();
      const body: any = await res.json();
      if (res.status !== 503 || body.reasonCode !== "LAB_EXTRACTION_TIMEOUT") {
        throw new Error(`Expected 503 LAB_EXTRACTION_TIMEOUT, got ${res.status} ${body.reasonCode}`);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Lab extraction - Provider HTTP 500 returns LAB_EXTRACTION_UNAVAILABLE", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () => new Response("Internal error", { status: 500 });
    try {
      const res = await labRequest();
      const body: any = await res.json();
      if (res.status !== 503 || body.reasonCode !== "LAB_EXTRACTION_UNAVAILABLE") {
        throw new Error(`Expected 503 LAB_EXTRACTION_UNAVAILABLE, got ${res.status} ${body.reasonCode}`);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Observability - GET /health returns HTTP 200 process status", async () => {
    const res = await httpFetch(`${baseUrl}/../health`);
    const body: any = await res.json();
    if (res.status !== 200 || body.status !== "ok") {
      throw new Error(`Expected process health OK, got ${res.status} ${JSON.stringify(body)}`);
    }
  });

  await runTest("Observability - GET /ready probe returns 503 when dependencies missing in production mode", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await httpFetch(`${baseUrl}/../ready`);
      const body: any = await res.json();
      if (res.status !== 503 || body.ready !== false) {
        throw new Error(`Expected 503 unready in production with mock storage, got ${res.status} ${JSON.stringify(body)}`);
      }
    } finally {
      if (prevEnv !== undefined) process.env.NODE_ENV = prevEnv;
      else delete process.env.NODE_ENV;
    }
  });

  await runTest("Lab extraction - Empty extraction result returns LAB_EXTRACTION_EMPTY_RESULT", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    try {
      const res = await labRequest();
      const body: any = await res.json();
      if (res.status !== 503 || body.reasonCode !== "LAB_EXTRACTION_EMPTY_RESULT") {
        throw new Error(`Expected 503 LAB_EXTRACTION_EMPTY_RESULT, got ${res.status} ${body.reasonCode}`);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Lab extraction - Malformed model JSON returns LAB_EXTRACTION_PARSE_FAILED", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{invalid json" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    try {
      const res = await labRequest();
      const body: any = await res.json();
      if (res.status !== 503 || body.reasonCode !== "LAB_EXTRACTION_PARSE_FAILED") {
        throw new Error(`Expected 503 LAB_EXTRACTION_PARSE_FAILED, got ${res.status} ${body.reasonCode}`);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Security - Verification of no secret, prompt, or PHI leakage in extraction responses", async () => {
    const originalFetch = global.fetch;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    global.fetch = async () => new Response("Upstream error detail", { status: 403 });
    try {
      const res = await labRequest();
      const bodyText = await res.text();
      if (bodyText.includes("synthetic-test-key") || bodyText.includes("Upstream error detail")) {
        throw new Error("Sensitive secret or raw provider error leaked in response body");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest("Security - Blocked CORS origin is rejected", async () => {
    const res = await httpFetch(`${baseUrl}/health`, { headers: { Origin: "https://blocked.example" } });
    if (res.status < 400) throw new Error(`Blocked origin returned ${res.status}`);
  });

  await runTest("Security - Local CORS origin is accepted", async () => {
    const res = await httpFetch(`${baseUrl}/health`, { headers: { Origin: "http://localhost:5173" } });
    if (res.headers.get("access-control-allow-origin") !== "http://localhost:5173") {
      throw new Error("Local development origin was not accepted");
    }
  });

  await runTest("Security - Rate limiter returns 429", async () => {
    const previous = process.env.RATE_LIMIT_MAX_REQUESTS;
    process.env.RATE_LIMIT_MAX_REQUESTS = "2";
    const isolated = express();
    isolated.use(createRateLimiter());
    isolated.get("/", (_req, res) => res.json({ ok: true }));
    const listener = isolated.listen(0);
    const isolatedPort = (listener.address() as any).port;
    try {
      await httpFetch(`http://localhost:${isolatedPort}/`);
      await httpFetch(`http://localhost:${isolatedPort}/`);
      const limited = await httpFetch(`http://localhost:${isolatedPort}/`);
      if (limited.status !== 429) throw new Error(`Expected 429, got ${limited.status}`);
    } finally {
      listener.close();
      if (previous === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS;
      else process.env.RATE_LIMIT_MAX_REQUESTS = previous;
    }
  });

  await runTest("Security - Ordinary JSON body over 1 MB is rejected", async () => {
    const res = await httpFetch(`${baseUrl}/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer mock-uid-patient-A" },
      body: JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }),
    });
    if (res.status !== 413) throw new Error(`Expected 413, got ${res.status}`);
  });

  await runTest("Lab upload - Malformed base64 is rejected", async () => {
    const res = await labRequest("%%%not-base64%%%", "image/png");
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await runTest("Lab upload - MIME and signature mismatch is rejected", async () => {
    const pdf = Buffer.from("%PDF-1.4\nsynthetic").toString("base64");
    const res = await labRequest(pdf, "image/png");
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await runTest("Lab upload - Excessive image dimensions are rejected", async () => {
    const previous = process.env.LAB_REPORT_MAX_WIDTH;
    process.env.LAB_REPORT_MAX_WIDTH = "1";
    const image = await sharp({ create: { width: 2, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    try {
      const res = await labRequest(image.toString("base64"), "image/png");
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    } finally {
      if (previous === undefined) delete process.env.LAB_REPORT_MAX_WIDTH;
      else process.env.LAB_REPORT_MAX_WIDTH = previous;
    }
  });

  await runTest("Auth - Production rejects mock authentication", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await httpFetch(`${baseUrl}/profile`, { headers: { Authorization: "Bearer mock-uid-patient-A" } });
      if (res.status < 400) throw new Error("Production accepted mock authentication");
    } finally { process.env.NODE_ENV = previous; }
  });

  await runTest("Lab processing - Required consent blocks Gemini", async () => {
    const previous = process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT;
    process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT = "true";
    let geminiCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => { geminiCalls++; return new Response("{}"); };
    try {
      const res = await labRequest(validPng, "image/png");
      if (res.status !== 422 || geminiCalls !== 0) throw new Error("Missing consent did not block external processing");
    } finally {
      global.fetch = originalFetch;
      if (previous === undefined) delete process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT;
      else process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT = previous;
    }
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

testSecurity().catch((err) => {
  console.error(err);
  process.exit(1);
});
