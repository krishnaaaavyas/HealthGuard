export type DietStrategy =
  | "Calorie Deficit"
  | "Low Sodium"
  | "Low Glycemic"
  | "Heart-Healthy / Lipid Control"
  | "Balanced Wellness";

export interface MealRecommendation {
  meal: string;
  reason: string;
  expectedBenefit: string;
}

export interface DailyDietPlan {
  breakfast: MealRecommendation;
  lunch: MealRecommendation;
  snacks: MealRecommendation;
  dinner: MealRecommendation;
}

export interface DietEngineInput {
  priorities?: Array<{ id: string; title: string; severity?: string; category?: string }>;
  bmi?: number;
  heightCm?: number;
  weightKg?: number;
  diabetesRiskCategory?: "low" | "moderate" | "high";
  diabetesRiskScore?: number;
  hypertensionRiskCategory?: "low" | "moderate" | "high";
  hypertensionRiskScore?: number;
  systolic?: number;
  diastolic?: number;
  fastingBloodSugar?: number;
  hba1c?: number;
  totalCholesterol?: number;
  ldl?: number;
  dietType?: "vegetarian" | "vegan" | "eggetarian" | "non-vegetarian" | "jain" | "satvik" | "no-onion-garlic" | string;
  allergies?: string[];
  foodAllergies?: string;
  lactoseIntolerant?: boolean;
  excludedFoods?: string[];
  [key: string]: any;
}

export interface WeeklyDietPlan {
  mon: DailyDietPlan;
  tue: DailyDietPlan;
  wed: DailyDietPlan;
  thu: DailyDietPlan;
  fri: DailyDietPlan;
  sat: DailyDietPlan;
  sun: DailyDietPlan;
  [key: string]: DailyDietPlan;
}

export interface DietEngineOutput {
  strategy: DietStrategy;
  strategyReason: string;
  meals: DailyDietPlan;
  weeklyPlan: WeeklyDietPlan;
  constraintsApplied: {
    dietType: string;
    allergies: string[];
    exclusions: string[];
  };
}

export interface MealTemplate {
  name: string;
  course: "breakfast" | "lunch" | "snacks" | "dinner";
  strategies: DietStrategy[];
  types: string[]; // ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic", "eggetarian", "non-vegetarian"]
  contains: string[]; // ["milk", "paneer", "curd", "cheese", "ghee", "eggs", "fish", "chicken", "onion", "garlic", "root-vegetables", "peanuts", "soy", "gluten"]
  reasons: Record<DietStrategy, { reason: string; expectedBenefit: string }>;
}

export const FALLBACK_MEAL: MealRecommendation = {
  meal: "No safe meal available.",
  reason: "Constraints restrict all available options.",
  expectedBenefit: "Consult a dietitian for custom options.",
};

