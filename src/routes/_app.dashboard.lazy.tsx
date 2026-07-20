import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useHealthResult, useProfile, useHistory } from "@/lib/health-store";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { jsPDF } from "jspdf";
import {
  ArrowRight,
  Brain,
  Download,
  Loader2,
  Activity,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Scale,
  Clock,
  Lock,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Flame,
  Heart,
  Droplets,
  Dumbbell,
  CalendarCheck,
  Shield,
  Sparkles,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { startMeasure, endMeasure } from "@/lib/timing";
import { calculateCalorieAndMacros } from "@/lib/personalization-engine";
import { ShapeGrid } from "@/components/ui/shape-grid";

export const Route = createLazyFileRoute("/_app/dashboard")({
  component: Dashboard,
});

// ─── Color helpers ────────────────────────────────────────────────────────
const C_GREEN = "#10b981";
const C_AMBER = "#f59e0b";
const C_RED   = "#ef4444";

function riskColor(score: number) {
  if (score < 33) return C_GREEN;
  if (score < 66) return C_AMBER;
  return C_RED;
}
function riskLabel(score: number) {
  if (score < 33) return "Low";
  if (score < 66) return "Moderate";
  return "High";
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ─── Circular score arc (SVG) ─────────────────────────────────────────────
function ScoreArc({ score, size = 88 }: { score: number; size?: number }) {
  const color = riskColor(score);
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={9} />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </svg>
  );
}

// ─── Mini horizontal progress bar ────────────────────────────────────────
function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Tip icon resolver ────────────────────────────────────────────────────
function tipIcon(rec: string) {
  const l = rec.toLowerCase();
  if (l.includes("water") || l.includes("drink"))   return <Droplets className="h-3.5 w-3.5" />;
  if (l.includes("walk") || l.includes("min"))       return <Activity className="h-3.5 w-3.5" />;
  if (l.includes("workout") || l.includes("cardio")) return <Dumbbell className="h-3.5 w-3.5" />;
  if (l.includes("sleep"))                           return <Flame className="h-3.5 w-3.5" />;
  if (l.includes("heart") || l.includes("sodium"))   return <Heart className="h-3.5 w-3.5" />;
  return <Sparkles className="h-3.5 w-3.5" />;
}

// ─────────────────────────────────────────────────────────────────────────
function Dashboard() {
  const navigate = useNavigate();
  useEffect(() => { document.title = "Dashboard — HealthGuard"; }, []);

  const [result, setResult]   = useHealthResult();
  const [profile, setProfile] = useProfile();
  const [history, setHistory] = useHistory();
  const { loading: authLoading } = useAuth();

  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError]     = useState<string | null>(null);
  const [isWaking, setIsWaking]                 = useState(false);
  const [retryKey, setRetryKey]                 = useState(0);

  const hasData = Boolean(result) && typeof result?.overallRisk === "string" && Boolean(profile);

  useEffect(() => {
    let active = true;
    const uid = auth.currentUser?.uid;
    const ok  = () => active && auth.currentUser?.uid === uid;
    setBootstrapLoading(true); setBootstrapError(null);
    const wt = setTimeout(() => { if (ok()) setIsWaking(true); }, 2500);
    (async () => {
      try {
        startMeasure("Dashboard Bootstrap");
        const data = await apiClient.get<any>("/api/dashboard/bootstrap", { timeoutMs: 35000 });
        endMeasure("Dashboard Bootstrap");
        clearTimeout(wt);
        if (!ok()) return;
        setIsWaking(false); setBootstrapLoading(false);
        if (data.profile) setProfile(data.profile);
        if (data.result)  setResult(data.result);
        if (data.history) setHistory(data.history);
      } catch (err: any) {
        clearTimeout(wt);
        if (!ok()) return;
        setIsWaking(false); setBootstrapLoading(false);
        let msg = "Failed to load dashboard. Please try again.";
        if (err instanceof ApiError) {
          if (err.type === "cold_start") msg = "Health service is starting up…";
          else if (err.type === "timeout") msg = "Request timed out. Try refreshing.";
        }
        setBootstrapError(msg);
      }
    })();
    return () => { active = false; clearTimeout(wt); };
  }, [retryKey, auth.currentUser?.uid]);

  async function download() {
    if (!result || !profile) return;
    const tid = toast.loading("Generating PDF…");
    try {
      const doc = new jsPDF("p", "pt", "a4");
      const W = doc.internal.pageSize.getWidth(), m = 40;
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 200, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(24);
      doc.text("HealthGuard", m, 80);
      doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(20, 184, 166);
      doc.text("AI Preventive Health Report", m, 105);
      doc.setTextColor(148, 163, 184); doc.setFontSize(8);
      doc.text(`Generated ${new Date().toDateString()}`, m, 170);
      doc.setFillColor(248, 250, 252); doc.rect(m, 230, W - m * 2, 90, "F");
      doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(`Name: ${auth.currentUser?.displayName || "User"}`, m + 15, 260);
      doc.text(`BMI: ${result.bmi.toFixed(1)}  |  Diabetes: ${result.risk.diabetes}/100  |  Heart: ${result.risk.heartDisease}/100`, m + 15, 280);
      doc.save(`healthguard-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF downloaded.", { id: tid });
    } catch { toast.error("Failed to generate PDF.", { id: tid }); }
  }

  function getCoachTips(): string[] {
    if (!result) return [];
    const { diabetes, heartDisease, hypertension } = result.risk;
    const hi = Math.max(diabetes, heartDisease, hypertension);
    if (hi === diabetes    && hi > 40) return ["Reduce refined sugars & processed carbs", "30-min walk after your largest meal", "7–8 hours of quality sleep"];
    if (hi === heartDisease && hi > 40) return ["30 min of moderate cardio daily", "Include heart-healthy fats (nuts, olive oil)", "Monitor resting heart rate weekly"];
    if (hi === hypertension && hi > 40) return ["Drink 2.5–3L of water throughout the day", "Reduce high-sodium processed foods", "10 min of deep breathing daily"];
    return ["Drink 2.5L of water daily", "30 min of physical activity", "Ensure 7–8 hours of quality sleep"];
  }

  // ── Loading skeleton ──────────────────────────────────────────────
  if ((bootstrapLoading || authLoading) && !hasData) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-4 animate-pulse">
        <div className="h-24 bg-muted/40 rounded-2xl" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-20 bg-muted/40 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-7 gap-3">
          <div className="col-span-2 h-40 bg-muted/40 rounded-xl" />
          <div className="col-span-3 h-40 bg-muted/40 rounded-xl" />
          <div className="col-span-2 h-40 bg-muted/40 rounded-xl" />
        </div>
      </div>
    );
  }

  // ── STATE 1: New user ─────────────────────────────────────────────
  if (!result || !profile) {
    const firstName = auth.currentUser?.displayName?.split(" ")[0] ?? "there";
    return (
      <div className="relative w-full min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center overflow-hidden bg-background">
        {/* Full-page ShapeGrid background */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <ShapeGrid
            direction="diagonal"
            speed={0.5}
            squareSize={40}
            borderColor="#2F293A"
            hoverFillColor="#222"
            hoverTrailAmount={0}
            className="w-full h-full"
          />
        </div>
        {bootstrapError && (
          <div className="absolute top-4 left-4 right-4 max-w-lg mx-auto p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold rounded-xl flex items-center justify-between gap-3">
            <span>{bootstrapError}</span>
            <Button size="sm" variant="outline" className="border-red-400/30 text-red-400 h-7 text-xs" onClick={() => setRetryKey(k => k + 1)}>Retry</Button>
          </div>
        )}
        <div className="w-full max-w-xl mx-auto px-5 py-10 space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-teal/25 bg-teal/5 text-teal text-[11px] font-bold uppercase tracking-widest mb-1">
              <Shield className="h-3 w-3" /> HealthGuard AI
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
              👋 Welcome, {firstName}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base font-medium">Let's build your first Health Profile.</p>
          </div>

          <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="px-6 pt-6 pb-4 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Complete one assessment to unlock</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {[["🩺","Disease Risk Prediction"],["🥗","AI Diet Plan"],["🏋️","AI Workout Plan"],["🩸","Blood Report Analysis"],["📊","Health Dashboard"],["📈","Progress Tracking"]].map(([icon,label]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center gap-3">
              <Button onClick={() => navigate({ to: "/assessment" })} size="lg"
                className="w-full sm:w-auto px-7 h-11 text-sm font-black bg-primary text-primary-foreground hover:bg-primary/95 hover:-translate-y-0.5 transition-all rounded-2xl shadow-lg shadow-primary/25 flex items-center gap-1.5">
                Start Assessment <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-[11px] font-semibold text-slate-400">Takes ~5 minutes. Free.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">How it works</p>
              <ol className="space-y-2">
                {["Answer health & lifestyle questions","Upload blood report (optional)","AI analyses your physiological data","Get personalised insights & plans"].map((s,i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                    <span className="shrink-0 h-4.5 w-4.5 rounded-full border border-teal/35 bg-teal/5 text-teal text-[10px] font-black flex items-center justify-center mt-0.5">{i+1}</span>
                    <span className="font-medium leading-snug">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Privacy first</p>
              <ul className="space-y-2">
                {[["🔒","All health data encrypted end-to-end"],["🩸","Blood report remains strictly private"],["🛡️","You own and control your data"]].map(([icon,text]) => (
                  <li key={text} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                    <span className="font-medium leading-snug">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STATE 2 & 3: Has assessment data ──────────────────────────────
  const firstName   = auth.currentUser?.displayName?.split(" ")[0] ?? "there";
  const scoreScaled = Math.round((result.overallScore / 80) * 100);
  const scoreColor  = riskColor(result.overallScore);
  const scoreLabel  = riskLabel(result.overallScore);

  const lastUpdatedStr = (result as any)?.updatedAt ?? new Date().toISOString();
  const diffDays       = Math.floor((Date.now() - new Date(lastUpdatedStr).getTime()) / 86_400_000);
  const daysUntilNext  = Math.max(0, 30 - diffDays);
  const isToday        = diffDays < 1;
  const isReturning    = Array.isArray(history) && history.length > 1;

  let prevScoreScaled = 0, scoreDiff = 0;
  if (isReturning) {
    prevScoreScaled = Math.round((history[history.length - 2].overallScore / 80) * 100);
    scoreDiff       = scoreScaled - prevScoreScaled;
  }

  const coachTips   = getCoachTips();
  const dietTargets = calculateCalorieAndMacros(profile);
  const hasBlood    = (profile.labObservations?.length ?? 0) > 0;

  const timeline = Array.isArray(history) && history.length > 0 ? history.slice(-3) : [{ date: lastUpdatedStr, overallScore: result.overallScore }];
  const placeholders = Math.max(0, 3 - timeline.length);

  return (
    <div className="relative w-full max-w-5xl mx-auto px-4 py-4 space-y-3 min-h-[calc(100vh-5rem)]">
      {/* ── Full-page ShapeGrid background ─────────────────── */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <ShapeGrid
          direction="diagonal"
          speed={0.5}
          squareSize={40}
          borderColor="#2F293A"
          hoverFillColor="#222"
          hoverTrailAmount={0}
          className="w-full h-full"
        />
      </div>

      {/* ── System banners ──────────────────────────────── */}
      {isWaking && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-teal/8 border border-teal/20 text-teal text-xs font-bold rounded-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          Health service is waking up. Your data will appear shortly…
        </div>
      )}
      {bootstrapError && (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-red-500/8 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl">
          <span>{bootstrapError}</span>
          <Button size="sm" variant="outline" className="border-red-400/30 text-red-400 h-7 text-xs shrink-0" onClick={() => setRetryKey(k => k + 1)}>Retry</Button>
        </div>
      )}

      {/* ── ROW 1: HERO ─────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-sm px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: greeting + buttons */}
          <div className="min-w-0 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-teal">
              {isReturning ? `Welcome back, ${firstName}` : `${getGreeting()}, ${firstName} 👋`}
            </p>
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-foreground leading-tight">
              {isReturning ? "Great to see you staying on track." : "Your Health Summary is Ready."}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {isReturning && (
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-2">
                  <Clock className="h-3 w-3 text-teal" />
                  Next check in <strong className="text-teal ml-0.5">{daysUntilNext}d</strong>
                </span>
              )}
              <Button asChild className="h-8 px-4 text-[11px] font-black bg-primary text-primary-foreground hover:bg-primary/95 rounded-xl shadow-sm flex items-center gap-1">
                <Link to="/report">Full Report <ChevronRight className="h-3.5 w-3.5" /></Link>
              </Button>
              <Button onClick={download} variant="outline" className="h-8 px-3.5 text-[11px] font-bold rounded-xl border-border flex items-center gap-1 hover:bg-muted/50">
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button asChild variant="ghost" className="h-8 px-3.5 text-[11px] font-bold rounded-xl text-slate-500 hover:text-foreground hover:bg-muted/50">
                <Link to="/assessment" search={{ mode: "retake" }}>Reassess</Link>
              </Button>
            </div>
          </div>

          {/* Right: score arc */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative w-[88px] h-[88px]">
              <ScoreArc score={scoreScaled} size={88} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-xl font-black leading-none" style={{ color: scoreColor }}>{scoreScaled}</span>
                <span className="text-[9px] font-bold text-slate-400">/100</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Health Score</p>
              <Badge className="font-bold text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}30` }}>
                {scoreLabel} Risk
              </Badge>
              {isReturning && (
                <div className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color: scoreDiff >= 0 ? C_GREEN : C_RED }}>
                  {scoreDiff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {scoreDiff >= 0 ? "+" : ""}{scoreDiff} pts
                </div>
              )}
              <p className="text-[9px] text-slate-400 font-semibold">{isToday ? "Updated today" : `${diffDays}d ago`}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: QUICK STATS 4-column ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Diabetes Risk",  value: result.risk.diabetes,    display: `${result.risk.diabetes}/100`,  color: riskColor(result.risk.diabetes),    status: riskLabel(result.risk.diabetes) },
          { label: "Heart Risk",     value: result.risk.heartDisease, display: `${result.risk.heartDisease}/100`, color: riskColor(result.risk.heartDisease), status: riskLabel(result.risk.heartDisease) },
          { label: "BMI",            value: Math.min(100,((result.bmi-10)/30)*100), display: result.bmi.toFixed(1), color: result.bmi>=18.5&&result.bmi<25?C_GREEN:C_AMBER, status: result.bmi<18.5?"Underweight":result.bmi<25?"Normal":"Overweight" },
          { label: "Blood Report",   value: hasBlood?100:0, display: hasBlood?"Linked":"Missing", color: hasBlood?C_GREEN:C_AMBER, status: hasBlood?`${profile.labObservations?.length} markers`:"Upload to unlock",
            cta: !hasBlood ? (() => navigate({ to: "/assessment", search: { step: 5 } })) : undefined },
        ].map((s, i) => (
          <Card key={i} className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-3.5 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">{s.label}</span>
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white leading-none">{s.display}</div>
            <MiniBar value={s.value} color={s.color} />
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.status}</span>
              {s.cta && (
                <button onClick={s.cta} className="text-[9px] font-bold text-amber-500 flex items-center gap-0.5 hover:underline shrink-0">
                  <Upload className="h-2.5 w-2.5" /> Upload
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* ── ROW 3: AI COACH | ACTIVE PLANS | PROGRESS ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
        {/* AI Coach — 2 cols */}
        <Card className="sm:col-span-2 rounded-xl border border-teal/15 bg-gradient-to-br from-teal/[0.04] to-card/80 backdrop-blur-sm p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-lg bg-teal/10 border border-teal/20 flex items-center justify-center text-teal shrink-0">
              <Brain className="h-3 w-3" />
            </div>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-foreground">AI Coach</h2>
          </div>
          <div className="space-y-2.5">
            {coachTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-md bg-teal/8 text-teal flex items-center justify-center shrink-0 mt-0.5">{tipIcon(tip)}</div>
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-snug">{tip}</p>
              </div>
            ))}
          </div>
          <Link to="/action-plan" className="text-[10px] font-bold text-teal flex items-center gap-0.5 hover:underline pt-0.5">
            See full plan <ChevronRight className="h-3 w-3" />
          </Link>
        </Card>

        {/* Active Plans — 3 cols */}
        <Card className="sm:col-span-3 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-foreground">Active Plans</h2>
            <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5">
              <CalendarCheck className="h-3 w-3 text-teal" /> Personalised
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Diet */}
            <div className="p-3 rounded-xl border border-border/70 bg-slate-50/60 dark:bg-slate-900/30 space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">🥗 Daily Diet</p>
              <p className="text-base font-extrabold text-foreground leading-tight">{Math.round(dietTargets.calories)} kcal</p>
              <p className="text-[10px] text-slate-500">{(profile as any).fitnessGoal ?? "Stay Healthy"}</p>
              <Link to="/action-plan" className="text-[10px] font-bold text-teal flex items-center gap-0.5 hover:underline">
                Open <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
            {/* Workout */}
            <div className="p-3 rounded-xl border border-border/70 bg-slate-50/60 dark:bg-slate-900/30 space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">🏋️ Workout</p>
              <p className="text-base font-extrabold text-foreground leading-tight">
                {(profile as any).workoutDaysPerWeek ? `${(profile as any).workoutDaysPerWeek} days/wk` : "4 days/wk"}
              </p>
              <p className="text-[10px] text-slate-500">{(profile as any).exerciseLocation ?? "Home / Gym"}</p>
              <Link to="/action-plan" className="text-[10px] font-bold text-teal flex items-center gap-0.5 hover:underline">
                Open <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
          </div>
          {/* Goals row */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[
              { label: "7-Day Diet",  done: true },
              { label: "Workout",     done: true },
              { label: "Blood Report",done: hasBlood },
              { label: "Monthly Review", done: isReturning },
            ].map(({ label, done }) => (
              <span key={label} className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${done ? "bg-teal/8 border-teal/20 text-teal" : "bg-muted/30 border-border text-slate-400"}`}>
                {done ? "✓" : "○"} {label}
              </span>
            ))}
          </div>
        </Card>

        {/* Progress — 2 cols */}
        <Card className="sm:col-span-2 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-teal" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-foreground">Progress</h2>
          </div>
          {/* Score comparison */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border/60 p-2.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Previous</p>
              <p className="text-xl font-black text-slate-600 dark:text-slate-300 mt-0.5">{isReturning ? prevScoreScaled : "—"}</p>
            </div>
            <div className="bg-teal/[0.04] rounded-xl border border-teal/15 p-2.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-teal">Current</p>
              <p className="text-xl font-black mt-0.5" style={{ color: scoreColor }}>{scoreScaled}</p>
              {isReturning && (
                <p className="text-[10px] font-bold flex items-center justify-center gap-0.5" style={{ color: scoreDiff >= 0 ? C_GREEN : C_RED }}>
                  {scoreDiff >= 0 ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}{Math.abs(scoreDiff)}
                </p>
              )}
            </div>
          </div>
          {/* Weight + Next */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border/60 p-2.5 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Weight</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{profile.weightKg ? `${profile.weightKg}kg` : "—"}</p>
              <p className="text-[9px] text-slate-400 flex items-center justify-center gap-0.5 mt-0.5"><Scale className="h-2.5 w-2.5" /> Stable</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border/60 p-2.5 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Next Check</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{daysUntilNext}d</p>
              <p className="text-[9px] text-slate-400 flex items-center justify-center gap-0.5 mt-0.5"><Clock className="h-2.5 w-2.5" /> In 1 mo</p>
            </div>
          </div>
          {/* Timeline */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">History</p>
            <div className="flex items-center">
              {timeline.map((entry: any, i: number) => {
                const s = Math.round((entry.overallScore / 80) * 100);
                const c = riskColor(entry.overallScore);
                const d = new Date(entry.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 relative">
                    {i < timeline.length - 1 && <div className="absolute left-[50%] right-[-50%] top-3.5 h-px bg-border/70 z-0" />}
                    <div className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black z-10 shadow-sm"
                      style={{ borderColor: c, backgroundColor: `${c}15`, color: c }}>{s}</div>
                    <span className="text-[9px] font-semibold text-slate-400">{d}</span>
                  </div>
                );
              })}
              {Array.from({ length: placeholders }).map((_, idx) => {
                const d = new Date(); d.setMonth(d.getMonth() + idx + 1);
                return (
                  <div key={`p-${idx}`} className="flex-1 flex flex-col items-center gap-1 relative">
                    {idx + timeline.length < 2 && <div className="absolute left-[50%] right-[-50%] top-3.5 h-px bg-border/25 z-0" />}
                    <div className="h-7 w-7 rounded-full border border-dashed border-slate-200 dark:border-slate-700 bg-muted/10 flex items-center justify-center z-10">
                      <Lock className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600" />
                    </div>
                    <span className="text-[9px] font-semibold text-slate-300 dark:text-slate-600">{d.toLocaleDateString(undefined,{month:"short"})}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* ── ROW 4: RECENT ACTIVITY + DISCLAIMER ─────────── */}
      <div className="grid sm:grid-cols-5 gap-3">
        {/* Recent Activity — 3 cols */}
        <Card className="sm:col-span-3 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 shadow-sm">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-foreground mb-3">Recent Activity</h2>
          <div className="space-y-2.5">
            {[
              { label: "Completed Health Assessment",    date: new Date(lastUpdatedStr).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}), done: true },
              { label: hasBlood ? "Blood Report Uploaded & Verified" : "Blood Report Pending", date: hasBlood ? new Date(lastUpdatedStr).toLocaleDateString(undefined,{day:"numeric",month:"short"}) : "Pending", done: hasBlood },
              { label: "AI Diet & Workout Plan Generated", date: new Date(lastUpdatedStr).toLocaleDateString(undefined,{day:"numeric",month:"short"}), done: true },
            ].map(({ label, date, done }, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 ${done ? "border-teal/35 bg-teal/8" : "border-amber-400/30 bg-amber-400/5"}`}>
                    {done ? <CheckCircle2 className="h-2.5 w-2.5 text-teal" /> : <Clock className="h-2.5 w-2.5 text-amber-500" />}
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{label}</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 shrink-0">{date}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Medical Disclaimer — 2 cols */}
        <div className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-50/40 dark:bg-amber-950/8 backdrop-blur-sm p-4">
          <div className="h-7 w-7 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1.5">⚕ Medical Disclaimer</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              HealthGuard provides <strong className="text-foreground">educational</strong> risk assessments and is{" "}
              <strong className="text-foreground">not</strong> a substitute for professional medical advice. Always consult a{" "}
              <strong className="text-foreground">licensed physician</strong> for clinical decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
