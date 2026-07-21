import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useHealthResult, useProfile } from "@/lib/health-store";
import { useLanguage, tr, type Lang } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Coffee,
  Cookie,
  Soup,
  UtensilsCrossed,
  Dumbbell,
  Flame,
  Timer,
  Activity,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import SplitText from "@/components/ui/split-text";
import { ShapeGrid } from "@/components/ui/shape-grid";
import { generatePersonalizedPlans } from "@/lib/personalization-engine";
import { generateHealthPriorities, type HealthPriority } from "@/lib/priority-engine";
import { generateDietPlan } from "@/lib/diet-engine";

export const Route = createFileRoute("/_app/action-plan")({
  component: ActionPlanPage,
});

// ----------------- DIET DATA & SAMPLES -----------------
const meals = {
  breakfast: { icon: Coffee, label: "Breakfast", kcal: "350-450" },
  lunch: { icon: UtensilsCrossed, label: "Lunch", kcal: "500-650" },
  snacks: { icon: Cookie, label: "Snacks", kcal: "150-250" },
  dinner: { icon: Soup, label: "Dinner", kcal: "450-600" },
} as const;

const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border shadow-card-soft">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-accent text-teal">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-base font-semibold text-foreground">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionPlanPage() {
  const navigate = useNavigate();
  const [profile] = useProfile();
  const [result] = useHealthResult();
  const currentLang = useLanguage();

  useEffect(() => {
    document.title = `${tr("actionPlan", currentLang)} — HealthGuard`;
  }, [currentLang]);

  const hasValidResult =
    Boolean(result) &&
    typeof result?.overallRisk === "string" &&
    typeof result?.bmi === "number" &&
    Boolean(profile);

  if (!hasValidResult) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center flex flex-col items-center justify-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-teal shadow-card-soft">
          <Activity className="h-7 w-7" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-foreground">
          {tr("assessmentRequired", currentLang)}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
          {tr("actionPlanAssessDesc", currentLang)}
        </p>
        <Button
          type="button"
          onClick={() => navigate({ to: "/assessment" })}
          className="mt-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-semibold px-6 py-2 h-11"
        >
          <span>{tr("startAssessment", currentLang)}</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Generate personalized plans using Mifflin-St Jeor engine
  const personalized = profile ? generatePersonalizedPlans(profile) : null;
  const bmiVal = typeof result?.bmi === "number" ? result.bmi.toFixed(1) : "22.0";

  return (
    <div className="relative w-full min-h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col justify-start isolate animate-fade-in">
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
            className="rounded-full bg-teal/10 text-teal border border-teal/20"
          >
            {tr("activePlan", currentLang)}
          </Badge>
          <SplitText
            text={tr("actionPlan", currentLang)}
            className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl"
            delay={35}
            duration={0.6}
            ease="power3.out"
            splitType="chars"
            tag="h1"
            textAlign="left"
          />
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
            {tr("actionPlanDesc", currentLang)}
          </p>
        </div>

        {/* Dynamic Targets Summary Banners */}
        {personalized && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            <MetricCard
              icon={Flame}
              label="Target Calories"
              value={`${personalized.macroTarget.calories} kcal`}
            />
            <MetricCard
              icon={Dumbbell}
              label="Target Protein"
              value={`${personalized.macroTarget.protein} g`}
            />
            <MetricCard
              icon={Activity}
              label="Target Carbs"
              value={`${personalized.macroTarget.carbs} g`}
            />
            <MetricCard
              icon={Coffee}
              label="Target Fat"
              value={`${personalized.macroTarget.fat} g`}
            />
            <MetricCard
              icon={Sparkles}
              label="Target Fiber"
              value={`${personalized.macroTarget.fiber} g`}
            />
          </div>
        )}

        {/* Top 3 Actions */}
        <Card className="border-border bg-surface shadow-card-soft overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal via-primary to-accent" />
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal animate-pulse" />{" "}
              {tr("thisWeeksTopActions", currentLang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {(() => {
              const engineInput = {
                ...(profile || {}),
                diabetesRiskCategory: result?.risk?.diabetes ? (result.risk.diabetes > 50 ? "high" : result.risk.diabetes > 25 ? "moderate" : "low") : undefined,
                hypertensionRiskCategory: result?.risk?.hypertension ? (result.risk.hypertension > 50 ? "high" : result.risk.hypertension > 25 ? "moderate" : "low") : undefined,
              };
              const priorities = generateHealthPriorities(engineInput);
              if (priorities.length === 0) return null;

              return (
                <div className="grid gap-3 sm:grid-cols-3">
                  {priorities.slice(0, 3).map((p, i) => (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between gap-2.5 rounded-xl border border-border bg-surface-muted/50 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span className="font-display text-lg font-black text-teal shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground leading-snug">{p.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-normal">{p.reason}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/20">
                        <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 ${
                          p.severity === "high" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }`}>
                          {p.severity} severity
                        </Badge>
                        {p.evidence.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
                            {p.evidence[0]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })() || (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                  <span className="font-display text-lg font-black text-teal shrink-0">1</span>
                  <p className="text-sm font-bold text-foreground">
                    {tr("fallbackAction1", currentLang)}
                  </p>
                </div>
                <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                  <span className="font-display text-lg font-black text-teal shrink-0">2</span>
                  <p className="text-sm font-bold text-foreground">
                    {tr("fallbackAction2", currentLang)}
                  </p>
                </div>
                <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                  <span className="font-display text-lg font-black text-teal shrink-0">3</span>
                  <p className="text-sm font-bold text-foreground">
                    {tr("fallbackAction3", currentLang)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Simple Diet Plan */}
        <div className="space-y-4 border-t border-border/40 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Badge variant="secondary" className="rounded-full">
                {tr("dietPlan", currentLang)}
              </Badge>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight">
                {tr("weeklyMealPlanner", currentLang)}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {tr("mealPlannerDesc", currentLang).replace("{bmi}", bmiVal)}
              </p>
            </div>

            {(() => {
              const engineInput = {
                ...(profile || {}),
                priorities: generateHealthPriorities(profile || {}),
                diabetesRiskCategory: result?.risk?.diabetes ? (result.risk.diabetes > 50 ? "high" : result.risk.diabetes > 25 ? "moderate" : "low") : undefined,
                hypertensionRiskCategory: result?.risk?.hypertension ? (result.risk.hypertension > 50 ? "high" : result.risk.hypertension > 25 ? "moderate" : "low") : undefined,
              };
              const dietPlanOutput = generateDietPlan(engineInput);
              return (
                <div className="bg-surface-muted/40 rounded-xl border border-border/60 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-teal/20 text-teal hover:bg-teal/30 font-semibold">
                      Strategy: {dietPlanOutput.strategy}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {dietPlanOutput.strategyReason}
                  </p>
                </div>
              );
            })()}
          </div>

          <Tabs defaultValue="breakfast" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-4 bg-muted p-1">
              {(Object.keys(meals) as Array<keyof typeof meals>).map((k) => {
                const M = meals[k];
                return (
                  <TabsTrigger
                    key={k}
                    value={k}
                    className="gap-2 cursor-pointer text-xs font-semibold"
                  >
                    <M.icon className="h-3.5 w-3.5" />
                    <span>{tr(k, currentLang)}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {(Object.keys(meals) as Array<keyof typeof meals>).map((k) => {
              const M = meals[k];
              return (
                <TabsContent key={k} value={k} className="mt-4">
                  <Card className="border-border bg-surface shadow-card-soft">
                    <CardHeader className="pb-3 border-b border-border/40">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                          <M.icon className="h-4 w-4 text-teal" /> {tr(k, currentLang)}{" "}
                          {tr("suggestions", currentLang)}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 pt-4">
                        {(() => {
                          const engineInput = {
                            ...(profile || {}),
                            priorities: generateHealthPriorities(profile || {}),
                            diabetesRiskCategory: result?.risk?.diabetes ? (result.risk.diabetes > 50 ? "high" : result.risk.diabetes > 25 ? "moderate" : "low") : undefined,
                            hypertensionRiskCategory: result?.risk?.hypertension ? (result.risk.hypertension > 50 ? "high" : result.risk.hypertension > 25 ? "moderate" : "low") : undefined,
                          };
                          const dietPlanOutput = generateDietPlan(engineInput);
                          const courseKey = k === "breakfast" ? "breakfast" : k === "lunch" ? "lunch" : k === "snacks" ? "snacks" : "dinner";
                          const rec = dietPlanOutput.meals[courseKey];

                          return weekdays.map((day, i) => {
                            const meal = personalized?.dietPlan[day]?.[k];
                            return (
                              <div
                                key={i}
                                className="rounded-xl border border-border bg-surface-muted/65 p-3.5 flex flex-col justify-between"
                              >
                                <div>
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-teal font-mono">
                                    {tr(day, currentLang)}
                                  </div>
                                  <div className="mt-1 text-xs font-semibold leading-relaxed text-foreground">
                                    {rec.meal || meal?.name || "Healthy Choice"}
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground leading-normal italic">
                                    {rec.reason}
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-border/30 text-[10px] text-teal font-medium">
                                  {rec.expectedBenefit}
                                </div>
                              </div>
                            );
                          });
                        })()}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        {/* Simple Exercise Plan */}
        <div className="space-y-4 border-t border-border/40 pt-6">
          <div>
            <Badge variant="secondary" className="rounded-full">
              {tr("exercisePlan", currentLang)}
            </Badge>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight">
              {tr("weeklyWorkoutPlan", currentLang)}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Custom-tailored exercise schedule based on your profile inputs.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {weekdays.map((day) => {
              const w = personalized?.workoutPlan[day];
              return (
                <Card key={day} className="border-border bg-surface shadow-card-soft flex flex-col justify-between p-3.5">
                  <div>
                    <div className="flex items-center justify-between border-b border-border/40 pb-1.5 mb-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-teal font-mono">
                        {tr(day, currentLang)}
                      </div>
                      <Badge className="text-[10px] py-0 bg-teal/10 text-teal border-none font-bold">
                        {w?.focus || "Rest"}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {w?.exercises.map((ex, idx) => (
                        <div key={idx} className="space-y-0.5 text-left">
                          <div className="text-xs font-bold text-foreground leading-snug">{ex.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{ex.sets}</div>
                          <div className="text-[10px] text-muted-foreground/80 leading-normal">{ex.explanation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {w && (
                    <div className="mt-3 border-t border-border/40 pt-2 text-[10px] text-muted-foreground flex justify-between items-center font-mono">
                      <span>Duration</span>
                      <span>{w.min} min</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
