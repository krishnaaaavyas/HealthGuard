import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useLanguage, tr } from "@/lib/i18n";
import {
  ScanLine,
  Upload,
  AlertTriangle,
  CheckCircle,
  Heart,
  Activity,
  Brain,
  FileText,
  Loader2,
  Sparkles,
  Camera,
  RefreshCw,
  Info,
  ChevronRight,
  Sparkle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  assessIngredientsImage,
  assessIngredientsText,
  type IngredientReport,
} from "@/lib/health.functions";
import SplitText from "@/components/ui/split-text";
import { ShapeGrid } from "@/components/ui/shape-grid";

export function getHumanReadableReason(reasonCode?: string, message?: string): string {
  switch (reasonCode) {
    case "NO_INGREDIENTS_DETECTED":
      return "No ingredient list detected in this image. Please upload a clearer photo of the ingredient label.";
    case "UNSUPPORTED_FORMAT":
    case "SCANNER_FILE_UNSUPPORTED":
    case "LAB_FILE_UNSUPPORTED":
      return "Unsupported file format. Please upload a JPEG, PNG, or WebP image.";
    case "IMAGE_TOO_LARGE":
    case "LAB_FILE_TOO_LARGE":
      return "Image file size exceeds 10 MB limit. Please upload a smaller image.";
    case "IMAGE_EMPTY":
    case "LAB_FILE_EMPTY":
      return "Uploaded image file is empty.";
    case "IMAGE_PREPROCESSING_FAILED":
    case "LAB_UPLOAD_INVALID_IMAGE":
      return "Selected image is corrupted or unreadable.";
    case "GEMINI_AUTH_FAILED":
    case "LAB_EXTRACTION_CREDENTIALS_MISSING":
      return "AI extraction service authentication failed or API key is unconfigured.";
    case "GEMINI_QUOTA_EXCEEDED":
      return "AI extraction rate limit reached. Please try again in a few moments.";
    case "GEMINI_TIMEOUT":
    case "LAB_EXTRACTION_TIMEOUT":
      return "AI extraction service timed out. Please try again.";
    case "GEMINI_REQUEST_FAILED":
    case "LAB_EXTRACTION_UNAVAILABLE":
      return "AI extraction service is currently unavailable.";
    case "GEMINI_RESPONSE_PARSE_FAILED":
    case "LAB_EXTRACTION_PARSE_FAILED":
      return "Unable to read ingredient text structure from this image.";
    default:
      return message || "Unable to extract ingredient text from image. Please ensure the label is clear or enter ingredients manually.";
  }
}

export const Route = createLazyFileRoute("/_app/scanner")({
  component: ScannerPage,
});

export type ScannerState =
  | "idle"
  | "validating"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "success"
  | "deterministic-success"
  | "failed";

