import { Response } from "express";
import { ParsedLabResult } from "./labParser.service.js";

export interface LabExtractionUnavailableResponse {
  status: "extraction-unavailable";
  reasonCode: string;
  observations: any[];
  manualEntryAllowed: true;
}

export class LabResponseBuilder {
  /**
   * Format and return structured extraction-unavailable response.
   */
  public static buildUnavailable(
    res: Response,
    reasonCode: string,
    statusCode: number,
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
        reasonCode,
        durationMs,
      })
    );

    const payload: LabExtractionUnavailableResponse = {
      status: "extraction-unavailable",
      reasonCode,
      observations: [],
      manualEntryAllowed: true,
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
        durationMs,
      })
    );

    return res.json({
      ...result,
      status: "extracted",
    });
  }
}
