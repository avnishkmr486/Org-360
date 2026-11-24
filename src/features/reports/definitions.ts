/**
 * Report definitions — pure functions over (db, filter, scope, today).
 * No React here: the same builders can later run server-side against Supabase.
 */
import type { AnalyticsFilter, ComplianceTask, ComplianceTier, Database, DataScope, Employee, ISODate } from "@/types";
import {
  computeParticipation,
  computeStats,
  employeeMatches,
  filterTasks,
  getEffectiveStatus,
  getIndexes,
  getTier,
  groupStats,
  type ComplianceStats,
} from "@/lib/calculations/compliance";
import { getDashboardMetrics } from "@/lib/calculations/dashboard";
import { daysBetween, monthBuckets, previousPeriod } from "@/lib/utils/dates";

export type ReportId =
  | "organization"
  | "department"
  | "team"
  | "employee"
  | "process-adherence"
  | "overdue"
  | "participation"
  | "monthly-trend"
  | "band"
  | "process-owner";

export type CellFormat = "text" | "number" | "percent" | "date" | "delta";
export type ReportFilterKey = "department" | "team" | "employee" | "band" | "category" | "process";

export interface ReportColumn {
  key: string;
  header: string;
  format?: CellFormat;
  align?: "left" | "right";
  width?: number;
}

export type ReportRow = Record<string, string | number | null | undefined> & { _id: string; _href?: string; _tier?: ComplianceTier };

export type ChartSpec =
  | { kind: "compliance-bars"; data: { id: string; name: string; compliance: number | null; tier: ComplianceTier; due?: number; overdue?: number }[]; hrefPrefix?: string }
  | { kind: "trend"; data: { key: string; label: string; compliance: number | null; participation: number | null; onTimeRate: number | null; completed: number; due: number }[] }
  | { kind: "count-bars"; label: string; data: { id: string; name: string; value: number }[] };

export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: { label: string; value: string }[];
  chart?: ChartSpec;
  chartTitle?: string;
  note?: string;
}

export interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  icon: "building" | "layers" | "users" | "user" | "workflow" | "alarm" | "activity" | "trend" | "award" | "briefcase" | "crown";
  group: "Organization" | "People" | "Process";
  filters: ReportFilterKey[];
  build: (db: Database, filter: AnalyticsFilter, scope: DataScope | null, today: ISODate) => ReportResult;
}

const p = (v: number | null) => (v === null ? "N/A" : `${v.toFixed(1)}%`);
const name = (e: Employee | undefined) => (e ? `${e.firstName} ${e.lastName}` : "—");

