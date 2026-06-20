import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Sparkles,
  Check,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { isConfigured, db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/auth-context";

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

import { assessHealth, type HealthResult } from "@/lib/health.functions";
import {
  useHealthResult,
  useProfile,
  pushHistory,
  useLangPref,
  type Profile,
} from "@/lib/health-store";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/_app/assessment")({
  component: AssessmentPage,
});

const steps = [
  { id: 1, label: "Personal", desc: "Basic profile" },
  { id: 2, label: "Lifestyle", desc: "Habits & activity" },
  { id: 3, label: "Family history", desc: "Hereditary risk" },
  { id: 4, label: "Symptoms", desc: "What you're feeling" },
];

function AssessmentPage() {
  useEffect(() => {
    document.title = "Health Assessment — HealthGuard";
  }, []);
  const navigate = useNavigate();
  const { setHasCompletedAssessment } = useAuth();
  const assess = assessHealth;
  const [, setResult] = useHealthResult();
  const [profile, setProfile] = useProfile();
  const [lang] = useLangPref();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

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
    },
  });

  const total = steps.length;
  const pct = (step / total) * 100;

  async function submit(values: Profile) {
    setLoading(true);
    try {
      const res = (await assess({
        data: {
          ...values,
          age: Number(values.age),
          heightCm: Number(values.heightCm),
          weightKg: Number(values.weightKg),
          language: lang,
        },
      })) as HealthResult & { bmi: number };
      setProfile(values);
      setResult(res);
      pushHistory({
        date: new Date().toISOString(),
        overallScore: res.overallScore,
        bmi: res.bmi,
        weightKg: values.weightKg,
        risks: res.risk,
      });

      // Write onboarding status flag to firestore users collection
      if (isConfigured && auth.currentUser) {
        const uid = auth.currentUser.uid;
        console.log(`[Firestore Debug] [Assessment Submit] Starting db write for users/${uid}`);
        try {
          const userRef = doc(db, "users", uid);
          console.log(`[Firestore Debug] [Assessment Submit] Fetching user doc: users/${uid}`);
          const fetchStartTime = Date.now();
          const userSnap = await getDoc(userRef);
          const exists = userSnap.exists();
          const userData = exists ? userSnap.data() : null;
          console.log(`[Firestore Debug] [Assessment Submit] Fetch completed in ${Date.now() - fetchStartTime}ms. Exists: ${exists}`);

          const updateData: Record<string, unknown> = {
            uid: uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName || null,
            hasCompletedAssessment: true,
            lastAssessmentUpdatedAt: serverTimestamp(),
          };

          if (!userData || !userData.assessmentCompletedAt) {
            updateData.assessmentCompletedAt = serverTimestamp();
          } else {
            updateData.assessmentCompletedAt = userData.assessmentCompletedAt;
          }

          console.log(`[Firestore Debug] [Assessment Submit] Setting user doc users/${uid} with payload:`, updateData);
          const writeStartTime = Date.now();
          await setDoc(userRef, updateData, { merge: true });
          console.log(`[Firestore Debug] [Assessment Submit] setDoc completed successfully in ${Date.now() - writeStartTime}ms`);
        } catch (dbErr: unknown) {
          console.error("[Firestore Debug] [Assessment Submit] Firestore update failed during assessment submission:", dbErr);
          const e = dbErr as { message?: string; code?: string; stack?: string };
          console.error(`[Firestore Debug] [Assessment Submit] Details - Code: ${e?.code || "N/A"}, Message: ${e?.message || "N/A"}, Stack: ${e?.stack || "N/A"}`);
          toast.error("Cloud sync failed. Please check your internet connection.");
          throw dbErr;
        }
      }

      setHasCompletedAssessment(true);
      toast.success("Assessment complete");
      navigate({ to: "/dashboard" });
    } catch (e: unknown) {
      console.error("Assessment submit flow failure:", e);
      const errMsg = (e as Error)?.message || "";
      if (
        !errMsg.includes("firestore") &&
        !errMsg.includes("database") &&
        !errMsg.includes("network")
      ) {
        toast.error("Assessment failed. Please try again.");
      }
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
    if (step === 1) {
      fieldsToValidate = ["age", "gender", "heightCm", "weightKg"];
    } else if (step === 2) {
      fieldsToValidate = ["smoking", "exercise"];
    }

    if (fieldsToValidate.length > 0) {
      const isValid = await form.trigger(fieldsToValidate);
      if (!isValid) {
        toast.error("Please fill in all required fields correctly before continuing.");
        return;
      }
    }

    if (step < total) setStep(step + 1);
    else form.handleSubmit(submit, onInvalid)();
  }
  function back() {
    if (step > 1) setStep(step - 1);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
      <div className="mb-8">
        <Badge
          variant="secondary"
          className="rounded-full bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20"
        >
          Health assessment
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {tr("assessmentTitle", lang)}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          This takes about 10 minutes. Your answers stay on your device and power your risk model
          and care plan.
        </p>
      </div>

      {/* Step bar */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span className="font-semibold text-primary uppercase tracking-wider text-[10px]">
            Step {step} of {total}
          </span>
          <span className="font-semibold text-teal uppercase tracking-wider text-[10px]">
            {Math.round(pct)}% complete
          </span>
        </div>
        <Progress value={pct} className="h-1 bg-muted [&>div]:bg-teal" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map((s) => {
            const active = s.id === step;
            const done = s.id < step;
            return (
              <div
                key={s.id}
                className={`rounded-lg border p-3 text-left transition-all duration-300 relative overflow-hidden ${
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
                    {done ? <Check className="h-3 w-3" /> : s.id}
                  </span>
                  <span
                    className={`text-sm font-semibold transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {s.label}
                  </span>
                </div>
                <div className="mt-1.5 hidden text-xs text-muted-foreground sm:block">{s.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="border-border bg-surface shadow-card-soft">
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={form.handleSubmit(submit, onInvalid)} className="space-y-6">
            {step === 1 && (
              <div className="grid gap-6 sm:grid-cols-2">
                <Field
                  label={tr("age", lang)}
                  helperText="Required for demographic scaling."
                  error={form.formState.errors.age?.message}
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      className={`h-11 border-border/80 bg-surface/50 pr-10 transition-all duration-200 focus:border-teal focus:ring-teal ${
                        form.formState.errors.age
                          ? "border-red-500 focus-visible:ring-red-500 bg-red-500/5"
                          : ""
                      }`}
                      {...form.register("age", {
                        valueAsNumber: true,
                        required: "Age is required",
                        min: { value: 1, message: "Age must be at least 1" },
                        max: { value: 120, message: "Age cannot exceed 120" },
                      })}
                    />
                    <span className="absolute right-3 top-3 text-xs text-muted-foreground font-mono">
                      yrs
                    </span>
                  </div>
                </Field>

                <Field
                  label={tr("gender", lang)}
                  helperText="Used for metabolic baseline modeling."
                  error={form.formState.errors.gender?.message}
                >
                  <Select
                    value={form.watch("gender")}
                    onValueChange={(v) => form.setValue("gender", v as Profile["gender"])}
                  >
                    <SelectTrigger
                      className={`h-11 border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal ${
                        form.formState.errors.gender ? "border-red-500 focus:ring-red-500" : ""
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label={tr("height", lang)}
                  tooltip="Height is used along with weight to calculate your Body Mass Index (BMI), a key indicator for cardiovascular and diabetes risk."
                  helperText="Combined with weight to establish your BMI."
                  error={form.formState.errors.heightCm?.message}
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min={50}
                      max={260}
                      className={`h-11 border-border/80 bg-surface/50 pr-10 transition-all duration-200 focus:border-teal focus:ring-teal ${
                        form.formState.errors.heightCm
                          ? "border-red-500 focus-visible:ring-red-500 bg-red-500/5"
                          : ""
                      }`}
                      {...form.register("heightCm", {
                        valueAsNumber: true,
                        required: "Height is required",
                        min: { value: 50, message: "Height must be at least 50 cm" },
                        max: { value: 260, message: "Height cannot exceed 260 cm" },
                      })}
                    />
                    <span className="absolute right-3 top-3 text-xs text-muted-foreground font-mono">
                      cm
                    </span>
                  </div>
                </Field>

                <Field
                  label={tr("weight", lang)}
                  tooltip="Weight changes directly impact your calculated BMI and metabolic load. Tracking baseline weight is essential for monitoring progress."
                  helperText="Baseline weight for monitoring."
                  error={form.formState.errors.weightKg?.message}
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min={10}
                      max={400}
                      className={`h-11 border-border/80 bg-surface/50 pr-10 transition-all duration-200 focus:border-teal focus:ring-teal ${
                        form.formState.errors.weightKg
                          ? "border-red-500 focus-visible:ring-red-500 bg-red-500/5"
                          : ""
                      }`}
                      {...form.register("weightKg", {
                        valueAsNumber: true,
                        required: "Weight is required",
                        min: { value: 10, message: "Weight must be at least 10 kg" },
                        max: { value: 400, message: "Weight cannot exceed 400 kg" },
                      })}
                    />
                    <span className="absolute right-3 top-3 text-xs text-muted-foreground font-mono">
                      kg
                    </span>
                  </div>
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-6 sm:grid-cols-2">
                <Field
                  label={tr("smoking", lang)}
                  helperText="Vascular and systemic health risk factor."
                  error={form.formState.errors.smoking?.message}
                >
                  <Select
                    value={form.watch("smoking")}
                    onValueChange={(v) => form.setValue("smoking", v as Profile["smoking"])}
                  >
                    <SelectTrigger className="h-11 border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never smoked</SelectItem>
                      <SelectItem value="former">Former smoker</SelectItem>
                      <SelectItem value="current">Current smoker</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label={tr("exercise", lang)}
                  helperText="Refined parameter for cardiovascular fitness."
                  error={form.formState.errors.exercise?.message}
                >
                  <Select
                    value={form.watch("exercise")}
                    onValueChange={(v) => form.setValue("exercise", v as Profile["exercise"])}
                  >
                    <SelectTrigger className="h-11 border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="light">Light (1-2× / week)</SelectItem>
                      <SelectItem value="moderate">Moderate (3-4× / week)</SelectItem>
                      <SelectItem value="active">Active (5+ / week)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            {step === 3 && (
              <Field
                label={tr("familyHistory", lang)}
                tooltip="First-degree relatives share genetic factors that significantly influence your susceptibility to inherited conditions."
                helperText="List any first-degree relatives (parents, siblings) with Type 2 Diabetes, Cardiovascular Disease, or Hypertension."
                error={form.formState.errors.familyHistory?.message}
              >
                <Textarea
                  rows={4}
                  placeholder="e.g. mother — type 2 diabetes; father — hypertension; sibling — none"
                  className="border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal focus-visible:ring-teal"
                  {...form.register("familyHistory")}
                />
              </Field>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <Field
                  label={tr("symptoms", lang)}
                  tooltip={tr("symptomsTooltip", lang)}
                  helperText={tr("symptomsHelper", lang)}
                  error={form.formState.errors.symptoms?.message}
                >
                  <Textarea
                    rows={4}
                    placeholder="e.g. occasional fatigue, mild headaches, frequent thirst, sleep disturbance"
                    className="border-border/80 bg-surface/50 transition-all duration-200 focus:border-teal focus:ring-teal focus-visible:ring-teal"
                    {...form.register("symptoms")}
                  />
                </Field>

                {/* Pre-submission Review Card (Styled like a clean clinical record sheet) */}
                <div className="rounded-xl border border-border/70 bg-surface-muted/30 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-border/60 pb-3">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/10 text-teal">
                      <Check className="h-3 w-3" />
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-bold text-foreground">
                        Lifestyle & Wellness Profile Summary
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Please verify your self-reported parameters before analysis.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Age / Gender
                      </span>
                      <span className="font-medium text-foreground">
                        {form.watch("age")} yrs /{" "}
                        <span className="capitalize">{form.watch("gender")}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Height / Weight
                      </span>
                      <span className="font-medium text-foreground">
                        {form.watch("heightCm")} cm / {form.watch("weightKg")} kg
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Smoking status
                      </span>
                      <span className="font-medium text-foreground capitalize">
                        {form.watch("smoking")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Exercise frequency
                      </span>
                      <span className="font-medium text-foreground capitalize">
                        {form.watch("exercise")}
                      </span>
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1.5 border-b border-border/40 pb-2.5">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Family history
                      </span>
                      <span className="text-xs italic text-foreground/90 bg-surface-muted/50 p-2 rounded border border-border/30">
                        {form.watch("familyHistory") || "No history reported"}
                      </span>
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1.5 pb-1">
                      <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                        Current symptoms
                      </span>
                      <span className="text-xs italic text-foreground/90 bg-surface-muted/50 p-2 rounded border border-border/30">
                        {form.watch("symptoms") || "No symptoms reported"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-lg border border-border bg-accent/40 p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  <p className="text-xs leading-relaxed text-accent-foreground">
                    HealthGuard provides educational health risk assessments based on user-provided
                    information. It is not intended to diagnose, treat, cure, or prevent any
                    clinical condition. Users should consult qualified healthcare professionals for
                    medical advice.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={back}
                disabled={step === 1 || loading}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                type="button"
                onClick={next}
                disabled={loading}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow transition-all font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analyzing
                  </>
                ) : step === total ? (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate plan
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
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
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-help focus:outline-none"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
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
      {error && <p className="text-xs font-semibold text-red-500 leading-normal">{error}</p>}
      {helperText && !error && (
        <p className="text-[11px] text-muted-foreground leading-normal">{helperText}</p>
      )}
    </div>
  );
}
