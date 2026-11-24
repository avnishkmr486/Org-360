/**
 * Dashboard metrics — derived entirely from the database snapshot.
 * Nothing here is hardcoded; every KPI, series and insight is computed.
 */
import type { AnalyticsFilter, ComplianceTier, Database, DataScope, DateRange, Employee, ISODate } from "@/types";
import {
  computeEmployeeCompliance,
  computeParticipation,
  computeStats,
  employeeMatches,
  filterTasks,
  getIndexes,
  getTier,
  groupStats,
  pct,
  TIER_LABELS,
  type ComplianceStats,
  type EmployeeCompliance,
} from "./compliance";
import { monthBuckets, previousPeriod } from "@/lib/utils/dates";

export interface KpiValue {
  value: number | null;
  previous: number | null;
  delta: number | null;
}

const kpi = (value: number | null, previous: number | null): KpiValue => ({
  value,
  previous,
  delta: value !== null && previous !== null ? Math.round((value - previous) * 10) / 10 : null,
});

export interface GroupRow {
  id: string;
  name: string;
  parentName?: string;
  compliance: number | null;
  previous: number | null;
  delta: number | null;
  tier: ComplianceTier;
  employees: number;
  stats: ComplianceStats;
  participation: number | null;
}

export interface ProcessRow {
  id: string;
  name: string;
  categoryName: string;
  ownerName: string;
  compliance: number | null;
  threshold: number;
  stats: ComplianceStats;
}

export interface TrendPoint {
  key: string;
  label: string;
  range: DateRange;
  compliance: number | null;
  participation: number | null;
  onTimeRate: number | null;
  completed: number;
  due: number;
  overdue: number;
}

export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral";
  title: string;
  headline: string;
  detail: string;
  href: string;
}

export interface DashboardMetrics {
  range: DateRange;
  previousRange: DateRange;
  employeesInScope: Employee[];
  kpis: {
    totalEmployees: number;
    activeEmployees: number;
    departments: number;
    teams: number;
    activeProcesses: number;
    compliance: KpiValue;
    participation: KpiValue;
    compliantEmployees: KpiValue;
    nonCompliantEmployees: KpiValue;
    overdueTasks: KpiValue;
    noApplicableTasks: number;
  };
  stats: ComplianceStats;
  previousStats: ComplianceStats;
  trend: TrendPoint[];
  departments: GroupRow[];
  teams: GroupRow[];
  processes: ProcessRow[];
  distribution: { tier: ComplianceTier; label: string; count: number }[];
  employees: EmployeeCompliance[];
  insights: Insight[];
}

export const fullName = (e: Pick<Employee, "firstName" | "lastName">) => `${e.firstName} ${e.lastName}`;

