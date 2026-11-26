import {
  Activity, AlarmClock, BadgeCheck, Boxes, Building2, CheckCircle2, ClipboardList, Clock, Contact, FileClock, Gauge, Handshake, Hourglass, Layers, Link2, ListChecks, Package, Plug,
  ShieldCheck, ShoppingCart, Star, ThumbsUp, TimerReset, Unlink, UserCheck, UserMinus, UserRoundX, UserX, Users, UsersRound, Workflow, XCircle, type LucideIcon,
} from "lucide-react";
import type { DashboardKey, Database } from "@/types";
import type { DashboardMetrics } from "@/lib/calculations/dashboard";
import type { Tone } from "@/lib/constants";
import { formatNumber, formatPercent } from "@/lib/utils/format";

/** What a dashboard hands to the catalog so each KPI can work out its value. */
export interface KpiContext {
  db: Database;
  m: DashboardMetrics;
  /** Appends the dashboard's current filters to a link. */
  q: (extra?: Record<string, string>) => string;
  threshold: number;
}

export interface KpiResult {
  value: string | number;
  hint?: string;
  delta?: number | null;
  deltaUnit?: string;
  goodWhen?: "up" | "down";
  href?: string;
}

export interface KpiDef {
  id: string;
  label: string;
  group: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  compute: (c: KpiContext) => KpiResult;
}

export const DASHBOARD_KEYS: { key: DashboardKey; label: string }[] = [
  { key: "executive", label: "Executive Dashboard" },
  { key: "department", label: "Department Dashboard" },
  { key: "team", label: "Team Dashboard" },
];

/** What each dashboard showed before it became configurable. */
export const DEFAULT_DASHBOARD_KPIS: Record<DashboardKey, string[]> = {
  executive: ["emp.total", "emp.active", "org.departments", "org.teams", "proc.active", "cmp.compliance", "cmp.participation", "emp.compliant", "emp.noncompliant", "cmp.overdue"],
  department: ["emp.active", "org.teams", "proc.inview", "cmp.compliance", "cmp.participation", "cmp.pending", "cmp.overdue", "cmp.awaiting"],
  team: ["emp.active", "cmp.compliance", "cmp.participation", "proc.inview", "cmp.pending", "cmp.overdue"],
};

const ECO_ICONS: Record<string, LucideIcon> = { product: Package, client: Handshake, module: Layers, integration: Plug, pos: ShoppingCart };
const ecoIcon = (name: string) => ECO_ICONS[Object.keys(ECO_ICONS).find((k) => name.toLowerCase().includes(k)) ?? ""] ?? Boxes;

const pct = (v: number | null) => formatPercent(v);

const C = "Compliance & tasks";
const P = "People";
const O = "Organization";
const R = "Processes";
const E = "Clients, modules & integrations";

