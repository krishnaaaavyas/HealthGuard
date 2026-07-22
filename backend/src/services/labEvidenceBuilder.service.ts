import { ParsedLabResult } from "./labParser.service.js";
import { RawLabObservationInput, UploadedReportMetadata } from "./evidenceBuilder.service.js";

export class LabEvidenceBuilder {
  /**
   * Build array of RawLabObservationInput objects from normalized ParsedLabResult.
   */
  public static buildObservations(
    normalized: ParsedLabResult,
    source: string = "ocr",
  ): RawLabObservationInput[] {
    console.log("[LabEvidenceBuilder] Building lab observations array for Evidence pipeline.");
    const observations: RawLabObservationInput[] = [];
    const now = normalized.reportDate || new Date().toISOString();

    if (normalized.fastingBloodSugar) {
      observations.push({
        code: "fasting_blood_sugar",
        name: "Fasting Blood Sugar",
        value: normalized.fastingBloodSugar.value,
        unit: normalized.fastingBloodSugar.unit,
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    if (normalized.HbA1c) {
      observations.push({
        code: "hba1c",
        name: "HbA1c",
        value: normalized.HbA1c.value,
        unit: normalized.HbA1c.unit,
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    if (normalized.totalCholesterol) {
      observations.push({
        code: "total_cholesterol",
        name: "Total Cholesterol",
        value: normalized.totalCholesterol.value,
        unit: normalized.totalCholesterol.unit,
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    if (normalized.ldl) {
      observations.push({
        code: "ldl",
        name: "LDL Cholesterol",
        value: normalized.ldl.value,
        unit: normalized.ldl.unit,
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    if (normalized.hdl) {
      observations.push({
        code: "hdl",
        name: "HDL Cholesterol",
        value: normalized.hdl.value,
        unit: normalized.hdl.unit,
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    if (normalized.triglycerides) {
      observations.push({
        code: "triglycerides",
        name: "Triglycerides",
        value: normalized.triglycerides.value,
        unit: normalized.triglycerides.unit,
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    if (normalized.bloodPressure) {
      observations.push({
        code: "systolic_bp",
        name: "Systolic Blood Pressure",
        value: normalized.bloodPressure.systolic,
        unit: "mmHg",
        isVerified: true,
        source,
        observedAt: now,
      });
      observations.push({
        code: "diastolic_bp",
        name: "Diastolic Blood Pressure",
        value: normalized.bloodPressure.diastolic,
        unit: "mmHg",
        isVerified: true,
        source,
        observedAt: now,
      });
    }

    console.log(`[LabEvidenceBuilder] Created ${observations.length} biomarker observation entries.`);
    return observations;
  }

  /**
   * Build UploadedReportMetadata for Evidence engine.
   */
  public static buildMetadata(
    safeMimeType: string,
    fileSizeBucket: string,
    observationsCount: number,
  ): UploadedReportMetadata {
    return {
      source: "ocr",
      mimeType: safeMimeType,
      fileSizeBucket,
      uploadedAt: new Date().toISOString(),
      extractionStatus: "extracted",
      verifiedLabsCount: observationsCount,
      rawObservationsCount: observationsCount,
    };
  }
}