// Reusable Deterministic Meal Template Catalog
export const REUSABLE_MEAL_CATALOG: MealTemplate[] = [
  // ─── BREAKFAST ───
  {
    name: "Vegetable Oats",
    course: "breakfast",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: ["gluten"],
    reasons: {
      "Low Glycemic": {
        reason: "Lower glycemic load and rich in soluble beta-glucan fiber.",
        expectedBenefit: "Supports blood sugar management and postprandial glucose stability.",
      },
      "Calorie Deficit": {
        reason: "High volume, low energy density breakfast.",
        expectedBenefit: "Promotes satiety while maintaining target calorie deficit.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Beta-glucan fiber binds digestive cholesterol.",
        expectedBenefit: "Helps reduce systemic LDL cholesterol absorption.",
      },
      "Low Sodium": {
        reason: "Naturally sodium-free whole grain base.",
        expectedBenefit: "Maintains optimal vascular pressure control.",
      },
      "Balanced Wellness": {
        reason: "Complex carbohydrates and dietary fiber balance.",
        expectedBenefit: "Sustained morning energy release.",
      },
    },
  },
  {
    name: "Moong Dal Chilla",
    course: "breakfast",
    strategies: ["Low Glycemic", "Calorie Deficit", "Balanced Wellness", "Low Sodium"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "High plant-based protein with a low glycemic index.",
        expectedBenefit: "Prevents glucose spikes and stabilizes insulin response.",
      },
      "Calorie Deficit": {
        reason: "Protein-dense pancake with minimal fats.",
        expectedBenefit: "Supports appetite regulation during weight loss.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Zero cholesterol and rich in legumes.",
        expectedBenefit: "Supports arterial wall health.",
      },
      "Low Sodium": {
        reason: "Fresh herb seasoning with minimal added salt.",
        expectedBenefit: "Helps keep blood pressure in range.",
      },
      "Balanced Wellness": {
        reason: "Lentil protein and micro-nutrient balance.",
        expectedBenefit: "Promotes metabolic health.",
      },
    },
  },
  {
    name: "Ragi Dosa with Coconut Chutney",
    course: "breakfast",
    strategies: ["Low Glycemic", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "Finger millet provides slow-release carbohydrates and calcium.",
        expectedBenefit: "Supports glycemic control and bone density.",
      },
      "Calorie Deficit": {
        reason: "High fiber millet breakfast.",
        expectedBenefit: "Extends satiety between meals.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Polyphenol-rich whole grain millet.",
        expectedBenefit: "Provides lipid-protective antioxidants.",
      },
      "Low Sodium": {
        reason: "Fermented batter naturally low in sodium.",
        expectedBenefit: "Supports vascular endothelium health.",
      },
      "Balanced Wellness": {
        reason: "Traditional fermented calcium-rich breakfast.",
        expectedBenefit: "Improves gut microbiome diversity.",
      },
    },
  },
  {
    name: "Sprouts Chaat",
    course: "breakfast",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "Raw sprouted legume enzymes with high protein content.",
        expectedBenefit: "Minimal impact on blood sugar response.",
      },
      "Calorie Deficit": {
        reason: "Nutrient-dense with exceptionally low calorie count.",
        expectedBenefit: "Ideal for structured weight reduction goals.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Rich in vitamin C, active enzymes, and plant fiber.",
        expectedBenefit: "Reduces oxidative lipid modification.",
      },
      "Low Sodium": {
        reason: "Lemon juice and herbs substitute for table salt.",
        expectedBenefit: "Controls fluid balance and blood pressure.",
      },
      "Balanced Wellness": {
        reason: "Bioavailable plant protein and vitamins.",
        expectedBenefit: "Boosts cellular metabolic energy.",
      },
    },
  },

  // ─── LUNCH ───
  {
    name: "Dal Tadka with Brown Rice and Cucumber Salad",
    course: "lunch",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan"],
    contains: ["onion", "garlic"],
    reasons: {
      "Low Glycemic": {
        reason: "Brown rice provides complex starch paired with high-protein yellow lentils.",
        expectedBenefit: "Moderates postprandial glucose rise.",
      },
      "Calorie Deficit": {
        reason: "High fiber pulse and whole grain combination.",
        expectedBenefit: "Prevents afternoon hunger cravings.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Zero saturated fat and high soluble legume fiber.",
        expectedBenefit: "Encourages bile acid excretion and cholesterol lowering.",
      },
      "Low Sodium": {
        reason: "Steamed grain and spiced pulse with low sodium seasoning.",
        expectedBenefit: "Maintains optimal systolic blood pressure.",
      },
      "Balanced Wellness": {
        reason: "Complete amino acid profile from grain + legume pairing.",
        expectedBenefit: "Supports muscle tissue maintenance.",
      },
    },
  },
  {
    name: "Gujarati Khichdi with Curd",
    course: "lunch",
    strategies: ["Low Glycemic", "Calorie Deficit", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "satvik", "jain", "no-onion-garlic"],
    contains: ["milk", "curd"],
    reasons: {
      "Low Glycemic": {
        reason: "Split yellow moong dal reduces overall glycemic load.",
        expectedBenefit: "Easy digestive clearance and stable blood sugar.",
      },
      "Calorie Deficit": {
        reason: "Comforting, high-water volume meal.",
        expectedBenefit: "Satiates without excess dietary fat.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Light lentil dish with probiotic curd.",
        expectedBenefit: "Supports gut-lipid metabolic axis.",
      },
      "Low Sodium": {
        reason: "Gentle spicing with minimal salt.",
        expectedBenefit: "Supports steady renal and blood pressure function.",
      },
      "Balanced Wellness": {
        reason: "Balanced comfort protein and prebiotic combination.",
        expectedBenefit: "Promotes efficient digestion.",
      },
    },
  },
  {
    name: "Soya Chunks Curry with Whole Wheat Roti",
    course: "lunch",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Balanced Wellness"],
    types: ["vegetarian", "vegan"],
    contains: ["soy", "onion", "garlic", "gluten"],
    reasons: {
      "Low Glycemic": {
        reason: "Soy isoflavones and high protein minimize glucose curve.",
        expectedBenefit: "Protects against insulin resistance spikes.",
      },
      "Calorie Deficit": {
        reason: "Very high protein-to-calorie ratio.",
        expectedBenefit: "Preserves lean body mass during weight loss.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Plant soy protein displaces animal saturated fats.",
        expectedBenefit: "Assists in blood lipid optimization.",
      },
      "Low Sodium": {
        reason: "Potassium-rich soya and whole wheat flour.",
        expectedBenefit: "Balances intracellular electrolyte pressure.",
      },
      "Balanced Wellness": {
        reason: "Complete vegan protein source.",
        expectedBenefit: "Supports physical recovery.",
      },
    },
  },
  {
    name: "Jain Methi Thepla with Boiled Potato Sabzi",
    course: "lunch",
    strategies: ["Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "satvik", "jain", "no-onion-garlic"],
    contains: ["root-vegetables", "gluten"],
    reasons: {
      "Low Glycemic": {
        reason: "Fenugreek herb infused flatbread.",
        expectedBenefit: "Fenugreek seeds improve insulin sensitivity.",
      },
      "Calorie Deficit": {
        reason: "Portion-controlled herb flatbread.",
        expectedBenefit: "Satiating whole grain energy.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Herb-rich bread with zero cholesterol.",
        expectedBenefit: "Maintains clear vascular walls.",
      },
      "Low Sodium": {
        reason: "Herbal spicing reduces sodium requirement.",
        expectedBenefit: "Keeps blood pressure within safe boundaries.",
      },
      "Balanced Wellness": {
        reason: "Traditional Jain herbal preparation.",
        expectedBenefit: "Provides dietary fiber and phytonutrients.",
      },
    },
  },

  // ─── SNACKS ───
  {
    name: "Roasted Makhana (Lotus Seeds)",
    course: "snacks",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "Low glycemic index puffed water lily seeds.",
        expectedBenefit: "Prevents afternoon blood glucose dips and spikes.",
      },
      "Calorie Deficit": {
        reason: "Crunchy snack with low calorie density.",
        expectedBenefit: "Satisfies oral fixation without breaking calorie budget.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Rich in kaempferol flavonoid antioxidants.",
        expectedBenefit: "Protects cardiac tissue from oxidative stress.",
      },
      "Low Sodium": {
        reason: "Dry roasted with rock salt or herbs.",
        expectedBenefit: "Avoids sodium-induced fluid retention.",
      },
      "Balanced Wellness": {
        reason: "Antioxidant-dense traditional snack.",
        expectedBenefit: "Improves cellular defense.",
      },
    },
  },
  {
    name: "Roasted Bengal Gram (Chana)",
    course: "snacks",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "High fiber roasted legumes with slow digestibility.",
        expectedBenefit: "Extends glucose stability until dinner.",
      },
      "Calorie Deficit": {
        reason: "High protein and fiber snack.",
        expectedBenefit: "Curbs mid-day hunger.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Soluble pulse fiber reduces LDL reabsorption.",
        expectedBenefit: "Supports healthy lipid profiles.",
      },
      "Low Sodium": {
        reason: "Unsalted dry roasted legumes.",
        expectedBenefit: "Zero impact on blood pressure.",
      },
      "Balanced Wellness": {
        reason: "Natural plant protein and minerals.",
        expectedBenefit: "Sustains steady afternoon focus.",
      },
    },
  },

  // ─── DINNER ───
  {
    name: "Moong Dal Khichdi with Steamed Vegetables",
    course: "dinner",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "Light, easily digestible lentil and rice porridge.",
        expectedBenefit: "Prevents nocturnal glucose spikes and improves sleep.",
      },
      "Calorie Deficit": {
        reason: "Light evening meal with low calorie density.",
        expectedBenefit: "Supports nocturnal lipid metabolism and weight loss.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Low fat and zero cholesterol dinner.",
        expectedBenefit: "Reduces liver metabolic burden overnight.",
      },
      "Low Sodium": {
        reason: "Mild herb seasoning with low salt.",
        expectedBenefit: "Lowers nocturnal blood pressure dipping strain.",
      },
      "Balanced Wellness": {
        reason: "Classic restorative evening dish.",
        expectedBenefit: "Promotes digestive rest and recovery.",
      },
    },
  },
  {
    name: "Mix Vegetable Sabzi with 2 Bajra Rotis",
    course: "dinner",
    strategies: ["Low Glycemic", "Calorie Deficit", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": {
        reason: "Pearl millet (bajra) releases glucose slowly.",
        expectedBenefit: "Stabilizes overnight insulin levels.",
      },
      "Calorie Deficit": {
        reason: "High fiber vegetable curry with gluten-free millet.",
        expectedBenefit: "Keeps evening appetite satisfied.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Magnesium-rich millet with fiber vegetables.",
        expectedBenefit: "Relaxes arterial smooth muscle.",
      },
      "Low Sodium": {
        reason: "Fresh vegetable curry prepared with minimal salt.",
        expectedBenefit: "Supports nocturnal blood pressure regulation.",
      },
      "Balanced Wellness": {
        reason: "Nutrient-dense vegetable and millet meal.",
        expectedBenefit: "Provides essential dietary minerals.",
      },
    },
  },
  {
    name: "Paneer Bhurji with 2 Jowar Rotis",
    course: "dinner",
    strategies: ["Low Glycemic", "Calorie Deficit", "Balanced Wellness"],
    types: ["vegetarian"],
    contains: ["paneer", "milk", "onion", "garlic"],
    reasons: {
      "Low Glycemic": {
        reason: "High protein cottage cheese with gluten-free sorghum.",
        expectedBenefit: "Zero glycemic spike before sleep.",
      },
      "Calorie Deficit": {
        reason: "High protein satiety meal.",
        expectedBenefit: "Prevents late-night snacking.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Calcium-rich paneer with complex sorghum.",
        expectedBenefit: "Supports muscle protein synthesis.",
      },
      "Low Sodium": {
        reason: "Lightly spiced paneer crumble.",
        expectedBenefit: "Controls evening sodium load.",
      },
      "Balanced Wellness": {
        reason: "Casein protein provides slow overnight amino release.",
        expectedBenefit: "Supports tissue repair.",
      },
    },
  },
  {
    name: "Tofu Stir-fry with Broccoli and Quinoa",
    course: "dinner",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: ["soy"],
    reasons: {
      "Low Glycemic": {
        reason: "Tofu and quinoa provide complete vegan protein with low carbs.",
        expectedBenefit: "Excellent glycemic control for diabetic management.",
      },
      "Calorie Deficit": {
        reason: "Lean plant protein with cruciferous vegetables.",
        expectedBenefit: "Maximizes fat oxidation while preserving muscle.",
      },
      "Heart-Healthy / Lipid Control": {
        reason: "Soy protein and glucosinolates from broccoli.",
        expectedBenefit: "Supports arterial elasticity and lipid lowering.",
      },
      "Low Sodium": {
        reason: "Steamed tofu and broccoli with herbs.",
        expectedBenefit: "Optimal for blood pressure control.",
      },
      "Balanced Wellness": {
        reason: "Complete amino acid vegan dinner.",
        expectedBenefit: "Enhances cellular repair.",
      },
    },
  },

  // ─── ADDITIONAL BREAKFAST VARIATIONS ───
  {
    name: "Besan Chilla",
    course: "breakfast",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": { reason: "Chickpea flour pancake rich in complex protein.", expectedBenefit: "Stabilizes glucose levels." },
      "Calorie Deficit": { reason: "High-protein low-fat breakfast.", expectedBenefit: "Sustains satiety." },
      "Heart-Healthy / Lipid Control": { reason: "Soluble fiber legume base.", expectedBenefit: "Supports clear arteries." },
      "Low Sodium": { reason: "Spiced with herbs instead of salt.", expectedBenefit: "Helps regulate blood pressure." },
      "Balanced Wellness": { reason: "Plant-based protein source.", expectedBenefit: "Boosts morning metabolism." },
    },
  },
  {
    name: "Vegetable Upma",
    course: "breakfast",
    strategies: ["Low Glycemic", "Calorie Deficit", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: ["gluten"],
    reasons: {
      "Low Glycemic": { reason: "Fiber-rich semolina with diced vegetables.", expectedBenefit: "Slower digestive breakdown." },
      "Calorie Deficit": { reason: "Light vegetable-filled morning grain.", expectedBenefit: "Controlled caloric density." },
      "Heart-Healthy / Lipid Control": { reason: "Low saturated fat preparation.", expectedBenefit: "Cardiovascular friendly." },
      "Low Sodium": { reason: "Mildly spiced without excess salt.", expectedBenefit: "Maintains fluid balance." },
      "Balanced Wellness": { reason: "Traditional vegetable semolina breakfast.", expectedBenefit: "Provides morning energy." },
    },
  },
  {
    name: "Paneer Bhurji with Toast",
    course: "breakfast",
    strategies: ["Low Glycemic", "Calorie Deficit", "Balanced Wellness"],
    types: ["vegetarian"],
    contains: ["paneer", "milk", "gluten"],
    reasons: {
      "Low Glycemic": { reason: "Protein-rich cottage cheese crumble.", expectedBenefit: "Zero glycemic spike." },
      "Calorie Deficit": { reason: "High satiety protein dish.", expectedBenefit: "Reduces mid-morning cravings." },
      "Heart-Healthy / Lipid Control": { reason: "Calcium and casein protein.", expectedBenefit: "Supports metabolic health." },
      "Low Sodium": { reason: "Light herb seasoning.", expectedBenefit: "Controlled sodium intake." },
      "Balanced Wellness": { reason: "Nutrient-dense breakfast.", expectedBenefit: "Sustained cellular repair." },
    },
  },

  // ─── ADDITIONAL LUNCH VARIATIONS ───
  {
    name: "Millet Roti + Dal",
    course: "lunch",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": { reason: "Complex millet carbs paired with lentil protein.", expectedBenefit: "Slow glucose absorption." },
      "Calorie Deficit": { reason: "High fiber grain and pulse meal.", expectedBenefit: "Keeps fullness prolonged." },
      "Heart-Healthy / Lipid Control": { reason: "Magnesium and fiber rich combination.", expectedBenefit: "Supports arterial wellness." },
      "Low Sodium": { reason: "Low salt lentil soup with millet flatbread.", expectedBenefit: "Maintains optimal BP." },
      "Balanced Wellness": { reason: "Traditional whole grain Indian thali.", expectedBenefit: "Complete nutrition balance." },
    },
  },
  {
    name: "Moong Dal Khichdi",
    course: "lunch",
    strategies: ["Low Glycemic", "Calorie Deficit", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": { reason: "Balanced pulse-grain ratio.", expectedBenefit: "Steady energy without insulin spike." },
      "Calorie Deficit": { reason: "Comforting high-volume meal.", expectedBenefit: "Fills without heavy calories." },
      "Heart-Healthy / Lipid Control": { reason: "Zero cholesterol meal.", expectedBenefit: "Eases digestive burden." },
      "Low Sodium": { reason: "Gently spiced with low salt.", expectedBenefit: "Helps maintain normal blood pressure." },
      "Balanced Wellness": { reason: "Easily digestible complete protein.", expectedBenefit: "Restores gut balance." },
    },
  },
  {
    name: "Rajma Rice with Salad",
    course: "lunch",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Balanced Wellness"],
    types: ["vegetarian", "vegan"],
    contains: ["onion", "garlic"],
    reasons: {
      "Low Glycemic": { reason: "Kidney beans are rich in resistant starch.", expectedBenefit: "Protects against rapid sugar spikes." },
      "Calorie Deficit": { reason: "High fiber and plant protein pulse.", expectedBenefit: "Long-lasting fullness." },
      "Heart-Healthy / Lipid Control": { reason: "Soluble pulse fiber lowers cholesterol.", expectedBenefit: "Supports cardiovascular health." },
      "Low Sodium": { reason: "Balanced spice seasoning.", expectedBenefit: "Keeps sodium in safe range." },
      "Balanced Wellness": { reason: "Protein-rich comfort bowl.", expectedBenefit: "Supports muscle & metabolic health." },
    },
  },

  // ─── ADDITIONAL SNACK VARIATIONS ───
  {
    name: "Sprouts Salad",
    course: "snacks",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": { reason: "Sprouted pulses are low in GI and rich in active enzymes.", expectedBenefit: "Keeps glucose stable." },
      "Calorie Deficit": { reason: "Very low calorie volume snack.", expectedBenefit: "Aids weight loss." },
      "Heart-Healthy / Lipid Control": { reason: "High in antioxidants and vitamin C.", expectedBenefit: "Protects blood vessels." },
      "Low Sodium": { reason: "Lemon juice dressing.", expectedBenefit: "Zero added sodium." },
      "Balanced Wellness": { reason: "Living sprout nutrients.", expectedBenefit: "Enhances vitality." },
    },
  },
  {
    name: "Boiled Black Chana",
    course: "snacks",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": { reason: "Black chickpeas have extremely low glycemic response.", expectedBenefit: "Prevents evening fatigue." },
      "Calorie Deficit": { reason: "High fiber legume snack.", expectedBenefit: "Eliminates unhealthy cravings." },
      "Heart-Healthy / Lipid Control": { reason: "Rich in soluble fiber.", expectedBenefit: "Maintains healthy lipids." },
      "Low Sodium": { reason: "Lightly seasoned with cumin.", expectedBenefit: "Supports blood pressure." },
      "Balanced Wellness": { reason: "High iron and plant protein.", expectedBenefit: "Supports hemoglobin levels." },
    },
  },

  // ─── ADDITIONAL DINNER VARIATIONS ───
  {
    name: "Paneer + Vegetables",
    course: "dinner",
    strategies: ["Low Glycemic", "Calorie Deficit", "Heart-Healthy / Lipid Control", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian"],
    contains: ["paneer", "milk"],
    reasons: {
      "Low Glycemic": { reason: "Sauteed cottage cheese with high-fiber greens.", expectedBenefit: "Prevents late glucose rise." },
      "Calorie Deficit": { reason: "Low carb, high protein dinner.", expectedBenefit: "Supports overnight fat burn." },
      "Heart-Healthy / Lipid Control": { reason: "Calcium and bioavailable protein.", expectedBenefit: "Supports cardiac recovery." },
      "Low Sodium": { reason: "Herb and pepper seasoning.", expectedBenefit: "Controls nighttime BP strain." },
      "Balanced Wellness": { reason: "Nutrient-rich evening meal.", expectedBenefit: "Aids muscle restoration." },
    },
  },
  {
    name: "Lauki Sabzi with Jowar Roti",
    course: "dinner",
    strategies: ["Low Glycemic", "Calorie Deficit", "Low Sodium", "Balanced Wellness"],
    types: ["vegetarian", "vegan", "satvik", "jain", "no-onion-garlic"],
    contains: [],
    reasons: {
      "Low Glycemic": { reason: "Hydrating bottle gourd with sorghum flatbread.", expectedBenefit: "Gentle glucose impact." },
      "Calorie Deficit": { reason: "Exceptionally light evening meal.", expectedBenefit: "Promotes steady fat loss." },
      "Heart-Healthy / Lipid Control": { reason: "High potassium and water content.", expectedBenefit: "Supports vascular tone." },
      "Low Sodium": { reason: "Naturally low-sodium vegetable dish.", expectedBenefit: "Lowers fluid retention." },
      "Balanced Wellness": { reason: "Soothing ayurvedic dinner.", expectedBenefit: "Promotes restful sleep." },
    },
  },
];

