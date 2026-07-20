import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readStoredResultCompatibility } from "./health-store";
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { renderToString } from "react-dom/server";

// Dynamic hook value stubs that start with 'mock' to satisfy Vitest isolation requirements
const mockAuthValue = {
  loading: false,
  syncing: false,
  hasCompletedAssessment: true,
  setHasCompletedAssessment: vi.fn(),
};

const mockHealthResultValue = [
  {
    overallScore: 45,
    overallRisk: "Moderate",
    bmi: 26.2,
    risk: {
      diabetes: 18,
      heartDisease: 10,
      hypertension: 25,
    },
  },
  vi.fn(),
];

const mockHistoryValue: any[] = [];

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => mockAuthValue,
}));

vi.mock("@/lib/health-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./health-store")>();
  return {
    ...actual,
    useHealthResult: () => mockHealthResultValue,
    useProfile: () => [
      {
        age: 45,
        gender: "male",
        heightCm: 175,
        weightKg: 80,
        smoking: "never",
        exercise: "moderate",
        familyHistory: "",
        symptoms: "",
      },
      vi.fn(),
    ],
    useHistory: () => [mockHistoryValue, vi.fn()],
  };
});

vi.mock("@/lib/i18n", () => ({
  useLanguage: () => "en",
  tr: (key: string) => {
    const translations: Record<string, string> = {
      riskDashboard: "Risk Dashboard",
      clinicalEngine: "Clinical Engine",
      overallRisk: "Overall Risk Score",
      conditionRisksBreakdown: "Condition Breakdown",
      diabetes: "Diabetes Risk",
      heartDisease: "Cardiovascular Risk",
      hypertension: "Hypertension Risk",
      lifestyleImpact: "Lifestyle Impact",
      actionPrioritiesTitle: "Action Priorities",
      expertClinicalReview: "Expert Review",
    };
    return translations[key] || key;
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createLazyFileRoute: () => (options: any) => ({ options }),
    createFileRoute: () => (options: any) => ({ options }),
    useNavigate: () => vi.fn(),
    Link: ({ children }: any) => children,
  };
});

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-uid", displayName: "Test User" } },
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({}) },
  ApiError: class ApiError extends Error { type = "unknown"; },
}));

vi.mock("@/lib/timing", () => ({
  startMeasure: vi.fn(),
  endMeasure: vi.fn(),
}));

vi.mock("@/components/ui/shape-grid", () => ({
  ShapeGrid: () => null,
}));

// Import the lazy route component (which uses the mocked hooks)
import { Route } from "../routes/_app.dashboard.lazy";

describe("Frontend Compatibility & Isolation Tests", () => {
  // Set up mock window/document/localStorage objects since the dashboard uses them
  beforeAll(() => {
    global.window = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
    global.document = {
      title: "",
    } as any;
    global.localStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn().mockReturnValue(null),
    };
  });

  afterAll(() => {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).localStorage;
  });

  it("should parse legacy results containing mlRisk safely and preserve V1 risks, discarding experimental fields", () => {
    const rawLegacyResult = {
      overallScore: 45,
      overallRisk: "Moderate",
      bmi: 26.2,
      risk: {
        diabetes: 18,
        heartDisease: 10,
        hypertension: 25,
      },
      mlRisk: {
        mlRiskCategory: "moderate",
        confidence: 85,
        supportingFactors: ["High BMI", "Sedentary"],
        modelVersion: "ml-risk-v1",
        explanation: "This is an experimental V2 explanation that should be ignored.",
      },
      modelConfidence: 85,
      modelVersion: "ml-risk-v1",
      experimentalResult: { something: true },
      supportingFactors: ["High BMI", "Sedentary"],
    };

    const parsed = readStoredResultCompatibility(rawLegacyResult);

    expect(parsed).not.toBeNull();
    expect(parsed!.overallScore).toBe(45);
    expect(parsed!.overallRisk).toBe("Moderate");
    expect(parsed!.bmi).toBe(26.2);

    expect(parsed!.risk.diabetes).toBe(18);
    expect(parsed!.risk.heartDisease).toBe(10);
    expect(parsed!.risk.hypertension).toBe(25);

    expect((parsed as any).mlRisk).toBeUndefined();
    expect((parsed as any).modelConfidence).toBeUndefined();
    expect((parsed as any).modelVersion).toBeUndefined();
    expect((parsed as any).experimentalResult).toBeUndefined();
    expect((parsed as any).supportingFactors).toBeUndefined();
  });

  it("should verify that the dashboard component does not reference or render ML risk sections (static check)", () => {
    const dashboardPath = path.resolve(__dirname, "../routes/_app.dashboard.lazy.tsx");
    const content = fs.readFileSync(dashboardPath, "utf-8");

    expect(content).not.toContain("result.mlRisk");
    expect(content).not.toContain("mlRiskCategory");
    expect(content).not.toContain("mlDisclaimer");
  });

  it("should render the dashboard redirect component successfully", () => {
    mockAuthValue.loading = false;
    mockAuthValue.syncing = false;

    const DashboardComponent = Route.options.component;
    expect(DashboardComponent).toBeDefined();

    const html = renderToString(React.createElement(DashboardComponent));
    expect(html).toBeDefined();
  });
});