const PRESETS: Record<string, Omit<IngredientReport, "rawText">> = {
  "Maggi Noodles": {
    name: "Maggi Noodles (with Tastemaker)",
    score: 3,
    goodIngredients: ["Mixed Spices", "Onion Powder", "Garlic Powder", "Coriander", "Turmeric"],
    watchOut: [
      "Refined Wheat Flour (Maida)",
      "Palm Oil",
      "Excessive Salt / Sodium",
      "Monosodium Glutamate (MSG)",
      "Caramel Color",
    ],
    diabetesImpact:
      "High Glycemic Index from refined wheat flour (maida) triggers rapid glucose spikes and insulin release.",
    bloodPressureImpact:
      "Very high sodium content from added salt, MSG, and flavor enhancers promotes fluid retention and vascular pressure.",
    heartHealthImpact:
      "Palm oil contains high proportions of saturated fats, which can negatively affect LDL cholesterol levels and arterial health.",
    recommendation:
      "Contains refined flour, palm oil, and high sodium content. Consume in strict moderation for metabolic wellness.",
  },
  "Coca-Cola": {
    name: "Coca-Cola (Regular Cola)",
    score: 2,
    goodIngredients: [],
    watchOut: [
      "High Added Sugar (approx. 44g per bottle)",
      "Caramel Color (150d)",
      "Phosphoric Acid",
      "Caffeine",
    ],
    diabetesImpact:
      "High concentration of simple sucrose/glucose leads to rapid blood sugar spikes and contributes to insulin resistance.",
    bloodPressureImpact:
      "Heavy glycemic load and caffeine absorption can cause temporary elevations in arterial stiffness and heart rate.",
    heartHealthImpact:
      "High added sugar intake is metabolically linked to increased liver fat accumulation and elevated triglycerides.",
    recommendation:
      "High in simple added sugars with minimal nutritional benefit. Discouraged for individuals managing glycemic risk.",
  },
  "Lay's Chips": {
    name: "Lay's Chips (Classic Salted)",
    score: 4,
    goodIngredients: ["Potato"],
    watchOut: [
      "Refined Vegetable Oils (Palmolein, Rice Bran Oil)",
      "High Sodium (Iodised Salt)",
      "Saturated Fats",
    ],
    diabetesImpact:
      "Simple starches in fried potatoes break down rapidly into glucose.",
    bloodPressureImpact:
      "Added salt causes sodium accumulation, promoting fluid retention and blood pressure elevation.",
    heartHealthImpact:
      "Frying in palmolein oil increases saturated fat intake, affecting LDL cholesterol levels.",
    recommendation:
      "High in sodium, calories, and saturated fats. Consume sparingly as part of a balanced diet.",
  },
  "Amul Yogurt": {
    name: "Amul Masti Dahi (Plain Yogurt)",
    score: 8,
    goodIngredients: [
      "Pasteurized Double Toned Milk",
      "Active Probiotic Cultures (L. acidophilus, Bifidobacterium)",
      "Calcium",
      "Dietary Protein",
    ],
    watchOut: [],
    diabetesImpact:
      "Low glycemic index, rich in protein which helps slow down carbohydrate absorption.",
    bloodPressureImpact:
      "Calcium and minerals naturally present in dairy help support vascular tone and blood pressure stability.",
    heartHealthImpact:
      "Double toned milk provides lower fat content while supplying beneficial nutrients and proteins.",
    recommendation:
      "Nutrient-dense probiotic food supporting digestive health and vascular function. Suitable for regular consumption.",
  },
  "Roasted Chana": {
    name: "Roasted Chana (Bengal Gram)",
    score: 9,
    goodIngredients: [
      "Roasted Bengal Gram (Chickpeas)",
      "Dietary Fiber",
      "Plant-based Protein",
      "Magnesium & Potassium",
    ],
    watchOut: [],
    diabetesImpact:
      "Low glycemic index and high dietary fiber content slow glucose absorption, promoting steady blood sugar levels.",
    bloodPressureImpact:
      "Rich in natural potassium and magnesium which assist in arterial relaxation and sodium balance.",
    heartHealthImpact:
      "High fiber content helps lower cholesterol absorption and supports cardiovascular wellness.",
    recommendation:
      "Excellent whole-grain snack high in protein and fiber. Recommended for metabolic and cardiovascular support.",
  },
};

/**
 * Deterministic keyword evaluator for manual text input
 */
