import { describe, it, expect, vi } from "vitest";
import { readStoredResultCompatibility } from "./health-store";
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Route } from "../routes/_app.dashboard.lazy";

// Mock the TanStack router and custom hooks
vi.mock("@/lib/health-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./health-store")>();
  return {
    ...actual,
    useHealthResult: () => [
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
    ],
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
    useHistory: () => [[], vi.fn()],
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    loading: false,
    syncing: false,
    hasCompletedAssessment: true,
    setHasCompletedAssessment: vi.fn(),
  }),
}));

vi.mock("@/lib/i18n", () => ({
  useLanguage: () => "en",
  tr: (key: string) => key,
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

describe("Frontend Compatibility & Isolation Tests", () => {
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

    // Verify clinical V1 risk inputs are fully preserved
    expect(parsed!.risk.diabetes).toBe(18);
    expect(parsed!.risk.heartDisease).toBe(10);
    expect(parsed!.risk.hypertension).toBe(25);

    // Verify experimental V2 fields are discarded (not exposed/exposed as undefined)
    expect((parsed as any).mlRisk).toBeUndefined();
    expect((parsed as any).modelConfidence).toBeUndefined();
    expect((parsed as any).modelVersion).toBeUndefined();
    expect((parsed as any).experimentalResult).toBeUndefined();
    expect((parsed as any).supportingFactors).toBeUndefined();
  });

  it("should verify that the dashboard component does not reference or render ML risk sections (static check)", () => {
    const dashboardPath = path.resolve(__dirname, "../routes/_app.dashboard.lazy.tsx");
    const content = fs.readFileSync(dashboardPath, "utf-8");

    // Assert that the dashboard UI does not try to render an ML risk card or lookup mlRisk properties
    expect(content).not.toContain("result.mlRisk");
    expect(content).not.toContain("mlRiskCategory");
    expect(content).not.toContain("mlDisclaimer");
  });

  it("should render the dashboard component successfully and not expose or render ML elements (runtime check)", () => {
    // Mock global window/document/localStorage objects since dashboard uses them
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

    const DashboardComponent = Route.options.component;
    expect(DashboardComponent).toBeDefined();

    // Render to static HTML string
    const html = renderToString(React.createElement(DashboardComponent));
    expect(html).toContain("overallRisk"); // Preserves V1 overallRisk key
    expect(html).not.toContain("mlRisk");
    expect(html).not.toContain("ml-card");
    expect(html).not.toContain("Machine Learning");
  });
});
