import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useHealthResult, useProfile } from "@/lib/health-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Sparkles, TrendingDown, Activity } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useLanguage, tr } from "@/lib/i18n";

export const Route = createFileRoute("/_app/simulator")({
  component: ActionImpactExplorerPage,
});

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const CHART_AMBER = "oklch(0.74 0.15 70)";
const CHART_RED = "oklch(0.58 0.21 25)";
const CHART_GREEN = "oklch(0.62 0.13 155)";

function colorFor(score: number) {
  if (score < 33) return CHART_GREEN;
  if (score < 66) return CHART_AMBER;
  return CHART_RED;
}

function ActionImpactExplorerPage() {
  const currentLang = useLanguage();
  const navigate = useNavigate();
  const [profile] = useProfile();
  const [result] = useHealthResult();

  interface ActionImpact {
    id: string;
    title: string;
    category: string;
    icon: string;
    currentRisk: number;
    projectedRisk: number;
    absoluteReduction: number;
    relativeReduction: number;
  }

  const [actionImpacts, setActionImpacts] = useState<ActionImpact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = tr("actionImpactExplorer", currentLang) + " — " + tr("appName", currentLang);
  }, [currentLang]);

  useEffect(() => {
    if (!result || !profile) return;
    const fetchImpacts = async () => {
      setLoading(true);
      try {
        let idToken = "mock-uid-guest";
        if (auth.currentUser) idToken = await auth.currentUser.getIdToken();
        const resp = await fetch(`${API_URL}/api/actions/impact`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.success) {
            setActionImpacts(data.data.recommendedActions.slice(0, 3));
          }
        }
      } catch (err) {
        console.error("Failed to fetch action impacts:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchImpacts();
  }, [result, profile]);

  if (!profile || !result) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center flex flex-col items-center justify-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-teal shadow-card-soft">
          <Activity className="h-7 w-7" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-foreground">
          {tr("assessmentRequired", currentLang)}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
          {tr("fit_please_complete", currentLang)}
        </p>
        <Button
          onClick={() => navigate({ to: "/assessment" })}
          className="mt-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-semibold px-6 py-2 h-11"
        >
          <span>{tr("startAssessment", currentLang)}</span>
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
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
    <div className="mx-auto max-w-4xl px-6 py-10 lg:py-14 space-y-8">
      {/* Header */}
      <div>
        <Badge
          variant="secondary"
          className="rounded-full bg-teal/10 text-teal border border-teal/20"
        >
          {tr("simulationEngine", currentLang)}
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {tr("actionImpactExplorer", currentLang)}
        </h1>
        <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
          {tr("fit_explore_action_impact", currentLang)}
        </p>
      </div>

      {/* Main Content: Current Risk & Improvements */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Current Risk Card */}
        <Card className="border-border bg-surface shadow-card-soft h-full flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              {tr("currentOverallRisk", currentLang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-6 flex-1 flex flex-col justify-center">
            <div className="flex items-baseline gap-2 justify-center">
              <span
                className="font-display text-6xl font-black tracking-tight"
                style={{ color: overallColor }}
              >
                {result.overallScore}
              </span>
              <span className="text-xl text-muted-foreground font-semibold">/ 80</span>
            </div>
            <div className="text-center mt-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border"
                style={{
                  color: overallColor,
                  borderColor: `${overallColor}30`,
                  backgroundColor: `${overallColor}08`,
                }}
              >
                {tr("riskLevel", currentLang)}:{" "}
                {tr(
                  result.overallRisk.toLowerCase() === "low"
                    ? "low"
                    : result.overallRisk.toLowerCase() === "moderate"
                      ? "moderateRisk"
                      : "high",
                  currentLang,
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Top Improvements List */}
        <Card className="border-border bg-surface shadow-card-soft md:col-span-2 relative overflow-hidden h-full flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal via-primary to-accent" />
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal animate-pulse" />{" "}
              {tr("topLifestyleImprovements", currentLang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 flex-1">
            {loading ? (
              <div className="flex flex-col gap-3 justify-center items-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-teal" />
                <span className="text-xs text-muted-foreground">
                  {tr("calculatingBenefits", currentLang)}
                </span>
              </div>
            ) : actionImpacts.length > 0 ? (
              <div className="flex flex-col gap-3">
                {actionImpacts.map((action, idx) => {
                  const badgeColors = [
                    "bg-teal/10 text-teal border-teal/20",
                    "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    "bg-purple-500/10 text-purple-400 border-purple-500/20",
                  ];
                  return (
                    <div
                      key={action.id}
                      className="flex items-center gap-4 rounded-xl border border-border bg-surface-muted/30 p-3.5 hover:bg-accent/10 transition-colors"
                    >
                      {/* Icon */}
                      <span className="text-2xl shrink-0">{action.icon}</span>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{action.title}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground font-mono">
                          <span
                            className="font-bold"
                            style={{ color: colorFor(action.currentRisk) }}
                          >
                            {action.currentRisk}/100
                          </span>
                          <span>→</span>
                          <span className="font-bold text-teal">{action.projectedRisk}/100</span>
                        </div>
                      </div>

                      {/* Benefit */}
                      <div
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${badgeColors[idx % 3]}`}
                      >
                        -{action.absoluteReduction} {tr("fit_pts", currentLang)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
                <TrendingDown className="h-8 w-8 text-teal/40 mb-2" />
                <span>{tr("fit_profile_fully_optimized", currentLang)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/95">
          <Link to="/action-plan">
            {tr("fit_view_action_plan", currentLang)} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
