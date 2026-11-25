import { AlarmClock, GitBranchPlus, HeartPulse, Layers, ShieldAlert, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import type { HubTile } from "@/types";

export const DEFAULT_HUB_TILES: HubTile[] = [
  { id: "TILE-processes", label: "Processes", metric: "processes", status: null, health: null, tone: "info" },
  { id: "TILE-healthy", label: "Healthy", metric: "processes", status: null, health: "healthy", tone: "success" },
  { id: "TILE-at-risk", label: "At Risk", metric: "processes", status: null, health: "at_risk", tone: "warning" },
  { id: "TILE-critical", label: "Critical", metric: "processes", status: null, health: "critical", tone: "danger" },
  { id: "TILE-assignments", label: "Active assignments", metric: "assignments", status: "active", health: null, tone: "teal" },
  { id: "TILE-covered", label: "Employees covered", metric: "employees_covered", status: null, health: null, tone: "neutral" },
  { id: "TILE-followups", label: "Follow-ups due", metric: "followups_due", status: null, health: null, tone: "warning" },
];

export const METRIC_LABELS: Record<HubTile["metric"], string> = {
  processes: "Number of processes",
  assignments: "Number of assignments",
  employees_covered: "Employees covered by active assignments",
  followups_due: "Process follow-ups due within 7 days",
};

/** Metrics that only make sense to people who manage processes (hidden from employees, as before). */
export const MANAGER_METRICS: HubTile["metric"][] = ["assignments", "employees_covered"];

export function tileIcon(t: HubTile): LucideIcon {
  if (t.metric === "assignments") return GitBranchPlus;
  if (t.metric === "employees_covered") return Users;
  if (t.metric === "followups_due") return AlarmClock;
  if (t.health === "healthy") return ShieldCheck;
  if (t.health === "at_risk") return HeartPulse;
  if (t.health === "critical") return ShieldAlert;
  return Layers;
}
