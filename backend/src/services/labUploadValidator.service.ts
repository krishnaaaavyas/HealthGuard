import { validateLabUpload } from "./labUploadValidation.service.js";

export interface LabValidationResult {
  isValid: boolean;
  safeMimeType: string;
  fileSizeBucket: string;
  reasonCode?: string;
  statusCode?: number;
}

export class LabPipelineError extends Error {
  public reasonCode: string;
  public statusCode: number;

  constructor(reasonCode: string, statusCode: number = 400, message?: string) {
    super(message || reasonCode);
    this.name = "LabPipelineError";
    this.reasonCode = reasonCode;
    this.statusCode = statusCode;
  }
}

export class LabUploadValidator {
  private static getFileSizeBucket(bytes: number): string {
    if (bytes < 100 * 1024) return "<100KB";
    if (bytes < 1024 * 1024) return "100KB-1MB";
    if (bytes < 5 * 1024 * 1024) return "1MB-5MB";
    if (bytes < 10 * 1024 * 1024) return "5MB-10MB";
    return ">10MB";
  }

  /**
   * Validate incoming lab report upload request body, feature flags, consent, and binary integrity.
   */
  public static async validate(body: any): Promise<LabValidationResult> {
    console.log("[LabUploadValidator] Starting validation of lab report upload request.");

    const { contents, externalProcessingConsent } = body || {};

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      console.log("[LabUploadValidator] Validation failed: Missing or invalid contents array.");
      throw new LabPipelineError("LAB_FILE_INVALID", 400);
    }

    let safeMimeType = "unknown";
    let fileSizeBucket = "unknown";

    const inlinePart = contents.flatMap((entry: any) =>
      Array.isArray(entry?.parts) ? entry.parts.filter((p: any) => p?.inlineData) : []
    )[0];

    if (inlinePart?.inlineData?.mimeType) {
      safeMimeType = String(inlinePart.inlineData.mimeType);
    }

    if (inlinePart?.inlineData?.data && typeof inlinePart.inlineData.data === "string") {
      const estimatedBytes = Math.floor((inlinePart.inlineData.data.length * 3) / 4);
      fileSizeBucket = this.getFileSizeBucket(estimatedBytes);
    }

    const processingEnabled = process.env.GEMINI_LAB_PROCESSING_ENABLED !== "false";
    if (!processingEnabled) {
      console.log("[LabUploadValidator] Validation failed: Lab processing is disabled.");
      throw new LabPipelineError("LAB_EXTRACTION_DISABLED", 503);
    }

    const consentRequired = process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT
      ? process.env.REQUIRE_EXTERNAL_PROCESSING_CONSENT === "true"
      : process.env.NODE_ENV === "production";

    if (consentRequired && externalProcessingConsent !== true) {
      console.log("[LabUploadValidator] Validation failed: Required processing consent missing.");
      throw new LabPipelineError("LAB_EXTRACTION_CONSENT_REQUIRED", 422);
    }

    try {
      await validateLabUpload(contents);
    } catch (validationError: any) {
      const msg = String(validationError?.message || "");
      console.log(`[LabUploadValidator] Binary/schema validation error: ${msg}`);

      if (
        msg === "LAB_UPLOAD_UNSUPPORTED_MIME_TYPE" ||
        msg === "LAB_UPLOAD_MIME_SIGNATURE_MISMATCH" ||
        msg === "LAB_UPLOAD_HEIC_UNSUPPORTED"
      ) {
        throw new LabPipelineError("LAB_FILE_UNSUPPORTED", 400);
      }
      if (msg === "LAB_UPLOAD_EMPTY_FILE") {
        throw new LabPipelineError("LAB_FILE_EMPTY", 400);
      }
      if (msg === "LAB_UPLOAD_SIZE_LIMIT_EXCEEDED") {
        throw new LabPipelineError("LAB_FILE_TOO_LARGE", 400);
      }
      if (msg === "LAB_UPLOAD_DIMENSIONS_EXCEEDED") {
        throw new LabPipelineError("LAB_IMAGE_DIMENSIONS_EXCEEDED", 400);
      }
      if (msg === "LAB_UPLOAD_PDF_UNREADABLE") {
        throw new LabPipelineError("LAB_PDF_UNREADABLE", 400);
      }
      throw new LabPipelineError("LAB_FILE_INVALID", 400);
    }

    console.log(`[LabUploadValidator] Validation passed. mimeType: ${safeMimeType}, sizeBucket: ${fileSizeBucket}`);
    return {
      isValid: true,
      safeMimeType,
      fileSizeBucket,
    };
  }
}
