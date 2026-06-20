import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  ClipboardList,
  Heart,
  LineChart,
  Lock,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  Watch,
  ThumbsUp,
  BookOpen,
  Check,
  Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage, tr } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading, hasCompletedAssessment } = useAuth();
  const navigate = useNavigate();
  const currentLang = useLanguage();

  useEffect(() => {
    document.title = "HealthGuard — Health Awareness & Risk Assessment";
  }, []);

  useEffect(() => {
    if (!loading && user && hasCompletedAssessment !== null) {
      if (hasCompletedAssessment === true) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        navigate({ to: "/assessment", replace: true });
      }
    }
  }, [user, loading, hasCompletedAssessment, navigate]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading HealthGuard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/40 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-12 lg:py-24 items-center">
          {/* Left side: Content & CTAs */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[52px]">
              {tr("homeTitle", currentLang)}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              {tr("homeSubtitle", currentLang)}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 px-6 font-semibold"
              >
                <Link to="/assessment">
                  {tr("startAssessment", currentLang)} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base font-semibold hover:bg-accent/40 hover:-translate-y-0.5 transition-all duration-300"
              >
                <Link to="/about">{tr("learnMore", currentLang)}</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground border-t border-border/60 pt-6">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> {tr("noMedicalRecords", currentLang)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> {tr("privateProcessing", currentLang)}
              </span>
            </div>
          </div>

          {/* Right side: Modern, minimal visual showcase of focus areas */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="relative w-full max-w-[420px] py-6 space-y-4">
              {/* Vibrant gradients and background glows */}
              <div className="absolute -inset-10 rounded-full bg-gradient-to-tr from-teal/20 via-primary/5 to-teal/10 blur-3xl opacity-75 pointer-events-none" />

              {/* Card 1: Type 2 Diabetes */}
              <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:border-teal/30 group">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-teal to-teal/60" />
                <div className="flex gap-4 items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal transition-colors duration-300 group-hover:bg-teal group-hover:text-primary-foreground">
                    <Brain className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {tr("diabetes", currentLang)}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Glucose baselines, family history, and physical activity indicators.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Hypertension */}
              <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:border-teal/30 group">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-teal to-teal/60" />
                <div className="flex gap-4 items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal transition-colors duration-300 group-hover:bg-teal group-hover:text-primary-foreground">
                    <Activity className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {tr("hypertension", currentLang)}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Blood pressure markers, dietary habits, and weight indicators.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: Heart Disease */}
              <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:border-teal/30 group">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-teal to-teal/60" />
                <div className="flex gap-4 items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal transition-colors duration-300 group-hover:bg-teal group-hover:text-primary-foreground">
                    <Heart className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      {tr("heartDisease", currentLang)}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Cardiovascular risk baseline and personalized preventive guidance.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why HealthGuard? */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xs shrink-0">
              <Badge
                variant="secondary"
                className="rounded-full bg-teal/10 text-teal border border-teal/20"
              >
                {tr("whyHealthGuard", currentLang)}
              </Badge>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                {tr("healthAssistant", currentLang)}
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-muted-foreground max-w-3xl">
              {tr("healthAssistantDesc", currentLang)}
            </div>
          </div>
        </div>
      </section>

      {/* Simple 3-Step Guide Section */}
      <section className="border-b border-border bg-surface-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl mb-12">
            <Badge
              variant="secondary"
              className="rounded-full bg-teal/10 text-teal border border-teal/20"
            >
              {tr("howItHelps", currentLang)}
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground">
              {tr("threeStepExplanation", currentLang)}
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">{tr("threeStepDesc", currentLang)}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "Step 1",
                title: tr("step1Title", currentLang),
                desc: tr("step1Desc", currentLang),
              },
              {
                step: "Step 2",
                title: tr("step2Title", currentLang),
                desc: tr("step2Desc", currentLang),
              },
              {
                step: "Step 3",
                title: tr("step3Title", currentLang),
                desc: tr("step3Desc", currentLang),
              },
            ].map((s) => (
              <Card
                key={s.step}
                className="border-border bg-surface shadow-card-soft hover:shadow-md transition-all duration-300"
              >
                <CardContent className="p-6 space-y-3">
                  <div className="text-xs font-bold text-teal uppercase tracking-widest">
                    {s.step}
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground leading-snug">
                    {s.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-12">
          <div className="lg:col-span-4 flex flex-col justify-center">
            <Badge variant="secondary" className="rounded-full w-fit">
              FAQ
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
              {tr("faqTitle", currentLang)}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {tr("faqSupportText1", currentLang)}
              <Link
                to="/contact"
                className="text-teal underline underline-offset-4 hover:text-teal/80"
              >
                {tr("support", currentLang)}
              </Link>
              {tr("faqSupportText2", currentLang)}
            </p>
          </div>
          <div className="lg:col-span-8">
            <Accordion type="single" collapsible className="w-full">
              {[
                {
                  q: tr("faq1Q", currentLang),
                  a: tr("faq1A", currentLang),
                },
                {
                  q: tr("faq2Q", currentLang),
                  a: tr("faq2A", currentLang),
                },
                {
                  q: tr("faq3Q", currentLang),
                  a: tr("faq3A", currentLang),
                },
                {
                  q: tr("faq4Q", currentLang),
                  a: tr("faq4A", currentLang),
                },
                {
                  q: tr("faq5Q", currentLang),
                  a: tr("faq5A", currentLang),
                },
                {
                  q: tr("faq6Q", currentLang),
                  a: tr("faq6A", currentLang),
                },
              ].map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border-border/80">
                  <AccordionTrigger className="text-left text-sm font-semibold hover:text-teal hover:no-underline py-3">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs leading-relaxed text-muted-foreground pb-4">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Why Prevention Matters */}
      <section className="border-t border-border bg-surface-muted/10">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <Badge
              variant="secondary"
              className="rounded-full bg-teal/10 text-teal border border-teal/20"
            >
              {tr("publicHealthEvidence", currentLang)}
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {tr("whyPreventionMatters", currentLang)}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {tr("whyPreventionMattersDesc", currentLang)}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 mb-16">
            {/* Stat Card 1: Cardiovascular Disease */}
            <Card className="border border-border/80 bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-teal/30 transition-all duration-300">
              <CardContent className="p-6 space-y-4">
                <div className="font-display text-4xl font-extrabold text-teal">80%</div>
                <div className="space-y-2">
                  <h3 className="font-display text-base font-bold text-foreground">
                    {tr("preventableHeartConditions", currentLang)}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {tr("preventableHeartConditionsDesc", currentLang)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Stat Card 2: Hypertension */}
            <Card className="border border-border/80 bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-teal/30 transition-all duration-300">
              <CardContent className="p-6 space-y-4">
                <div className="font-display text-4xl font-extrabold text-teal">46%</div>
                <div className="space-y-2">
                  <h3 className="font-display text-base font-bold text-foreground">
                    {tr("undiagnosedHypertension", currentLang)}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {tr("undiagnosedHypertensionDesc", currentLang)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Stat Card 3: Type 2 Diabetes */}
            <Card className="border border-border/80 bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-teal/30 transition-all duration-300">
              <CardContent className="p-6 space-y-4">
                <div className="font-display text-4xl font-extrabold text-teal">58%</div>
                <div className="space-y-2">
                  <h3 className="font-display text-base font-bold text-foreground">
                    {tr("reducedDiabetesRisk", currentLang)}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {tr("reducedDiabetesRiskDesc", currentLang)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Natural transition to assessment */}
          <div className="border border-border bg-surface rounded-2xl p-8 max-w-4xl mx-auto text-center space-y-6 shadow-sm">
            <div className="space-y-2 max-w-2xl mx-auto">
              <h3 className="font-display text-xl font-bold text-foreground">
                {tr("assessYourRiskMarkers", currentLang)}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tr("assessYourRiskMarkersDesc", currentLang)}
              </p>
            </div>
            <div className="flex justify-center flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/95 px-6 font-semibold"
              >
                <Link to="/assessment">
                  {tr("startHealthAssessment", currentLang)} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 px-6 text-sm font-semibold hover:bg-accent/40"
              >
                <Link to="/about">{tr("readMethodology", currentLang)}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