/**
 * Strategy Selection Logic (Rule 3)
 */
export function selectDietStrategy(input: DietEngineInput): { strategy: DietStrategy; reason: string } {
  const p = input || {};

  // Compute BMI if missing
  let bmi = p.bmi;
  if (!bmi && typeof p.heightCm === "number" && p.heightCm > 0 && typeof p.weightKg === "number" && p.weightKg > 0) {
    bmi = Number((p.weightKg / Math.pow(p.heightCm / 100, 2)).toFixed(1));
  }

  const fastingGlucose = p.fastingBloodSugar;
  const hba1c = p.hba1c;
  const systolic = p.systolic;
  const diastolic = p.diastolic;

  // 1. Prediabetes / Diabetes -> Low Glycemic
  const isDiabeticRisk =
    p.diabetesRiskCategory === "high" ||
    p.diabetesRiskCategory === "moderate" ||
    (typeof fastingGlucose === "number" && fastingGlucose >= 100) ||
    (typeof hba1c === "number" && hba1c >= 5.7) ||
    (p.priorities || []).some((item) => item.id === "glycemic-control");

  if (isDiabeticRisk) {
    return {
      strategy: "Low Glycemic",
      reason: "Elevated glycemic screening markers or glucose levels indicate need for glycemic load management.",
    };
  }

  // 2. Hypertension -> Low Sodium
  const isHypRisk =
    p.hypertensionRiskCategory === "high" ||
    p.hypertensionRiskCategory === "moderate" ||
    (typeof systolic === "number" && systolic >= 130) ||
    (typeof diastolic === "number" && diastolic >= 85) ||
    (p.priorities || []).some((item) => item.id === "hypertension-management");

  if (isHypRisk) {
    return {
      strategy: "Low Sodium",
      reason: "Elevated blood pressure readings or hypertension screening require a sodium-restricted DASH-oriented diet.",
    };
  }

  // 3. BMI High -> Calorie Deficit
  const isHighBmi = (typeof bmi === "number" && bmi >= 25) || (p.priorities || []).some((item) => item.id === "weight-management");

  if (isHighBmi) {
    return {
      strategy: "Calorie Deficit",
      reason: "BMI in overweight/obesity range requires a structured energy deficit strategy.",
    };
  }

  // 4. Lipid Strain -> Heart-Healthy
  const isLipidRisk = (typeof p.totalCholesterol === "number" && p.totalCholesterol >= 200) || (typeof p.ldl === "number" && p.ldl >= 130);

  if (isLipidRisk) {
    return {
      strategy: "Heart-Healthy / Lipid Control",
      reason: "Elevated lipid panel markers call for a low saturated fat, soluble-fiber rich strategy.",
    };
  }

  // 5. Default -> Balanced Wellness
  return {
    strategy: "Balanced Wellness",
    reason: "Physiological markers are within normal range; maintaining nutrient balance and metabolic health.",
  };
}

