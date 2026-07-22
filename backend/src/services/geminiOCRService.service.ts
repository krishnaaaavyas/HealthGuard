import { LabPipelineError } from "./labUploadValidator.service.js";

export class GeminiOCRService {
  /**
   * Execute Gemini OCR API request to extract raw biomarker JSON text.
   */
  public static async executeOCR(contents: any[]): Promise<string> {
    console.log("[GeminiOCRService] Checking Gemini API credentials.");

    const key = process.env.GEMINI_API_KEY;
    if (
      !key ||
      key === "YOUR_GEMINI_API_KEY" ||
      key.includes("placeholder") ||
      key.trim() === ""
    ) {
      console.log("[GeminiOCRService] OCR failed: Gemini API key missing or invalid.");
      throw new LabPipelineError("LAB_EXTRACTION_CREDENTIALS_MISSING", 503);
    }

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key as string)}`;

    const labPrompt = `You are a clinical laboratory data extraction system. Analyze the provided lab report image or document.
Extract the following biomarkers if present, including their numeric value and unit. Do not guess values.
Biomarkers to look for:
1. fastingBloodSugar (fasting blood glucose, FBS)
2. HbA1c (Glycated hemoglobin, A1c)
3. totalCholesterol
4. ldl (LDL Cholesterol)
5. hdl (HDL Cholesterol)
6. triglycerides
7. bloodPressure (systolic and diastolic in mmHg)
8. weight (body weight)
9. height (body height)

Also extract the report date/test date if visible.

Return strictly valid JSON matching the requested schema.`;

    const geminiContents = JSON.parse(JSON.stringify(contents));
    geminiContents.push({
      role: "user",
      parts: [{ text: labPrompt }],
    });

    console.log("[GeminiOCRService] Sending request to Gemini Vision API.");

    let geminiResp: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      geminiResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                fastingBloodSugar: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                HbA1c: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                totalCholesterol: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                ldl: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                hdl: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                triglycerides: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                bloodPressure: {
                  type: "object",
                  properties: {
                    systolic: { type: "number" },
                    diastolic: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                weight: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                height: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                    unit: { type: "string" },
                  },
                },
                reportDate: {
                  type: "string",
                  description: "Date of the report in YYYY-MM-DD format if visible",
                },
              },
            },
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchErr: any) {
      if (fetchErr?.name === "AbortError" || String(fetchErr?.message).includes("aborted")) {
        console.log("[GeminiOCRService] OCR failed: Timeout contacting Gemini API.");
        throw new LabPipelineError("LAB_EXTRACTION_TIMEOUT", 503);
      }
      console.log(`[GeminiOCRService] OCR failed: Fetch error: ${fetchErr?.message}`);
      throw new LabPipelineError("LAB_EXTRACTION_UNAVAILABLE", 503);
    }

    if (!geminiResp.ok) {
      console.log(`[GeminiOCRService] OCR failed: Gemini HTTP status ${geminiResp.status}`);
      throw new LabPipelineError("LAB_EXTRACTION_UNAVAILABLE", 503);
    }

    const geminiJson: any = await geminiResp.json();
    const geminiText =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";

    console.log(`[GeminiOCRService] OCR completed successfully. Response length: ${geminiText.length} chars.`);
    return geminiText;
  }
}
