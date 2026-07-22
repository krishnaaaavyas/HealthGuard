import { Response } from "express";
import { ParsedLabResult } from "./labParser.service.js";

export interface LabDegradationResponse {
  status: "manual-entry-required" | "extraction-unavailable";
  reasonCode: string;
  stage: string;
  message: string;
  processingTime: number;
  manualEntryAllowed: true;
  missingBiomarkers: string[];
  confidence: number;
  observations: any[];
}

export class LabResponseBuilder {
  public static readonly ALL_BIOMARKER_KEYS = [
    "fastingBloodSugar",
    "HbA1c",
    "totalCholesterol",
    "ldl",
    "hdl",
    "triglycerides",
    "bloodPressure",
    "weight",
    "height",
  ];

  /**
   * Format and return structured degradation response (manual entry fallback) when Gemini extraction fails or is disabled.
   */
  public static buildUnavailable(
    res: Response,
    reasonCode: string,
    statusCode: number,
    requestId: string,
    mimeType: string,
    fileSizeBucket: string,
    durationMs: number,
    stage: string = "Unknown",
    message: string = "Extraction unavailable. Allow manual entry.",
    extractedBiomarkerKeys: string[] = []
  ): Response {
    console.log(
      JSON.stringify({
        requestId,
        mimeType,
        fileSizeBucket,
        reasonCode,
        stage,
        status: "manual-entry-required",
        durationMs,
      })
    );

    const missingBiomarkers = this.ALL_BIOMARKER_KEYS.filter(
      (key) => !extractedBiomarkerKeys.includes(key)
    );

    const payload: LabDegradationResponse = {
      status: "manual-entry-required",
      reasonCode,
      stage,
      message,
      processingTime: durationMs,
      manualEntryAllowed: true,
      missingBiomarkers,
      confidence: 0,
      observations: [],
    };

    return res.status(statusCode).json(payload);
  }

  /**
   * Format and return structured success response.
   */
  public static buildSuccess(
    res: Response,
    result: ParsedLabResult,
    requestId: string,
    mimeType: string,
    fileSizeBucket: string,
    durationMs: number,
  ): Response {
    console.log(
      JSON.stringify({
        requestId,
        mimeType,
        fileSizeBucket,
        status: "extracted",
        stage: "Complete",
        durationMs,
      })
    );

    return res.json({
      ...result,
      status: "extracted",
      stage: "Complete",
      processingTime: durationMs,
      manualEntryAllowed: true,
      confidence: 0.95,
    });
  }
}
