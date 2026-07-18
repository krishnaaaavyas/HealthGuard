import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState, useRef } from "react";
import { useHealthResult, useProfile, useHistory } from "@/lib/health-store";
import { useLanguage, tr } from "@/lib/i18n";
import { auth, db, isConfigured } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowRight,
  Brain,
  Download,
  TrendingDown,
  Info,
  Stethoscope,
  RefreshCw,
  Loader2,
  Activity,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { startMeasure, endMeasure } from "@/lib/timing";
import { EmptyState, LedgerTable, RiskLedgerTable } from "./_app.dashboard";

export const Route = createLazyFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function AnimatedScore({ score }: { score: number }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = score;
    if (start === end) {
      setCurrent(end);
      return;
    }
    const totalDuration = 800; // ms
    const incrementTime = Math.max(Math.floor(totalDuration / end), 12);
    const timer = setInterval(() => {
      start += 1;
      setCurrent(start);
      if (start >= end) clearInterval(timer);
    }, incrementTime);
    return () => clearInterval(timer);
  }, [score]);
  return <>{current}</>;
}

const CHART_AMBER = "oklch(0.74 0.15 70)";
const CHART_RED = "oklch(0.58 0.21 25)";
const CHART_GREEN = "oklch(0.62 0.13 155)";

function colorFor(score: number) {
  if (score < 33) return CHART_GREEN;
  if (score < 66) return CHART_AMBER;
  return CHART_RED;
}

