import { ParsedLabResult } from "./labParser.service.js";

export class UnitNormalizer {
  /**
   * Normalize unit values to standard clinical units:
   * Glucose/Lipids -> mg/dL, HbA1c -> %, Weight -> kg, Height -> cm, BloodPressure -> mmHg
   */
  public static normalize(parsed: ParsedLabResult): ParsedLabResult {
    console.log("[UnitNormalizer] Starting unit normalization for extracted lab biomarkers.");
    const result: ParsedLabResult = JSON.parse(JSON.stringify(parsed));

    if (result.fastingBloodSugar?.value && typeof result.fastingBloodSugar.value === "number") {
      const unit = (result.fastingBloodSugar.unit || "").toLowerCase();
      if (unit.includes("mmol")) {
        result.fastingBloodSugar = {
          value: Number((result.fastingBloodSugar.value * 18.018).toFixed(1)),
          unit: "mg/dL",
        };
      } else {
        result.fastingBloodSugar.unit = "mg/dL";
      }
    }

    if (result.HbA1c?.value && typeof result.HbA1c.value === "number") {
      const unit = (result.HbA1c.unit || "").toLowerCase();
      if (unit.includes("mmol")) {
        result.HbA1c = {
          value: Number((result.HbA1c.value * 0.09148 + 2.152).toFixed(1)),
          unit: "%",
        };
      } else {
        result.HbA1c.unit = "%";
      }
    }

    const lipidKeys: Array<"totalCholesterol" | "ldl" | "hdl" | "triglycerides"> = [
      "totalCholesterol",
      "ldl",
      "hdl",
      "triglycerides",
    ];

    lipidKeys.forEach((key) => {
      if (result[key]?.value && typeof result[key].value === "number") {
        const unit = (result[key]!.unit || "").toLowerCase();
        if (unit.includes("mmol")) {
          const factor = key === "triglycerides" ? 88.57 : 38.67;
          result[key] = {
            value: Number((result[key]!.value * factor).toFixed(1)),
            unit: "mg/dL",
          };
        } else {
          result[key]!.unit = "mg/dL";
        }
      }
    });

    if (result.weight?.value && typeof result.weight.value === "number") {
      const unit = (result.weight.unit || "").toLowerCase();
      if (unit.includes("lb")) {
        result.weight = {
          value: Number((result.weight.value * 0.453592).toFixed(1)),
          unit: "kg",
        };
      } else {
        result.weight.unit = "kg";
      }
    }

    if (result.height?.value && typeof result.height.value === "number") {
      const unit = (result.height.unit || "").toLowerCase();
      if (unit === "m" || unit === "meters") {
        result.height = {
          value: Number((result.height.value * 100).toFixed(1)),
          unit: "cm",
        };
      } else if (unit.includes("in")) {
        result.height = {
          value: Number((result.height.value * 2.54).toFixed(1)),
          unit: "cm",
        };
      } else {
        result.height.unit = "cm";
      }
    }

    if (result.bloodPressure && typeof result.bloodPressure.systolic === "number") {
      result.bloodPressure.unit = "mmHg";
    }

    console.log("[UnitNormalizer] Unit normalization completed cleanly.");
    return result;
  }
}