function groupReport(
  db: Database,
  filter: AnalyticsFilter,
  scope: DataScope | null,
  today: ISODate,
  groups: { id: string; name: string; parent?: string; href?: string; members: (e: Employee) => boolean }[],
  firstHeader: string,
): ReportResult {
  const idx = getIndexes(db);
  const tasks = filterTasks(db, filter, scope);
  const prev = filterTasks(db, { ...filter, range: previousPeriod(filter.range) }, scope);
  const rows: ReportRow[] = [];
  for (const g of groups) {
    const t = tasks.filter((x) => g.members(idx.employees.get(x.employeeId)!));
    const pt = prev.filter((x) => g.members(idx.employees.get(x.employeeId)!));
    const s = computeStats(t, today);
    const ps = computeStats(pt, today);
    const part = computeParticipation(t, today);
    const employees = db.employees.filter((e) => e.status === "active" && g.members(e) && employeeMatches(e, filter, scope)).length;
    if (!employees && !t.length) continue;
    rows.push({
      _id: g.id,
      _href: g.href,
      _tier: getTier(s.compliance, db.settings.thresholds),
      name: g.name,
      parent: g.parent ?? null,
      employees,
      due: s.due,
      completed: s.completedDue,
      compliance: s.compliance,
      previous: ps.compliance,
      change: s.compliance !== null && ps.compliance !== null ? Math.round((s.compliance - ps.compliance) * 10) / 10 : null,
      participation: part.rate,
      onTime: s.onTimeRate,
      pending: s.pending,
      overdue: s.overdue,
      rejected: s.rejected,
    });
  }
  const all = computeStats(tasks, today);
  const hasParent = groups.some((g) => g.parent);
  return {
    columns: [
      { key: "name", header: firstHeader, width: 28 },
      ...(hasParent ? [{ key: "parent", header: "Department", width: 24 } as ReportColumn] : []),
      { key: "employees", header: "Employees", format: "number", align: "right" },
      { key: "due", header: "Due tasks", format: "number", align: "right" },
      { key: "completed", header: "Completed", format: "number", align: "right" },
      { key: "compliance", header: "Compliance", format: "percent", align: "right" },
      { key: "change", header: "Change", format: "delta", align: "right" },
      { key: "participation", header: "Participation", format: "percent", align: "right" },
      { key: "onTime", header: "On-time", format: "percent", align: "right" },
      { key: "overdue", header: "Overdue", format: "number", align: "right" },
      { key: "rejected", header: "Rejected", format: "number", align: "right" },
    ],
    rows,
    summary: [
      { label: "Overall compliance", value: p(all.compliance) },
      { label: "Participation", value: p(computeParticipation(tasks, today).rate) },
      { label: "Due tasks", value: String(all.due) },
      { label: "Overdue tasks", value: String(all.overdue) },
    ],
    chart: { kind: "compliance-bars", data: rows.map((r) => ({ id: r._id, name: String(r.name), compliance: r.compliance as number | null, tier: r._tier!, due: r.due as number, overdue: r.overdue as number })), hrefPrefix: groups[0]?.href?.replace(/[^/]+$/, "") },
    chartTitle: `Compliance by ${firstHeader.toLowerCase()}`,
  };
}