export function getDashboardMetrics(db: Database, filter: AnalyticsFilter, scope: DataScope | null, today: ISODate): DashboardMetrics {
  const { thresholds } = db.settings;
  const idx = getIndexes(db);
  const range = filter.range;
  const prevRange = previousPeriod(range);

  const tasks = filterTasks(db, filter, scope);
  const prevTasks = filterTasks(db, { ...filter, range: prevRange }, scope);
  const stats = computeStats(tasks, today);
  const previousStats = computeStats(prevTasks, today);

  const employeesInScope = db.employees.filter((e) => employeeMatches(e, filter, scope));
  const activeEmployees = employeesInScope.filter((e) => e.status === "active");

  // Per-employee compliance (active employees only).
  const employees = computeEmployeeCompliance(activeEmployees, tasks, today, thresholds);
  const prevEmployees = computeEmployeeCompliance(activeEmployees, prevTasks, today, thresholds);
  const compliantOf = (rows: EmployeeCompliance[]) => rows.filter((r) => r.stats.compliance !== null && r.stats.compliance >= thresholds.good).length;
  const nonCompliantOf = (rows: EmployeeCompliance[]) => rows.filter((r) => r.stats.compliance !== null && r.stats.compliance < thresholds.good).length;

  const participation = computeParticipation(tasks, today);
  const prevParticipation = computeParticipation(prevTasks, today);

  // Organizational counts respecting filters/scope.
  const deptIds = new Set(employeesInScope.map((e) => e.departmentId));
  const teamIds = new Set(employeesInScope.map((e) => e.teamId).filter(Boolean) as string[]);
  const departmentsList = db.departments.filter((d) => d.status === "active" && (filter.departmentId ? d.id === filter.departmentId : scope?.departmentIds ? scope.departmentIds.includes(d.id) : true) && (scope?.teamIds || scope?.employeeIds ? deptIds.has(d.id) : true));
  const teamsList = db.teams.filter((t) => t.status === "active" && departmentsList.some((d) => d.id === t.departmentId) && (filter.teamId ? t.id === filter.teamId : scope?.teamIds ? scope.teamIds.includes(t.id) : true) && (scope?.employeeIds ? teamIds.has(t.id) : true));

  const employeeFilterActive = Boolean(filter.departmentId || filter.teamId || filter.employeeId || filter.bandId || scope?.departmentIds || scope?.teamIds || scope?.employeeIds);
  const processIdsWithTasks = new Set(tasks.map((t) => t.processId));
  const activeProcesses = db.processes.filter(
    (p) =>
      p.status === "active" &&
      (!filter.processId || p.id === filter.processId) &&
      (!filter.processCategoryId || p.categoryId === filter.processCategoryId) &&
      (!filter.processStatus || p.status === filter.processStatus) &&
      (!employeeFilterActive || processIdsWithTasks.has(p.id)),
  ).length;

  // Group rows.
  const deptOf = (id: string) => idx.employees.get(id)?.departmentId;
  const teamOf = (id: string) => idx.employees.get(id)?.teamId ?? null;
  const byDept = groupStats(tasks, (t) => deptOf(t.employeeId), today);
  const byDeptPrev = groupStats(prevTasks, (t) => deptOf(t.employeeId), today);
  const byTeam = groupStats(tasks, (t) => teamOf(t.employeeId), today);
  const byTeamPrev = groupStats(prevTasks, (t) => teamOf(t.employeeId), today);
  const empty = computeStats([], today);

  const participationBy = (key: (empId: string) => string | null | undefined) => {
    const m = new Map<string, number | null>();
    const groups = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const k = key(t.employeeId);
      if (!k) continue;
      const g = groups.get(k);
      if (g) g.push(t);
      else groups.set(k, [t]);
    }
    for (const [k, g] of groups) m.set(k, computeParticipation(g, today).rate);
    return m;
  };
  const deptParticipation = participationBy(deptOf);
  const teamParticipation = participationBy(teamOf);

  const departments: GroupRow[] = departmentsList.map((d) => {
    const s = byDept.get(d.id) ?? empty;
    const prev = byDeptPrev.get(d.id)?.compliance ?? null;
    return {
      id: d.id,
      name: d.name,
      compliance: s.compliance,
      previous: prev,
      delta: s.compliance !== null && prev !== null ? Math.round((s.compliance - prev) * 10) / 10 : null,
      tier: getTier(s.compliance, thresholds),
      employees: activeEmployees.filter((e) => e.departmentId === d.id).length,
      stats: s,
      participation: deptParticipation.get(d.id) ?? null,
    };
  });

  const deptName = new Map(db.departments.map((d) => [d.id, d.name]));
  const teams: GroupRow[] = teamsList.map((t) => {
    const s = byTeam.get(t.id) ?? empty;
    const prev = byTeamPrev.get(t.id)?.compliance ?? null;
    return {
      id: t.id,
      name: t.name,
      parentName: deptName.get(t.departmentId),
      compliance: s.compliance,
      previous: prev,
      delta: s.compliance !== null && prev !== null ? Math.round((s.compliance - prev) * 10) / 10 : null,
      tier: getTier(s.compliance, thresholds),
      employees: activeEmployees.filter((e) => e.teamId === t.id).length,
      stats: s,
      participation: teamParticipation.get(t.id) ?? null,
    };
  });

  const byProcess = groupStats(tasks, (t) => t.processId, today);
  const catName = new Map(db.processCategories.map((c) => [c.id, c.name]));
  const processes: ProcessRow[] = [...byProcess.entries()].map(([id, s]) => {
    const p = idx.processes.get(id)!;
    const owner = idx.employees.get(p.ownerId);
    return {
      id,
      name: p.name,
      categoryName: catName.get(p.categoryId) ?? "—",
      ownerName: owner ? fullName(owner) : "—",
      compliance: s.compliance,
      threshold: p.complianceThreshold,
      stats: s,
    };
  });

  // Monthly trend (6 months ending at range end), honoring all non-date filters.
  const allTasks = filterTasks(db, filter, scope, { ignoreRange: true });
  const trend: TrendPoint[] = monthBuckets(range.to > today ? today : range.to, 6).map((b) => {
    const mt = allTasks.filter((t) => t.dueDate >= b.range.from && t.dueDate <= b.range.to);
    const s = computeStats(mt, today);
    return {
      key: b.key,
      label: b.label,
      range: b.range,
      compliance: s.compliance,
      participation: computeParticipation(mt, today).rate,
      onTimeRate: s.onTimeRate,
      completed: s.completed,
      due: s.due,
      overdue: s.overdue,
    };
  });

  const counts: Record<ComplianceTier, number> = { excellent: 0, good: 0, needs_improvement: 0, critical: 0, na: 0 };
  for (const e of employees) counts[e.tier]++;
  const distribution = (["excellent", "good", "needs_improvement", "critical"] as ComplianceTier[]).map((tier) => ({ tier, label: TIER_LABELS[tier], count: counts[tier] }));

  const insights = buildInsights({ departments, teams, processes, employees, trend, thresholds: thresholds.good });

  return {
    range,
    previousRange: prevRange,
    employeesInScope,
    kpis: {
      totalEmployees: employeesInScope.length,
      activeEmployees: activeEmployees.length,
      departments: departmentsList.length,
      teams: teamsList.length,
      activeProcesses,
      compliance: kpi(stats.compliance, previousStats.compliance),
      participation: kpi(participation.rate, prevParticipation.rate),
      compliantEmployees: kpi(compliantOf(employees), compliantOf(prevEmployees)),
      nonCompliantEmployees: kpi(nonCompliantOf(employees), nonCompliantOf(prevEmployees)),
      overdueTasks: kpi(stats.overdue, previousStats.overdue),
      noApplicableTasks: counts.na,
    },
    stats,
    previousStats,
    trend,
    departments,
    teams,
    processes,
    distribution,
    employees,
    insights,
  };
}

