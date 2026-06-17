export class GuardrailsService {
  private static bannedMedications = [
    "metformin",
    "insulin",
    "lisinopril",
    "atorvastatin",
    "statin",
    "statins",
    "amlodipine",
    "beta-blocker",
    "beta-blockers",
    "metoprolol",
    "losartan",
    "glipizide",
    "ibuprofen",
    "aspirin",
  ];

  private static diagnosticPhrases = [
    {
      phrase: "you have diabetes",
      replacement: "your profile suggests elevated diabetes risk markers",
    },
    {
      phrase: "you definitely have diabetes",
      replacement: "your profile suggests highly elevated risk markers for diabetes",
    },
    {
      phrase: "you have hypertension",
      replacement: "your profile suggests elevated blood pressure risk indicators",
    },
    {
      phrase: "you have cardiovascular disease",
      replacement: "your profile indicates potential cardiovascular risk markers",
    },
    {
      phrase: "you are diagnosed with",
      replacement: "your profile suggests risk patterns associated with",
    },
    {
      phrase: "we diagnose you with",
      replacement: "risk estimation suggests indicators of",
    },
    {
      phrase: "you should stop medication",
      replacement:
        "any changes to your active prescriptions should be discussed with a medical professional",
    },
    {
      phrase: "stop taking your medication",
      replacement: "do not alter or stop prescribed medication without consulting your doctor",
    },
    {
      phrase: "stop medication",
      replacement: "consult your physician before modifying medication regimens",
    },
  ];

  /**
   * Sanitizes text to remove diagnoses, drug prescriptions, and unsafe statements.
   */
  static sanitizeText(text: string): string {
    if (!text) return text;
    let cleaned = text;

    // 1. Redact specific prescription drugs (case-insensitive)
    this.bannedMedications.forEach((med) => {
      const regex = new RegExp(`\\b${med}\\b`, "gi");
      cleaned = cleaned.replace(
        regex,
        "[medication reference redacted; please consult your physician for clinical prescriptions]",
      );
    });

    // 2. Adjust definite diagnostic or unsafe assertions
    this.diagnosticPhrases.forEach(({ phrase, replacement }) => {
      const regex = new RegExp(phrase, "gi");
      cleaned = cleaned.replace(regex, replacement);
    });

    return cleaned;
  }

  /**
   * Checks if the text violates safety constraints (e.g. contains diagnoses or prescriptions).
   * Returns true if safe, false if it contains serious violations that require prompt correction.
   */
  static verifySafety(text: string): boolean {
    if (!text) return true;
    const lower = text.toLowerCase();

    // Check for explicit drug mentions or diagnosis statements
    const hasMetformin = lower.includes("metformin") || lower.includes("take metformin");
    const hasDefiniteDiabetes =
      lower.includes("you definitely have diabetes") || lower.includes("you have diabetes");
    const hasStopMed =
      lower.includes("stop medication") ||
      lower.includes("stop taking your medication") ||
      lower.includes("should stop medication");

    if (hasMetformin || hasDefiniteDiabetes || hasStopMed) {
      return false; // requires regeneration or deep sanitization
    }

    return true;
  }
}