function Dashboard() {
  const currentLang = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Risk Dashboard — HealthGuard";
  }, []);

  const [result, setResult] = useHealthResult();
  const [profile, setProfile] = useProfile();
  const [, setHistory] = useHistory();

  const {
    loading: authLoading,
    syncing: authSyncing,
    hasCompletedAssessment,
    setHasCompletedAssessment,
  } = useAuth();

  // Action Impact Engine State
  interface ActionImpact {
    id: string;
    title: string;
    category: string;
    icon: string;
    currentRisk: number;
    projectedRisk: number;
    absoluteReduction: number;
    relativeReduction: number;
    conditionImpact: { diabetes: number; heart: number; hypertension: number };
  }
  const [actionImpacts, setActionImpacts] = useState<ActionImpact[]>([]);

  // Coach nudge states
  interface CoachNudge {
    signalType: string;
    insight: string;
    message: string;
    nextAction: string;
    encouragement: string;
  }
  const [coachNudge, setCoachNudge] = useState<CoachNudge | null>(null);
  const [nudgeRefreshing, setNudgeRefreshing] = useState(false);

  // Risk Drivers State
  interface RiskDriver {
    factor: string;
    contribution: number;
    modifiable: boolean;
  }
  const [riskDrivers, setRiskDrivers] = useState<RiskDriver[]>([]);

  // Expert Review Status State
  const [expertReviewStatus, setExpertReviewStatus] = useState<string | null>(null);

  // User Assessment status state
  const [userStatus, setUserStatus] = useState<{
    hasCompletedAssessment: boolean;
    assessmentCompletedAt: string | null;
    lastAssessmentUpdate: string | null;
  } | null>(null);

  // Bootstrap fetching state
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const hasValidHealthResult =
    Boolean(result) && typeof result?.overallRisk === "string" && Boolean(profile);

  // Consolidated Bootstrap Fetch on Mount/Retry
  useEffect(() => {
    let active = true;
    const initiatingUid = auth.currentUser?.uid;
    const checkState = () => {
      return active && auth.currentUser && auth.currentUser.uid === initiatingUid;
    };

    setBootstrapLoading(true);
    setBootstrapError(null);

    // If it takes more than 2.5s, display Render container cold start wakeup warning
    const wakingTimer = setTimeout(() => {
      if (checkState()) setIsWaking(true);
    }, 2500);

    const loadDashboard = async () => {
      try {
        startMeasure("Dashboard Bootstrap");
        const data = await apiClient.get<any>("/api/dashboard/bootstrap", {
          timeoutMs: 35000, // Render cold start timeout
        });
        endMeasure("Dashboard Bootstrap");

        clearTimeout(wakingTimer);
        if (!checkState()) return;

        setIsWaking(false);
        setBootstrapLoading(false);

        if (data.profile) setProfile(data.profile);
        if (data.result) setResult(data.result);
        if (data.history) setHistory(data.history);

        if (data.userStatus) setUserStatus(data.userStatus);
        if (data.riskDrivers) setRiskDrivers(data.riskDrivers);
        if (data.actionImpacts) setActionImpacts(data.actionImpacts);
        if (data.coachNudge) setCoachNudge(data.coachNudge);
        if (data.expertReview && data.expertReview.requests.length > 0) {
          setExpertReviewStatus(data.expertReview.requests[0].status);
        }
      } catch (err: any) {
        clearTimeout(wakingTimer);
        if (!checkState()) return;
        setIsWaking(false);
        setBootstrapLoading(false);
        console.error("Failed to bootstrap dashboard:", err);

        let msg = "Failed to load dashboard parameters.";
        if (err instanceof ApiError) {
          if (err.type === "cold_start") {
            msg = "The health service is starting. Your dashboard will load shortly.";
          } else if (err.type === "timeout") {
            msg = "Dashboard request timed out. Retrying may help.";
          } else if (err.type === "network") {
            msg = "Network connection failed. Please check your internet connectivity.";
          }
        }
        setBootstrapError(msg);
      }
    };

    loadDashboard();

    return () => {
      active = false;
    };
  }, [retryKey, setProfile, setResult, setHistory]);

  // Handle manual retry triggers
  const handleRetry = () => {
    setRetryKey((prev) => prev + 1);
  };

  // Generate fresh AI Coach Nudge (decapsulated from bootstrap)
  const refreshCoachNudge = async () => {
    const initiatingUid = auth.currentUser?.uid;
    setNudgeRefreshing(true);
    try {
      startMeasure("AI Coach Nudge Refresh");
      const data = await apiClient.get<any>("/api/coach/behavior", {
        timeoutMs: 25000, // Gemini timeout limit
      });
      endMeasure("AI Coach Nudge Refresh");

      if (auth.currentUser && auth.currentUser.uid === initiatingUid) {
        if (data.success && data.nudge) {
          setCoachNudge(data.nudge);
          toast.success("Coach recommendations refreshed successfully.");
        }
      }
    } catch (err) {
      console.error("Failed to generate fresh nudge:", err);
      toast.error("Unable to generate fresh AI advice at this time.");
    } finally {
      setNudgeRefreshing(false);
    }
  };

  // Dynamically load PDF download libraries
  async function download() {
    if (!result || !profile) return;
    const toastId = toast.loading("Preparing health report PDF download...");
    try {
      // Dynamic imports to code-split PDF libraries from the main bundle
      const { default: jsPDF } = await import("jspdf");

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      const pageW = doc.internal.pageSize.getWidth();
      const cw = pageW - margin * 2;
      let y = margin;

      // Header band
      doc.setFillColor(11, 30, 63);
      doc.rect(0, 0, pageW, 88, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Personalized Preventive-Health Assessment", margin, 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Lifestyle Screening Index Report", margin, 58);
      doc.setFontSize(9);
      doc.text(new Date().toLocaleString(), pageW - margin, 58, { align: "right" });
      y = 120;
      doc.setTextColor(20);

      const ensureSpace = (heightNeeded: number) => {
        if (y + heightNeeded > 770) {
          doc.addPage();
          y = margin + 20;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(140);
          doc.text("HealthGuard Printable Report (cont.)", margin, margin - 15);
          doc.setDrawColor(230);
          doc.line(margin, margin - 10, pageW - margin, margin - 10);
        }
      };

      const title = (t: string) => {
        ensureSpace(45);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(11, 30, 63);
        doc.text(t.toUpperCase(), margin, y);
        y += 6;
        doc.setDrawColor(220);
        doc.line(margin, y, pageW - margin, y);
        y += 14;
        doc.setTextColor(40);
      };

      const para = (t: string, size = 10) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(t, cw);
        lines.forEach((l: string) => {
          ensureSpace(size + 6);
          doc.text(l, margin, y);
          y += size + 4;
        });
      };

      // Profile
      title("Your Profile Parameters");
      [
        `Age: ${profile.age}    Gender: ${profile.gender}`,
        `Height: ${profile.heightCm} cm    Weight: ${profile.weightKg} kg    BMI: ${result.bmi.toFixed(1)}`,
        `Smoking: ${profile.smoking}    Exercise: ${profile.exercise}`,
        `Family history: ${profile.familyHistory || "none reported"}`,
        `Reported symptoms: ${profile.symptoms || "none reported"}`,
      ].forEach((l) => para(l));
      y += 10;

      // Overall risk
      title("Overall Screening Index");
      ensureSpace(60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      const color =
        result.overallRisk === "Low"
          ? [34, 139, 87]
          : result.overallRisk === "Moderate"
            ? [200, 130, 30]
            : [200, 60, 40];
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`${result.overallScore}/80`, margin, y);
      y += 26;
      doc.setFontSize(11);
      const tier = result.overallRisk === "High" ? "Elevated" : result.overallRisk;
      doc.text(`Screening Tier: ${tier}`, margin, y);
      y += 22;
      doc.setTextColor(20);

      // Per-condition
      title("Per-Condition Screening Index");
      (
        [
          ["Diabetes screening index", result.risk.diabetes, result.rationale.diabetes],
          ["Heart Disease screening index", result.risk.heartDisease, result.rationale.heartDisease],
          ["Hypertension screening index", result.risk.hypertension, result.rationale.hypertension],
        ] as const
      ).forEach(([name, score, why]) => {
        ensureSpace(40);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${name}: ${score}/100`, margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        para(why);
        y += 8;
      });

      // Plans
      const sections: Array<[string, string]> = [
        ["Diet plan", result.dietPlan || ""],
        ["Exercise plan", result.exercisePlan || ""],
        ["Prevention recommendations", result.preventionTips || ""],
      ];
      sections.forEach(([t, body]) => {
        y += 6;
        title(t);
        para((body || "").replace(/[#*_`>]/g, ""));
      });

      ensureSpace(40);
      y += 12;
      const disc = doc.splitTextToSize(
        "HealthGuard provides educational health screening indices based on self-reported parameters. It does not diagnose, treat, cure, or prevent any clinical condition. Projections are mathematical trends and do not guarantee biological outcomes. Users must consult qualified healthcare professionals for medical advice and clinical testing.",
        cw,
      );
      doc.text(disc, margin, y);

      doc.save(`healthguard-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Health report PDF downloaded successfully.", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF document.", { id: toastId });
    }
  }

  // Render Skeleton while auth is parsing or local profile is empty
  const isSyncingFirstTime =
    (bootstrapLoading || authLoading || authSyncing) && !hasValidHealthResult;
  if (isSyncingFirstTime) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-10 space-y-6 animate-pulse">
        <div className="h-10 bg-muted/40 w-1/4 rounded-lg" />
        <div className="h-4 bg-muted/30 w-1/3 rounded-lg" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-32 bg-muted/40 rounded-2xl md:col-span-2" />
          <div className="h-32 bg-muted/40 rounded-2xl" />
        </div>
        {isWaking && (
          <div className="p-4 bg-teal/10 border border-teal/20 text-teal text-xs font-semibold rounded-xl flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>The health service is starting. Your dashboard will load shortly.</span>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-80 bg-muted/40 rounded-2xl" />
          <div className="h-80 bg-muted/40 rounded-2xl" />
          <div className="h-80 bg-muted/40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!hasValidHealthResult) return <EmptyState />;

  const lastUpdateDateStr = userStatus?.lastAssessmentUpdate || result?.updatedAt || null;

  let profileAgeDays = 0;
  if (lastUpdateDateStr) {
    const lastUpdate = new Date(lastUpdateDateStr);
    const diffTime = Math.abs(new Date().getTime() - lastUpdate.getTime());
    profileAgeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  const hasScannedFood = !!localStorage.getItem("hg.hasScannedFood");

  let nextStepTitle = "";
  let nextStepDesc = "";
  let nextStepLink = "";
  let nextStepButton = "";

  if (!hasCompletedAssessment) {
    nextStepTitle = "Complete Assessment";
    nextStepDesc =
      "Fill in your demographic and physiological parameters to generate your profile.";
    nextStepLink = "/assessment";
    nextStepButton = "Start Assessment";
  } else if (!hasScannedFood) {
    nextStepTitle = "Scan your first food item";
    nextStepDesc =
      "Use our AI scanner to assess packaged ingredient safety against your health risks.";
    nextStepLink = "/scanner";
    nextStepButton = "Open Scanner";
  } else {
    nextStepTitle = "Check your Action Plan updates";
    nextStepDesc = "Your AI Coach has updated suggestions to lower your specific risk metrics.";
    nextStepLink = "/action-plan";
    nextStepButton = "Open Action Plan";
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const overall = result.overallScore;
  const overallPct = Math.min(100, (overall / 80) * 100);
  const overallColor =
    result.overallRisk === "Low"
      ? CHART_GREEN
      : result.overallRisk === "Moderate"
        ? CHART_AMBER
        : CHART_RED;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-10 space-y-6">
      {/* Wake-up & Error Diagnostic Banners */}
      {isWaking && (
        <div className="p-4 bg-teal/10 border border-teal/20 text-teal text-xs font-semibold rounded-xl flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>The health service is starting. Your dashboard will load shortly.</span>
        </div>
      )}

      {bootstrapError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold rounded-xl flex items-center justify-between gap-4">
          <span>{bootstrapError}</span>
          <Button
            size="sm"
            variant="outline"
            className="border-red-500/30 hover:bg-red-500/10 text-red-500 font-bold"
            onClick={handleRetry}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* Dashboard Header Banner */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary" className="rounded-full">
            {tr("clinicalEngine", currentLang)}
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {tr("riskDashboard", currentLang)}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Generated for a {profile.age}-year-old {profile.gender}, BMI {result.bmi.toFixed(1)}.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            asChild
            variant="outline"
            className="border-teal/30 hover:bg-teal/5 text-teal hover:text-teal font-semibold"
          >
            <Link to="/simulator">Action Impact Explorer</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/assessment">Re-run Assessment</Link>
          </Button>
          <Button
            onClick={download}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            <Download className="h-4 w-4" /> Download Report
          </Button>
        </div>
      </div>

      {/* Dynamic Journey Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left 2 cols: Progress & Recommended Next Step */}
        <div className="md:col-span-2 p-6 rounded-2xl bg-gradient-to-r from-teal/10 via-primary/5 to-surface border border-teal/10 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              {tr("overview", currentLang)}
            </h2>
            <div className="flex flex-col gap-2.5 mt-3 text-xs">
              <div className="flex items-center gap-2 text-teal font-medium">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/20 text-teal text-[10px] font-bold">
                  ✓
                </span>
                <span>{tr("assessmentComplete", currentLang)}</span>
              </div>
              <div className="flex items-center gap-2 text-teal font-medium">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/20 text-teal text-[10px] font-bold">
                  ✓
                </span>
                <span>{tr("riskProfileGenerated", currentLang)}</span>
              </div>
              <div className="mt-2 p-3.5 rounded-xl border border-border bg-surface-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">
                    {tr("nextRecommendedStep", currentLang)}
                  </span>
                  <h4 className="font-bold text-foreground text-sm">{nextStepTitle}</h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">{nextStepDesc}</p>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="bg-teal text-white hover:bg-teal/90 shrink-0 text-xs font-bold rounded-lg h-9"
                >
                  <Link to={nextStepLink}>{nextStepButton}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 col: Profile Age & Assessment Date */}
        <Card className="border-border bg-surface shadow-card-soft h-full flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {tr("assessmentValidity", currentLang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4 flex-1 flex flex-col justify-center text-center space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">{tr("profileAge", currentLang)}</p>
              <h3 className="font-display text-3xl font-black text-foreground mt-1">
                {profileAgeDays === 0
                  ? tr("today", currentLang)
                  : `${profileAgeDays} ${profileAgeDays === 1 ? tr("day", currentLang) : tr("days", currentLang)} ${tr("old", currentLang)}`}
              </h3>
            </div>
            <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-2.5 mt-2">
              {tr("completedColon", currentLang)} {formatDate(lastUpdateDateStr)}
            </div>
          </CardContent>
          <CardFooter className="pt-0 pb-4 justify-center bg-surface-muted/10 border-t border-border/30 rounded-b-xl py-3">
            <Button
              asChild
              variant="ghost"
              className="text-xs font-bold text-teal hover:bg-teal/5 h-8"
            >
              <Link to="/assessment">{tr("updateAssessment", currentLang)}</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Main Layout Area */}
      <div className="space-y-6">
        {/* Health Coach Check-In Card */}
        <Card className="border-border bg-surface shadow-card-soft overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal via-primary to-accent" />
          <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-teal/15 text-teal flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="h-5 w-5 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-bold text-foreground">
                    {tr("healthCoachCheckIn", currentLang)}
                  </h3>
                  <button
                    onClick={refreshCoachNudge}
                    disabled={nudgeRefreshing}
                    className="p-1 rounded text-muted-foreground hover:text-teal hover:bg-teal/10 transition-colors disabled:opacity-50"
                    title="Generate fresh AI nudge"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${nudgeRefreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {nudgeRefreshing ? (
                  <div className="space-y-2 mt-2">
                    <div className="h-4 w-3/4 bg-muted/40 animate-pulse rounded-lg" />
                    <div className="h-4 w-1/2 bg-muted/40 animate-pulse rounded-lg" />
                  </div>
                ) : (
                  <div className="space-y-1.5 mt-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      {tr("currentFocus", currentLang)}{" "}
                      <span className="font-normal text-muted-foreground">
                        {coachNudge?.insight || "Reduce sedentary lifestyle."}
                      </span>
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {tr("nextAction", currentLang)}{" "}
                      <span className="font-normal text-muted-foreground">
                        {coachNudge?.nextAction || "Take a 15-minute walk tomorrow morning."}
                      </span>
                    </p>
                    {coachNudge?.message && (
                      <p className="text-xs text-muted-foreground italic leading-normal border-t border-border/30 pt-1.5 mt-1.5">
                        Coach Advice: {coachNudge.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button
              asChild
              className="bg-teal text-white hover:bg-teal/90 font-bold text-xs h-9 cursor-pointer self-stretch md:self-auto rounded-lg shrink-0"
            >
              <Link to="/action-plan">{tr("goToActionPlan", currentLang)}</Link>
            </Button>
          </CardContent>
        </Card>

        {/* 3-Column Layout: Overall Risk, Primary Drivers, Highest Impact Actions */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Health Score */}
          <Card className="border-border bg-surface shadow-card-soft">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                  <span>{tr("overallRisk", currentLang)}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/60 hover:text-foreground cursor-pointer"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] p-2 bg-popover text-popover-foreground text-xs rounded border border-border shadow-md">
                        {tr("calculatedUsingModels", currentLang)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span
                    className="font-display text-6xl font-bold tracking-tight"
                    style={{ color: overallColor }}
                  >
                    <AnimatedScore score={result.overallScore} />
                  </span>
                  <span className="text-xl text-muted-foreground font-semibold">/ 80</span>
                </div>
                <div
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border"
                  style={{
                    color: overallColor,
                    borderColor: `${overallColor}30`,
                    backgroundColor: `${overallColor}08`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: overallColor }}
                  />
                  {tr("riskLevel", currentLang)}:{" "}
                  {tr(
                    result.overallRisk === "Low"
                      ? "low"
                      : result.overallRisk === "Moderate"
                        ? "moderateRisk"
                        : "high",
                    currentLang,
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-border/40 pt-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  {tr("conditionRisksBreakdown", currentLang)}
                </div>
                {[
                  { name: "Diabetes", value: result.risk.diabetes },
                  { name: "Heart Disease", value: result.risk.heartDisease },
                  { name: "Hypertension", value: result.risk.hypertension },
                ].map((r) => {
                  const c = colorFor(r.value);
                  return (
                     <div key={r.name} className="space-y-1">
                       <div className="flex justify-between text-xs font-semibold">
                         <span className="text-muted-foreground">
                           {r.name === "Diabetes"
                             ? tr("diabetes", currentLang)
                             : r.name === "Heart Disease"
                               ? tr("heartDisease", currentLang)
                               : tr("hypertension", currentLang)}
                         </span>
                         <span style={{ color: c }}>{r.value}/100</span>
                       </div>
                       <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                         <div
                           className="h-full rounded-full transition-all duration-500"
                           style={{ width: `${r.value}%`, backgroundColor: c }}
                         />
                       </div>
                     </div>
                  );
                })}
                <div className="mt-4 pt-3 border-t border-border/20 text-[10px] text-muted-foreground leading-normal">
                  HealthGuard screening indices are educational numbers generated by custom lifestyle scoring logic and do not represent diagnostic, calibrated disease probabilities or universal medical risk. The Overall Screening Index is a sum summarizing the three lifestyle screening domains (max 80). Consult a physician for clinical testing.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Primary Risk Drivers */}
          <Card className="border-border bg-surface shadow-card-soft">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base text-foreground font-semibold">
                <Brain className="h-4 w-4 text-teal animate-pulse-slow" />{" "}
                {tr("lifestyleImpact", currentLang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-1 flex flex-col justify-between h-[calc(100%-60px)]">
              {riskDrivers.length > 0 ? (
                <div className="flex flex-col justify-between h-full space-y-4">
                  {/* Top Drivers List */}
                  <div className="space-y-3">
                    {riskDrivers.slice(0, 3).map((driver, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center text-xs font-semibold"
                      >
                        <span className="text-foreground flex items-center gap-2">
                          <span className="text-teal font-bold">{index + 1}.</span>
                          <span>{driver.factor}</span>
                        </span>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {driver.contribution}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted-foreground">
                  <Brain className="h-8 w-8 text-teal/40 mb-2" />
                  <span>{tr("noRiskDrivers", currentLang)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Highest Impact Actions */}
          <Card className="relative border-border bg-surface shadow-card-soft overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal to-primary opacity-60" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base text-foreground font-semibold">
                <TrendingDown className="h-4 w-4 text-teal" />{" "}
                {tr("actionPrioritiesTitle", currentLang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {actionImpacts.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {actionImpacts.map((action, idx) => {
                    const rankColors = ["text-amber-500", "text-slate-400", "text-orange-700"];
                    const badgeColors = [
                      "bg-teal/10 text-teal border-teal/20",
                      "bg-blue-500/10 text-blue-400 border-blue-500/20",
                      "bg-purple-500/10 text-purple-400 border-purple-500/20",
                    ];
                    return (
                      <div
                        key={action.id}
                        className="flex flex-col rounded-lg border border-border bg-surface-muted/50 p-2.5 hover:bg-accent/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Rank */}
                          <div className={`text-base font-bold w-5 shrink-0 ${rankColors[idx]}`}>
                            {idx + 1}
                          </div>
                          {/* Icon + Title */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{action.icon}</span>
                              <p className="text-xs font-semibold text-foreground truncate">
                                {action.title}
                              </p>
                            </div>
                            {/* Risk arrow */}
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground font-mono">
                              <span
                                className="font-semibold"
                                style={{ color: colorFor(action.currentRisk) }}
                              >
                                {action.currentRisk}%
                              </span>
                              <span>→</span>
                              <span className="font-semibold text-teal">
                                {action.projectedRisk}%
                              </span>
                            </div>
                          </div>
                          {/* Reduction badge */}
                          <div
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeColors[idx]}`}
                          >
                            -{action.absoluteReduction} {tr("estimatedReduction", currentLang)}
                          </div>
                        </div>

                        {/* Explainability Nudge */}
                        <div className="mt-2 text-[10px] text-muted-foreground border-t border-border/30 pt-1.5">
                          <span className="font-bold text-teal">
                            {tr("whyQuestion", currentLang)}
                          </span>{" "}
                          {action.id === "exercise_30_min"
                            ? tr("whyExercise", currentLang)
                            : action.id === "lose_5kg"
                              ? tr("whyLoseWeight", currentLang)
                              : action.id === "improve_sleep"
                                ? tr("whySleep", currentLang)
                                : tr("whyLifestyle", currentLang)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {result.actionPriorities && result.actionPriorities.length > 0 ? (
                    result.actionPriorities.slice(0, 3).map((p, i) => (
                      <div
                        key={i}
                        className="flex flex-col rounded-lg border border-border bg-surface-muted/65 p-2.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground">{p.action}</p>
                            <p className="text-[10px] text-teal mt-0.5">
                              ↓ {Math.abs(p.estimatedImpact)}{" "}
                              {tr("estimatedReduction", currentLang)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 text-[10px] text-muted-foreground border-t border-border/30 pt-1.5">
                          <span className="font-bold text-teal">
                            {tr("whyQuestion", currentLang)}
                          </span>{" "}
                          {tr("whyDefault", currentLang)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-teal/20 bg-teal/5 p-3">
                      <Brain className="h-4 w-4 text-teal shrink-0" />
                      <p className="text-xs text-teal font-medium">
                        {tr("wellOptimised", currentLang)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expert Review Card (Phase 9) */}
        <Card className="border-border bg-surface shadow-card-soft mt-6">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-teal/15 text-teal flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">
                  {tr("expertClinicalReview", currentLang)}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {expertReviewStatus === "pending" && tr("expertReviewStatusPending", currentLang)}
                  {expertReviewStatus === "accepted" &&
                    tr("expertReviewStatusAccepted", currentLang)}
                  {expertReviewStatus === "completed" &&
                    tr("expertReviewStatusCompleted", currentLang)}
                  {!expertReviewStatus && tr("expertReviewStatusNone", currentLang)}
                </p>
              </div>
            </div>
            <Button
              asChild
              className="bg-teal text-white hover:bg-teal/95 font-bold text-xs h-9 rounded-lg shrink-0 w-full sm:w-auto shadow-sm"
            >
              <Link to="/expert-review">
                {expertReviewStatus
                  ? tr("checkStatus", currentLang)
                  : tr("requestReview", currentLang)}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