/**
 * Check if a meal satisfies all strict dietary, allergy, and food exclusion constraints (Rule 5)
 */
export function isMealConstraintCompliant(meal: MealTemplate, input: DietEngineInput): boolean {
  const pref = (input.dietType || "vegetarian").toLowerCase();

  // 1. Dietary Preference Filters
  if (pref === "vegetarian" || pref === "satvik" || pref === "jain" || pref === "no-onion-garlic") {
    if (meal.types.includes("non-vegetarian") || meal.types.includes("eggetarian")) return false;
    if (meal.contains.includes("chicken") || meal.contains.includes("fish") || meal.contains.includes("meat") || meal.contains.includes("eggs")) return false;
  }

  if (pref === "vegan") {
    if (!meal.types.includes("vegan")) return false;
    if (
      meal.contains.includes("milk") ||
      meal.contains.includes("paneer") ||
      meal.contains.includes("curd") ||
      meal.contains.includes("ghee") ||
      meal.contains.includes("cheese") ||
      meal.contains.includes("lactose") ||
      meal.contains.includes("eggs") ||
      meal.contains.includes("fish") ||
      meal.contains.includes("chicken")
    ) {
      return false;
    }
  }

  if (pref === "jain") {
    if (!meal.types.includes("jain")) return false;
    if (meal.contains.includes("onion") || meal.contains.includes("garlic") || meal.contains.includes("root-vegetables")) return false;
  }

  if (pref === "satvik" || pref === "no-onion-garlic") {
    if (meal.contains.includes("onion") || meal.contains.includes("garlic")) return false;
  }

  if (pref === "eggetarian") {
    if (meal.types.includes("non-vegetarian") || meal.contains.includes("chicken") || meal.contains.includes("fish")) return false;
  }

  // 2. Lactose Intolerance & Dairy Allergy
  const hasLactoseIntolerance =
    input.lactoseIntolerant === true ||
    (input.allergies || []).some((a) => a.toLowerCase().includes("lactose") || a.toLowerCase().includes("dairy") || a.toLowerCase().includes("milk")) ||
    (input.foodAllergies || "").toLowerCase().includes("lactose") ||
    (input.foodAllergies || "").toLowerCase().includes("dairy") ||
    (input.foodAllergies || "").toLowerCase().includes("milk");

  if (hasLactoseIntolerance) {
    if (
      meal.contains.includes("milk") ||
      meal.contains.includes("paneer") ||
      meal.contains.includes("curd") ||
      meal.contains.includes("ghee") ||
      meal.contains.includes("cheese") ||
      meal.contains.includes("lactose")
    ) {
      return false;
    }
  }

  // 3. Allergies & Excluded Foods
  const allExclusions: string[] = [
    ...(input.allergies || []),
    ...(input.excludedFoods || []),
    ...(input.foodAllergies ? input.foodAllergies.split(",").map((s) => s.trim()) : []),
  ].map((s) => s.toLowerCase()).filter(Boolean);

  for (const exclusion of allExclusions) {
    // Direct match against meal contains tags
    if (meal.contains.some((ingredient) => ingredient.toLowerCase() === exclusion)) {
      return false;
    }
    // Substring match against meal name
    if (meal.name.toLowerCase().includes(exclusion)) {
      return false;
    }
  }

  return true;
}

