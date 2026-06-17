export interface BehaviorSignal {
  type:
    | "risk_stagnant_30_days"
    | "risk_improved"
    | "repeated_high_sugar_scans"
    | "simulates_but_no_progress"
    | "missed_progress_logging";
  severity: "low" | "medium" | "positive";
  insight: string;
}

export class BehaviorService {
  /**
   * Run rule-based behavior logic on user history collections from last 30 days.
   */
  static analyzeBehavior({
    progressLogs,
    simulations,
    foodScans,
  }: {
    progressLogs: any[];
    simulations: any[];
    foodScans: any[];
  }): BehaviorSignal[] {
    const signals: BehaviorSignal[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Sort progress logs ascending by date
    const sortedLogs = [...progressLogs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const logsLast30Days = sortedLogs.filter((log) => new Date(log.createdAt) >= thirtyDaysAgo);

    // 1. Check missed progress logging
    if (sortedLogs.length === 0) {
      signals.push({
        type: "missed_progress_logging",
        severity: "low",
        insight: "It has been a while since your last progress update.",
      });
    } else {
      const latestLog = sortedLogs[sortedLogs.length - 1];
      if (new Date(latestLog.createdAt) < fourteenDaysAgo) {
        signals.push({
          type: "missed_progress_logging",
          severity: "low",
          insight: "It has been a while since your last progress update.",
        });
      }
    }

    // 2. Check risk stagnant or improved (requires at least 2 logs in the last 30 days)
    if (logsLast30Days.length >= 2) {
      const earliestLog = logsLast30Days[0];
      const latestLog = logsLast30Days[logsLast30Days.length - 1];
      const diff = earliestLog.overallRisk - latestLog.overallRisk; // positive is improvement

      if (diff >= 5) {
        signals.push({
          type: "risk_improved",
          severity: "positive",
          insight: `Your overall risk has improved by ${diff} points.`,
        });
      } else if (Math.abs(diff) < 3) {
        signals.push({
          type: "risk_stagnant_30_days",
          severity: "medium",
          insight: "Your risk score has not changed much in the last 30 days.",
        });
      }
    }

    // 3. Check repeated high-risk/sugar food scans (score <= 3 in 30 days)
    const recentScans = foodScans.filter((scan) => new Date(scan.createdAt) >= thirtyDaysAgo);
    const lowScoreScans = recentScans.filter((scan) => (scan.personalizedScore ?? scan.score) <= 3);
    if (lowScoreScans.length >= 3) {
      signals.push({
        type: "repeated_high_sugar_scans",
        severity: "medium",
        insight: "Several recent scanned foods conflict with your risk goals.",
      });
    }

    // 4. Check simulation without action
    const recentSims = simulations.filter((sim) => new Date(sim.createdAt) >= thirtyDaysAgo);
    if (recentSims.length >= 3 && logsLast30Days.length === 0) {
      signals.push({
        type: "simulates_but_no_progress",
        severity: "medium",
        insight: "You explored improvement plans but haven't logged progress yet.",
      });
    }

    return signals;
  }
}
