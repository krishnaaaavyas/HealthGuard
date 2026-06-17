import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useHealthResult, useProfile } from "@/lib/health-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dietSamples = {
  "indian-veg": {
    breakfast: [
      "Vegetable poha + green chutney",
      "Moong dal chilla + curd",
      "Oats upma + flax seeds",
      "Multigrain paratha + dahi",
      "Idli + sambar (2 idlis)",
      "Besan cheela + mint chutney",
      "Daliya + mixed vegetables",
    ],
    lunch: [
      "Roti, dal tadka, lauki sabzi, salad",
      "Brown rice, rajma, beetroot raita",
      "2 jowar roti, paneer bhurji, palak",
      "Quinoa pulao, mixed dal",
      "Roti, chana masala, gobi sabzi",
      "Khichdi + papad + curd",
      "Roti, mixed dal, bhindi sabzi",
    ],
    snacks: [
      "Roasted chana + green tea",
      "Handful almonds + apple",
      "Fruit chaat + walnuts",
      "Sprouts salad",
      "Cucumber + hummus",
      "Greek yogurt + seeds",
      "Buttermilk + makhana",
    ],
    dinner: [
      "Vegetable soup + 2 multigrain roti + sabzi",
      "Light khichdi + salad",
      "Stir-fried tofu + brown rice",
      "Dal + roti + steamed veg",
      "Paneer tikka + salad",
      "Vegetable daliya + curd",
      "Mixed sabzi + roti + raita",
    ],
  },
  "indian-nonveg": {
    breakfast: [
      "Egg bhurji + 2 multigrain toast",
      "Boiled eggs + oats + fruit",
      "Chicken keema paratha + curd",
      "Egg omelette + brown bread",
      "Idli + sambar + boiled egg",
      "Egg white scramble + roti",
      "Greek yogurt + boiled egg",
    ],
    lunch: [
      "Roti, chicken curry, salad, raita",
      "Brown rice, fish curry, bhindi",
      "2 jowar roti, egg bhurji, spinach",
      "Quinoa pulao, chicken stir-fry",
      "Roti, mutton curry (lean), gobi",
      "Khichdi + omelette + curd",
      "Roti, fish fry, bhindi sabzi",
    ],
    snacks: [
      "Hard-boiled egg + green tea",
      "Handful almonds + apple",
      "Chicken salad + walnuts",
      "Sprouts salad",
      "Cucumber + boiled egg",
      "Greek yogurt + seeds",
      "Buttermilk + boiled egg",
    ],
    dinner: [
      "Chicken soup + 2 roti + sabzi",
      "Light khichdi + boiled egg",
      "Stir-fried chicken + brown rice",
      "Fish curry + roti + steamed veg",
      "Chicken tikka + salad",
      "Vegetable daliya + egg bhurji",
      "Mixed sabzi + roti + fish curry",
    ],
  },
};

// ----------------- FITNESS DATA -----------------
type FitnessLevel = "beginner" | "intermediate" | "advanced";

const fitnessPlans: Record<
  FitnessLevel,
  {
    title: string;
    weekly: string;
    intensity: string;
    kcal: number;
    sessions: Array<{ day: string; focus: string; detail: string; min: number }>;
  }