function analyzeRawText(text: string): Omit<IngredientReport, "rawText"> {
  const lowercaseText = text.toLowerCase();
  let score = 7; // Base score for custom list

  const watchOutDetected: string[] = [];
  const goodDetected: string[] = [];

  // Watchout ingredient triggers
  const watchOutKeywords = [
    { key: "sugar", label: "Added Sugars / Sucrose" },
    { key: "high fructose", label: "High Fructose Corn Syrup" },
    { key: "palm oil", label: "Palm Oil / Palmolein" },
    { key: "hydrogenated", label: "Hydrogenated Vegetable Oils (Trans Fats)" },
    { key: "maida", label: "Refined Wheat Flour (Maida)" },
    { key: "salt", label: "Added Salt / Sodium" },
    { key: "sodium", label: "Sodium Additives" },
    { key: "msg", label: "Monosodium Glutamate (MSG)" },
    { key: "preservative", label: "Chemical Preservatives (E211/E202)" },
    { key: "maltodextrin", label: "Maltodextrin (High GI Carbohydrate)" },
  ];

  watchOutKeywords.forEach(({ key, label }) => {
    if (lowercaseText.includes(key)) {
      watchOutDetected.push(label);
      score -= 1.5;
    }
  });

  // Beneficial ingredient triggers
  const goodKeywords = [
    { key: "oats", label: "Whole Grain Oats" },
    { key: "almonds", label: "Almonds / Nuts" },
    { key: "chana", label: "Bengal Gram / Chickpeas" },
    { key: "fiber", label: "Dietary Fiber" },
    { key: "protein", label: "Protein" },
    { key: "probiotic", label: "Probiotic Cultures" },
    { key: "turmeric", label: "Turmeric (Curcumin)" },
    { key: "chia", label: "Chia Seeds" },
    { key: "flax", label: "Flaxseeds" },
  ];

  goodKeywords.forEach(({ key, label }) => {
    if (lowercaseText.includes(key)) {
      goodDetected.push(label);
    }
  });

  if (goodDetected.length > 0) {
    score += Math.min(2, Math.floor(goodDetected.length / 2));
  }

  score = Math.max(1, Math.min(10, Math.round(score)));

  let diabetesImpact = "No high-GI sugars or refined starches detected. Favorable for glycemic balance.";
  if (watchOutDetected.some((w) => w.toLowerCase().includes("sugar") || w.toLowerCase().includes("maida") || w.toLowerCase().includes("maltodextrin"))) {
    diabetesImpact = "Contains refined flour or added sugars. May cause blood glucose fluctuations; exercise portion control.";
  }

  let bloodPressureImpact = "Low added sodium detected. Minimal impact on fluid retention and blood pressure.";
  if (watchOutDetected.some((w) => w.toLowerCase().includes("salt") || w.toLowerCase().includes("sodium") || w.toLowerCase().includes("msg"))) {
    bloodPressureImpact = "Contains added sodium/salt. May promote fluid retention and increase arterial pressure.";
  }

  let heartHealthImpact = "Contains low levels of saturated/trans fats. Favorable for healthy blood lipids.";
  if (watchOutDetected.some((w) => w.toLowerCase().includes("palm") || w.toLowerCase().includes("hydrogenated"))) {
    heartHealthImpact = "Contains palm oil or hydrogenated oils. Associated with increases in LDL cholesterol.";
  }

  let recommendation = "This food has a balanced nutritional profile suitable for regular dietary inclusion.";
  if (score <= 4) {
    recommendation = "Contains refined ingredients, sodium, or saturated fats. Consume sparingly to protect metabolic health.";
  } else if (score <= 7) {
    recommendation = "Moderate nutritional profile. Enjoy in moderation as part of a balanced diet.";
  } else {
    recommendation = "Nutrient-dense food supporting metabolic and heart health. Suitable for regular inclusion.";
  }

  return {
    name: "Custom ingredient list",
    score,
    goodIngredients: goodDetected,
    watchOut: watchOutDetected,
    diabetesImpact,
    bloodPressureImpact,
    heartHealthImpact,
    recommendation,
  };
}

