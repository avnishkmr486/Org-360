/**
 * Process health — a one-glance indicator combining adherence and governance.
 *
 *  - Adherence: compliance over the last 90 days vs the process's own threshold.
 *      ≥ threshold            → Healthy
 *      within 10 pts below    → At risk
 *      more than 10 pts below → Critical
 *  - Governance: an overdue follow-up or overdue review downgrades Healthy → At risk.
 *  - Draft / inactive / expired processes are "Not active"; no due tasks = "No data".
 */
import type { ComplianceTask, ISODate, Process } from "@/types";
import { computeStats, groupStats, type ComplianceStats } from "./compliance";
import { addDaysISO } from "@/lib/utils/dates";

export type ProcessHealth = "healthy" | "at_risk" | "critical" | "no_data" | "not_active";

export interface HealthResult {
  health: ProcessHealth;
  compliance: number | null;
  threshold: number;
  stats: ComplianceStats;
  /** Plain-language reasons shown in tooltips. */
  reasons: string[];
}

export const HEALTH_WINDOW_DAYS = 90;

export const HEALTH_META: Record<ProcessHealth, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  healthy: { label: "Healthy", tone: "success" },
  at_risk: { label: "At risk", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
  no_data: { label: "No data", tone: "neutral" },
  not_active: { label: "Not active", tone: "neutral" },
};

export function evaluateHealth(process: Process, stats: ComplianceStats, today: ISODate): HealthResult {
  const reasons: string[] = [];
  const base = { compliance: stats.compliance, threshold: process.complianceThreshold, stats };

  if (process.status !== "active" || (process.expiryDate !== null && process.expiryDate < today)) {
    return { ...base, health: "not_active", reasons: [process.status !== "active" ? `Process is ${process.status.replace("_", " ")}.` : "Process has expired."] };
  }
  if (stats.compliance === null) {
    return { ...base, health: "no_data", reasons: ["No tasks were due in the last 90 days."] };
  }

  const gap = process.complianceThreshold - stats.compliance;
  let health: ProcessHealth;
  if (gap <= 0) {
    health = "healthy";
    reasons.push(`Compliance ${stats.compliance.toFixed(1)}% meets the ${process.complianceThreshold}% target.`);
  } else if (gap <= 10) {
    health = "at_risk";
    reasons.push(`Compliance ${stats.compliance.toFixed(1)}% is ${gap.toFixed(1)} pts below the ${process.complianceThreshold}% target.`);
  } else {
    health = "critical";
    reasons.push(`Compliance ${stats.compliance.toFixed(1)}% is ${gap.toFixed(1)} pts below the ${process.complianceThreshold}% target.`);
  }
  if (stats.overdue > 0) reasons.push(`${stats.overdue} overdue task${stats.overdue === 1 ? "" : "s"}.`);

  const followUpOverdue = process.followUpDate !== null && process.followUpDate < today;
  const reviewOverdue = process.nextReviewDate !== null && process.nextReviewDate < today;
  if (followUpOverdue) reasons.push(`Follow-up was due ${process.followUpDate}.`);
  if (reviewOverdue) reasons.push(`Review was due ${process.nextReviewDate}.`);
  if (health === "healthy" && (followUpOverdue || reviewOverdue)) health = "at_risk";

  return { ...base, health, reasons };
}

/** Health for every process, computed in one pass over the task list. */
export function computeAllProcessHealth(processes: readonly Process[], tasks: readonly ComplianceTask[], today: ISODate): Map<string, HealthResult> {
  const from = addDaysISO(today, -HEALTH_WINDOW_DAYS);
  const recent = tasks.filter((t) => t.dueDate >= from && t.dueDate <= today);
  const byProcess = groupStats(recent, (t) => t.processId, today);
  const empty = computeStats([], today);
  return new Map(processes.map((p) => [p.id, evaluateHealth(p, byProcess.get(p.id) ?? empty, today)]));
}
