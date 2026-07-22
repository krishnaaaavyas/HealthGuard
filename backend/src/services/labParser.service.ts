import { LabPipelineError } from "./labUploadValidator.service.js";

export interface ParsedLabResult {
  fastingBloodSugar?: { value: number; unit: string };
  HbA1c?: { value: number; unit: string };
  totalCholesterol?: { value: number; unit: string };
  ldl?: { value: number; unit: string };
  hdl?: { value: number; unit: string };
  triglycerides?: { value: number; unit: string };
  bloodPressure?: { systolic: number; diastolic: number; unit?: string };
  weight?: { value: number; unit: string };
  height?: { value: number; unit: string };
  reportDate?: string;
}

export class LabParser {
  /**
   * Parse raw OCR text into structured lab result object, validating schema and values.
   */
  public static parse(rawJsonText: string): ParsedLabResult {
    console.log("[LabParser] Parsing raw OCR JSON response.");

    if (!rawJsonText || typeof rawJsonText !== "string" || rawJsonText.trim() === "") {
      console.log("[LabParser] Parsing failed: Empty JSON text.");
      throw new LabPipelineError("LAB_EXTRACTION_PARSE_FAILED", 503);
    }

    let result: any = null;
    try {
      result = JSON.parse(rawJsonText);
    } catch {
      console.log("[LabParser] Parsing failed: Malformed JSON syntax.");
      throw new LabPipelineError("LAB_EXTRACTION_PARSE_FAILED", 503);
    }

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      console.log("[LabParser] Parsing failed: Result is not a valid JSON object.");
      throw new LabPipelineError("LAB_EXTRACTION_PARSE_FAILED", 503);
    }

    const biomarkerKeys = [
      "fastingBloodSugar",
      "HbA1c",
      "totalCholesterol",
      "ldl",
      "hdl",
      "triglycerides",
      "weight",
      "height",
    ];

    for (const name of biomarkerKeys) {
      if (!(name in result)) continue;
      const biomarker = result[name];
      if (
        !biomarker ||
        typeof biomarker !== "object" ||
        typeof biomarker.value !== "number" ||
        !Number.isFinite(biomarker.value) ||
        typeof biomarker.unit !== "string" ||
        biomarker.unit.trim() === ""
      ) {
        console.log(`[LabParser] Parsing failed: Invalid schema for biomarker '${name}'.`);
        throw new LabPipelineError("LAB_EXTRACTION_PARSE_FAILED", 503);
      }
    }

    if ("bloodPressure" in result) {
      const bp = result.bloodPressure;
      if (
        !bp ||
        typeof bp !== "object" ||
        typeof bp.systolic !== "number" ||
        !Number.isFinite(bp.systolic) ||
        typeof bp.diastolic !== "number" ||
        !Number.isFinite(bp.diastolic)
      ) {
        console.log("[LabParser] Parsing failed: Invalid bloodPressure schema.");
        throw new LabPipelineError("LAB_EXTRACTION_PARSE_FAILED", 503);
      }
    }

    const extractedKeys = [...biomarkerKeys, "bloodPressure"].filter((name) => name in result);
    if (extractedKeys.length === 0) {
      console.log("[LabParser] Parsing failed: Zero biomarkers extracted in result.");
      throw new LabPipelineError("LAB_EXTRACTION_EMPTY_RESULT", 503);
    }

    if (result.reportDate !== undefined && typeof result.reportDate !== "string") {
      console.log("[LabParser] Parsing failed: Invalid reportDate type.");
      throw new LabPipelineError("LAB_EXTRACTION_PARSE_FAILED", 503);
    }

    console.log(`[LabParser] Successfully parsed ${extractedKeys.length} biomarkers.`);
    return result as ParsedLabResult;
  }
}