/**
 * Populate Meal Recommendation for a Course with Day Variation
 */
export function populateMealForCourse(
  course: "breakfast" | "lunch" | "snacks" | "dinner",
  strategy: DietStrategy,
  input: DietEngineInput,
  dayIndex = 0
): MealRecommendation {
  const matches = REUSABLE_MEAL_CATALOG.filter((meal) => {
    if (meal.course !== course) return false;
    if (!meal.strategies.includes(strategy) && !meal.strategies.includes("Balanced Wellness")) return false;
    return isMealConstraintCompliant(meal, input);
  });

  if (matches.length === 0) {
    const anyCompliant = REUSABLE_MEAL_CATALOG.filter(
      (meal) => meal.course === course && isMealConstraintCompliant(meal, input)
    );
    if (anyCompliant.length === 0) {
      return FALLBACK_MEAL;
    }
    const selected = anyCompliant[dayIndex % anyCompliant.length];
    const reasoning = selected.reasons[strategy] || selected.reasons["Balanced Wellness"];
    return {
      meal: selected.name,
      reason: reasoning.reason,
      expectedBenefit: reasoning.expectedBenefit,
    };
  }

  const selected = matches[dayIndex % matches.length];
  const reasoning = selected.reasons[strategy] || selected.reasons["Balanced Wellness"];

  return {
    meal: selected.name,
    reason: reasoning.reason,
    expectedBenefit: reasoning.expectedBenefit,
  };
}

/**
 * Deterministic Diet Recommendation Engine (Main Entrypoint)
 */
export function generateDietPlan(input: DietEngineInput): DietEngineOutput {
  const { strategy, reason: strategyReason } = selectDietStrategy(input);

  const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const weeklyPlan: WeeklyDietPlan = {
    mon: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
    tue: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
    wed: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
    thu: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
    fri: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
    sat: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
    sun: { breakfast: FALLBACK_MEAL, lunch: FALLBACK_MEAL, snacks: FALLBACK_MEAL, dinner: FALLBACK_MEAL },
  };

  weekdays.forEach((day, index) => {
    weeklyPlan[day] = {
      breakfast: populateMealForCourse("breakfast", strategy, input, index),
      lunch: populateMealForCourse("lunch", strategy, input, index),
      snacks: populateMealForCourse("snacks", strategy, input, index),
      dinner: populateMealForCourse("dinner", strategy, input, index),
    };
  });

  return {
    strategy,
    strategyReason,
    meals: weeklyPlan.mon,
    weeklyPlan,
    constraintsApplied: {
      dietType: input.dietType || "vegetarian",
      allergies: input.allergies || [],
      exclusions: input.excludedFoods || [],
    },
  };
}
