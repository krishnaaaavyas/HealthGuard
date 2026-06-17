import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHealthResult, useProfile, useHistory } from "@/lib/health-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, HeartPulse } from "lucide-react";
import jsPDF from "jspdf";
import { EmptyState, LedgerTable, RiskLedgerTable } from "./_app.dashboard";

const CHART_GREEN = "oklch(0.62 0.13 155)";
const CHART_AMBER = "oklch(0.74 0.15 70)";
const CHART_RED = "oklch(0.58 0.21 25)";

function colorFor(score: number) {
  if (score < 33) return CHART_GREEN;
  if (score < 66) return CHART_AMBER;
  return CHART_RED;
}
function levelFor(score: number) {
  if (score < 33) return "Low";
  if (score < 66) return "Moderate";
  return "High";
}

export const Route = createFileRoute("/_app/report")({
  component: ReportPage,
});

function ReportPage() {
  useEffect(() => {
    document.title = "Health Report — HealthGuard";
  }, []);
  const [resultMaybe] = useHealthResult();
  const [profileMaybe] = useProfile();
  const [history] = useHistory();

  if (!resultMaybe || !profileMaybe) return <EmptyState />;
  const result = resultMaybe;
  const profile = profileMaybe;

  const overallColor =
    result.overallRisk === "Low"
      ? CHART_GREEN
      : result.overallRisk === "Moderate"
        ? CHART_AMBER
        : CHART_RED;

  function download() {
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
    doc.text("HealthGuard Clinical Report", margin, 40);
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
        doc.text("HealthGuard Clinical Report (cont.)", margin, margin - 15);
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
    title("Patient profile");
    [
      `Age: ${profile.age}    Gender: ${profile.gender}`,
      `Height: ${profile.heightCm} cm    Weight: ${profile.weightKg} kg    BMI: ${result.bmi}`,
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
    doc.setTextColor(40);

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

    // Longitudinal progress summary if history exists
    if (history && history.length >= 2) {
      const baseline = history[0];
      const latest = history[history.length - 1];
      const weightDiff = latest.weightKg - baseline.weightKg;
      const scoreDiff = latest.overallScore - baseline.overallScore;

      title("Longitudinal Progress & Trends");
      ensureSpace(120);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Metric", margin, y);
      doc.text("Baseline", margin + 140, y);
      doc.text("Current", margin + 240, y);
      doc.text("Absolute Change", margin + 340, y);
      y += 8;
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      // Body Weight
      doc.text("Body Weight", margin, y);
      doc.text(`${baseline.weightKg.toFixed(1)} kg`, margin + 140, y);
      doc.text(`${latest.weightKg.toFixed(1)} kg`, margin + 240, y);
      doc.text(`${weightDiff >= 0 ? "+" : ""}${weightDiff.toFixed(1)} kg`, margin + 340, y);
      y += 16;

      // BMI
      doc.text("Body Mass Index (BMI)", margin, y);
      doc.text(`${baseline.bmi.toFixed(1)}`, margin + 140, y);
      doc.text(`${latest.bmi.toFixed(1)}`, margin + 240, y);
      const bmiDiff = latest.bmi - baseline.bmi;
      doc.text(`${bmiDiff >= 0 ? "+" : ""}${bmiDiff.toFixed(1)}`, margin + 340, y);
      y += 16;

      // Overall Risk Score
      doc.text("Overall Risk Score", margin, y);
      doc.text(`${baseline.overallScore}/80`, margin + 140, y);
      doc.text(`${latest.overallScore}/80`, margin + 240, y);
      doc.text(`${scoreDiff >= 0 ? "+" : ""}${scoreDiff} pts`, margin + 340, y);
      y += 24;

      // Milestones achieved list
      const milestonesList: string[] = [];
      if (baseline.weightKg - latest.weightKg >= 5) {
        milestonesList.push(
          `🎉 Weight Loss Milestone: Lost ${(baseline.weightKg - latest.weightKg).toFixed(1)}kg since first assessment.`,
        );
      }
      if (baseline.overallScore - latest.overallScore >= 10) {
        milestonesList.push(
          `🎉 Risk Reduction Milestone: Overall risk score reduced by ${baseline.overallScore - latest.overallScore} points.`,
        );
      }
      if (milestonesList.length > 0) {
        ensureSpace(60);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("HEALTH MILESTONES ACHIEVED", margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        milestonesList.forEach((m) => {
          para(m);
        });
        y += 10;
      }
    }

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge
            variant="secondary"
            className="rounded-full bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20"
          >
            Clinical report
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Your health report
          </h1>
          <p className="mt-2 text-muted-foreground">
            Share this with your physician at your next visit.
          </p>
        </div>
        <Button
          onClick={download}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow transition-all font-semibold"
        >
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* Report preview */}
      <Card className="overflow-hidden border-border bg-surface shadow-elevated">
        <div className="flex items-center justify-between bg-primary px-8 py-6 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary-foreground/10">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-bold">HealthGuard Clinical Report</div>
              <div className="text-xs text-primary-foreground/70">
                AI-assisted preventive health assessment
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-primary-foreground/70">
            {new Date().toLocaleString()}
          </div>
        </div>

        <CardContent className="space-y-8 p-8">
          <Section title="Patient profile">
            <LedgerTable
              items={[
                {
                  parameter: "Age",
                  value: `${profile.age} yrs`,
                  reference: "Adult baseline",
                  status: "Demographic",
                },
                {
                  parameter: "Gender",
                  value: profile.gender,
                  reference: "Metabolic standard",
                  status: "Recorded",
                },
                {
                  parameter: "Height",
                  value: `${profile.heightCm} cm`,
                  reference: "Demographic standard",
                  status: "Recorded",
                },
                {
                  parameter: "Weight",
                  value: `${profile.weightKg} kg`,
                  reference: "Subject baseline",
                  status: "Recorded",
                },
                {
                  parameter: "Body Mass Index (BMI)",
                  value: `${result.bmi}`,
                  reference: "18.5 – 24.9 optimal",
                  status: result.bmi >= 18.5 && result.bmi < 25 ? "Optimal" : "Review",
                  statusColor:
                    result.bmi >= 18.5 && result.bmi < 25
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning",
                },
                {
                  parameter: "Smoking history",
                  value: profile.smoking,
                  reference: "Non-smoker standard",
                  status: profile.smoking === "never" ? "Optimal" : "Review",
                  statusColor:
                    profile.smoking === "never"
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning",
                },
                {
                  parameter: "Exercise baseline",
                  value: profile.exercise,
                  reference: "3-4x/week active target",
                  status: profile.exercise === "none" ? "Sedentary" : "Active",
                  statusColor:
                    profile.exercise === "none"
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success",
                },
                {
                  parameter: "Hereditary risk markers",
                  value: profile.familyHistory ? "Reported" : "None",
                  reference: "Family history profile",
                  status: profile.familyHistory ? "Review" : "Optimal",
                  statusColor: profile.familyHistory
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success",
                },
                {
                  parameter: "Active symptom tracking",
                  value: profile.symptoms ? "Reported" : "None",
                  reference: "Self-reported concerns",
                  status: profile.symptoms ? "Review" : "Optimal",
                  statusColor: profile.symptoms
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success",
                },
              ]}
            />
          </Section>

          <Section title="Overall risk score">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-5xl font-bold text-primary">
                {result.overallScore}
                <span className="text-xl text-muted-foreground">/80</span>
              </span>
              <span
                className="text-sm font-semibold text-muted-foreground"
                style={{ color: overallColor }}
              >
                {result.overallRisk} risk
              </span>
            </div>
          </Section>

          {history && history.length >= 2 && (
            <Section title="Longitudinal Progress & Trends">
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
                  <span className="text-xs text-muted-foreground font-semibold uppercase font-display">
                    Weight Evolution
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-foreground">
                      {history[history.length - 1].weightKg} kg
                    </span>
                    <span className="text-xs text-muted-foreground">
                      vs {history[0].weightKg} kg baseline
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold mt-1.5 block ${history[history.length - 1].weightKg - history[0].weightKg <= 0 ? "text-success" : "text-danger"}`}
                  >
                    {history[history.length - 1].weightKg - history[0].weightKg <= 0
                      ? `▼ ${(history[0].weightKg - history[history.length - 1].weightKg).toFixed(1)} kg lost`
                      : `▲ ${(history[history.length - 1].weightKg - history[0].weightKg).toFixed(1)} kg gained`}
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
                  <span className="text-xs text-muted-foreground font-semibold uppercase font-display">
                    Risk Score Change
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-foreground">
                      {history[history.length - 1].overallScore} pts
                    </span>
                    <span className="text-xs text-muted-foreground">
                      vs {history[0].overallScore} pts baseline
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold mt-1.5 block ${history[history.length - 1].overallScore - history[0].overallScore <= 0 ? "text-success" : "text-warning"}`}
                  >
                    {history[history.length - 1].overallScore - history[0].overallScore <= 0
                      ? `▼ ${history[0].overallScore - history[history.length - 1].overallScore} pts improved`
                      : `▲ ${history[history.length - 1].overallScore - history[0].overallScore} pts increased`}
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-surface-muted/60 p-4 sm:col-span-2 md:col-span-1">
                  <span className="text-xs text-muted-foreground font-semibold uppercase font-display">
                    BMI Evolution
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-foreground">
                      {history[history.length - 1].bmi.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      vs {history[0].bmi.toFixed(1)} baseline
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold mt-1.5 block ${history[history.length - 1].bmi - history[0].bmi <= 0 ? "text-success" : "text-warning"}`}
                  >
                    {history[history.length - 1].bmi - history[0].bmi <= 0
                      ? `▼ ${(history[0].bmi - history[history.length - 1].bmi).toFixed(1)} points improved`
                      : `▲ ${(history[history.length - 1].bmi - history[0].bmi).toFixed(1)} points increased`}
                  </span>
                </div>
              </div>
            </Section>
          )}

          <Section title="Per-condition risk breakdown">
            <RiskLedgerTable
              items={[
                {
                  condition: "Diabetes (Type 2)",
                  score: result.risk.diabetes,
                  classification: levelFor(result.risk.diabetes),
                  color: colorFor(result.risk.diabetes),
                  rationale: result.rationale.diabetes,
                },
                {
                  condition: "Heart Disease",
                  score: result.risk.heartDisease,
                  classification: levelFor(result.risk.heartDisease),
                  color: colorFor(result.risk.heartDisease),
                  rationale: result.rationale.heartDisease,
                },
                {
                  condition: "Hypertension",
                  score: result.risk.hypertension,
                  classification: levelFor(result.risk.hypertension),
                  color: colorFor(result.risk.hypertension),
                  rationale: result.rationale.hypertension,
                },
              ]}
            />
          </Section>

          <Section title="Recommendations">
            <Sub heading="Diet">{result.dietPlan}</Sub>
            <Sub heading="Exercise">{result.exercisePlan}</Sub>
            <Sub heading="Prevention">{result.preventionTips}</Sub>
          </Section>

          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Disclaimer: This report contains AI-generated estimates produced for educational and
            preventive purposes. It is not a clinical diagnosis and does not replace consultation
            with a qualified medical professional.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
        {title}
      </div>
      {children}
    </section>
  );
}

function Sub({ heading, children }: { heading: string; children: string }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="font-display text-sm font-semibold text-foreground">{heading}</div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {children.replace(/[#*`>]/g, "").trim()}
      </p>
    </div>
  );
}
