import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Sparkles,
  Check,
  HelpCircle,
  Camera,
  Upload,
  ScanLine,
  AlertTriangle,
  FileText,
  CheckCircle,
  CheckCircle2,
  ClipboardList,
  Stethoscope,
  Edit2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { isConfigured, db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/auth-context";
import { profileSyncService } from "@/lib/profile-sync";
import { calculateEvidenceSummary } from "@/lib/evidence-summary";
import { EvidenceSummaryCard } from "@/components/EvidenceSummaryCard";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

import { assessHealth, assessLabReportImage, type HealthResult } from "@/lib/health.functions";
import {
  useHealthResult,
  useProfile,
  pushHistory,
  useLangPref,
  type Profile,
  getScopedKey,
} from "@/lib/health-store";
import { tr } from "@/lib/i18n";
import { z } from "zod";
import SplitText from "@/components/ui/split-text";
import ShapeGrid from "@/components/ui/shape-grid";

function getBiomarkerStatus(code: string, value: number, gender?: string): {
  status: "normal" | "borderline" | "high";
  label: string;
  badgeClass: string;
  rangeText: string;
} {
  let status: "normal" | "borderline" | "high" = "normal";
  let rangeText = "";

  switch (code) {
    case "fastingBloodSugar":
      rangeText = "70-99 mg/dL";
      if (value >= 126) status = "high";
      else if (value >= 100) status = "borderline";
      break;
    case "HbA1c":
      rangeText = "< 5.7%";
      if (value >= 6.5) status = "high";
      else if (value >= 5.7) status = "borderline";
      break;
    case "totalCholesterol":
      rangeText = "< 200 mg/dL";
      if (value >= 240) status = "high";
      else if (value >= 200) status = "borderline";
      break;
    case "ldl":
      rangeText = "< 100 mg/dL";
      if (value >= 160) status = "high";
      else if (value >= 100) status = "borderline";
      break;
    case "hdl":
      const cutoff = gender === "female" ? 50 : 40;
      rangeText = `>= ${cutoff} mg/dL`;
      if (value < cutoff) status = "high";
      break;
    case "triglycerides":
      rangeText = "< 150 mg/dL";
      if (value >= 200) status = "high";
      else if (value >= 150) status = "borderline";
      break;
  }

  const badges = {
    normal: { label: "Normal", badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    borderline: { label: "Borderline", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    high: { label: "Elevated", badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  };

  return {
    status,
    ...badges[status],
    rangeText,
  };
}

export const Route = createLazyFileRoute("/_app/assessment")({
  component: AssessmentPage,
});

function AssessmentPage() {
  const { mode, step: initialStep } = Route.useSearch();
  const { hasCompletedAssessment, loading: authLoading, setHasCompletedAssessment } = useAuth();
  const navigate = useNavigate();

  const [lang] = useLangPref();
  const [profile, setProfile] = useProfile();
  const [, setResult] = useHealthResult();

  const [step, setStep] = useState(initialStep ?? 1);
  const [loading, setLoading] = useState(false);

  // Determine flowMode based on search parameters or initial state
  const [flowMode, setFlowMode] = useState<"blood" | "questionnaire" | "combined" | null>(() => {
    const normMode = mode ? String(mode).toLowerCase() : null;
    if (normMode === "blood") return "blood";
    if (normMode === "lifestyle" || normMode === "questionnaire") return "questionnaire";
    if (normMode === "combined" || normMode === "retake" || normMode === "reassess") return "combined";
    if (initialStep === 5) return "blood";
    if (initialStep && initialStep >= 1 && initialStep <= 4) return "questionnaire";
    return null;
  });

  const [externalConsent, setExternalConsent] = useState(true);

  const form = useForm<Profile>({
    defaultValues: profile ?? {
      age: 35,
      gender: "male",
      heightCm: 170,
      weightKg: 72,
      smoking: "never",
      exercise: "light",
      familyHistory: "",
      symptoms: "",
      labObservations: [],
      fitnessGoal: "stay-healthy",
      fitnessLevel: "beginner",
      sittingHours: 4,
      medicalConditions: [],
      workoutDaysPerWeek: 3,
      workoutDuration: 30,
      exerciseLocation: "home",
      equipment: "none",
      dietType: "vegetarian",
      lactoseIntolerant: false,
      foodAllergies: "",
      regionalCuisine: "north",
      budget: "medium",
      cookingTime: 20,
      weightGoal: "maintain",
      sleepHours: "7-8",
      stressLevel: "medium",
      waterIntake: "2 L",
      occupation: "office",
      alcohol: "never",
      tobaccoUse: "none",
      excludedFoods: [],
    },
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [extractedLabs, setExtractedLabs] = useState<Record<string, { value: number; unit: string; checked: boolean; error?: string }>>({});
  const [reportDate, setReportDate] = useState<string>("");
  const [useExistingReport, setUseExistingReport] = useState(true);
  const [bloodUploadState, setBloodUploadState] = useState<"upload" | "processing" | "review" | "success">("upload");
  const [processingIndex, setProcessingIndex] = useState(0);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const existingLabs = profile?.labObservations || [];
  const hasExistingReport = existingLabs.length > 0;

  const bounds: Record<string, { min: number; max: number; unit: string; name: string }> = {
    fastingBloodSugar: { min: 50, max: 400, unit: "mg/dL", name: "Fasting Blood Sugar" },
    HbA1c: { min: 3, max: 18, unit: "%", name: "HbA1c" },
    totalCholesterol: { min: 50, max: 500, unit: "mg/dL", name: "Total Cholesterol" },
    ldl: { min: 20, max: 300, unit: "mg/dL", name: "LDL Cholesterol" },
    hdl: { min: 10, max: 150, unit: "mg/dL", name: "HDL Cholesterol" },
    triglycerides: { min: 30, max: 600, unit: "mg/dL", name: "Triglycerides" },
  };

  // Define steps dynamically based on selected flowMode
  const activeSteps = (() => {
    if (flowMode === "blood") {
      return [
        { id: 1, type: "blood" as const, label: "Blood Report", desc: "Upload & Verify" }
      ];
    }
    if (flowMode === "questionnaire") {
      return [
        { id: 1, type: "personal" as const, label: "Basic Profile", desc: "Goals & Body" },
        { id: 2, type: "health" as const, label: "Health Info", desc: "Conditions & History" },
        { id: 3, type: "lifestyle" as const, label: "Lifestyle", desc: "Activity & Habits" },
        { id: 4, type: "diet" as const, label: "Diet Prefs", desc: "Cuisine & Exclusions" },
      ];
    }
    if (flowMode === "combined") {
      return [
        { id: 1, type: "blood" as const, label: "Blood Report", desc: "Upload & Verify" },
        { id: 2, type: "personal" as const, label: "Basic Profile", desc: "Goals & Body" },
        { id: 3, type: "health" as const, label: "Health Info", desc: "Conditions & History" },
        { id: 4, type: "lifestyle" as const, label: "Lifestyle", desc: "Activity & Habits" },
        { id: 5, type: "diet" as const, label: "Diet Prefs", desc: "Cuisine & Exclusions" },
      ];
    }
    return [];
  })();

  const currentStepInfo = activeSteps[step - 1];
  const currentStepType = currentStepInfo?.type;

  const selectFlow = (mode: "blood" | "questionnaire" | "combined") => {
    setFlowMode(mode);
    setStep(1);
  };

  useEffect(() => {
    if (currentStepType === "blood" && hasExistingReport && useExistingReport) {
      form.setValue("labObservations", existingLabs);
    }
  }, [currentStepType, useExistingReport, hasExistingReport, existingLabs, form]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const initializeEmptyLabs = () => {
    const empty: Record<string, { value: number; unit: string; checked: boolean; error?: string }> = {};
    Object.entries(bounds).forEach(([key, rule]) => {
      empty[key] = {
        value: 0,
        unit: rule.unit,
        checked: false,
      };
    });
    setExtractedLabs(empty);
    setReportDate(new Date().toISOString().split("T")[0]);
  };

  useEffect(() => {
    initializeEmptyLabs();
  }, []);

  const handleToggleChecked = (code: string) => {
    setExtractedLabs((prev) => {
      const current = prev[code];
      if (!current) return prev;
      return {
        ...prev,
        [code]: {
          ...current,
          checked: !current.checked,
        },
      };
    });
  };

  const handleExtractedValChange = (code: string, valueStr: string) => {
    const numVal = parseFloat(valueStr) || 0;
    const rule = bounds[code];
    const inBounds = numVal >= rule.min && numVal <= rule.max;
    setExtractedLabs((prev) => {
      const current = prev[code];
      if (!current) return prev;
      return {
        ...prev,
        [code]: {
          ...current,
          value: numVal,
          checked: inBounds,
          error: inBounds ? undefined : `Value out of range (${rule.min}-${rule.max} ${rule.unit})`,
        },
      };
    });
  };

  const startCamera = async () => {
    setSelectedFile(null);
    setExtractedLabs({});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      toast.success("Camera activated successfully.");
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error("Could not access camera. Please upload a file instead.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const processOCRResult = (result: any) => {
    const initialExtracted: Record<string, { value: number; unit: string; checked: boolean; error?: string }> = {};

    Object.entries(bounds).forEach(([key, rule]) => {
      const fieldData = result[key];
      if (fieldData && typeof fieldData.value === "number") {
        const val = fieldData.value;
        const u = fieldData.unit || rule.unit;
        const inBounds = val >= rule.min && val <= rule.max;
        initialExtracted[key] = {
          value: val,
          unit: u,
          checked: inBounds,
          error: inBounds ? undefined : `Value out of sane range (${rule.min}-${rule.max} ${rule.unit})`,
        };
      } else {
        initialExtracted[key] = {
          value: 0,
          unit: rule.unit,
          checked: false,
        };
      }
    });

    setExtractedLabs(initialExtracted);
    if (result.reportDate) {
      setReportDate(result.reportDate);
    } else {
      setReportDate(new Date().toISOString().split("T")[0]);
    }
  };

  function getExtractionErrorMessage(reasonCode?: string): string {
    switch (reasonCode) {
      case "LAB_EXTRACTION_DISABLED":
        return "AI extraction is currently disabled. You can enter your laboratory values manually.";
      case "LAB_EXTRACTION_CONSENT_REQUIRED":
      case "EXTERNAL_PROCESSING_CONSENT_REQUIRED":
        return "Consent is required before external AI processing.";
      case "LAB_EXTRACTION_API_KEY_MISSING":
      case "LAB_EXTRACTION_CREDENTIALS_MISSING":
        return "AI extraction service is not configured. You can enter your laboratory values manually.";
      case "LAB_FILE_TYPE_UNSUPPORTED":
      case "LAB_FILE_UNSUPPORTED":
      case "LAB_UPLOAD_UNSUPPORTED_MIME_TYPE":
        return "This file type is not supported. Upload a PDF, PNG, or JPEG.";
      case "LAB_FILE_TOO_LARGE":
      case "LAB_UPLOAD_SIZE_LIMIT_EXCEEDED":
        return "File size limit exceeded. Please upload a smaller report file.";
      case "LAB_FILE_INVALID":
      case "LAB_UPLOAD_INVALID_IMAGE":
      case "LAB_UPLOAD_MIME_SIGNATURE_MISMATCH":
        return "Selected file is invalid or unreadable. Please choose a valid lab report.";
      case "LAB_EXTRACTION_TIMEOUT":
        return "AI extraction timed out. You can enter your laboratory values manually.";
      case "LAB_EXTRACTION_EMPTY_RESULT":
        return "No lab values could be extracted from this report. You can enter values manually.";
      case "LAB_EXTRACTION_PARSE_FAILED":
        return "Failed to read lab report structure. You can enter your laboratory values manually.";
      case "LAB_EXTRACTION_UNAVAILABLE":
      case "LAB_EXTRACTION_PROVIDER_REJECTED":
      default:
        return "AI extraction is currently unavailable. You can enter your laboratory values manually.";
    }
  }

  const startScanningAnimationAndOCR = async (ocrPromise: Promise<any>) => {
    setBloodUploadState("processing");
    setProcessingIndex(0);
    setIsScanning(true);

    const animPromise = new Promise<void>((resolve) => {
      let currentIdx = 0;
      const interval = setInterval(() => {
        currentIdx++;
        setProcessingIndex(currentIdx);
        if (currentIdx >= 4) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });

    try {
      const [result] = await Promise.all([ocrPromise, animPromise]);
      const httpStatus = result?.httpStatus ?? (result?.status === "extracted" ? 200 : (result?.reasonCode === "UNSUPPORTED_FORMAT" || result?.reasonCode === "REPORT_EMPTY" ? 400 : 503));

      if (httpStatus >= 400 && httpStatus < 500) {
        // HTTP 400 / 422: Upload validation failure
        setBloodUploadState("upload");
        toast.error(`Validation error: ${getExtractionErrorMessage(result?.reasonCode || result?.message)}`);
      } else if (httpStatus >= 500) {
        // HTTP >= 500: Server failure
        setBloodUploadState("review");
        toast.error("Server error: Unable to analyze lab report. Please enter values manually.");
      } else if (result?.status === "manual-entry-required") {
        // status="manual-entry-required": Navigate directly to manual biomarker entry
        initializeEmptyLabs();
        setBloodUploadState("review");
        toast.info("AI extraction unavailable. Switched to manual biomarker entry.");
      } else if (result?.status === "extraction-unavailable") {
        // status="extraction-unavailable": Show warning UI instead of success
        setBloodUploadState("review");
        toast.warning(`Extraction unavailable: ${getExtractionErrorMessage(result?.reasonCode)}`);
      } else if (httpStatus >= 200 && httpStatus < 300 && result?.status === "extracted") {
        // Strictly ONLY show success toast when HTTP status is 2xx AND response.status === "extracted"
        processOCRResult(result);
        setBloodUploadState("review");
        toast.success("Lab report analyzed successfully!");
      } else {
        setBloodUploadState("review");
        toast.warning(getExtractionErrorMessage(result?.reasonCode));
      }
    } catch (err: any) {
      console.error("OCR analysis failure:", err);
      setBloodUploadState("review");
      toast.error(getExtractionErrorMessage(err?.reasonCode || err?.message));
    } finally {
      setIsScanning(false);
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg");
    const base64Data = dataUrl.split(",")[1];

    stopCamera();

    const ocrPromise = assessLabReportImage({
      base64Image: base64Data,
      mimeType: "image/jpeg",
      externalProcessingConsent: externalConsent,
    });

    await startScanningAnimationAndOCR(ocrPromise);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      toast.error("Uploaded report file is empty.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size limit exceeded. Please upload a report file under 10 MB.");
      return;
    }

    const normType = (file.type || "").toLowerCase();
    const fileName = (file.name || "").toLowerCase();
    const isSupported =
      normType.includes("pdf") ||
      normType.includes("jpeg") ||
      normType.includes("png") ||
      normType.includes("webp") ||
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".webp");

    if (!isSupported || normType.includes("heic") || normType.includes("heif") || fileName.endsWith(".heic") || fileName.endsWith(".heif")) {
      toast.error("Unsupported file format. Please upload a PDF, PNG, JPEG, or WebP file.");
      return;
    }

    setSelectedFile(file);
    stopCamera();

    const base64Promise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });

    const ocrPromise = base64Promise.then((base64Data) =>
      assessLabReportImage({
        base64Image: base64Data,
        mimeType: file.type || "image/jpeg",
        externalProcessingConsent: externalConsent,
      })
    );

    await startScanningAnimationAndOCR(ocrPromise);
  };

  const saveLabObservations = () => {
    const obsList: any[] = [];
    Object.entries(extractedLabs).forEach(([code, info]) => {
      const hasValue = info.value > 0;
      if (hasValue) {
        const rule = bounds[code];
        const inBounds = info.value >= rule.min && info.value <= rule.max;
        obsList.push({
          code,
          value: Number(info.value),
          unit: info.unit,
          observedAt: reportDate ? new Date(reportDate).toISOString() : new Date().toISOString(),
          isVerified: inBounds,
          verifiedBy: "user",
        });
      }
    });

    form.setValue("labObservations", obsList);
  };

  const total = activeSteps.length;
  const pct = (step / total) * 100;

  async function submit(values: Profile) {
    const initiatingUid = auth.currentUser?.uid || "guest";
    setLoading(true);
    try {
      const isBloodReportOnly = flowMode === "blood";
      const updatedValues = {
        ...values,
        bloodReportOnly: isBloodReportOnly,
        labObservations: flowMode === "questionnaire" ? [] : values.labObservations,
      };

      const res = (await assessHealth({
        data: {
          ...updatedValues,
          age: Number(values.age),
          heightCm: Number(values.heightCm),
          weightKg: Number(values.weightKg),
          language: lang,
          labObservations: updatedValues.labObservations || [],
        },
      })) as HealthResult & { bmi: number };

      const currentUid = auth.currentUser?.uid || "guest";
      if (currentUid !== initiatingUid) {
        console.warn("Assessment submit aborted: User switched accounts during calculation.");
        return;
      }

      setProfile(updatedValues);
      setResult(res);

      const newHistoryEntry = {
        date: new Date().toISOString(),
        overallScore: res.overallScore,
        bmi: res.bmi,
        weightKg: values.weightKg,
        risks: res.risk,
      };
      pushHistory(newHistoryEntry);

      const historyKey = getScopedKey("hg.history.v1", currentUid === "guest" ? null : currentUid);
      const localHistoryRaw = localStorage.getItem(historyKey);
      const historyList = localHistoryRaw ? JSON.parse(localHistoryRaw) : [];

      setHasCompletedAssessment(true);
      toast.success("Assessment complete");
      navigate({ to: "/action-plan" });

      profileSyncService.queueProfileSync(updatedValues, res, historyList);
    } catch (e: unknown) {
      console.error("Assessment submit flow failure:", e);
      toast.error("Assessment calculation failed. Please verify inputs.");
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (errors: unknown) => {
    console.error("Form validation errors:", errors);
    toast.error("Please fill in all fields correctly before generating your plan.");
  };

  async function next() {
    let fieldsToValidate: Array<keyof Profile> = [];
    if (currentStepType === "personal") {
      fieldsToValidate = ["age", "gender", "heightCm", "weightKg", "fitnessGoal"];
    } else if (currentStepType === "lifestyle") {
      fieldsToValidate = ["exercise", "exerciseLocation"];
    } else if (currentStepType === "diet") {
      fieldsToValidate = ["dietType", "regionalCuisine", "weightGoal"];
    }

    if (fieldsToValidate.length > 0) {
      const isValid = await form.trigger(fieldsToValidate);
      if (!isValid) {
        toast.error("Please fill in all required fields correctly before continuing.");
        return;
      }
    }

    if (currentStepType === "blood") {
      saveLabObservations();
    }

    if (step < total) setStep(step + 1);
    else form.handleSubmit(submit, onInvalid)();
  }

  function back() {
    if (step > 1) setStep(step - 1);
    else setFlowMode(null);
  }

  // ── Flow Mode Selector (Gateway entry page) ─────────────────────────────
  if (flowMode === null) {
    return (
      <div className="relative w-full min-h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col justify-start py-2 lg:py-4 px-4 animate-fade-in isolate">
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

        <div className="relative z-10 mx-auto max-w-4xl w-full space-y-5">
          <div className="text-center space-y-2 pt-0">
            <Badge variant="secondary" className="rounded-full bg-teal/10 text-teal border border-teal/20">
              {tr("assessment", lang)}
            </Badge>
            <SplitText
              text={tr("tellUsAboutYourHealth", lang)}
              className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
              delay={35}
              duration={0.6}
              ease="power3.out"
              splitType="chars"
              tag="h1"
              textAlign="center"
            />
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {tr("chooseHowToBegin", lang)}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 pt-4">
            {/* Card 1: Upload Blood Report */}
            <div className="relative group rounded-2xl border border-border bg-surface p-6 hover:border-teal/40 hover:bg-[#f6fcfb] dark:hover:bg-[#112421] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-sm hover:shadow-md">
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-teal/10 border border-teal/20 flex items-center justify-center text-teal">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {tr("uploadBloodReportTitle", lang)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{tr("fastestMethod", lang)}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tr("uploadBloodReportDesc", lang)}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal shrink-0" />
                    {tr("aiExtractsLabValues", lang)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal shrink-0" />
                    {tr("fasterAnalysis", lang)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal shrink-0" />
                    {tr("skipManualEntry", lang)}
                  </li>
                </ul>
              </div>
              <Button
                onClick={() => selectFlow("blood")}
                className="mt-6 w-full bg-teal text-white hover:bg-teal/90 font-semibold cursor-pointer h-10 rounded-xl"
              >
                {tr("uploadReportBtn", lang)}
              </Button>
            </div>

            {/* Card 2: Complete Health Assessment */}
            <div className="relative group rounded-2xl border border-border bg-surface p-6 hover:border-primary/40 hover:bg-[#f8fafc] dark:hover:bg-[#151b26] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-sm hover:shadow-md">
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {tr("healthAssessment", lang)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{tr("lifestyleAndSymptoms", lang)}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tr("answerLifestyleQuestionsDesc", lang)}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {tr("lifestyleQuestionsItem", lang)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {tr("familyHistoryItem", lang)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {tr("symptomsItem", lang)}
                  </li>
                </ul>
              </div>
              <Button
                onClick={() => selectFlow("questionnaire")}
                className="mt-6 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer h-10 rounded-xl"
              >
                {tr("startAssessmentBtn", lang)}
              </Button>
            </div>

            {/* Card 3: Complete Health Analysis */}
            <div className="relative group rounded-2xl border border-teal/30 bg-[#f0faf8] dark:bg-[#0e221f] p-6 hover:border-teal/50 hover:bg-[#e4f6f2] dark:hover:bg-[#122b27] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-sm hover:shadow-md">
              <div className="absolute -top-3 right-4 bg-teal text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm">
                ⭐ {tr("recommendedBadge", lang)}
              </div>
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-teal/20 border border-teal/35 flex items-center justify-center text-teal">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {tr("completeHealthAnalysisTitle", lang)}
                  </h3>
                  <p className="text-xs text-teal font-semibold mt-1">{tr("fullDiagnosticMapping", lang)}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tr("combineBloodReportDesc", lang)}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal shrink-0" />
                    {tr("bloodReportPlusLifestyle", lang)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal shrink-0" />
                    {tr("combinedAiAnalysis", lang)}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal shrink-0" />
                    {tr("richestHealthResults", lang)}
                  </li>
                </ul>
              </div>
              <Button
                onClick={() => selectFlow("combined")}
                className="mt-6 w-full bg-teal text-white hover:bg-teal/90 font-semibold cursor-pointer h-10 rounded-xl"
              >
                {tr("startCompleteAnalysisBtn", lang)}
              </Button>
            </div>
          </div>

          {/* disclaimer */}
          <div className="rounded-2xl border border-amber-400/40 bg-[#fffdf6] dark:bg-[#18150d] p-5 flex gap-4 max-w-3xl mx-auto mt-4">
            <div className="shrink-0 mt-0.5">
              <div className="h-9 w-9 rounded-xl bg-amber-400/15 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-500" strokeWidth={2} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1.5 font-mono">
                ⚕ {tr("medicalDisclaimerTitle", lang)}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tr("medicalDisclaimerDesc", lang)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active Flow Rendering ───────────────────────────────────────────────
  return (
    <div className="w-full px-4 py-3 space-y-4">
      <div className="mb-4">
        {flowMode !== "blood" && (
          <Badge
            variant="secondary"
            className="rounded-full bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20"
          >
            {flowMode === "questionnaire" ? "Health Questionnaire" : "Combined Health Analysis"}
          </Badge>
        )}
        <SplitText
          text={flowMode === "blood" ? "Upload Blood Report" : flowMode === "questionnaire" ? "Health Assessment" : "Complete Health Analysis"}
          className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground"
          delay={35}
          duration={0.6}
          ease="power3.out"
          splitType="chars"
          tag="h1"
          textAlign="left"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {flowMode === "blood"
            ? "Extract medical biomarkers automatically from a recent test report."
            : flowMode === "questionnaire"
            ? "Complete lifestyle questions to build your health index profile."
            : "Upload blood test values and complete lifestyle history for combined diagnostics."}
        </p>
      </div>

      {flowMode !== "blood" && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="font-semibold text-primary uppercase tracking-wider text-[10px] font-mono">
              {tr("stepWord", lang)} {step} {tr("ofWord", lang)} {total}
            </span>
            <span className="font-semibold text-teal uppercase tracking-wider text-[10px] font-mono">
              {Math.round(pct)}% {tr("completeWord", lang)}
            </span>
          </div>
          <Progress value={pct} className="h-1 bg-muted [&>div]:bg-teal" />
          
          <div className={`mt-4 grid grid-cols-2 gap-3 ${total > 4 ? "sm:grid-cols-5" : total === 4 ? "sm:grid-cols-4" : total === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {activeSteps.map((s, index) => {
              const stepNum = index + 1;
              const active = stepNum === step;
              const done = stepNum < step;
              const label = s.label || ("labelKey" in s ? tr((s as any).labelKey, lang) : "");
              const desc = s.desc || ("descKey" in s ? tr((s as any).descKey, lang) : "");
              return (
                <div
                  key={s.type}
                  className={`rounded-lg border p-2.5 text-left transition-all duration-300 relative overflow-hidden ${
                    active
                      ? "border-teal/60 bg-surface shadow-[0_0_12px_rgba(20,184,166,0.08)]"
                      : done
                        ? "border-border/60 bg-accent/20"
                        : "border-border bg-surface-muted/30"
                  }`}
                >
                  {active && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal via-teal to-primary" />
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold transition-colors ${
                        active
                          ? "bg-teal text-white"
                          : done
                            ? "bg-teal/20 text-teal"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : stepNum}
                    </span>
                    <span
                      className={`text-xs font-semibold transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="mt-1 hidden text-[10px] text-muted-foreground sm:block">
                    {desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Card className="border-border bg-surface shadow-card-soft">
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={form.handleSubmit(submit, onInvalid)} className="space-y-4">
            
            {currentStepType === "personal" && (
              <div className="space-y-6 text-left animate-fade-in">
                {/* Fitness Goal Selection Card Grid */}
                <Field
                  label={lang === "hi" ? "आपका मुख्य स्वास्थ्य लक्ष्य क्या है?" : lang === "gu" ? "તમારો મુખ્ય સ્વાસ્થ્ય ધ્યેય શું છે?" : "What is your primary fitness goal?"}
                  helperText="Everything will be customized around this choice."
                  error={form.formState.errors.fitnessGoal?.message}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { id: "lose-weight", label: "Lose Weight", labelHi: "वजन घटाएं", labelGu: "વજન ઘટાડવું", desc: "Reduce fat mass" },
                      { id: "gain-muscle", label: "Gain Muscle", labelHi: "मांसपेशियों का विकास", labelGu: "સ્નાયુબદ્ધ બનવું", desc: "Hypertrophy focus" },
                      { id: "stay-healthy", label: "Stay Healthy", labelHi: "स्वस्थ रहें", labelGu: "સ્વસ્થ રહેવું", desc: "General wellbeing" },
                      { id: "improve-heart", label: "Heart Health", labelHi: "हृदय स्वास्थ्य", labelGu: "હૃદયની તંદુરસ્તી", desc: "Aerobic recovery" },
                      { id: "diabetes", label: "Manage Diabetes", labelHi: "मधुमेह नियंत्रण", labelGu: "ડાયાબિટીસ નિયંત્રણ", desc: "Low-GI target" },
                      { id: "hypertension", label: "Reduce BP", labelHi: "रक्तचाप कम करें", labelGu: "બીપી ઘટાડવું", desc: "Low sodium target" },
                      { id: "increase-energy", label: "Increase Energy", labelHi: "ऊर्जा बढ़ाएं", labelGu: "ઉર્જા વધારવી", desc: "Combat fatigue" },
                      { id: "better-sleep", label: "Better Sleep", labelHi: "बेहतर नींद", labelGu: "સારી ઊંઘ", desc: "Stress recovery" },
                    ].map((g) => {
                      const active = form.watch("fitnessGoal") === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => form.setValue("fitnessGoal", g.id)}
                          className={`rounded-xl border p-3 text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                            active
                              ? "border-teal bg-teal/5 ring-1 ring-teal shadow-sm"
                              : "border-border bg-surface hover:border-teal/40 hover:bg-surface-muted/50"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-foreground">
                              {lang === "hi" ? g.labelHi : lang === "gu" ? g.labelGu : g.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{g.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2 border-t border-border/40 pt-4">
                  <Field
                    label={tr("age", lang)}
                    helperText={tr("helperDemographic", lang)}
                    error={form.formState.errors.age?.message}
                  >
                    <div className="relative">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        className="h-10 border-border/80 bg-surface/50 pr-10 focus:border-teal focus:ring-teal"
                        {...form.register("age", { valueAsNumber: true, required: "Age is required" })}
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                        {tr("yrs", lang)}
                      </span>
                    </div>
                  </Field>

                  <Field
                    label={tr("gender", lang)}
                    helperText={tr("helperMetabolic", lang)}
                    error={form.formState.errors.gender?.message}
                  >
                    <Select
                      value={form.watch("gender")}
                      onValueChange={(v) => form.setValue("gender", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{tr("male", lang)}</SelectItem>
                        <SelectItem value="female">{tr("female", lang)}</SelectItem>
                        <SelectItem value="other">{tr("other", lang)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    label={tr("height", lang)}
                    helperText={tr("helperHeight", lang)}
                    error={form.formState.errors.heightCm?.message}
                  >
                    <div className="relative">
                      <Input
                        type="number"
                        min={50}
                        max={260}
                        className="h-10 border-border/80 bg-surface/50 pr-10 focus:border-teal focus:ring-teal"
                        {...form.register("heightCm", { valueAsNumber: true, required: "Height is required" })}
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                        {tr("cm", lang)}
                      </span>
                    </div>
                  </Field>

                  <Field
                    label={tr("weight", lang)}
                    helperText={tr("helperWeight", lang)}
                    error={form.formState.errors.weightKg?.message}
                  >
                    <div className="relative">
                      <Input
                        type="number"
                        min={10}
                        max={400}
                        className="h-10 border-border/80 bg-surface/50 pr-10 focus:border-teal focus:ring-teal"
                        {...form.register("weightKg", { valueAsNumber: true, required: "Weight is required" })}
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                        {tr("kg", lang)}
                      </span>
                    </div>
                  </Field>

                  <Field
                    label={lang === "hi" ? "व्यवसाय" : lang === "gu" ? "વ્યવસાય" : "Occupation"}
                    helperText="Helps determine baseline movement requirements"
                    error={form.formState.errors.occupation?.message}
                  >
                    <Select
                      value={form.watch("occupation") || "office"}
                      onValueChange={(v) => form.setValue("occupation", v)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="office">Office worker (Sitting)</SelectItem>
                        <SelectItem value="student">Student (Mostly Sitting)</SelectItem>
                        <SelectItem value="labour">Heavy Labour (Active)</SelectItem>
                        <SelectItem value="healthcare">Healthcare worker (Active)</SelectItem>
                        <SelectItem value="retired">Retired / Senior</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {currentStepType === "health" && (
              <div className="space-y-5 text-left animate-fade-in">
                {/* Conditional Medical Conditions */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-foreground">Do you have any medical conditions?</Label>
                  <div className="flex gap-4">
                    {[
                      { val: false, label: "No medical conditions" },
                      { val: true, label: "Yes, I have conditions" },
                    ].map((opt) => {
                      const list = form.watch("medicalConditions") || [];
                      const active = opt.val ? list.length > 0 : list.length === 0;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            if (!opt.val) form.setValue("medicalConditions", []);
                            else if (list.length === 0) form.setValue("medicalConditions", ["diabetes"]);
                          }}
                          className={`rounded-xl border px-4 py-2 text-xs font-semibold cursor-pointer transition-all duration-200 ${
                            active
                              ? "border-teal bg-teal/5 text-teal"
                              : "border-border bg-surface text-muted-foreground hover:bg-surface-muted/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Progressive Checklist of Conditions */}
                  {(form.watch("medicalConditions") || []).length > 0 && (
                    <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-4 mt-2 grid grid-cols-2 gap-3 animate-fade-in">
                      {[
                        { id: "diabetes", label: "Diabetes" },
                        { id: "hypertension", label: "Hypertension" },
                        { id: "heart-disease", label: "Heart Disease" },
                        { id: "arthritis", label: "Arthritis" },
                        { id: "knee-pain", label: "Knee Pain" },
                        { id: "back-pain", label: "Back Pain" },
                        { id: "asthma", label: "Asthma" },
                        { id: "thyroid", label: "Thyroid" },
                      ].map((item) => (
                        <label key={item.id} className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            value={item.id}
                            {...form.register("medicalConditions")}
                            className="rounded border-border text-teal focus:ring-teal h-4 w-4 cursor-pointer"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tobacco use */}
                <div className="space-y-2 border-t border-border/40 pt-4">
                  <Label className="text-xs font-bold text-foreground">Tobacco Consumption (Optional)</Label>
                  <Select
                    value={form.watch("tobaccoUse") || "none"}
                    onValueChange={(v) => form.setValue("tobaccoUse", v)}
                  >
                    <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="gutka">Gutka / Chewing Tobacco</SelectItem>
                      <SelectItem value="pan">Pan Masala</SelectItem>
                      <SelectItem value="chewing">Tobacco Chewing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 border-t border-border/40 pt-4">
                  <Field
                    label={tr("familyHistory", lang)}
                    helperText={tr("helperFamilyHistory", lang)}
                    error={form.formState.errors.familyHistory?.message}
                  >
                    <Textarea
                      rows={3}
                      placeholder={tr("familyHistoryPlaceholder", lang)}
                      className="border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal focus-visible:ring-teal text-xs"
                      {...form.register("familyHistory")}
                    />
                  </Field>

                  <Field
                    label={tr("symptoms", lang)}
                    helperText={tr("symptomsHelper", lang)}
                    error={form.formState.errors.symptoms?.message}
                  >
                    <Textarea
                      rows={3}
                      placeholder={tr("symptomsPlaceholder", lang)}
                      className="border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal focus-visible:ring-teal text-xs"
                      {...form.register("symptoms")}
                    />
                  </Field>
                </div>
              </div>
            )}

            {currentStepType === "lifestyle" && (
              <div className="space-y-5 text-left animate-fade-in">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* How active are you */}
                  <Field
                    label="How active are you?"
                    helperText="Decides your physical baseline profile"
                    error={form.formState.errors.exercise?.message}
                  >
                    <Select
                      value={form.watch("exercise")}
                      onValueChange={(v) => form.setValue("exercise", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sedentary (Mostly sitting)</SelectItem>
                        <SelectItem value="light">Lightly Active (Light walks)</SelectItem>
                        <SelectItem value="moderate">Moderately Active (Workout 3-5x/wk)</SelectItem>
                        <SelectItem value="active">Very Active (Heavy sports/gym daily)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Workout Location */}
                  <Field
                    label="Exercise Preference"
                    helperText="Where do you prefer to workout?"
                  >
                    <Select
                      value={form.watch("exerciseLocation") || "home"}
                      onValueChange={(v) => form.setValue("exerciseLocation", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">Home Workouts</SelectItem>
                        <SelectItem value="gym">Gym Center</SelectItem>
                        <SelectItem value="outdoor">Outdoor / Parks</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* Progressive disclosure: show equipment only if Gym/Home is selected */}
                {(form.watch("exerciseLocation") === "home" || form.watch("exerciseLocation") === "gym") && (
                  <div className="space-y-2 border-t border-border/40 pt-4 animate-fade-in">
                    <Label className="text-xs font-bold text-foreground">Available Equipment</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1.5">
                      {[
                        { id: "none", label: "No Equipment" },
                        { id: "bands", label: "Resistance Bands" },
                        { id: "dumbbells", label: "Dumbbells" },
                        { id: "gym", label: "Full Gym Machines" },
                      ].map((eq) => {
                        const active = form.watch("equipment") === eq.id;
                        return (
                          <button
                            key={eq.id}
                            type="button"
                            onClick={() => form.setValue("equipment", eq.id as any)}
                            className={`rounded-xl border p-3 text-center transition-all duration-200 cursor-pointer ${
                              active
                                ? "border-teal bg-teal/5 text-teal font-semibold shadow-sm"
                                : "border-border bg-surface text-muted-foreground hover:bg-surface-muted/50"
                            }`}
                          >
                            <span className="text-xs">{eq.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 border-t border-border/40 pt-4">
                  <Field
                    label="Workout Days per Week"
                    helperText="Preferred schedule target"
                  >
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal"
                      {...form.register("workoutDaysPerWeek", { valueAsNumber: true })}
                    />
                  </Field>

                  <Field
                    label="Preferred Session Duration"
                    helperText="Duration per workout session"
                  >
                    <div className="relative">
                      <Input
                        type="number"
                        min={10}
                        max={180}
                        className="h-10 border-border/80 bg-surface/50 pr-10 focus:border-teal focus:ring-teal"
                        {...form.register("workoutDuration", { valueAsNumber: true })}
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                        min
                      </span>
                    </div>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 border-t border-border/40 pt-4">
                  <Field label="Average Sleep">
                    <Select
                      value={form.watch("sleepHours") || "7-8"}
                      onValueChange={(v) => form.setValue("sleepHours", v)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="<5">&lt; 5 hours</SelectItem>
                        <SelectItem value="5-6">5 - 6 hours</SelectItem>
                        <SelectItem value="7-8">7 - 8 hours</SelectItem>
                        <SelectItem value="9+">9+ hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Stress Level">
                    <Select
                      value={form.watch("stressLevel") || "medium"}
                      onValueChange={(v) => form.setValue("stressLevel", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Water Intake">
                    <Select
                      value={form.watch("waterIntake") || "2 L"}
                      onValueChange={(v) => form.setValue("waterIntake", v)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1 L">1 Litre</SelectItem>
                        <SelectItem value="2 L">2 Litres</SelectItem>
                        <SelectItem value="3 L">3 Litres</SelectItem>
                        <SelectItem value="4+ L">4+ Litres</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {currentStepType === "diet" && (
              <div className="space-y-5 text-left animate-fade-in">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Diet Type */}
                  <Field label="Diet Type">
                    <Select
                      value={form.watch("dietType") || "vegetarian"}
                      onValueChange={(v) => form.setValue("dietType", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vegetarian">Vegetarian</SelectItem>
                        <SelectItem value="eggetarian">Eggetarian</SelectItem>
                        <SelectItem value="non-vegetarian">Non-Vegetarian</SelectItem>
                        <SelectItem value="vegan">Vegan</SelectItem>
                        <SelectItem value="jain">Jain</SelectItem>
                        <SelectItem value="satvik">Satvik</SelectItem>
                        <SelectItem value="no-onion-garlic">No Onion & Garlic</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Regional Cuisine */}
                  <Field label="Preferred Regional Cuisine">
                    <Select
                      value={form.watch("regionalCuisine") || "north"}
                      onValueChange={(v) => form.setValue("regionalCuisine", v)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="north">North Indian</SelectItem>
                        <SelectItem value="south">South Indian</SelectItem>
                        <SelectItem value="gujarati">Gujarati</SelectItem>
                        <SelectItem value="punjabi">Punjabi</SelectItem>
                        <SelectItem value="maharashtrian">Maharashtrian</SelectItem>
                        <SelectItem value="bengali">Bengali</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* Foods you DON'T eat */}
                <div className="space-y-2 border-t border-border/40 pt-4">
                  <Label className="text-xs font-bold text-foreground">Foods you DON'T eat (Exclusions)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-1.5 rounded-xl border border-border/80 bg-surface-muted/30 p-4">
                    {[
                      { id: "paneer", label: "Paneer" },
                      { id: "milk", label: "Milk / Dairy" },
                      { id: "eggs", label: "Eggs" },
                      { id: "fish", label: "Fish" },
                      { id: "chicken", label: "Chicken" },
                      { id: "soy", label: "Soy Products" },
                      { id: "peanuts", label: "Peanuts" },
                      { id: "gluten", label: "Gluten" },
                      { id: "onion", label: "Onion" },
                      { id: "garlic", label: "Garlic" },
                    ].map((item) => (
                      <label key={item.id} className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          value={item.id}
                          {...form.register("excludedFoods")}
                          className="rounded border-border text-teal focus:ring-teal h-4 w-4 cursor-pointer"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 border-t border-border/40 pt-4">
                  <Field label="Lactose Intolerant?">
                    <Select
                      value={form.watch("lactoseIntolerant") ? "yes" : "no"}
                      onValueChange={(v) => form.setValue("lactoseIntolerant", v === "yes")}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Monthly Budget">
                    <Select
                      value={form.watch("budget") || "medium"}
                      onValueChange={(v) => form.setValue("budget", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low Cost (Affordable)</SelectItem>
                        <SelectItem value="medium">Medium Cost</SelectItem>
                        <SelectItem value="flexible">Flexible / Premium</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Weight Goal">
                    <Select
                      value={form.watch("weightGoal") || "maintain"}
                      onValueChange={(v) => form.setValue("weightGoal", v as any)}
                    >
                      <SelectTrigger className="h-10 border-border/80 bg-surface/50 focus:border-teal focus:ring-teal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lose">Weight Loss (Deficit)</SelectItem>
                        <SelectItem value="maintain">Maintain weight</SelectItem>
                        <SelectItem value="gain">Weight Gain (Surplus)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {currentStepType === "blood" && (
              <div className="space-y-4 animate-fade-in">
                {/* ── View 1: Upload ── */}
                {bloodUploadState === "upload" && (
                  <div className="space-y-4 py-2 animate-fade-in text-left">
                    {hasExistingReport && (
                      <div className="w-full rounded-2xl border border-teal/20 bg-teal/5 p-4 shadow-sm space-y-3 mb-2">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-4.5 w-4.5 text-teal shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-xs font-bold text-foreground">Verified Blood Report Found</h4>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              We found a verified blood report uploaded {(() => {
                                const updatedAt = (profile as any)?.updatedAt;
                                if (!updatedAt) return "recently";
                                const days = Math.floor(Math.abs(new Date().getTime() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
                                return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
                              })()}.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            setUseExistingReport(true);
                            setExtractedLabs((prev) => {
                              const copy = { ...prev };
                              existingLabs.forEach((obs: any) => {
                                if (copy[obs.code]) {
                                  copy[obs.code] = {
                                    ...copy[obs.code],
                                    value: obs.value,
                                    checked: true,
                                  };
                                }
                              });
                              return copy;
                            });
                            setBloodUploadState("review");
                          }}
                          className="w-full bg-teal text-white hover:bg-teal/90 text-xs font-semibold h-9 rounded-xl cursor-pointer"
                        >
                          Use Existing Verified Report
                        </Button>
                      </div>
                    )}

                    <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 w-full items-stretch">
                      
                      {/* Left Column: Upload Section */}
                      <div className="flex flex-col justify-start space-y-5">


                        {isCameraActive ? (
                          <div className="space-y-3">
                            <div className="relative overflow-hidden rounded-xl bg-black aspect-video border border-border">
                              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={captureFrame}
                                className="flex-1 h-9 bg-teal text-white hover:bg-teal/90 gap-1.5 font-semibold text-xs rounded-xl cursor-pointer"
                              >
                                <Camera className="h-4 w-4" /> Capture Photo
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={stopCamera}
                                className="h-9 text-xs text-red-500 hover:bg-red-55 cursor-pointer font-semibold rounded-xl"
                              >
                                Close
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* Drag and Drop Zone */}
                            <div className="relative border-2 border-dashed border-border/80 hover:border-teal/50 rounded-2xl p-6 bg-surface-muted/15 hover:bg-teal/[0.01] transition-all flex flex-col items-center justify-center min-h-[160px] cursor-pointer group text-center">
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <div className="h-10 w-10 rounded-full bg-teal/5 border border-teal/10 flex items-center justify-center text-teal group-hover:scale-105 transition-transform mb-3">
                                <Upload className="h-5 w-5" />
                              </div>
                              
                              <Button
                                type="button"
                                size="sm"
                                className="bg-teal text-white hover:bg-teal/90 text-sm font-bold px-5 h-9 rounded-lg pointer-events-none mb-1 shadow-sm"
                              >
                                Browse Files
                              </Button>
                              <p className="text-xs text-muted-foreground font-medium">
                                or drag & drop here
                              </p>
                              
                              <div className="flex gap-1.5 justify-center mt-3">
                                {["PDF", "JPG", "PNG", "WEBP"].map((ext) => (
                                  <span key={ext} className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface border border-border/60 text-muted-foreground font-mono">
                                    ✓ {ext}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={startCamera}
                              className="h-10 border-teal/20 text-teal hover:bg-teal/5 gap-2 cursor-pointer font-semibold rounded-xl w-full text-xs sm:text-sm"
                            >
                              <Camera className="h-4 w-4" />
                              Scan with Camera
                            </Button>

                            <div className="flex items-center gap-2 pt-1 px-1 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                id="external-consent"
                                checked={externalConsent}
                                onChange={(e) => setExternalConsent(e.target.checked)}
                                className="h-4 w-4 rounded border-border text-teal focus:ring-teal cursor-pointer shrink-0"
                              />
                              <label htmlFor="external-consent" className="cursor-pointer select-none text-[11px] leading-tight">
                                I consent to external AI processing of this lab report for biomarker extraction.
                              </label>
                            </div>
                          </div>
                        )}

                        {/* Supported Report Chips */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider font-mono">
                            Supported Reports
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: "CBC", icon: "🩸" },
                              { label: "Lipid Profile", icon: "❤️" },
                              { label: "Diabetes Panel", icon: "🧪" },
                              { label: "Full Body Checkup", icon: "📄" },
                            ].map((item) => (
                              <Badge
                                key={item.label}
                                variant="secondary"
                                className="text-xs px-3 py-1.5 rounded-xl font-semibold text-foreground bg-surface border border-border/60 hover:bg-surface-muted/30 select-none shadow-sm flex items-center gap-1.5"
                              >
                                  <span>{item.icon}</span>
                                  <span>{item.label}</span>
                                </Badge>
                              ))}
                            </div>
                            <p className="text-sm text-muted-foreground/85 leading-relaxed pt-2">
                              💡 <strong>Not sure which report you have?</strong> Don't worry—HealthGuard automatically identifies the report type after you upload it.
                            </p>
                            <p className="text-xs text-muted-foreground/60 italic pt-0.5">
                              Average processing time: 10–15 seconds
                            </p>
                          </div>
                      </div>

                      {/* Right Column: Informational Panel & Flow */}
                      <div className="rounded-2xl border border-border bg-surface-muted/5 p-5 flex flex-col justify-between space-y-4">
                        <div className="space-y-3.5">
                          <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-widest font-mono flex items-center gap-1.5 border-b border-border/60 pb-2.5">
                            💡 Why upload your report?
                          </h3>
                          
                          <div className="grid gap-2.5">
                            {[
                              { title: "Faster assessment", desc: "Instantly extracts lab values in seconds." },
                              { title: "More accurate results", desc: "Eliminates calculation variance." },
                              { title: "Less manual entry", desc: "No tedious typing of decimal numbers." },
                              { title: "AI extracts biomarkers", desc: "Fully automated secure scanning." },
                            ].map((b, i) => (
                              <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl bg-surface border border-border/40 hover:border-teal/30 hover:bg-teal/[0.005] transition-all shadow-sm">
                                <span className="text-teal text-xs mt-0.5">✓</span>
                                <div className="min-w-0">
                                  <h4 className="text-xs sm:text-sm font-bold text-foreground leading-normal">{b.title}</h4>
                                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-normal mt-0.5">{b.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Visual Flow chart */}
                        <div className="bg-surface border border-border/40 rounded-xl p-3 shadow-sm text-center">
                          <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono px-1">
                            <span>Upload</span>
                            <span>→</span>
                            <span className="text-teal">AI Extraction</span>
                            <span>→</span>
                            <span>Review</span>
                            <span>→</span>
                            <span className="text-primary">Analysis</span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Bottom buttons */}
                    <div className="flex items-center justify-between border-t border-border pt-4 mt-2 w-full">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={back}
                        className="gap-2 text-muted-foreground hover:text-foreground h-9 cursor-pointer text-xs sm:text-sm font-semibold"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back to Selector
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setExtractedLabs((prev) => {
                            const copy = { ...prev };
                            Object.keys(copy).forEach((k) => {
                              copy[k] = { ...copy[k], value: 0, checked: false };
                            });
                            return copy;
                          });
                          setBloodUploadState("review");
                        }}
                        className="text-teal hover:bg-teal/5 h-9 cursor-pointer font-bold text-xs sm:text-sm"
                      >
                        Enter values manually
                      </Button>
                    </div>
                  </div>
                )}
                {bloodUploadState === "processing" && (
                  <div className="space-y-6 py-6 text-center max-w-sm mx-auto animate-pulse-slow">
                    <div className="flex justify-center">
                      <div className="h-16 w-16 rounded-2xl bg-teal/15 flex items-center justify-center text-teal animate-spin-slow">
                        <Stethoscope className="h-8 w-8" />
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="font-display text-lg font-bold text-foreground">
                        Reading your blood report...
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Our medical AI is extracting values. Estimated time: 5-10s
                      </p>
                    </div>

                    {/* Checklist progress */}
                    <div className="bg-surface-muted/30 border border-border/40 rounded-2xl p-4 text-left space-y-3.5">
                      {[
                        "Uploading report file...",
                        "Extracting biomarkers with Gemini AI...",
                        "Validating clinical ranges & units...",
                        "Ready for review"
                      ].map((task, idx) => {
                        const active = processingIndex === idx;
                        const completed = processingIndex > idx;
                        return (
                          <div key={task} className="flex items-center gap-3 transition-all duration-300">
                            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                              completed
                                ? "bg-teal text-white"
                                : active
                                  ? "bg-teal/20 text-teal animate-pulse"
                                  : "bg-muted text-muted-foreground/40"
                            }`}>
                              {completed ? <Check className="h-3 w-3" /> : idx + 1}
                            </span>
                            <span className={`text-xs font-semibold transition-colors ${
                              completed
                                ? "text-foreground font-medium"
                                : active
                                  ? "text-teal font-bold"
                                  : "text-muted-foreground/40"
                            }`}>
                              {task}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── View 3: Review Extracted Values ── */}
                {bloodUploadState === "review" && (
                  <div className="space-y-6 py-2">
                    {Object.values(extractedLabs).filter((obs) => obs.value > 0).length === 0 ? (
                      <div className="text-center max-w-md mx-auto space-y-4 rounded-2xl border border-amber-400/30 bg-amber-50/20 dark:bg-amber-950/20 p-6">
                        <div className="mx-auto h-12 w-12 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-500">
                          <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-display text-base font-bold text-foreground">Extraction unavailable. Allow manual entry.</h3>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            No biomarkers could be automatically extracted from this file. You can retry uploading or enter values manually.
                          </p>
                        </div>
                        <div className="flex gap-2 justify-center pt-2">
                          <Button
                            type="button"
                            onClick={() => setBloodUploadState("upload")}
                            className="bg-teal text-white hover:bg-teal/90 text-xs font-semibold h-9 rounded-xl cursor-pointer px-4"
                          >
                            Retry Upload
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center max-w-md mx-auto space-y-2">
                        <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">
                          We found {Object.values(extractedLabs).filter((obs) => obs.value > 0).length} biomarkers
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Review and verify the extracted health metrics below.
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setBloodUploadState("upload")}
                          className="text-xs text-teal hover:bg-teal/5 font-semibold h-8 rounded-lg cursor-pointer"
                        >
                          🔄 Upload Different Report / Retry
                        </Button>
                      </div>
                    )}

                    <div className="max-w-2xl mx-auto space-y-3">
                      {/* Detected biomarkers */}
                      {Object.entries(extractedLabs).map(([code, info]) => {
                        const rule = bounds[code];
                        const hasValue = info.value > 0;
                        
                        if (!hasValue && editingCode !== code) return null;

                        const stat = getBiomarkerStatus(code, info.value, form.watch("gender"));

                        return (
                          <div
                            key={code}
                            className="rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all duration-200"
                          >
                            <div className="flex justify-between items-center gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-foreground truncate">{rule.name}</span>
                                  {hasValue && (
                                    <Badge variant="outline" className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold select-none ${stat.badgeClass}`}>
                                      {stat.label}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                  Optimal: {stat.rangeText}
                                </p>
                              </div>

                              <div className="flex items-center gap-3">
                                {editingCode !== code ? (
                                  <>
                                    <div className="text-right">
                                      <span className="font-display font-extrabold text-lg text-foreground font-mono">{info.value}</span>
                                      <span className="text-[10px] font-semibold text-muted-foreground ml-1 font-mono">{rule.unit}</span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingCode(code)}
                                      className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="relative max-w-[120px]">
                                      <Input
                                        type="number"
                                        step={code === "HbA1c" ? "0.1" : "1"}
                                        value={info.value || ""}
                                        onChange={(e) => handleExtractedValChange(code, e.target.value)}
                                        className="h-8 text-xs border-border bg-surface pr-10 focus:border-teal focus:ring-teal font-bold font-mono"
                                        placeholder="Value"
                                        autoFocus
                                      />
                                      <span className="absolute right-2 top-2 text-[9px] text-muted-foreground font-mono">
                                        {rule.unit}
                                      </span>
                                    </div>
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        if (info.value <= 0) {
                                          setExtractedLabs((prev) => ({
                                            ...prev,
                                            [code]: { ...prev[code], value: 0, checked: false }
                                          }));
                                        }
                                        setEditingCode(null);
                                      }}
                                      className="h-8 px-2.5 text-xs bg-teal text-white hover:bg-teal/90 rounded-lg cursor-pointer font-bold"
                                    >
                                      Done
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {editingCode === code && info.error && (
                              <p className="text-[10px] font-medium text-red-500 mt-2 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                {info.error}
                              </p>
                            )}
                          </div>
                        );
                      })}

                      {/* Add manually actions */}
                      {Object.entries(extractedLabs).filter(([code, info]) => info.value === 0 && editingCode !== code).length > 0 && (
                        <div className="bg-surface-muted/20 border border-border/40 rounded-2xl p-4 space-y-2 mt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                            Biomarkers not detected
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {Object.entries(extractedLabs).map(([code, info]) => {
                              if (info.value > 0 || editingCode === code) return null;
                              const rule = bounds[code];
                              return (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => {
                                    setExtractedLabs((prev) => ({
                                      ...prev,
                                      [code]: { ...prev[code], value: rule.name === "HbA1c" ? 5.5 : 90, checked: true }
                                    }));
                                    setEditingCode(code);
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-teal/40 bg-surface hover:bg-teal/[0.01] text-[10px] font-semibold text-foreground transition-all cursor-pointer shadow-sm"
                                >
                                  <Plus className="h-3 w-3 text-teal" />
                                  Add {rule.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-4 mt-6">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setBloodUploadState("upload")}
                        className="gap-2 text-muted-foreground hover:text-foreground h-9 cursor-pointer"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back to Upload
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          saveLabObservations();
                          setBloodUploadState("success");
                        }}
                        disabled={Object.values(extractedLabs).some((l) => l.value > 0 && !!l.error)}
                        className="bg-teal text-white hover:bg-teal/90 gap-2 h-9 cursor-pointer font-semibold rounded-xl px-5"
                      >
                        Looks Good <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── View 4: Success & Choices ── */}
                {bloodUploadState === "success" && (
                  <div className="space-y-6 py-2 max-w-xl mx-auto">
                    <div className="text-center space-y-2">
                      <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                        <Check className="h-6 w-6" strokeWidth={2.5} />
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">
                        Blood Report Imported
                      </h2>
                      <p className="text-xs text-muted-foreground leading-normal">
                        {Object.values(extractedLabs).filter((obs) => obs.value > 0).length} biomarkers extracted successfully. Ready for analysis.
                      </p>
                    </div>

                    {/* Medical Disclaimer Card */}
                    <div className="rounded-2xl border border-amber-400/40 bg-[#fffdf6] dark:bg-[#18150d] p-4 flex gap-3 shadow-sm select-none">
                      <div className="shrink-0 mt-0.5">
                        <div className="h-7 w-7 rounded-lg bg-amber-400/15 flex items-center justify-center">
                          <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={2} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1 font-mono">
                          ⚕ Medical Disclaimer
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          HealthGuard provides educational health insights and is not a substitute for professional medical advice, diagnosis, or treatment.
                        </p>
                      </div>
                    </div>

                    {/* Selection Next paths */}
                    <div className="grid gap-4 pt-2">
                      <div className="relative group rounded-2xl border border-teal/25 bg-teal/[0.01] hover:bg-teal/[0.03] p-4.5 transition-all duration-300">
                        <div className="absolute -top-2.5 right-4 bg-teal text-white text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm">
                          ⭐ Recommended
                        </div>
                        <div className="space-y-1 text-left">
                          <h4 className="text-xs font-bold text-foreground">Continue with Lifestyle Assessment</h4>
                          <p className="text-[10px] text-muted-foreground leading-normal">
                            Provide demographic and lifestyle context (diet, sleep, symptoms) to build a combined health risk index.
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            setFlowMode("combined");
                            setStep(2);
                          }}
                          className="mt-3.5 w-full bg-teal text-white hover:bg-teal/90 text-xs font-bold h-10 rounded-xl cursor-pointer"
                        >
                          Continue Assessment
                        </Button>
                      </div>

                      <div className="rounded-2xl border border-border bg-surface-muted/20 p-4.5 hover:bg-surface-muted/30 transition-all">
                        <div className="space-y-1 text-left">
                          <h4 className="text-xs font-semibold text-foreground">Analyze Blood Report Only</h4>
                          <p className="text-[10px] text-muted-foreground leading-normal">
                            Skip lifestyle questions and generate index estimations immediately using only your blood lab metrics.
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            form.handleSubmit(submit, onInvalid)();
                          }}
                          variant="outline"
                          className="mt-3.5 w-full text-xs font-bold h-10 rounded-xl cursor-pointer"
                        >
                          Analyze Report Only
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setBloodUploadState("review")}
                        className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-8 px-3 rounded-lg cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Review
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pre-submission Review Card rendered at the final step */}
            {step === total && flowMode !== "blood" && (
              <div className="rounded-xl border border-border/70 bg-surface-muted/30 p-5 shadow-sm mt-4">
                <div className="flex items-center gap-2 mb-3 border-b border-border/60 pb-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/10 text-teal">
                    <Check className="h-3 w-3" />
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {tr("profileSummaryTitle", lang)}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tr("profileSummarySubtitle", lang)}
                    </p>
                  </div>
                </div>
                
                <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                      {tr("ageGenderLabel", lang)}
                    </span>
                    <span className="font-medium text-foreground">
                      {form.watch("age")} {tr("yrs", lang)} /{" "}
                      <span className="capitalize">{tr(form.watch("gender"), lang)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                      {tr("heightWeightLabel", lang)}
                    </span>
                    <span className="font-medium text-foreground">
                      {form.watch("heightCm")} {tr("cm", lang)} / {form.watch("weightKg")}{" "}
                      {tr("kg", lang)}
                    </span>
                  </div>
                  
                  {flowMode !== null && (
                    <>
                      <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                        <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                          {tr("smokingStatusLabel", lang)}
                        </span>
                        <span className="font-medium text-foreground capitalize">
                          {tr(form.watch("smoking"), lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                        <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                          {tr("exerciseFrequencyLabel", lang)}
                        </span>
                        <span className="font-medium text-foreground capitalize">
                          {tr(form.watch("exercise"), lang)}
                        </span>
                      </div>
                      
                      <div className="sm:col-span-2 flex flex-col gap-1 border-b border-border/40 pb-1.5">
                        <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                          {tr("familyHistory", lang)}
                        </span>
                        <span className="text-xs italic text-foreground/90 bg-surface-muted/50 p-2 rounded border border-border/30">
                          {form.watch("familyHistory") || tr("noHistoryReported", lang)}
                        </span>
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-1 border-b border-border/40 pb-1.5">
                        <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                          {tr("symptoms", lang)}
                        </span>
                        <span className="text-xs italic text-foreground/90 bg-surface-muted/50 p-2 rounded border border-border/30">
                          {form.watch("symptoms") || tr("noSymptomsReported", lang)}
                        </span>
                      </div>
                    </>
                  )}
                  
                  {flowMode !== "questionnaire" && form.watch("labObservations") && (form.watch("labObservations")?.length ?? 0) > 0 && (
                    <div className="sm:col-span-2 flex flex-col gap-1 pb-1">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Verified Lab Observations
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        {form.watch("labObservations")?.map((obs: any) => {
                          const name = bounds[obs.code]?.name || obs.code;
                          return (
                            <div key={obs.code} className="flex justify-between items-center text-xs bg-surface-muted/50 p-2 rounded border border-border/30">
                              <span className="font-medium text-foreground">{name}</span>
                              <span className="font-bold text-teal font-mono">{obs.value} {obs.unit}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Evidence Quality & Confidence Summary */}
                <div className="mt-4">
                  <EvidenceSummaryCard
                    summary={calculateEvidenceSummary(
                      form.getValues(),
                      form.watch("labObservations"),
                      (form.watch("labObservations") || []).map((o: any) => o.code)
                    )}
                  />
                </div>
              </div>
            )}

            {currentStepType !== "blood" && (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-border bg-accent/40 p-3 mt-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  <p className="text-[11px] leading-relaxed text-accent-foreground">
                    {tr("assessmentDisclaimer", lang)}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4 mt-6">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={back}
                    disabled={loading}
                    className="gap-2 text-muted-foreground hover:text-foreground h-9 cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" /> {tr("back", lang)}
                  </Button>
                  <div className="flex items-center gap-2">
                    {flowMode === "combined" && currentStepType === "diet" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          form.setValue("bloodReportOnly", false);
                          form.handleSubmit(submit, onInvalid)();
                        }}
                        disabled={loading}
                        className="gap-2 border-teal/40 text-teal hover:bg-teal/5 font-semibold h-9 cursor-pointer"
                      >
                        Skip & Generate Plan <Sparkles className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={next}
                      disabled={loading}
                      className="gap-2 bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow transition-all font-semibold h-9 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> {tr("analyzing", lang)}
                        </>
                      ) : step === total ? (
                        <>
                          <Sparkles className="h-4 w-4" /> {tr("generatePlan", lang)}
                        </>
                      ) : (
                        <>
                          {tr("continueWord", lang)} <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  helperText,
  tooltip,
  error,
  children,
}: {
  label: string;
  helperText?: string;
  tooltip?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-semibold">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-help focus:outline-none"
                >
                  <HelpCircle className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs leading-normal bg-primary text-primary-foreground border-none">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
      {error && <p className="text-[10px] font-semibold text-red-500 leading-normal">{error}</p>}
      {helperText && !error && (
        <p className="text-[10px] text-muted-foreground leading-normal">{helperText}</p>
      )}
    </div>
  );
}