function buildInsights(input: {
  departments: GroupRow[];
  teams: GroupRow[];
  processes: ProcessRow[];
  employees: EmployeeCompliance[];
  trend: TrendPoint[];
  thresholds: number;
}): Insight[] {
  const out: Insight[] = [];
  const rated = input.departments.filter((d) => d.compliance !== null).sort((a, b) => b.compliance! - a.compliance!);
  if (rated.length) {
    const top = rated[0];
    out.push({ id: "dept-top", tone: "positive", title: "Highest compliance department", headline: top.name, detail: `${top.compliance!.toFixed(1)}% compliance across ${top.stats.due} due tasks.`, href: `/departments/${top.id}` });
  }
  if (rated.length > 1) {
    const low = rated[rated.length - 1];
    out.push({ id: "dept-low", tone: low.compliance! < input.thresholds ? "negative" : "neutral", title: "Lowest compliance department", headline: low.name, detail: `${low.compliance!.toFixed(1)}% compliance · ${low.stats.overdue} overdue tasks.`, href: `/departments/${low.id}` });
  }
  const improving = input.teams.filter((t) => (t.delta ?? 0) > 0.5).sort((a, b) => b.delta! - a.delta!).slice(0, 3);
  if (improving.length) {
    out.push({ id: "teams-up", tone: "positive", title: "Teams showing improvement", headline: improving.map((t) => t.name).join(", "), detail: improving.map((t) => `${t.name} +${t.delta!.toFixed(1)} pts`).join(" · ") + " vs previous period.", href: `/teams/${improving[0].id}` });
  }
  const attention = input.teams.filter((t) => t.compliance !== null && t.compliance < input.thresholds).sort((a, b) => a.compliance! - b.compliance!).slice(0, 3);
  if (attention.length) {
    out.push({ id: "teams-attn", tone: "negative", title: "Teams requiring attention", headline: attention.map((t) => t.name).join(", "), detail: attention.map((t) => `${t.name} ${t.compliance!.toFixed(1)}%`).join(" · ") + ` (target ${input.thresholds}%).`, href: `/teams/${attention[0].id}` });
  }
  const overdueProc = [...input.processes].sort((a, b) => b.stats.overdue - a.stats.overdue)[0];
  if (overdueProc && overdueProc.stats.overdue > 0) {
    out.push({ id: "proc-overdue", tone: "negative", title: "Process with most overdue tasks", headline: overdueProc.name, detail: `${overdueProc.stats.overdue} overdue tasks · owner ${overdueProc.ownerName}.`, href: `/compliance?process=${overdueProc.id}&status=overdue` });
  }
  const stars = input.employees.filter((e) => e.tier === "excellent" && e.stats.due >= 3).sort((a, b) => b.stats.compliance! - a.stats.compliance! || b.stats.completed - a.stats.completed).slice(0, 4);
  if (stars.length) {
    out.push({ id: "emp-stars", tone: "positive", title: "Employees with outstanding compliance", headline: stars.map((s) => fullName(s.employee)).join(", "), detail: `${stars.length} employees at ≥ excellent threshold with full on-time records.`, href: `/performance` });
  }
  const t = input.trend.filter((p) => p.compliance !== null);
  if (t.length >= 2) {
    const last = t[t.length - 1];
    const prev = t[t.length - 2];
    const d = Math.round((last.compliance! - prev.compliance!) * 10) / 10;
    out.push({ id: "mom", tone: d >= 0 ? "positive" : "negative", title: "Month-over-month compliance", headline: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`, detail: `${prev.label}: ${prev.compliance!.toFixed(1)}% → ${last.label}: ${last.compliance!.toFixed(1)}%.`, href: `/reports/monthly-trend` });
  }
  return out;
}

/** Convenience: overall participation % for a set of filters. */
export function participationRate(db: Database, filter: AnalyticsFilter, scope: DataScope | null, today: ISODate): number | null {
  return computeParticipation(filterTasks(db, filter, scope), today).rate;
}

export { pct };
