import { LabUploadValidator, LabPipelineError } from "./services/labUploadValidator.service.js";
import { GeminiOCRService } from "./services/geminiOCRService.service.js";
import { LabParser } from "./services/labParser.service.js";
import { UnitNormalizer } from "./services/unitNormalizer.service.js";
import { LabEvidenceBuilder } from "./services/labEvidenceBuilder.service.js";
import { LabResponseBuilder } from "./services/labResponseBuilder.service.js";

console.log("==================================================");
console.log("HEALTHGUARD AI MODULAR LAB PIPELINE UNIT TESTS");
console.log("==================================================");

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`✅ Pass: ${description}`);
    passedCount++;
  } else {
    console.error(`❌ Fail: ${description}`);
    failedCount++;
  }
}

async function runTests() {
  // --- Service 1: LabUploadValidator ---
  console.log("\n[Test Suite 1: LabUploadValidator]");

  try {
    await LabUploadValidator.validate({});
    assert(false, "LabUploadValidator should reject empty request body");
  } catch (err: any) {
    assert(err instanceof LabPipelineError && err.reasonCode === "LAB_FILE_INVALID", "Empty body throws LAB_FILE_INVALID");
  }

  try {
    process.env.GEMINI_LAB_PROCESSING_ENABLED = "false";
    await LabUploadValidator.validate({ contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }] }] });
    assert(false, "LabUploadValidator should reject when lab processing is disabled");
  } catch (err: any) {
    assert(err instanceof LabPipelineError && err.reasonCode === "LAB_EXTRACTION_DISABLED", "Disabled processing throws LAB_EXTRACTION_DISABLED");
  } finally {
    delete process.env.GEMINI_LAB_PROCESSING_ENABLED;
  }

  // --- Service 2: GeminiOCRService ---
  console.log("\n[Test Suite 2: GeminiOCRService]");

  const origKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    await GeminiOCRService.executeOCR([{ parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }] }]);
    assert(false, "GeminiOCRService should reject when API key is missing");
  } catch (err: any) {
    assert(err instanceof LabPipelineError && err.reasonCode === "LAB_EXTRACTION_CREDENTIALS_MISSING", "Missing key throws LAB_EXTRACTION_CREDENTIALS_MISSING");
  } finally {
    process.env.GEMINI_API_KEY = origKey;
  }

  // --- Service 3: LabParser ---
  console.log("\n[Test Suite 3: LabParser]");

  try {
    LabParser.parse("invalid json string");
    assert(false, "LabParser should reject invalid JSON syntax");
  } catch (err: any) {
    assert(err instanceof LabPipelineError && err.reasonCode === "LAB_EXTRACTION_PARSE_FAILED", "Invalid JSON syntax throws LAB_EXTRACTION_PARSE_FAILED");
  }

  try {
    LabParser.parse("{}");
    assert(false, "LabParser should reject empty JSON object with no biomarkers");
  } catch (err: any) {
    assert(err instanceof LabPipelineError && err.reasonCode === "LAB_EXTRACTION_EMPTY_RESULT", "Empty JSON result throws LAB_EXTRACTION_EMPTY_RESULT");
  }

  const validRawJson = JSON.stringify({
    fastingBloodSugar: { value: 7.5, unit: "mmol/L" },
    HbA1c: { value: 48, unit: "mmol/mol" },
    totalCholesterol: { value: 5.2, unit: "mmol/L" },
    triglycerides: { value: 1.8, unit: "mmol/L" },
    weight: { value: 154, unit: "lbs" },
    height: { value: 1.75, unit: "meters" },
    bloodPressure: { systolic: 120, diastolic: 80, unit: "mmHg" },
  });

  const parsed = LabParser.parse(validRawJson);
  assert(parsed.fastingBloodSugar?.value === 7.5, "LabParser correctly extracts fastingBloodSugar value (7.5)");
  assert(parsed.bloodPressure?.systolic === 120, "LabParser correctly extracts bloodPressure (120/80)");

  // --- Service 4: UnitNormalizer ---
  console.log("\n[Test Suite 4: UnitNormalizer]");

  const normalized = UnitNormalizer.normalize(parsed);
  assert(normalized.fastingBloodSugar?.value === 135.1 && normalized.fastingBloodSugar?.unit === "mg/dL", "FBS mmol/L normalized to 135.1 mg/dL");
  assert(normalized.HbA1c?.value === 6.5 && normalized.HbA1c?.unit === "%", "HbA1c mmol/mol normalized to 6.5 %");
  assert(normalized.totalCholesterol?.value === 201.1 && normalized.totalCholesterol?.unit === "mg/dL", "Cholesterol mmol/L normalized to 201.1 mg/dL");
  assert(normalized.triglycerides?.value === 159.4 && normalized.triglycerides?.unit === "mg/dL", "Triglycerides mmol/L normalized to 159.4 mg/dL");
  assert(normalized.weight?.value === 69.9 && normalized.weight?.unit === "kg", "Weight lbs normalized to 69.9 kg");
  assert(normalized.height?.value === 175 && normalized.height?.unit === "cm", "Height meters normalized to 175 cm");

  // --- Service 5: LabEvidenceBuilder ---
  console.log("\n[Test Suite 5: LabEvidenceBuilder]");

  const observations = LabEvidenceBuilder.buildObservations(normalized);
  assert(observations.length === 6, "LabEvidenceBuilder creates 6 biomarker observation items (including systolic & diastolic BP)");
  const fbsObs = observations.find((o) => o.code === "fasting_blood_sugar");
  assert(fbsObs?.value === 135.1 && fbsObs?.unit === "mg/dL", "FBS observation contains normalized value (135.1 mg/dL)");

  const meta = LabEvidenceBuilder.buildMetadata("image/png", "<100KB", observations.length);
  assert(meta.extractionStatus === "extracted", "Metadata status is 'extracted'");
  assert(meta.verifiedLabsCount === 6, "Metadata verifiedLabsCount is 6");

  // --- Service 6: LabResponseBuilder ---
  console.log("\n[Test Suite 6: LabResponseBuilder]");

  let lastStatus = 0;
  let lastJson: any = null;
  const mockRes: any = {
    status: (code: number) => {
      lastStatus = code;
      return mockRes;
    },
    json: (obj: any) => {
      lastJson = obj;
      return mockRes;
    },
  };

  LabResponseBuilder.buildUnavailable(mockRes, "LAB_FILE_UNSUPPORTED", 400, "req-1", "image/png", "<100KB", 10);
  assert(lastStatus === 400, "LabResponseBuilder.buildUnavailable sets HTTP 400");
  assert(lastJson.reasonCode === "LAB_FILE_UNSUPPORTED", "LabResponseBuilder.buildUnavailable returns reasonCode 'LAB_FILE_UNSUPPORTED'");
  assert(lastJson.status === "extraction-unavailable", "Status is 'extraction-unavailable'");

  LabResponseBuilder.buildSuccess(mockRes, normalized, "req-2", "image/png", "<100KB", 15);
  assert(lastJson.status === "extracted", "LabResponseBuilder.buildSuccess sets status 'extracted'");
  assert(lastJson.fastingBloodSugar.value === 135.1, "LabResponseBuilder.buildSuccess includes normalized biomarkers");

  console.log("\n==================================================");
  console.log(`TESTS COMPLETE: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("==================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
