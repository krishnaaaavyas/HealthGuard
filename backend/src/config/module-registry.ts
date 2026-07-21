import { HealthContext, HealthModuleResult, TestRecommendation, HealthModuleResultSchema } from "./schemas-v2.js";

export interface HealthModule {
  moduleId: string;
  version: string;
  status: "available" | "disabled" | "unavailable";
  requiredInputs: string[];
  optionalInputs: string[];
  supportedLabCodes: string[];
  isEligible(context: HealthContext): boolean;
  evaluate(context: HealthContext): Promise<HealthModuleResult>;
  explain(result: HealthModuleResult): string;
  recommendTests(context: HealthContext): TestRecommendation[];
}

export const diseaseModuleRegistry: Record<string, HealthModule> = {
  diabetes: {
    moduleId: "diabetes",
    version: "2.0.0",
    status: "unavailable",
    requiredInputs: ["age", "gender"],
    optionalInputs: ["heightCm", "weightKg", "fastingBloodSugar"],
    supportedLabCodes: ["HbA1c"],
    isEligible: (context: HealthContext) => {
      return Boolean(context.assessment && context.assessment.age && context.assessment.gender);
    },
    evaluate: async (context: HealthContext): Promise<HealthModuleResult> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";

      try {
        const response = await fetch(`${fastApiUrl}/v1/modules/diabetes/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`FastAPI returned status ${response.status}`);
        }

        const data = await response.json();

        // Use the synchronized Zod response schema.
        const parsed = HealthModuleResultSchema.safeParse(data);
        if (!parsed.success) {
          console.warn("module=diabetes status=invalid-response-schema");
          throw new Error("Invalid model-service response schema");
        }

        return parsed.data;
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn("module=diabetes status=model-unavailable");

        return {
          moduleId: "diabetes-screening",
          moduleVersion: "unassigned",
          status: "model-unavailable",
          resultType: "screening-signal",
          source: "research-model",
          evidenceSupport: "insufficient",
          reasonCodes: ["MODEL_SERVICE_UNAVAILABLE"],
          usedEvidence: [],
          missingEvidence: [],
          limitations: ["NO_APPROVED_MODEL_RESULT"],
          nextSteps: ["RETRY_LATER"],
          evidenceCompleteness: 0,
          confidenceLevel: "insufficient",
          topContributors: [],
          protectiveFactors: [],
          missingInputs: [],
          recommendedActions: [],
          recommendedTests: [],
          safetyFlags: [],
        };
      }
    },
    explain: (result: HealthModuleResult) => {
      return `Diabetes Risk evaluated using engine version ${result.moduleVersion}. Status: ${result.status}`;
    },
    recommendTests: (_context: HealthContext) => {
      return [];
    },
  },

  hypertension: createPlaceholderModule(
    "hypertension",
    ["age", "gender", "systolicBP", "diastolicBP"],
    [],
    [],
  ),
  cardiovascular: createPlaceholderModule(
    "cardiovascular",
    ["age", "gender", "systolicBP", "fastingBloodSugar"],
    ["smoking"],
    ["totalCholesterol", "hdlCholesterol", "ldlCholesterol", "triglycerides"],
  ),
  kidney: createPlaceholderModule("kidney", ["age", "gender"], [], []),
  anaemia: createPlaceholderModule("anaemia", ["age", "gender"], [], []),
  thyroid: createPlaceholderModule("thyroid", ["age", "gender"], [], ["thyroidTSH"]),
};

function createPlaceholderModule(
  moduleId: string,
  requiredInputs: string[] = ["age", "gender"],
  optionalInputs: string[] = [],
  supportedLabCodes: string[] = [],
): HealthModule {
  return {
    moduleId,
    version: "2.0.0",
    status: "unavailable",
    requiredInputs,
    optionalInputs,
    supportedLabCodes,
    isEligible: (context: HealthContext) => {
      return Boolean(context.assessment && context.assessment.age && context.assessment.gender);
    },
    evaluate: async (context: HealthContext): Promise<HealthModuleResult> => {
      return {
        moduleId,
        moduleVersion: "2.0.0",
        resultType: moduleId === "cardiovascular" ? "risk-score" : "risk-tier",
        status: "unavailable",
        evidenceCompleteness: 0,
        confidenceLevel: "insufficient",
        topContributors: [],
        protectiveFactors: [],
        missingInputs: requiredInputs.filter((input) => !(input in context.assessment)),
        recommendedActions: [],
        recommendedTests: [],
        safetyFlags: [],
      };
    },
    explain: (result: HealthModuleResult) => {
      return `Module ${result.moduleId} (v${result.moduleVersion}) is currently unavailable.`;
    },
    recommendTests: (_context: HealthContext) => {
      return [];
    },
  };
}
export default diseaseModuleRegistry;
