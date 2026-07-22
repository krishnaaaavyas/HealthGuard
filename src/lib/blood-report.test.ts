import { describe, it, expect, vi } from "vitest";
import { assessLabReportImage, normalizeLabUnits, type ExtractedLabReport } from "./health.functions";

describe("Blood Report Analysis & Pipeline Audit", () => {
  it("rejects unsupported file formats like HEIC with UNSUPPORTED_FORMAT", async () => {
    const res = await assessLabReportImage({
      base64Image: "fakebase64data",
      mimeType: "image/heic",
      externalProcessingConsent: true,
    });

    expect(res.status).toBe("extraction-unavailable");
    expect(res.reasonCode).toBe("UNSUPPORTED_FORMAT");
    expect(res.manualEntryAllowed).toBe(true);
    expect(res.message).toContain("HEIC");
  });

  it("rejects unsupported MIME types with UNSUPPORTED_FORMAT", async () => {
    const res = await assessLabReportImage({
      base64Image: "fakebase64data",
      mimeType: "text/plain",
      externalProcessingConsent: true,
    });

    expect(res.status).toBe("extraction-unavailable");
    expect(res.reasonCode).toBe("UNSUPPORTED_FORMAT");
    expect(res.manualEntryAllowed).toBe(true);
  });

  it("rejects empty file inputs with REPORT_EMPTY", async () => {
    const res = await assessLabReportImage({
      base64Image: "",
      mimeType: "application/pdf",
      externalProcessingConsent: true,
    });

    expect(res.status).toBe("extraction-unavailable");
    expect(res.reasonCode).toBe("REPORT_EMPTY");
    expect(res.manualEntryAllowed).toBe(true);
    expect(res.message).toContain("empty");
  });

  it("never fabricates biomarkers on extraction failure", async () => {
    // Mock global fetch to simulate a backend extraction error
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        status: "extraction-unavailable",
        reasonCode: "EXTRACTION_UNAVAILABLE",
        observations: [],
        manualEntryAllowed: true,
        message: "Extraction unavailable. Allow manual entry.",
      }),
    });

    try {
      const res = await assessLabReportImage({
        base64Image: "SGVsbG8gV29ybGQ=",
        mimeType: "image/png",
        externalProcessingConsent: true,
      });

      expect(res.status).toBe("extraction-unavailable");
      expect(res.reasonCode).toBe("EXTRACTION_UNAVAILABLE");
      expect(res.manualEntryAllowed).toBe(true);
      expect(res.fastingBloodSugar).toBeUndefined();
      expect(res.HbA1c).toBeUndefined();
      expect(res.ldl).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("normalizes glucose units from mmol/L to mg/dL", () => {
    const rawReport: ExtractedLabReport = {
      fastingBloodSugar: { value: 6.0, unit: "mmol/L" },
    };

    const normalized = normalizeLabUnits(rawReport);
    expect(normalized.fastingBloodSugar?.value).toBe(108.1); // 6.0 * 18.018
    expect(normalized.fastingBloodSugar?.unit).toBe("mg/dL");
  });

  it("normalizes HbA1c units from mmol/mol to %", () => {
    const rawReport: ExtractedLabReport = {
      HbA1c: { value: 42, unit: "mmol/mol" },
    };

    const normalized = normalizeLabUnits(rawReport);
    expect(normalized.HbA1c?.value).toBe(6.0); // (42 * 0.09148) + 2.152
    expect(normalized.HbA1c?.unit).toBe("%");
  });

  it("normalizes lipid panel units from mmol/L to mg/dL", () => {
    const rawReport: ExtractedLabReport = {
      totalCholesterol: { value: 5.2, unit: "mmol/L" },
      ldl: { value: 3.4, unit: "mmol/L" },
      hdl: { value: 1.3, unit: "mmol/L" },
      triglycerides: { value: 1.7, unit: "mmol/L" },
    };

    const normalized = normalizeLabUnits(rawReport);
    expect(normalized.totalCholesterol?.value).toBe(201.1); // 5.2 * 38.67
    expect(normalized.totalCholesterol?.unit).toBe("mg/dL");
    expect(normalized.ldl?.value).toBe(131.5); // 3.4 * 38.67
    expect(normalized.hdl?.value).toBe(50.3); // 1.3 * 38.67
    expect(normalized.triglycerides?.value).toBe(150.6); // 1.7 * 88.57
  });

  it("normalizes weight from lbs to kg and height from meters/inches to cm", () => {
    const rawReport: ExtractedLabReport = {
      weight: { value: 154, unit: "lbs" },
      height: { value: 1.75, unit: "m" },
    };

    const normalized = normalizeLabUnits(rawReport);
    expect(normalized.weight?.value).toBe(69.9); // 154 * 0.453592
    expect(normalized.weight?.unit).toBe("kg");
    expect(normalized.height?.value).toBe(175); // 1.75 * 100
    expect(normalized.height?.unit).toBe("cm");
  });

  it("normalizes blood pressure unit to mmHg", () => {
    const rawReport: ExtractedLabReport = {
      bloodPressure: { systolic: 120, diastolic: 80, unit: "unknown" },
    };

    const normalized = normalizeLabUnits(rawReport);
    expect(normalized.bloodPressure?.systolic).toBe(120);
    expect(normalized.bloodPressure?.diastolic).toBe(80);
    expect(normalized.bloodPressure?.unit).toBe("mmHg");
  });
});