> = {
  beginner: {
    title: "Foundation",
    weekly: "150 min low-impact",
    intensity: "RPE 4-5 / 10",
    kcal: 1400,
    sessions: [
      { day: "Mon", focus: "Walk", detail: "30 min brisk walk + 5 min cooldown stretch", min: 35 },
      { day: "Tue", focus: "Mobility", detail: "20 min full-body stretching + breathing", min: 20 },
      {
        day: "Wed",
        focus: "Strength",
        detail: "Bodyweight: 3×10 squats, push-ups (knee), rows, planks 30s",
        min: 30,
      },
      { day: "Thu", focus: "Rest / walk", detail: "20 min easy walk or rest", min: 20 },
      {
        day: "Fri",
        focus: "Walk",
        detail: "35 min brisk walk + hill intervals (4×1 min)",
        min: 35,
      },
      {
        day: "Sat",
        focus: "Strength",
        detail: "Bodyweight circuit: 3 rounds x 8 movements",
        min: 35,
      },
      { day: "Sun", focus: "Recovery", detail: "Yoga or stretching, 25 min", min: 25 },
    ],
  },
  intermediate: {
    title: "Progression",
    weekly: "210 min mixed",
    intensity: "RPE 6-7 / 10",
    kcal: 2200,
    sessions: [
      { day: "Mon", focus: "Cardio", detail: "30 min run/cycle Z2, 5 min Z4 finisher", min: 35 },
      { day: "Tue", focus: "Strength A", detail: "Squat 4×6, Bench 4×6, Row 4×8", min: 45 },
      { day: "Wed", focus: "Intervals", detail: "8×400m run or 30s/30s bike sprints", min: 30 },
      {
        day: "Thu",
        focus: "Strength B",
        detail: "Deadlift 4×5, Press 4×6, Pull-ups 4×AMRAP",
        min: 45,
      },
      { day: "Fri", focus: "Cardio", detail: "40 min steady Z2 + 10 min cooldown", min: 50 },
      { day: "Sat", focus: "Mobility", detail: "Yoga / mobility flow", min: 30 },
      { day: "Sun", focus: "Rest", detail: "Active recovery walk 25 min", min: 25 },
    ],
  },
  advanced: {
    title: "Performance",
    weekly: "300+ min periodized",
    intensity: "RPE 7-9 / 10",
    kcal: 3000,
    sessions: [
      { day: "Mon", focus: "Strength A", detail: "Squat 5×3 @85%, accessories", min: 60 },
      { day: "Tue", focus: "Threshold", detail: "20 min @ LT2 + 2×8 min Z4", min: 55 },
      { day: "Wed", focus: "Strength B", detail: "Deadlift 5×3, upper push/pull", min: 60 },
      { day: "Thu", focus: "VO2 intervals", detail: "5×4 min Z5 / 3 min easy", min: 45 },
      {
        day: "Fri",
        focus: "Strength C",
        detail: "Bench 5×3, posterior chain accessories",
        min: 55,
      },
      { day: "Sat", focus: "Long endurance", detail: "75-90 min Z2", min: 90 },
      { day: "Sun", focus: "Recovery", detail: "Mobility, sauna, full rest", min: 30 },
    ],
  },
};

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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
  const [dietPref, setDietPref] = useState<"indian-veg" | "indian-nonveg">("indian-veg");

  useEffect(() => {
    document.title = "Action Plan — HealthGuard";
  }, []);

  if (!profile || !result) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center flex flex-col items-center justify-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-teal shadow-card-soft">
          <Activity className="h-7 w-7" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-foreground">
          Assessment Required
        </h1>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
          Please complete your initial health assessment before viewing your personalized Action Plan.
        </p>
        <Button
          onClick={() => navigate({ to: "/assessment" })}
          className="mt-8 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-semibold px-6 py-2 h-11"
        >
          <span>Start Assessment</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Determine fitness level baseline
  let recFitness: FitnessLevel = "beginner";
  if (profile.exercise === "active") recFitness = "advanced";
  else if (profile.exercise === "moderate") recFitness = "intermediate";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-14 space-y-10">
      {/* Header */}
      <div>
        <Badge
          variant="secondary"
          className="rounded-full bg-teal/10 text-teal border border-teal/20"
        >
          Active Plan
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Weekly Action Plan
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
          Your personalized list of highest impact habits, custom regional diet guides, and physical exercise workouts for this week.
        </p>
      </div>

      {/* Top 3 Actions */}
      <Card className="border-border bg-surface shadow-card-soft overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal via-primary to-accent" />
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal animate-pulse" /> This Week's Top Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {result.actionPriorities && result.actionPriorities.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {result.actionPriorities.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                  <span className="font-display text-lg font-black text-teal shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground leading-snug">{p.action}</p>
                    <p className="text-[10px] text-teal mt-1 font-semibold uppercase tracking-wider font-mono">
                      Benefit: ↓ {Math.abs(p.estimatedImpact)} pts risk drop
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                <span className="font-display text-lg font-black text-teal shrink-0">1</span>
                <p className="text-sm font-bold text-foreground">Exercise 30 minutes/day (moderate intensity)</p>
              </div>
              <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                <span className="font-display text-lg font-black text-teal shrink-0">2</span>
                <p className="text-sm font-bold text-foreground">Add high-fiber and protein foods to breakfast</p>
              </div>
              <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface-muted/50 p-4">
                <span className="font-display text-lg font-black text-teal shrink-0">3</span>
                <p className="text-sm font-bold text-foreground">Sleep 7–8 hours nightly</p>
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
              Diet Planner
            </Badge>
            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight">
              Weekly Meal Planner
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Regionally-adapted meals designed to optimize your BMI ({result.bmi.toFixed(1)}) and glycemic/cardiovascular metrics.
            </p>
          </div>
          <div className="flex rounded-lg border border-border bg-surface p-1">
            {[
              { v: "indian-veg" as const, label: "Vegetarian" },
              { v: "indian-nonveg" as const, label: "Non-vegetarian" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setDietPref(o.v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  dietPref === o.v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="breakfast" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-4 bg-muted p-1">
            {(Object.keys(meals) as Array<keyof typeof meals>).map((k) => {
              const M = meals[k];
              return (
                <TabsTrigger key={k} value={k} className="gap-2 cursor-pointer text-xs font-semibold">
                  <M.icon className="h-3.5 w-3.5" />
                  <span>{M.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {(Object.keys(meals) as Array<keyof typeof meals>).map((k) => {
            const M = meals[k];
            const list = dietSamples[dietPref][k];
            return (
              <TabsContent key={k} value={k} className="mt-4">
                <Card className="border-border bg-surface shadow-card-soft">
                  <CardHeader className="pb-3 border-b border-border/40">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                        <M.icon className="h-4 w-4 text-teal" /> {M.label} Suggestions
                      </CardTitle>
                      <span className="text-xs text-muted-foreground font-semibold">~{M.kcal} kcal</span>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 pt-4">
                    {list.map((dish, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border bg-surface-muted/65 p-3.5"
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider text-teal font-mono">
                          {week[i]}
                        </div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-foreground">{dish}</div>
                      </div>
                    ))}
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
            Workout Planner
          </Badge>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight">
            Weekly Workout Plan
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Activity goals tailored for your reported baseline activity profile:{" "}
            <span className="font-semibold capitalize text-foreground">{recFitness}</span>.
          </p>
        </div>

        <Tabs defaultValue={recFitness} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 bg-muted p-1">
            <TabsTrigger value="beginner" className="cursor-pointer text-xs font-semibold">
              Beginner
            </TabsTrigger>
            <TabsTrigger value="intermediate" className="cursor-pointer text-xs font-semibold">
              Intermediate
            </TabsTrigger>
            <TabsTrigger value="advanced" className="cursor-pointer text-xs font-semibold">
              Advanced
            </TabsTrigger>
          </TabsList>

          {(Object.keys(fitnessPlans) as FitnessLevel[]).map((level) => {
            const p = fitnessPlans[level];
            return (
              <TabsContent key={level} value={level} className="mt-4 space-y-4">
                <div className="grid gap-3 grid-cols-3">
                  <MetricCard icon={Timer} label="Weekly volume" value={p.weekly} />
                  <MetricCard icon={Flame} label="Estimated burn" value={`${p.kcal} kcal / wk`} />
                  <MetricCard icon={Dumbbell} label="Intensity" value={p.intensity} />
                </div>

                <Card className="border-border shadow-card-soft">
                  <CardHeader className="pb-3 border-b border-border/40">
                    <CardTitle className="font-display text-sm font-bold text-foreground">
                      Daily Activity Guide — {p.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                      {p.sessions.map((s) => (
                        <div
                          key={s.day}
                          className="rounded-xl border border-border bg-surface p-3.5 flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between border-b border-border/40 pb-1.5 mb-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-teal font-mono">
                              {s.day}
                            </div>
                            <div className="text-[10px] font-bold text-muted-foreground">{s.min} min</div>
                          </div>
                          <div className="text-xs font-bold text-foreground">{s.focus}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground font-medium">
                            {s.detail}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