/** Every KPI that can be put on a dashboard. The ecosystem ones follow whatever types the organization has defined. */
export function buildKpiCatalog(db: Database): KpiDef[] {
  const list: KpiDef[] = [
    { id: "cmp.compliance", group: C, label: "Overall Compliance", description: "Completed required tasks as a share of tasks due, with change vs the previous period.", icon: ShieldCheck, tone: "info", compute: ({ m, q }) => ({ value: pct(m.kpis.compliance.value), delta: m.kpis.compliance.delta, hint: "vs prev. period", href: `/compliance${q()}` }) },
    { id: "cmp.participation", group: C, label: "Participation", description: "Share of employees who submitted at least one task.", icon: Activity, tone: "teal", compute: ({ m }) => ({ value: pct(m.kpis.participation.value), delta: m.kpis.participation.delta, hint: "submitted ≥ 1 task" }) },
    { id: "cmp.overdue", group: C, label: "Overdue Tasks", description: "Tasks past their due date and not completed.", icon: AlarmClock, tone: "danger", compute: ({ m, q }) => ({ value: m.kpis.overdueTasks.value ?? 0, delta: m.kpis.overdueTasks.delta, deltaUnit: "", goodWhen: "down", hint: "vs prev. period", href: `/compliance${q({ status: "overdue" })}` }) },
    { id: "cmp.pending", group: C, label: "Pending Tasks", description: "Open tasks that are not yet late.", icon: ClipboardList, tone: "warning", compute: ({ m, q }) => ({ value: m.stats.pending, hint: "open, not yet late", href: `/compliance${q()}` }) },
    { id: "cmp.awaiting", group: C, label: "Awaiting Review", description: "Submitted tasks waiting for a reviewer.", icon: Hourglass, tone: "neutral", compute: ({ m }) => ({ value: m.stats.awaitingReview, hint: "submissions", href: "/compliance/approvals" }) },
    { id: "cmp.completed", group: C, label: "Completed Tasks", description: "Tasks completed in the period.", icon: CheckCircle2, tone: "success", compute: ({ m, q }) => ({ value: formatNumber(m.stats.completed), hint: "in period", href: `/compliance${q({ status: "completed" })}` }) },
    { id: "cmp.total", group: C, label: "Total Tasks", description: "All tasks in the period, whatever their status.", icon: ListChecks, tone: "info", compute: ({ m, q }) => ({ value: formatNumber(m.stats.totalAssigned), hint: "assigned in period", href: `/compliance${q()}` }) },
    { id: "cmp.due", group: C, label: "Tasks Due", description: "Required tasks that fell due in the period (the compliance denominator).", icon: Clock, tone: "neutral", compute: ({ m }) => ({ value: formatNumber(m.stats.due), hint: `${m.stats.completedDue} completed` }) },
    { id: "cmp.rejected", group: C, label: "Rejected Submissions", description: "Submissions a reviewer sent back.", icon: XCircle, tone: "danger", compute: ({ m }) => ({ value: m.stats.rejected, hint: "need rework" }) },
    { id: "cmp.approved", group: C, label: "Approved Tasks", description: "Completed tasks that went through reviewer approval.", icon: ThumbsUp, tone: "teal", compute: ({ m }) => ({ value: m.stats.approved, hint: "via reviewer approval" }) },
    { id: "cmp.ontime", group: C, label: "On-time Rate", description: "Completed tasks that were finished by their due date.", icon: TimerReset, tone: "success", compute: ({ m }) => ({ value: pct(m.stats.onTimeRate), hint: "of completed" }) },
    { id: "cmp.completion", group: C, label: "Completion Rate", description: "Completed tasks as a share of all tasks.", icon: Gauge, tone: "info", compute: ({ m }) => ({ value: pct(m.stats.completionRate), hint: "of all tasks" }) },
    { id: "cmp.quality", group: C, label: "Average Quality", description: "Average reviewer quality rating.", icon: Star, tone: "warning", compute: ({ m }) => ({ value: m.stats.avgQuality === null ? "N/A" : m.stats.avgQuality.toFixed(1), hint: "reviewer rating" }) },

    { id: "emp.total", group: P, label: "Total Employees", description: "Everyone in the current view, including inactive.", icon: Users, tone: "info", compute: ({ m, q }) => ({ value: formatNumber(m.kpis.totalEmployees), hint: "in current view", href: `/employees${q()}` }) },
    { id: "emp.active", group: P, label: "Active Employees", description: "Employees currently active.", icon: UserCheck, tone: "success", compute: ({ m, q }) => ({ value: formatNumber(m.kpis.activeEmployees), hint: `${m.kpis.totalEmployees - m.kpis.activeEmployees} on leave / inactive`, href: `/employees${q({ status: "active" })}` }) },
    { id: "emp.inactive", group: P, label: "Inactive / On Leave", description: "Employees who are not active.", icon: UserMinus, tone: "neutral", compute: ({ m, q }) => ({ value: m.kpis.totalEmployees - m.kpis.activeEmployees, hint: "not active", href: `/employees${q()}` }) },
    { id: "emp.compliant", group: P, label: "Compliant Employees", description: "Employees at or above the Good threshold.", icon: BadgeCheck, tone: "success", compute: ({ m, q, threshold }) => ({ value: m.kpis.compliantEmployees.value ?? 0, delta: m.kpis.compliantEmployees.delta, deltaUnit: "", hint: `≥ ${threshold}%`, href: `/performance${q({ tier: "compliant" })}` }) },
    { id: "emp.noncompliant", group: P, label: "Non-Compliant Employees", description: "Employees below the Good threshold.", icon: UserX, tone: "danger", compute: ({ m, q, threshold }) => ({ value: m.kpis.nonCompliantEmployees.value ?? 0, delta: m.kpis.nonCompliantEmployees.delta, deltaUnit: "", goodWhen: "down", hint: `< ${threshold}%`, href: `/performance${q({ tier: "noncompliant" })}` }) },

    { id: "org.departments", group: O, label: "Departments", description: "Active departments in view.", icon: Building2, tone: "neutral", compute: ({ m }) => ({ value: m.kpis.departments, hint: "active", href: "/departments" }) },
    { id: "org.teams", group: O, label: "Teams", description: "Active teams in view.", icon: UsersRound, tone: "neutral", compute: ({ m, q }) => ({ value: m.kpis.teams, hint: "active", href: `/teams${q()}` }) },
    { id: "org.bands", group: O, label: "Bands", description: "Bands (grades) defined for the organization.", icon: Layers, tone: "neutral", compute: ({ db }) => ({ value: db.bands.length, hint: "defined" }) },

    { id: "proc.active", group: R, label: "Active Processes", description: "Active processes with assignments in view.", icon: Workflow, tone: "teal", compute: ({ m }) => ({ value: m.kpis.activeProcesses, hint: "with assignments in view", href: "/processes?status=active" }) },
    { id: "proc.inview", group: R, label: "Assigned Processes", description: "Processes that have tasks in the period.", icon: Workflow, tone: "teal", compute: ({ m }) => ({ value: m.processes.length, hint: "with tasks in period", href: "/processes" }) },
    { id: "proc.total", group: R, label: "Total Processes", description: "Every process in the organization.", icon: Workflow, tone: "info", compute: ({ db }) => ({ value: db.processes.length, hint: `${db.processes.filter((p) => p.status === "active").length} active`, href: "/processes" }) },
    { id: "proc.review", group: R, label: "Processes Under Review", description: "Processes currently being reviewed.", icon: FileClock, tone: "warning", compute: ({ db }) => ({ value: db.processes.filter((p) => p.status === "under_review").length, hint: "under review", href: "/processes?status=under_review" }) },
    { id: "proc.draft", group: R, label: "Draft Processes", description: "Processes not yet published.", icon: FileClock, tone: "neutral", compute: ({ db }) => ({ value: db.processes.filter((p) => p.status === "draft").length, hint: "not yet active", href: "/processes?status=draft" }) },
    { id: "proc.mandatory", group: R, label: "Mandatory Processes", description: "Active processes that count towards compliance.", icon: ShieldCheck, tone: "info", compute: ({ db }) => ({ value: db.processes.filter((p) => p.isMandatory && p.status === "active").length, hint: "count towards compliance" }) },

    { id: "eco.total", group: E, label: "Ecosystem Entries", description: "Everything recorded in the ecosystem (clients, modules, integrations…).", icon: Boxes, tone: "info", compute: ({ db }) => ({ value: db.ecoEntities.length, hint: `${db.ecoEntities.filter((e) => e.status === "active").length} active`, href: "/ecosystem" }) },
    { id: "eco.relations", group: E, label: "Connections", description: "Links between ecosystem entries (e.g. client uses module).", icon: Link2, tone: "teal", compute: ({ db }) => ({ value: db.ecoRelations.length, hint: "between entries", href: "/ecosystem" }) },
    { id: "eco.noowner", group: E, label: "Entries Without Owner", description: "Ecosystem entries with no internal owner.", icon: UserRoundX, tone: "warning", compute: ({ db }) => ({ value: db.ecoEntities.filter((e) => !e.ownerId).length, hint: "need an owner", href: "/ecosystem" }) },
    { id: "eco.nocontact", group: E, label: "Entries Without Contact", description: "Ecosystem entries with no contact person.", icon: Contact, tone: "warning", compute: ({ db }) => ({ value: db.ecoEntities.filter((e) => !e.contactName.trim()).length, hint: "need a contact", href: "/ecosystem" }) },
    {
      id: "eco.unlinked", group: E, label: "Unlinked Entries", description: "Ecosystem entries not connected to anything.", icon: Unlink, tone: "neutral",
      compute: ({ db }) => {
        const linked = new Set(db.ecoRelations.flatMap((r) => [r.fromId, r.toId]));
        return { value: db.ecoEntities.filter((e) => !linked.has(e.id)).length, hint: "no connections", href: "/ecosystem" };
      },
    },
  ];

  for (const t of db.ecoTypes) {
    const plural = /s$/i.test(t.name) ? t.name : `${t.name}s`;
    const of = (d: Database) => d.ecoEntities.filter((e) => e.typeId === t.id);
    list.push(
      { id: `eco.type:${t.id}`, group: E, label: `Total ${plural}`, description: `Number of ${plural.toLowerCase()} in the ecosystem.`, icon: ecoIcon(t.name), tone: t.tone, compute: ({ db: d }) => ({ value: of(d).length, hint: `${of(d).filter((e) => e.status === "active").length} active`, href: "/ecosystem" }) },
      { id: `eco.active:${t.id}`, group: E, label: `Active ${plural}`, description: `${plural} with status Active.`, icon: ecoIcon(t.name), tone: "success", compute: ({ db: d }) => ({ value: of(d).filter((e) => e.status === "active").length, hint: `of ${of(d).length}`, href: "/ecosystem" }) },
      { id: `eco.planned:${t.id}`, group: E, label: `Planned ${plural}`, description: `${plural} that are planned but not live yet.`, icon: ecoIcon(t.name), tone: "warning", compute: ({ db: d }) => ({ value: of(d).filter((e) => e.status === "planned").length, hint: "not live yet", href: "/ecosystem" }) },
    );
  }
  return list;
}

/** Ids saved for a dashboard that still exist, in order; the original set when nothing was saved. */
export function selectedKpiIds(db: Database, key: DashboardKey, catalog: KpiDef[] = buildKpiCatalog(db)): string[] {
  const saved = db.settings.dashboardKpis?.[key];
  const known = new Set(catalog.map((k) => k.id));
  return (saved ?? DEFAULT_DASHBOARD_KPIS[key]).filter((id) => known.has(id));
}
