import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  useHealthResult,
  useProfile,
} from "@/lib/health-store";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Brain,
  Download,
  TrendingDown,
} from "lucide-react";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_app/dashboard")({
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
  useEffect(() => {
    document.title = "Risk Dashboard — HealthGuard";
  }, []);

  const [result, setResult] = useHealthResult();
  const [profile, setProfile] = useProfile();

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
  const [impactsLoading, setImpactsLoading] = useState(false);

  // Coach nudge states
  interface CoachNudge {
    signalType: string;
    insight: string;
    message: string;
    nextAction: string;
    encouragement: string;
  }
  const [coachNudge, setCoachNudge] = useState<CoachNudge | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);

  // Risk Drivers State
  interface RiskDriver {
    factor: string;
    contribution: number;
    modifiable: boolean;
  }
  const [riskDrivers, setRiskDrivers] = useState<RiskDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);

  // Fetch action impacts once result is available
  useEffect(() => {
    if (!result) return;
    const fetchImpacts = async () => {
      setImpactsLoading(true);
      try {
        let idToken = "mock-uid-guest";
        if (auth.currentUser) idToken = await auth.currentUser.getIdToken();
        const resp = await fetch(`${API_URL}/api/actions/impact`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.success) setActionImpacts(data.data.recommendedActions.slice(0, 3));
        }
      } catch (err) {
        console.error("Failed to fetch action impacts:", err);
      } finally {
        setImpactsLoading(false);
      }
    };
    fetchImpacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Fetch risk drivers once result is available
  useEffect(() => {
    if (!result) return;
    const fetchDrivers = async () => {
      setDriversLoading(true);
      try {
        let idToken = "mock-uid-guest";
        if (auth.currentUser) idToken = await auth.currentUser.getIdToken();
        const resp = await fetch(`${API_URL}/api/risk/drivers`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.success) {
            setRiskDrivers(data.data.topDrivers);
          }
        }
      } catch (err) {
        console.error("Failed to fetch risk drivers:", err);
      } finally {
        setDriversLoading(false);
      }
    };
    fetchDrivers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Fetch AI coach nudge once result is available
  useEffect(() => {
    if (!result) return;
    const fetchNudge = async () => {
      setNudgeLoading(true);
      try {
        let idToken = "mock-uid-guest";
        if (auth.currentUser) idToken = await auth.currentUser.getIdToken();
        const resp = await fetch(`${API_URL}/api/coach/behavior`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.success && data.nudge) {
            setCoachNudge(data.nudge);
          }
        }
      } catch (err) {
        console.error("Failed to fetch coach nudge:", err);
      } finally {
        setNudgeLoading(false);
      }
    };
    fetchNudge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (!result || !profile) return <EmptyState />;

  function download() {
    if (!result || !profile) return;
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
    doc.text("HealthGuard Printable Report", margin, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("AI-assisted preventive health assessment", margin, 58);
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

    // Section title helper
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
    title("Overall risk score");
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
    doc.text(`${result.overallRisk} risk`, margin, y);
    y += 22;
    doc.setTextColor(20);

    // Per-condition
    title("Per-condition risk");
    (
      [
        ["Diabetes (Type 2)", result.risk.diabetes, result.rationale.diabetes],
        ["Heart Disease", result.risk.heartDisease, result.rationale.heartDisease],
        ["Hypertension", result.risk.hypertension, result.rationale.hypertension],
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
      ["Diet plan", result.dietPlan],
      ["Exercise plan", result.exercisePlan],
      ["Prevention recommendations", result.preventionTips],
    ];
    sections.forEach(([t, body]) => {
      y += 6;
      title(t);
      para(body.replace(/[#*_`>]/g, ""));
    });

    ensureSpace(40);
    y += 12;
    doc.setFontSize(8);
    doc.setTextColor(120);
    const disc = doc.splitTextToSize(
      "Disclaimer: This report contains AI-generated estimates produced for educational and preventive purposes. It is not a clinical diagnosis and does not replace consultation with a qualified medical professional.",
      cw,
    );
    doc.text(disc, margin, y);

    doc.save(`healthguard-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const overall = result.overallScore;
  const overallPct = Math.min(100, (overall / 80) * 100);
  const overallColor =
    result.overallRisk === "Low"
      ? CHART_GREEN
      : result.overallRisk === "Moderate"
        ? CHART_AMBER
        : CHART_RED;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-10">
      {/* Dashboard Header Banner */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary" className="rounded-full">
            Clinical Assessment Portal
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Your Health Summary
          </h1>
          <p className="mt-2 text-muted-foreground">
            Generated for a {profile.age}-year-old {profile.gender}, BMI {result.bmi.toFixed(1)}.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button asChild variant="outline">
            <Link to="/assessment">Re-run Assessment</Link>
          </Button>
          <Button onClick={download} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
            <Download className="h-4 w-4" /> Download Report
          </Button>
        </div>
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
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-foreground">
                  Health Coach Check-In
                </h3>
                {nudgeLoading ? (
                  <div className="h-4 w-32 bg-muted/40 animate-pulse rounded-lg mt-1" />
                ) : (
                  <div className="space-y-1.5 mt-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      Current focus: <span className="font-normal text-muted-foreground">{coachNudge?.insight || "Reduce sedentary lifestyle."}</span>
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      Next action: <span className="font-normal text-muted-foreground">{coachNudge?.nextAction || "Take a 15-minute walk tomorrow morning."}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
            <Button
              asChild
              className="bg-teal text-white hover:bg-teal/90 font-bold text-xs h-9 cursor-pointer self-stretch md:self-auto rounded-lg shrink-0"
            >
              <Link to="/action-plan">Go to Action Plan</Link>
            </Button>
          </CardContent>
        </Card>

        {/* 3-Column Layout: Overall Risk, Primary Drivers, Highest Impact Actions */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Health Score */}
          <Card className="border-border bg-surface shadow-card-soft">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                  Overall Risk
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span
                    className="font-display text-6xl font-bold tracking-tight"
                    style={{ color: overallColor }}
                  >
                    <AnimatedScore score={Math.round(overallPct)} />%
                  </span>
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
                  {result.overallRisk} Risk
                </div>
              </div>
              
              <div className="mt-6 border-t border-border/40 pt-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Condition Risks Breakdown
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
                        <span className="text-muted-foreground">{r.name}</span>
                        <span style={{ color: c }}>{r.value}%</span>
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
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Primary Risk Drivers */}
          <Card className="border-border bg-surface shadow-card-soft">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base text-foreground font-semibold">
                <Brain className="h-4 w-4 text-teal animate-pulse-slow" /> Primary Risk Drivers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-1 flex flex-col justify-between h-[calc(100%-60px)]">
              {driversLoading ? (
                <div className="flex flex-col gap-3.5 py-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-5 bg-muted/40 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : riskDrivers.length > 0 ? (
                <div className="flex flex-col justify-between h-full space-y-4">
                  {/* Top Drivers List */}
                  <div className="space-y-3">
                    {riskDrivers.slice(0, 3).map((driver, index) => (
                      <div key={index} className="flex justify-between items-center text-xs font-semibold">
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
                  <span>No active risk drivers identified. Your health profile looks excellent!</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Highest Impact Actions */}
          <Card className="relative border-border bg-surface shadow-card-soft overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal to-primary opacity-60" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base text-foreground font-semibold">
                <TrendingDown className="h-4 w-4 text-teal" /> Highest Impact Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {impactsLoading ? (
                <div className="flex flex-col gap-2.5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : actionImpacts.length > 0 ? (
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
                        className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/50 p-2.5 hover:bg-accent/20 transition-colors"
                      >
                        {/* Rank */}
                        <div className={`text-base font-bold w-5 shrink-0 ${rankColors[idx]}`}>
                          {idx + 1}
                        </div>
                        {/* Icon + Title */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{action.icon}</span>
                            <p className="text-xs font-semibold text-foreground truncate">{action.title}</p>
                          </div>
                          {/* Risk arrow */}
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground font-mono">
                            <span className="font-semibold" style={{ color: colorFor(action.currentRisk) }}>{action.currentRisk}%</span>
                            <span>→</span>
                            <span className="font-semibold text-teal">{action.projectedRisk}%</span>
                          </div>
                        </div>
                        {/* Reduction badge */}
                        <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeColors[idx]}`}>
                          -{action.absoluteReduction} pts
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {result.actionPriorities && result.actionPriorities.length > 0 ? (
                    result.actionPriorities.slice(0, 3).map((p, i) => (
                      <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-muted/65 p-2.5">
                        <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{p.action}</p>
                          <p className="text-[10px] text-teal mt-0.5">↓ {Math.abs(p.estimatedImpact)} pts estimated</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-teal/20 bg-teal/5 p-3">
                      <Brain className="h-4 w-4 text-teal shrink-0" />
                      <p className="text-xs text-teal font-medium">Your profile is well-optimised. Keep up the healthy habits!</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center flex flex-col items-center justify-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-teal shadow-card-soft">
        <ArrowRight className="h-7 w-7 text-teal" />
      </div>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-foreground">
        Welcome to HealthGuard AI Portal
      </h1>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
        Complete your health assessment to unlock your personalized dashboard.
      </p>

      <Button
        onClick={() => navigate({ to: "/assessment" })}
        className="mt-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all font-semibold px-6 py-2 h-11"
      >
        <span>Start Assessment</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function LedgerTable({
  items,
}: {
  items: Array<{
    parameter: string;
    value: string;
    reference: string;
    status?: string;
    statusColor?: string;
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Parameter Description</th>
            <th className="px-4 py-3 text-right font-semibold">Result Value</th>
            <th className="px-4 py-3 font-semibold">Reference Interval</th>
            <th className="px-4 py-3 text-right font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 bg-surface">
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-accent/5 transition-colors">
              <td className="px-4 py-3 font-semibold text-foreground">{item.parameter}</td>
              <td className="px-4 py-3 text-right font-bold text-teal font-mono">{item.value}</td>
              <td className="px-4 py-3 text-muted-foreground">{item.reference}</td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                    item.statusColor || "bg-accent text-accent-foreground border border-border/50"
                  }`}
                >
                  <span className="h-1 w-1 rounded-full bg-current" />
                  {item.status || "Recorded"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RiskLedgerTable({
  items,
}: {
  items: Array<{
    condition: string;
    score: number;
    classification: string;
    color: string;
    rationale: string;
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Analyzed Condition</th>
            <th className="px-4 py-3 text-right font-semibold">Risk Index</th>
            <th className="px-4 py-3 font-semibold">Risk Level</th>
            <th className="px-4 py-3 font-semibold">Statistical Rationale Preview</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 bg-surface">
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-accent/5 transition-colors">
              <td className="px-4 py-3 font-semibold text-foreground">{item.condition}</td>
              <td
                className="px-4 py-3 text-right font-bold font-mono"
                style={{ color: item.color }}
              >
                {item.score}/100
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    color: item.color,
                    backgroundColor: `${item.color}08`,
                    border: `1px solid ${item.color}20`,
                  }}
                >
                  <span className="h-1 w-1 rounded-full bg-current" />
                  {item.classification}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground max-w-sm truncate">
                {item.rationale}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