function ScannerPage() {
  const currentLang = useLanguage();
  useEffect(() => {
    document.title = tr("ingredientsScanner", currentLang) + " — " + tr("appName", currentLang);
    return () => {
      stopCamera();
    };
  }, [currentLang]);

  const [rawText, setRawText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [lastUploadedImageData, setLastUploadedImageData] = useState<{ base64Data: string; mimeType: string; name: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [report, setReport] = useState<IngredientReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const presetsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (report && report.status !== "extraction-unavailable") {
      localStorage.setItem("hg.hasScannedFood", "true");
    }
  }, [report]);

  // Clean up object URLs to prevent leaks
  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  // Webcam States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    setReport(null);
    setRawText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      toast.success(tr("fit_webcam_active_toast", currentLang));
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error(tr("fit_webcam_access_failed_toast", currentLang));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;
    setIsScanning(true);
    setScannerState("extracting");

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not construct 2D context");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg");
      const base64Data = dataUrl.split(",")[1];

      stopCamera();

      setLastUploadedImageData({
        base64Data,
        mimeType: "image/jpeg",
        name: "Camera Snapshot",
      });

      const result = await assessIngredientsImage({
        base64Image: base64Data,
        mimeType: "image/jpeg",
      });

      if (result.status === "extraction-unavailable" || result.status === "unauthorized" || result.status === "failed") {
        setScannerState("failed");
        setReport({
          ...result,
          name: "Camera Snapshot Analysis",
          source: "Camera",
        });
      } else {
        setScannerState("success");
        setReport({
          ...result,
          source: "Camera",
        });
        toast.success(tr("fit_ingredients_analysed_toast", currentLang));
      }
    } catch (err: unknown) {
      console.error("Vision API error during camera scan:", err);
      toast.error(tr("fit_vision_failed_toast", currentLang));
      setScannerState("failed");
      setReport({
        name: "Camera Snapshot Failed",
        score: 0,
        goodIngredients: [],
        watchOut: [],
        diabetesImpact: "",
        bloodPressureImpact: "",
        heartHealthImpact: "",
        recommendation: "",
        status: "extraction-unavailable",
        reasonCode: "SCANNER_IMAGE_EXTRACTION_UNAVAILABLE",
        manualEntryAllowed: true,
        message: "Could not extract text from camera snapshot. Please try again, paste ingredients manually, or choose a preset.",
        source: "Camera",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handlePresetSelect = (key: string) => {
    const data = PRESETS[key];
    setRawText("");
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    stopCamera();
    setIsScanning(true);
    setScannerState("analyzing");

    setTimeout(() => {
      setReport({
        ...data,
        source: "Preset",
        analysisMode: "deterministic",
        rawText: `Preset Ingredients for ${data.name}: ${data.goodIngredients.join(", ")}, ${data.watchOut.join(", ")}`,
      });
      setIsScanning(false);
      setScannerState("success");
      toast.success(`${key} loaded successfully!`);
    }, 600);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const mime = file.type.toLowerCase();
    const isSupported = mime.includes("jpeg") || mime.includes("jpg") || mime.includes("png") || mime.includes("webp");
    if (!isSupported || mime.includes("heic") || mime.includes("heif")) {
      toast.error("Unsupported file format. Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      toast.error("File size exceeds 5 MB limit. Please upload a smaller image.");
      return;
    }

    if (file.size === 0) {
      toast.error("File is empty. Please select a valid image.");
      return;
    }

    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setFilePreviewUrl(previewUrl);

    setSelectedFile(file);
    setRawText("");
    setReport(null);
    stopCamera();
    setIsScanning(true);
    setScannerState("uploading");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setScannerState("extracting");
        const resultStr = reader.result as string;
        const base64Data = resultStr.split(",")[1];

        setLastUploadedImageData({
          base64Data,
          mimeType: file.type || "image/jpeg",
          name: file.name.replace(/\.[^/.]+$/, ""),
        });

        const result = await assessIngredientsImage({
          base64Image: base64Data,
          mimeType: file.type,
        });

        if (result.status === "extraction-unavailable" || result.status === "unauthorized" || result.status === "failed") {
          setScannerState("failed");
          setReport({
            ...result,
            name: file.name.replace(/\.[^/.]+$/, ""),
            source: "Uploaded image",
          });
        } else {
          setScannerState("success");
          setReport({
            ...result,
            name: result.name || file.name.replace(/\.[^/.]+$/, ""),
            source: "Uploaded image",
          });
          toast.success(tr("fit_ingredients_analysed_toast", currentLang));
        }
      } catch (err: unknown) {
        console.error("Vision API error on file upload:", err);
        toast.error(tr("fit_vision_failed_toast", currentLang));
        setScannerState("failed");
        setReport({
          name: file.name.replace(/\.[^/.]+$/, ""),
          score: 0,
          goodIngredients: [],
          watchOut: [],
          diabetesImpact: "",
          bloodPressureImpact: "",
          heartHealthImpact: "",
          recommendation: "",
          status: "extraction-unavailable",
          reasonCode: "SCANNER_IMAGE_EXTRACTION_UNAVAILABLE",
          manualEntryAllowed: true,
          message: "Could not extract ingredients from image. You can try again, paste ingredients manually, or select a preset.",
          source: "Uploaded image",
        });
      } finally {
        setIsScanning(false);
      }
    };

    reader.onerror = () => {
      toast.error(tr("fit_file_read_failed_toast", currentLang));
      setIsScanning(false);
      setScannerState("failed");
    };
    reader.readAsDataURL(file);
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      toast.error(tr("fit_enter_ingredients_toast", currentLang));
      return;
    }

    setIsScanning(true);
    setScannerState("analyzing");
    setReport(null);
    stopCamera();

    try {
      const result = await assessIngredientsText({ rawText });
      setReport({
        ...result,
        name: result.name || "Custom ingredient list",
        source: "Manual text",
        analysisMode: result.analysisMode || "ai",
      });
      setScannerState("success");
      toast.success(tr("fit_ingredients_analysed_toast", currentLang));
    } catch (err: unknown) {
      console.warn("AI text call failed, using rule-based local evaluator:", err);
      toast.info("Generated rule-based ingredient analysis.");

      const parsed = analyzeRawText(rawText);
      setReport({
        ...parsed,
        name: "Custom ingredient list",
        rawText,
        source: "Manual text",
        analysisMode: "deterministic",
        message: "AI analysis is temporarily unavailable. Results were generated from the ingredient text using HealthGuard's rule-based evaluator.",
      });
      setScannerState("deterministic-success");
    } finally {
      setIsScanning(false);
    }
  };

  const resetScanner = () => {
    setReport(null);
    setRawText("");
    setSelectedFile(null);
    setLastUploadedImageData(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    stopCamera();
    setScannerState("idle");
  };

  const retryImageAnalysis = async () => {
    if (lastUploadedImageData) {
      setIsScanning(true);
      setScannerState("extracting");
      try {
        const result = await assessIngredientsImage({
          base64Image: lastUploadedImageData.base64Data,
          mimeType: lastUploadedImageData.mimeType,
        });

        if (result.status === "extraction-unavailable" || result.status === "unauthorized" || result.status === "failed") {
          setScannerState("failed");
          setReport({
            ...result,
            name: lastUploadedImageData.name,
            source: "Uploaded image",
          });
        } else {
          setScannerState("success");
          setReport({
            ...result,
            name: result.name || lastUploadedImageData.name,
            source: "Uploaded image",
          });
          toast.success(tr("fit_ingredients_analysed_toast", currentLang));
        }
      } catch (err: unknown) {
        console.error("Vision API error on retry:", err);
        toast.error("Retry failed.");
        setScannerState("failed");
      } finally {
        setIsScanning(false);
      }
    } else if (selectedFile) {
      const event = {
        target: { files: [selectedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(event);
    } else if (isCameraActive) {
      captureFrame();
    }
  };

  const focusManualText = () => {
    const textElement = document.getElementById("manual-ingredient-textarea");
    if (textElement) {
      textElement.focus();
    }
  };

  const focusPresets = () => {
    if (presetsRef.current) {
      presetsRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "bg-green-500 text-white";
    if (score >= 5) return "bg-yellow-500 text-black";
    return "bg-red-500 text-white";
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 8) return "text-green-600 dark:text-green-400";
    if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreProgressColor = (score: number) => {
    if (score >= 8) return "[&>div]:bg-green-500";
    if (score >= 5) return "[&>div]:bg-yellow-500";
    return "[&>div]:bg-red-500";
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col justify-start isolate">
      {/* Background Grid */}
      <div className="absolute inset-0 -z-10 opacity-70">
        <ShapeGrid
          speed={0.2}
          squareSize={40}
          direction="diagonal"
          borderColor="rgba(20, 184, 166, 0.08)"
          hoverFillColor="rgba(20, 184, 166, 0.15)"
          shape="square"
          hoverTrailAmount={4}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 lg:py-8 w-full space-y-6">
        {/* Header */}
        <div>
          <Badge
            variant="secondary"
            className="rounded-full bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20"
          >
            {tr("wellnessTool", currentLang)}
          </Badge>
          <SplitText
            text={tr("ingredientsScanner", currentLang)}
            className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight"
            delay={35}
            duration={0.6}
            ease="power3.out"
            splitType="chars"
            tag="h1"
            textAlign="left"
          />
          <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {tr("scannerSubtitle", currentLang)}
          </p>
        </div>

        {/* Desktop 3-Row Grid Architecture (Fixes Defect 1: No card height stretching!) */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* ROW 1, COL 1 — Scan Ingredient Label (Image / Camera) */}
          <Card className="border-border bg-surface shadow-card-soft flex flex-col min-h-[280px]">
            <CardHeader className="py-3 px-4 border-b border-border/40 flex flex-row items-center justify-between gap-4 shrink-0">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4 text-teal" />
                {tr("scanPhoto", currentLang)}
              </CardTitle>
              {!isCameraActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startCamera}
                  disabled={isScanning}
                  className="h-8 gap-1.5 text-xs border-teal/20 text-teal hover:bg-teal/5 cursor-pointer font-semibold rounded-full"
                >
                  <Camera className="h-3.5 w-3.5" /> {tr("cameraScan", currentLang)}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={stopCamera}
                  className="h-8 text-xs text-red-500 hover:bg-red-50 cursor-pointer font-semibold"
                >
                  {tr("closeCamera", currentLang)}
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col justify-center">
              {isCameraActive ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-xl bg-black aspect-video border border-border">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border-2 border-dashed border-teal/40 pointer-events-none rounded-xl m-4" />
                  </div>
                  <Button
                    onClick={captureFrame}
                    disabled={isScanning}
                    className="w-full h-10 bg-teal text-white hover:bg-teal/90 gap-2 font-semibold text-xs rounded-lg cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Extracting Ingredients...
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" /> {tr("captureScanIngredients", currentLang)}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border/80 rounded-xl p-6 bg-surface-muted/10 hover:bg-surface-muted/20 transition-colors relative group cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isScanning}
                  />
                  <div className="h-12 w-12 rounded-full bg-teal/10 text-teal flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-300">
                    {isScanning ? <Loader2 className="h-6 w-6 animate-spin" /> : <ScanLine className="h-6 w-6" />}
                  </div>
                  <p className="text-xs font-semibold text-foreground text-center">
                    {selectedFile ? selectedFile.name : tr("clickOrDragPhoto", currentLang)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 text-center">
                    Supports JPEG, PNG, WebP (Max 5 MB)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ROW 1, COL 2 — Paste Ingredient List */}
          <Card className="border-border bg-surface shadow-card-soft flex flex-col min-h-[280px]">
            <CardHeader className="py-3 px-4 border-b border-border/40 shrink-0">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal" />
                {tr("textInput", currentLang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-3 flex-1 flex flex-col">
              <form onSubmit={handleTextSubmit} className="flex flex-col flex-1 gap-3">
                <Textarea
                  id="manual-ingredient-textarea"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={tr("ingredientsPlaceholder", currentLang)}
                  className="flex-1 resize-none text-xs border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal focus-visible:ring-teal"
                  disabled={isScanning}
                />
                <Button
                  type="submit"
                  disabled={isScanning || !rawText.trim()}
                  className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm font-semibold text-xs rounded-lg transition-all duration-200 shrink-0 gap-2"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyzing Ingredients...
                    </>
                  ) : (
                    <>
                      <Sparkle className="h-4 w-4 text-teal" /> {tr("analyzeIngredients", currentLang)}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* ROW 2 — Indian Food Presets (Spans full width lg:col-span-2, compact height, no h-full stretch!) */}
          <Card ref={presetsRef} className="border-border bg-surface shadow-card-soft lg:col-span-2">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal" />
                {tr("indianFoodPresets", currentLang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-3">
              <div className="flex flex-wrap gap-2">
                {Object.keys(PRESETS).map((presetKey) => (
                  <Button
                    key={presetKey}
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetSelect(presetKey)}
                    disabled={isScanning}
                    className="text-xs border-border/80 hover:bg-accent/40 hover:text-teal font-medium rounded-full transition-all duration-200"
                  >
                    {presetKey}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ROW 3 — Output Section / Error State / Empty State (Spans full width lg:col-span-2) */}
          <div className="lg:col-span-2">

            {/* A. Honest Image Extraction Error State (Defect 2 requirement: NO fabricated reports!) */}
            {report && report.status === "extraction-unavailable" && (
              <Card className="border-rose-500/30 bg-rose-500/5 shadow-card-soft overflow-hidden">
                <CardHeader className="py-3 px-5 border-b border-rose-500/20 bg-rose-500/10">
                  <CardTitle className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                    Image Ingredient Extraction Failed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <p className="text-xs text-foreground leading-relaxed">
                    {report.message || "Could not read or extract ingredient text from the image. Please ensure the label is clear, or use manual entry below."}
                  </p>
                  {report.reasonCode && (
                    <Badge variant="outline" className="text-[11px] font-semibold bg-rose-500/10 text-rose-600 border-rose-500/20 px-2.5 py-1">
                      {getHumanReadableReason(report.reasonCode, report.message)}
                    </Badge>
                  )}

                  <div className="pt-2 border-t border-rose-500/20">
                    <p className="text-xs font-semibold text-foreground mb-2">What would you like to do?</p>
                    <div className="flex flex-wrap gap-2.5">
                      <Button
                        size="sm"
                        onClick={retryImageAnalysis}
                        disabled={isScanning}
                        className="bg-teal text-white hover:bg-teal/90 text-xs font-semibold gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> 1. Retry Image Analysis
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={focusManualText}
                        className="text-xs font-semibold gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5 text-teal" /> 2. Paste Ingredients Manually
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={focusPresets}
                        className="text-xs font-semibold gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" /> 3. Select a Preset
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* B. Valid Scan Result Report Card */}
            {report && report.status !== "extraction-unavailable" && (
              <Card className="border-border bg-surface shadow-card-soft overflow-hidden">
                <CardHeader className="py-4 px-6 border-b border-border/40 bg-surface-muted/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-teal/10 text-teal border-teal/20">
                          {report.source || "Manual text"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-bold tracking-wider ${
                            report.analysisMode === "ai"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          }`}
                        >
                          {report.analysisMode === "ai" ? "AI-Assisted Analysis" : "Rule-Based Analysis"}
                        </Badge>
                        {report.isPersonalized === false && (
                          <Badge variant="secondary" className="text-[10px]">
                            Non-Personalized Baseline
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg font-bold text-foreground">
                        {report.name || "Custom ingredient list"}
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                          Nutrition Score
                        </span>
                        <span className={`text-xl font-black ${getScoreTextColor(report.score)}`}>
                          {report.score} / 10
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetScanner}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Informational notice for deterministic text analysis */}
                  {report.analysisMode === "deterministic" && (
                    <div className="rounded-lg bg-amber-500/10 p-3 border border-amber-500/20 flex items-start gap-2.5">
                      <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                        {report.message || "AI analysis is temporarily unavailable. Results were generated from the ingredient text using HealthGuard's rule-based evaluator."}
                      </p>
                    </div>
                  )}

                  {/* Profile required notice */}
                  {report.message && report.isPersonalized === false && report.analysisMode !== "deterministic" && (
                    <div className="rounded-lg bg-teal/10 p-3 border border-teal/20 flex items-start gap-2.5">
                      <Info className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                      <p className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed font-medium">
                        {report.message}
                      </p>
                    </div>
                  )}

                  {/* Score Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-foreground">
                      <span>Overall Wellness Rating</span>
                      <span>{report.score >= 7 ? "Favorable" : report.score >= 5 ? "Moderate" : "Caution Recommended"}</span>
                    </div>
                    <Progress value={report.score * 10} className={`h-2.5 ${getScoreProgressColor(report.score)}`} />
                  </div>

                  {/* Extracted Ingredients Raw Text */}
                  {report.rawText && (
                    <div className="rounded-lg bg-surface-muted/40 p-3 border border-border/30 space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Analyzed Ingredient Text
                      </span>
                      <p className="text-xs text-foreground font-mono leading-relaxed">
                        {report.rawText}
                      </p>
                    </div>
                  )}

                  {/* Good & Watchout Ingredients */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4" /> Beneficial Ingredients
                      </span>
                      {report.goodIngredients.length > 0 ? (
                        <ul className="space-y-1 pl-4 list-disc text-xs text-foreground">
                          {report.goodIngredients.map((ing, idx) => (
                            <li key={idx}>{ing}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No specific high-benefit ingredients flagged.</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" /> Ingredients to Watch
                      </span>
                      {report.watchOut.length > 0 ? (
                        <ul className="space-y-1 pl-4 list-disc text-xs text-foreground">
                          {report.watchOut.map((ing, idx) => (
                            <li key={idx} className="font-medium text-rose-600/90 dark:text-rose-400">{ing}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No major concerning additives or high-risk sugars flagged.</p>
                      )}
                    </div>
                  </div>

                  {/* Physiological Impacts */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Physiological & Metabolic Impacts
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/40 p-3 bg-surface-muted/30 space-y-1">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-teal" /> Glycemic Impact
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">{report.diabetesImpact}</p>
                      </div>

                      <div className="rounded-lg border border-border/40 p-3 bg-surface-muted/30 space-y-1">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Heart className="h-3.5 w-3.5 text-rose-500" /> Vascular Impact
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">{report.bloodPressureImpact}</p>
                      </div>

                      <div className="rounded-lg border border-border/40 p-3 bg-surface-muted/30 space-y-1">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Brain className="h-3.5 w-3.5 text-amber-500" /> Cardiac Impact
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">{report.heartHealthImpact}</p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendation & Safety Disclaimer */}
                  <div className="rounded-xl border border-teal/20 bg-teal/5 p-4 space-y-2">
                    <span className="text-xs font-bold text-teal uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4" /> Wellness Recommendation
                    </span>
                    <p className="text-xs text-foreground leading-relaxed font-medium">
                      {report.recommendation}
                    </p>
                    <p className="text-[11px] text-muted-foreground italic pt-1 border-t border-teal/10">
                      *This nutrition and wellness analysis is for lifestyle guidance and dietary awareness only. It is not a clinical diagnosis or medical prescription.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* C. Compact Empty Result State */}
            {!report && (
              <Card className="border-border/60 bg-surface/60 shadow-none">
                <CardContent className="p-6 text-center space-y-2">
                  <div className="h-10 w-10 rounded-full bg-teal/10 text-teal flex items-center justify-center mx-auto">
                    <ScanLine className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">No Food Analysis Generated Yet</p>
                  <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                    Upload an ingredient label photo, paste an ingredient list, or select a preset food item to see personalized nutrition insights.
                  </p>
                </CardContent>
              </Card>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
