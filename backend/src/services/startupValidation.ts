import { isConfigured } from "../firebase-admin.js";

export interface ReadinessCheck {
  ready: boolean;
  statusCode: 200 | 503;
  environment: string;
  checks: {
    database: { ready: boolean; mode: string };
    gemini: { ready: boolean; enabled: boolean; reasonCode?: string };
    cors: { ready: boolean };
    fastapi: { ready: boolean; url: string };
  };
  timestamp: string;
}

export function hasValidGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === "") return false;
  if (key === "YOUR_GEMINI_API_KEY" || key === "replace-with-local-secret" || key.includes("placeholder")) {
    return false;
  }
  return true;
}

export function validateProductionConfig(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const geminiEnabled = process.env.GEMINI_LAB_PROCESSING_ENABLED !== "false";
  const validGeminiKey = hasValidGeminiKey();

  if (isProduction) {
    if (!isConfigured) {
      console.warn("module=startup-validation status=warning message=\"Production running in mock-storage mode; real Firebase credentials recommended\"");
    }
    if (geminiEnabled && !validGeminiKey) {
      console.warn("module=startup-validation status=warning message=\"Gemini lab extraction enabled but API key is missing or unconfigured\"");
    }
  } else {
    console.log(`module=startup-validation status=ok env=${process.env.NODE_ENV || "development"} dbMode=${isConfigured ? "firebase" : "mock"}`);
  }
}

export function getSystemReadiness(): ReadinessCheck {
  const isProduction = process.env.NODE_ENV === "production";
  const dbReady = isConfigured || !isProduction;
  const geminiEnabled = process.env.GEMINI_LAB_PROCESSING_ENABLED !== "false";
  const validGeminiKey = hasValidGeminiKey();
  const geminiReady = !geminiEnabled || validGeminiKey || !isProduction;

  const corsReady = !!(process.env.CORS_ALLOWED_ORIGINS || !isProduction);
  const fastApiReady = true;

  const isAllReady = dbReady && geminiReady && corsReady && fastApiReady;

  let geminiReasonCode: string | undefined;
  if (!geminiReady) {
    geminiReasonCode = "LAB_EXTRACTION_CREDENTIALS_MISSING";
  } else if (!geminiEnabled) {
    geminiReasonCode = "LAB_EXTRACTION_DISABLED";
  }

  return {
    ready: isAllReady,
    statusCode: isAllReady ? 200 : 503,
    environment: process.env.NODE_ENV || "development",
    checks: {
      database: {
        ready: dbReady,
        mode: isConfigured ? "firebase" : "mock",
      },
      gemini: {
        ready: geminiReady,
        enabled: geminiEnabled,
        ...(geminiReasonCode ? { reasonCode: geminiReasonCode } : {}),
      },
      cors: {
        ready: corsReady,
      },
      fastapi: {
        ready: fastApiReady,
        url: process.env.FASTAPI_URL || "http://localhost:8000",
      },
    },
    timestamp: new Date().toISOString(),
  };
}