export const REPORTS: ReportDefinition[] = [
  {
    id: "organization",
    title: "Organization Compliance Report",
    description: "Headline compliance, participation and workload metrics for the whole organization versus the previous period.",
    icon: "building",
    group: "Organization",
    filters: ["department", "band", "category"],
    build: (db, filter, scope, today) => {
      const m = getDashboardMetrics(db, filter, scope, today);
      const k = m.kpis;
      const metric = (id: string, label: string, cur: number | null, prev: number | null, fmt: CellFormat = "number"): ReportRow => ({
        _id: id,
        name: label,
        current: cur,
        previous: prev,
        change: cur !== null && prev !== null ? Math.round((cur - prev) * 10) / 10 : null,
        fmt,
      });
      const rows: ReportRow[] = [
        metric("compliance", "Overall compliance (%)", k.compliance.value, k.compliance.previous),
        metric("participation", "Employee participation (%)", k.participation.value, k.participation.previous),
        metric("compliant", "Compliant employees", k.compliantEmployees.value, k.compliantEmployees.previous),
        metric("noncompliant", "Non-compliant employees", k.nonCompliantEmployees.value, k.nonCompliantEmployees.previous),
        metric("assigned", "Total assigned tasks", m.stats.totalAssigned, m.previousStats.totalAssigned),
        metric("completed", "Completed tasks", m.stats.completed, m.previousStats.completed),
        metric("pending", "Pending tasks", m.stats.pending, m.previousStats.pending),
        metric("overdue", "Overdue tasks", m.stats.overdue, m.previousStats.overdue),
        metric("rejected", "Rejected submissions", m.stats.rejected, m.previousStats.rejected),
        metric("ontime", "On-time completion (%)", m.stats.onTimeRate, m.previousStats.onTimeRate),
        metric("employees", "Active employees", k.activeEmployees, null),
        metric("processes", "Active processes", k.activeProcesses, null),
      ];
      return {
        columns: [
          { key: "name", header: "Metric", width: 32 },
          { key: "current", header: "Current period", format: "number", align: "right" },
          { key: "previous", header: "Previous period", format: "number", align: "right" },
          { key: "change", header: "Change", format: "delta", align: "right" },
        ],
        rows,
        summary: [
          { label: "Overall compliance", value: p(k.compliance.value) },
          { label: "Participation", value: p(k.participation.value) },
          { label: "Active employees", value: String(k.activeEmployees) },
          { label: "Overdue tasks", value: String(k.overdueTasks.value ?? 0) },
        ],
        chart: { kind: "trend", data: m.trend.map((t) => ({ key: t.key, label: t.label, compliance: t.compliance, participation: t.participation, onTimeRate: t.onTimeRate, completed: t.completed, due: t.due })) },
        chartTitle: "Six-month compliance trend",
      };
    },
  },
  {
    id: "department",
    title: "Department Compliance Report",
    description: "Compliance, participation and overdue work for each department with period-over-period change.",
    icon: "layers",
    group: "Organization",
    filters: ["department", "band", "category", "process"],
    build: (db, filter, scope, today) =>
      groupReport(
        db,
        filter,
        scope,
        today,
        db.departments.filter((d) => d.status === "active" && (!filter.departmentId || d.id === filter.departmentId)).map((d) => ({ id: d.id, name: d.name, href: `/departments/${d.id}`, members: (e) => e.departmentId === d.id })),
        "Department",
      ),
  },
  {
    id: "team",
    title: "Team Compliance Report",
    description: "Team-level process adherence, highlighting teams below target and those improving.",
    icon: "users",
    group: "Organization",
    filters: ["department", "team", "band", "category", "process"],
    build: (db, filter, scope, today) => {
      const dn = new Map(db.departments.map((d) => [d.id, d.name]));
      return groupReport(
        db,
        filter,
        scope,
        today,
        db.teams
          .filter((t) => t.status === "active" && (!filter.departmentId || t.departmentId === filter.departmentId) && (!filter.teamId || t.id === filter.teamId))
          .map((t) => ({ id: t.id, name: t.name, parent: dn.get(t.departmentId), href: `/teams/${t.id}`, members: (e) => e.teamId === t.id })),
        "Team",
      );
    },
  },
  {
    id: "employee",
    title: "Employee Compliance Report",
    description: "Per-employee compliance, completion, timeliness and outstanding work.",
    icon: "user",
    group: "People",
    filters: ["department", "team", "employee", "band", "category", "process"],
    build: (db, filter, scope, today) => {
      const tasks = filterTasks(db, filter, scope);
      const by = groupStats(tasks, (t) => t.employeeId, today);
      const empty = computeStats([], today);
      const L = { d: new Map(db.departments.map((d) => [d.id, d.name])), t: new Map(db.teams.map((t) => [t.id, t.name])), b: new Map(db.bands.map((b) => [b.id, b.code])) };
      const emps = db.employees.filter((e) => e.status !== "inactive" && employeeMatches(e, filter, scope));
      const rows: ReportRow[] = emps.map((e) => {
        const s = by.get(e.id) ?? empty;
        return {
          _id: e.id,
          _href: `/employees/${e.id}`,
          _tier: getTier(s.compliance, db.settings.thresholds),
          id: e.id,
          name: name(e),
          department: L.d.get(e.departmentId) ?? "—",
          team: e.teamId ? (L.t.get(e.teamId) ?? "—") : "—",
          band: L.b.get(e.bandId) ?? "—",
          due: s.due,
          completed: s.completedDue,
          compliance: s.compliance,
          onTime: s.onTimeRate,
          pending: s.pending,
          overdue: s.overdue,
          quality: s.avgQuality,
        };
      });
      const all = computeStats(tasks, today);
      const rated = rows.filter((r) => r.compliance !== null);
      return {
        columns: [
          { key: "id", header: "Employee ID" },
          { key: "name", header: "Employee", width: 24 },
          { key: "department", header: "Department", width: 22 },
          { key: "team", header: "Team", width: 26 },
          { key: "band", header: "Band" },
          { key: "due", header: "Due", format: "number", align: "right" },
          { key: "compliance", header: "Compliance", format: "percent", align: "right" },
          { key: "onTime", header: "On-time", format: "percent", align: "right" },
          { key: "pending", header: "Pending", format: "number", align: "right" },
          { key: "overdue", header: "Overdue", format: "number", align: "right" },
          { key: "quality", header: "Avg quality", format: "number", align: "right" },
        ],
        rows,
        summary: [
          { label: "Employees", value: String(rows.length) },
          { label: "Overall compliance", value: p(all.compliance) },
          { label: `Compliant (≥ ${db.settings.thresholds.good}%)`, value: String(rated.filter((r) => (r.compliance as number) >= db.settings.thresholds.good).length) },
          { label: "With overdue tasks", value: String(rows.filter((r) => (r.overdue as number) > 0).length) },
        ],
        chart: {
          kind: "compliance-bars",
          data: [...rated].sort((a, b) => (a.compliance as number) - (b.compliance as number)).slice(0, 15).map((r) => ({ id: r._id, name: String(r.name), compliance: r.compliance as number, tier: r._tier!, due: r.due as number, overdue: r.overdue as number })),
          hrefPrefix: "/employees/",
        },
        chartTitle: "Lowest 15 employees by compliance",
        note: "Compliance measures process adherence only and is not a complete measure of overall employee performance.",
      };
    },
  },
  {
    id: "process-adherence",
    title: "Process Adherence Report",
    description: "Adherence to each defined process against its own compliance threshold.",
    icon: "workflow",
    group: "Process",
    filters: ["department", "team", "category", "process"],
    build: (db, filter, scope, today) => {
      const tasks = filterTasks(db, filter, scope);
      const by = groupStats(tasks, (t) => t.processId, today);
      const idx = getIndexes(db);
      const cat = new Map(db.processCategories.map((c) => [c.id, c.name]));
      const rows: ReportRow[] = [...by.entries()].map(([id, s]) => {
        const pr = idx.processes.get(id)!;
        const assigned = new Set(tasks.filter((t) => t.processId === id).map((t) => t.employeeId)).size;
        return {
          _id: id,
          _href: `/processes/${id}`,
          _tier: getTier(s.compliance, db.settings.thresholds),
          id,
          name: pr.name,
          category: cat.get(pr.categoryId) ?? "—",
          owner: name(idx.employees.get(pr.ownerId)),
          frequency: pr.frequency.replace("_", " "),
          employees: assigned,
          due: s.due,
          compliance: s.compliance,
          threshold: pr.complianceThreshold,
          gap: s.compliance !== null ? Math.round((s.compliance - pr.complianceThreshold) * 10) / 10 : null,
          status: s.compliance === null ? "No due tasks" : s.compliance >= pr.complianceThreshold ? "Meets target" : "Below target",
          overdue: s.overdue,
        };
      });
      const below = rows.filter((r) => r.status === "Below target").length;
      return {
        columns: [
          { key: "id", header: "Process ID" },
          { key: "name", header: "Process", width: 34 },
          { key: "category", header: "Category", width: 22 },
          { key: "owner", header: "Owner", width: 20 },
          { key: "employees", header: "Employees", format: "number", align: "right" },
          { key: "due", header: "Due", format: "number", align: "right" },
          { key: "compliance", header: "Adherence", format: "percent", align: "right" },
          { key: "threshold", header: "Target", format: "percent", align: "right" },
          { key: "gap", header: "Gap", format: "delta", align: "right" },
          { key: "status", header: "Status" },
        ],
        rows,
        summary: [
          { label: "Processes in scope", value: String(rows.length) },
          { label: "Meeting target", value: String(rows.length - below - rows.filter((r) => r.status === "No due tasks").length) },
          { label: "Below target", value: String(below) },
          { label: "Overall adherence", value: p(computeStats(tasks, today).compliance) },
        ],
        chart: { kind: "compliance-bars", data: [...rows].sort((a, b) => ((a.compliance as number) ?? 101) - ((b.compliance as number) ?? 101)).map((r) => ({ id: r._id, name: String(r.name), compliance: r.compliance as number | null, tier: r._tier!, due: r.due as number, overdue: r.overdue as number })), hrefPrefix: "/processes/" },
        chartTitle: "Adherence by process",
      };
    },
  },
  {
    id: "overdue",
    title: "Overdue Process Report",
    description: "Every overdue task with the accountable employee, supervisor and days overdue.",
    icon: "alarm",
    group: "Process",
    filters: ["department", "team", "employee", "category", "process"],
    build: (db, filter, scope, today) => {
      const idx = getIndexes(db);
      const teams = new Map(db.teams.map((t) => [t.id, t]));
      const dn = new Map(db.departments.map((d) => [d.id, d.name]));
      const tasks = filterTasks(db, filter, scope).filter((t) => getEffectiveStatus(t, today) === "overdue");
      const rows: ReportRow[] = tasks
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
        .map((t: ComplianceTask) => {
          const e = idx.employees.get(t.employeeId)!;
          const team = e.teamId ? teams.get(e.teamId) : undefined;
          return {
            _id: t.id,
            _href: `/compliance/${encodeURIComponent(t.id)}`,
            employee: name(e),
            department: dn.get(e.departmentId) ?? "—",
            team: team?.name ?? "—",
            supervisor: name(team?.supervisorId ? idx.employees.get(team.supervisorId) : undefined),
            process: idx.processes.get(t.processId)?.name ?? t.processId,
            dueDate: t.dueDate,
            daysOverdue: daysBetween(t.dueDate, today),
            state: t.status === "in_progress" ? "In progress" : "Not started",
          };
        });
      const byDept = new Map<string, number>();
      for (const r of rows) byDept.set(String(r.department), (byDept.get(String(r.department)) ?? 0) + 1);
      const avg = rows.length ? rows.reduce((s, r) => s + (r.daysOverdue as number), 0) / rows.length : 0;
      return {
        columns: [
          { key: "employee", header: "Employee", width: 22 },
          { key: "department", header: "Department", width: 22 },
          { key: "team", header: "Team", width: 26 },
          { key: "supervisor", header: "Supervisor", width: 20 },
          { key: "process", header: "Process", width: 32 },
          { key: "dueDate", header: "Due date", format: "date" },
          { key: "daysOverdue", header: "Days overdue", format: "number", align: "right" },
          { key: "state", header: "State" },
        ],
        rows,
        summary: [
          { label: "Overdue tasks", value: String(rows.length) },
          { label: "Employees affected", value: String(new Set(tasks.map((t) => t.employeeId)).size) },
          { label: "Avg days overdue", value: avg.toFixed(1) },
          { label: "Over 7 days", value: String(rows.filter((r) => (r.daysOverdue as number) > 7).length) },
        ],
        chart: { kind: "count-bars", label: "Overdue tasks", data: [...byDept.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ id: n, name: n, value: v })) },
        chartTitle: "Overdue tasks by department",
      };
    },
  },
  {
    id: "participation",
    title: "Employee Participation Report",
    description: "Share of expected employees who submitted at least one required task, by department.",
    icon: "activity",
    group: "People",
    filters: ["department", "team", "band", "category"],
    build: (db, filter, scope, today) => {
      const idx = getIndexes(db);
      const tasks = filterTasks(db, filter, scope);
      const rows: ReportRow[] = db.departments
        .filter((d) => d.status === "active" && (!filter.departmentId || d.id === filter.departmentId))
        .map((d) => {
          const t = tasks.filter((x) => idx.employees.get(x.employeeId)?.departmentId === d.id);
          const part = computeParticipation(t, today);
          const expected = new Set(t.map((x) => x.employeeId));
          const silent = [...expected].filter((id) => !t.some((x) => x.employeeId === id && (x.submittedAt || x.status === "completed"))).map((id) => name(idx.employees.get(id)));
          return { _id: d.id, _href: `/departments/${d.id}`, _tier: getTier(part.rate, db.settings.thresholds), name: d.name, expected: part.expected, participated: part.participated, notParticipated: part.expected - part.participated, rate: part.rate, silent: silent.join(", ") || "—" };
        })
        .filter((r) => (r.expected as number) > 0);
      const all = computeParticipation(tasks, today);
      return {
        columns: [
          { key: "name", header: "Department", width: 26 },
          { key: "expected", header: "Expected to submit", format: "number", align: "right" },
          { key: "participated", header: "Submitted", format: "number", align: "right" },
          { key: "notParticipated", header: "Not submitted", format: "number", align: "right" },
          { key: "rate", header: "Participation", format: "percent", align: "right" },
          { key: "silent", header: "Employees with no submissions", width: 40 },
        ],
        rows,
        summary: [
          { label: "Participation", value: p(all.rate) },
          { label: "Expected", value: String(all.expected) },
          { label: "Submitted", value: String(all.participated) },
          { label: "No submissions", value: String(all.expected - all.participated) },
        ],
        chart: { kind: "compliance-bars", data: rows.map((r) => ({ id: r._id, name: String(r.name), compliance: r.rate as number | null, tier: r._tier! })), hrefPrefix: "/departments/" },
        chartTitle: "Participation by department",
        note: "Participation = employees who submitted at least one required task ÷ employees expected to submit.",
      };
    },
  },
  {
    id: "monthly-trend",
    title: "Monthly Compliance Trend",
    description: "Twelve-month view of compliance, participation and timeliness to track improvement.",
    icon: "trend",
    group: "Organization",
    filters: ["department", "team", "band", "category", "process"],
    build: (db, filter, scope, today) => {
      const all = filterTasks(db, filter, scope, { ignoreRange: true });
      const allMonths = monthBuckets(filter.range.to > today ? today : filter.range.to, 12).map((b) => {
        const t = all.filter((x) => x.dueDate >= b.range.from && x.dueDate <= b.range.to);
        const s: ComplianceStats = computeStats(t, today);
        return { key: b.key, label: b.label, compliance: s.compliance, participation: computeParticipation(t, today).rate, onTimeRate: s.onTimeRate, completed: s.completedDue, due: s.due, overdue: s.overdue, assigned: s.totalAssigned };
      });
      // Drop leading months before any task existed so the chart isn't half empty.
      const firstWithTasks = allMonths.findIndex((m) => m.assigned > 0);
      const months = firstWithTasks > 0 ? allMonths.slice(firstWithTasks) : allMonths;
      const rows: ReportRow[] = months.map((m, i) => {
        const prev = months[i - 1]?.compliance ?? null;
        return { _id: m.key, month: m.label, assigned: m.assigned, due: m.due, completed: m.completed, compliance: m.compliance, change: m.compliance !== null && prev !== null ? Math.round((m.compliance - prev) * 10) / 10 : null, participation: m.participation, onTime: m.onTimeRate, overdue: m.overdue };
      });
      const withData = months.filter((m) => m.compliance !== null);
      const first = withData[0];
      const last = withData[withData.length - 1];
      return {
        columns: [
          { key: "month", header: "Month" },
          { key: "assigned", header: "Assigned", format: "number", align: "right" },
          { key: "due", header: "Due", format: "number", align: "right" },
          { key: "completed", header: "Completed", format: "number", align: "right" },
          { key: "compliance", header: "Compliance", format: "percent", align: "right" },
          { key: "change", header: "MoM change", format: "delta", align: "right" },
          { key: "participation", header: "Participation", format: "percent", align: "right" },
          { key: "onTime", header: "On-time", format: "percent", align: "right" },
          { key: "overdue", header: "Overdue", format: "number", align: "right" },
        ],
        rows,
        summary: [
          { label: "Latest month", value: last ? p(last.compliance) : "N/A" },
          { label: "First month with data", value: first ? p(first.compliance) : "N/A" },
          { label: "Change over period", value: first && last ? `${last.compliance! - first.compliance! >= 0 ? "+" : ""}${(last.compliance! - first.compliance!).toFixed(1)} pts` : "N/A" },
          { label: "Months with data", value: String(withData.length) },
        ],
        chart: { kind: "trend", data: months },
        chartTitle: "Monthly compliance and participation",
        note: "Shows up to 12 months ending at the selected period end, starting from the first month with assigned tasks.",
      };
    },
  },
  {
    id: "band",
    title: "Band-wise Compliance Report",
    description: "Compliance by employee band (B1–B5) to see whether adherence varies by seniority.",
    icon: "award",
    group: "People",
    filters: ["department", "team", "category", "process"],
    build: (db, filter, scope, today) =>
      groupReport(db, filter, scope, today, db.bands.filter((b) => b.status === "active").map((b) => ({ id: b.id, name: `${b.code} · ${b.name}`, members: (e) => e.bandId === b.id })), "Band"),
  },
  {
    id: "process-owner",
    title: "Process Owner Performance Report",
    description: "Adherence of the processes each owner is accountable for, plus their pending review load.",
    icon: "crown",
    group: "Process",
    filters: ["department", "team", "category"],
    build: (db, filter, scope, today) => {
      const idx = getIndexes(db);
      const tasks = filterTasks(db, filter, scope);
      const owners = [...new Set(db.processes.map((x) => x.ownerId))];
      const rows: ReportRow[] = owners
        .map((ownerId) => {
          const procs = db.processes.filter((x) => x.ownerId === ownerId);
          const ids = new Set(procs.map((x) => x.id));
          const t = tasks.filter((x) => ids.has(x.processId));
          const s = computeStats(t, today);
          const owner = idx.employees.get(ownerId);
          const belowTarget = procs.filter((pr) => {
            const ps = computeStats(t.filter((x) => x.processId === pr.id), today).compliance;
            return ps !== null && ps < pr.complianceThreshold;
          }).length;
          return {
            _id: ownerId,
            _href: `/employees/${ownerId}`,
            _tier: getTier(s.compliance, db.settings.thresholds),
            name: name(owner),
            department: owner ? (db.departments.find((d) => d.id === owner.departmentId)?.name ?? "—") : "—",
            processes: procs.length,
            processNames: procs.map((x) => x.name).join(", "),
            due: s.due,
            compliance: s.compliance,
            belowTarget,
            awaiting: s.awaitingReview,
            overdue: s.overdue,
          };
        })
        .filter((r) => (r.due as number) > 0 || (r.awaiting as number) > 0);
      return {
        columns: [
          { key: "name", header: "Process owner", width: 22 },
          { key: "department", header: "Department", width: 22 },
          { key: "processes", header: "Processes owned", format: "number", align: "right" },
          { key: "due", header: "Due tasks", format: "number", align: "right" },
          { key: "compliance", header: "Adherence", format: "percent", align: "right" },
          { key: "belowTarget", header: "Processes below target", format: "number", align: "right" },
          { key: "awaiting", header: "Awaiting review", format: "number", align: "right" },
          { key: "overdue", header: "Overdue", format: "number", align: "right" },
          { key: "processNames", header: "Processes", width: 48 },
        ],
        rows,
        summary: [
          { label: "Process owners", value: String(rows.length) },
          { label: "Overall adherence", value: p(computeStats(tasks, today).compliance) },
          { label: "Submissions awaiting review", value: String(rows.reduce((s, r) => s + (r.awaiting as number), 0)) },
          { label: "Owners with gaps", value: String(rows.filter((r) => (r.belowTarget as number) > 0).length) },
        ],
        chart: { kind: "compliance-bars", data: rows.map((r) => ({ id: r._id, name: String(r.name), compliance: r.compliance as number | null, tier: r._tier!, due: r.due as number, overdue: r.overdue as number })), hrefPrefix: "/employees/" },
        chartTitle: "Adherence of owned processes",
      };
    },
  },
];

export function getReport(id: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function formatCell(v: string | number | null | undefined, fmt: CellFormat = "text"): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (fmt) {
    case "percent":
      return typeof v === "number" ? `${v.toFixed(1)}%` : String(v);
    case "delta":
      return typeof v === "number" ? `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(1)}` : String(v);
    case "number":
      return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
    default:
      return String(v);
  }
}
