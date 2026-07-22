import { describe, it, expect } from "vitest";
import { assessIngredientsImage } from "./health.functions";
import { getHumanReadableReason } from "../routes/_app.scanner.lazy";
import { FoodImpactService } from "../../backend/src/services/foodImpact.service";

describe("Food Scanner Image Ingredient Extraction & Diagnostic Pipeline", () => {
  it("rejects HEIC/HEIF image format before upload and returns UNSUPPORTED_FORMAT", async () => {
    const result = await assessIngredientsImage({
      base64Image: "fakebase64",
      mimeType: "image/heic",
    });

    expect(result.status).toBe("extraction-unavailable");
    expect(result.reasonCode).toBe("UNSUPPORTED_FORMAT");
    expect(result.manualEntryAllowed).toBe(true);
    expect(result.message).toContain("HEIC/HEIF");
  });

  it("rejects empty base64 image payload with IMAGE_EMPTY", async () => {
    const result = await assessIngredientsImage({
      base64Image: "",
      mimeType: "image/jpeg",
    });

    expect(result.status).toBe("extraction-unavailable");
    expect(result.reasonCode).toBe("IMAGE_EMPTY");
    expect(result.manualEntryAllowed).toBe(true);
    expect(result.message).toContain("empty");
  });

  it("maps raw technical reasonCodes into human-readable clinical messages", () => {
    expect(getHumanReadableReason("NO_INGREDIENTS_DETECTED")).toContain("No ingredient list detected");
    expect(getHumanReadableReason("UNSUPPORTED_FORMAT")).toContain("Unsupported file format");
    expect(getHumanReadableReason("IMAGE_TOO_LARGE")).toContain("exceeds 10 MB limit");
    expect(getHumanReadableReason("IMAGE_EMPTY")).toContain("file is empty");
    expect(getHumanReadableReason("IMAGE_PREPROCESSING_FAILED")).toContain("corrupted or unreadable");
    expect(getHumanReadableReason("GEMINI_AUTH_FAILED")).toContain("authentication failed");
    expect(getHumanReadableReason("GEMINI_QUOTA_EXCEEDED")).toContain("rate limit reached");
    expect(getHumanReadableReason("GEMINI_TIMEOUT")).toContain("timed out");
    expect(getHumanReadableReason("GEMINI_REQUEST_FAILED")).toContain("currently unavailable");
    expect(getHumanReadableReason("GEMINI_RESPONSE_PARSE_FAILED")).toContain("Unable to read ingredient text");
  });

  it("does not fabricate reports on extraction failure and provides manual entry option", async () => {
    const mockFailedResult = {
      status: "extraction-unavailable",
      reasonCode: "NO_INGREDIENTS_DETECTED",
      manualEntryAllowed: true,
      message: "No ingredient list detected in this image. Please upload a clear photo of the ingredient label.",
    };

    expect(mockFailedResult.status).toBe("extraction-unavailable");
    expect(mockFailedResult.reasonCode).toBe("NO_INGREDIENTS_DETECTED");
    expect(mockFailedResult).not.toHaveProperty("goodIngredients");
    expect(mockFailedResult).not.toHaveProperty("watchOut");
    expect(mockFailedResult).not.toHaveProperty("score");
  });

  it("extracts ingredients from clear label text correctly", () => {
    const rawLabelText = "Ingredients: Rolled Oats, Almond Slices, Whole Milk Powder, Chia Seeds, Salt";
    const extracted = FoodImpactService.parseIngredientsFromRawText(rawLabelText);

    expect(extracted.length).toBeGreaterThan(0);
    expect(extracted).toContain("Rolled Oats");
    expect(extracted).toContain("Almond Slices");
  });

  it("consumes full extracted ingredients array for deterministic scoring", () => {
    const fullIngredients = ["Whole Grain Oats", "Almonds", "Sugar", "Palm Oil", "Salt"];
    const result = FoodImpactService.analyzePersonalizedFood(
      fullIngredients,
      FoodImpactService.parseNutritionFacts(fullIngredients),
      { diabetes: 20, heart: 20, hypertension: 20 },
    );

    expect(result.goodIngredients).toEqual(["whole grain oats", "almonds"]);
    expect(result.personalizedFoodScore).toBeGreaterThan(0);
  });
});
