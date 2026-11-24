"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlarmClock, Building2, ClipboardList, ShieldCheck, Users, UsersRound, Workflow } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/states";
import { ChartCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart, GroupComplianceBars, StatusStackedBars } from "@/components/charts/compliance-charts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AnalyticsFilterBar, useAnalyticsFilter, useFilterQuery } from "./analytics-filters";
import { EmployeeRankList, overdueTasks, pendingTasks, TaskMiniList } from "@/features/dashboards/widgets";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { getDashboardMetrics } from "@/lib/calculations/dashboard";
import { filterTasks, getTier } from "@/lib/calculations/compliance";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatDelta, formatPercent } from "@/lib/utils/format";
import { formatRange } from "@/lib/utils/dates";

export function DepartmentDashboard() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { scope, can } = useCurrentUser();
  const { filter, values, set } = useAnalyticsFilter();
  const q = useFilterQuery();

  const departments = db.departments.filter((d) => d.status === "active" && (!scope.departmentIds || scope.departmentIds.includes(d.id)));
  const selectedId = departments.some((d) => d.id === values.department) ? values.department : (departments[0]?.id ?? "");
  useEffect(() => {
    if (selectedId && values.department !== selectedId) set({ department: selectedId, team: null, employee: null });
  }, [selectedId, values.department, set]);

  const dept = db.departments.find((d) => d.id === selectedId);
  const deptFilter = useMemo(() => ({ ...filter, departmentId: selectedId || null }), [filter, selectedId]);
  const m = useMemo(() => getDashboardMetrics(db, deptFilter, scope, today), [db, deptFilter, scope, today]);
  const tasks = useMemo(() => filterTasks(db, deptFilter, scope), [db, deptFilter, scope]);
  const upcoming = useMemo(() => filterTasks(db, { ...deptFilter, range: { from: today, to: "9999-12-31" } }, scope), [db, deptFilter, scope, today]);
  const pending = useMemo(() => pendingTasks([...tasks, ...upcoming.filter((t) => t.dueDate > deptFilter.range.to)], today), [tasks, upcoming, today, deptFilter.range.to]);
  const overdue = useMemo(() => overdueTasks(tasks, today), [tasks, today]);
  const threshold = db.settings.thresholds.good;

  if (!dept) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Department Dashboard" }]} title="Department Dashboard" />
        <EmptyState icon={<Building2 className="size-5" />} title="No department in your scope" description="Your persona is not mapped to an active department." />
      </div>
    );
  }

  const ranked = m.employees.filter((e) => e.stats.compliance !== null);
  const top = [...ranked].sort((a, b) => b.stats.compliance! - a.stats.compliance! || b.stats.completed - a.stats.completed).slice(0, 5);
  const attention = [...ranked].filter((e) => e.stats.compliance! < threshold || e.stats.overdue > 0).sort((a, b) => a.stats.compliance! - b.stats.compliance!).slice(0, 5);
  const k = m.kpis;

  const exportCols = [
    { header: "Employee", value: (r: (typeof m.employees)[number]) => `${r.employee.firstName} ${r.employee.lastName}`, width: 24 },
    { header: "Team", value: (r: (typeof m.employees)[number]) => L.teamName(r.employee.teamId), width: 26 },
    { header: "Compliance %", value: (r: (typeof m.employees)[number]) => r.stats.compliance, numFmt: '0.0"%"' },
    { header: "Due", value: (r: (typeof m.employees)[number]) => r.stats.due },
    { header: "Completed", value: (r: (typeof m.employees)[number]) => r.stats.completed },
    { header: "Overdue", value: (r: (typeof m.employees)[number]) => r.stats.overdue },
    { header: "Rating", value: (r: (typeof m.employees)[number]) => r.tier.replace("_", " ") },
  ];
  const summary = [
    { label: "Compliance", value: formatPercent(k.compliance.value) },
    { label: "Participation", value: formatPercent(k.participation.value) },
    { label: "Employees", value: k.activeEmployees },
    { label: "Overdue", value: k.overdueTasks.value ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Dashboards", href: "/" }, { label: "Department Dashboard" }]}
        title={`${dept.name} Dashboard`}
        description={
          <>
            Department head: <span className="font-medium text-foreground">{L.empName(dept.headId)}</span> · {db.organization.name} · {formatRange(m.range)}
          </>
        }
        actions={
          <>
            {can("reports.export") ? (
              <ExportMenu
                onExcel={() =>
                  exportToExcel({ organizationName: db.organization.name, title: `${dept.name} — Department Compliance`, subtitle: `Period: ${formatRange(m.range)}`, fileName: `${dept.code}_Department_Compliance_${m.range.to}`, summary, columns: exportCols, rows: m.employees, footer: db.settings.reportFooter })
                }
                onPdf={() =>
                  exportToPdf({
                    organizationName: db.organization.name,
                    title: `${dept.name} — Department Compliance`,
                    subtitle: `Period: ${formatRange(m.range)}`,
                    fileName: `${dept.code}_Department_Compliance_${m.range.to}`,
                    summary,
                    columns: exportCols.map((c) => ({ header: c.header, value: (r: (typeof m.employees)[number]) => (c.header === "Compliance %" ? formatPercent(r.stats.compliance) : c.value(r)) })),
                    rows: m.employees,
                    footer: db.settings.reportFooter,
                  })
                }
              />
            ) : null}
            <Button size="sm" asChild>
              <Link href={`/departments/${dept.id}`}>
                <Building2 /> Department details
              </Link>
            </Button>
          </>
        }
        filters={
          <>
            {departments.length > 1 ? (
              <Select value={selectedId} onValueChange={(v) => set({ department: v, team: null, employee: null })}>
                <SelectTrigger size="sm" className="h-8 min-w-[200px] bg-card text-xs" aria-label="Department">
                  <span className="mr-1 text-muted-foreground">Department:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <AnalyticsFilterBar show={["team", "employee", "band", "category"]} />
          </>
        }
      />

      <section className="kpi-strip" aria-label="Department KPIs">
        <KpiCard label="Employees" value={k.activeEmployees} icon={Users} tone="info" hint={`${k.totalEmployees} incl. inactive`} href={`/employees?department=${dept.id}`} />
        <KpiCard label="Teams" value={k.teams} icon={UsersRound} tone="neutral" hint="active" href={`/teams?department=${dept.id}`} />
        <KpiCard label="Assigned Processes" value={m.processes.length} icon={Workflow} tone="teal" hint="with tasks in period" href={`/processes`} />
        <KpiCard label="Overall Compliance" value={formatPercent(k.compliance.value)} icon={ShieldCheck} tone="info" delta={k.compliance.delta} hint="vs prev. period" href={`/compliance${q()}`} />
        <KpiCard label="Participation" value={formatPercent(k.participation.value)} icon={Activity} tone="teal" delta={k.participation.delta} hint="submitted ≥ 1 task" />
        <KpiCard label="Pending Tasks" value={pending.length} icon={ClipboardList} tone="warning" hint="open, not yet late" href={`/compliance${q()}`} />
        <KpiCard label="Overdue Tasks" value={k.overdueTasks.value} icon={AlarmClock} tone="danger" delta={k.overdueTasks.delta} deltaUnit="" goodWhen="down" href={`/compliance${q({ status: "overdue" })}`} />
        <KpiCard label="Awaiting Review" value={m.stats.awaitingReview} icon={ShieldCheck} tone="neutral" hint="submissions" href={`/compliance/approvals`} />
      </section>

      {m.stats.totalAssigned === 0 ? (
        <EmptyState title="No tasks in this period" description="Widen the date range or clear filters." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Team-wise Compliance" description="Click a team to open its dashboard">
              <GroupComplianceBars
                data={[...m.teams].sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101)).map((t) => ({ id: t.id, name: t.name, compliance: t.compliance, tier: t.tier, delta: t.delta, due: t.stats.due, overdue: t.stats.overdue }))}
                threshold={threshold}
                onSelect={(d) => router.push(`/dashboards/team?team=${d.id}`)}
              />
            </ChartCard>
            <ChartCard title="Compliance Trend" description="Department compliance and participation · last 6 months">
              <ComplianceTrendChart data={m.trend} threshold={threshold} height={230} />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Process-wise Compliance" description="Click a process to view its definition">
              <GroupComplianceBars
                data={[...m.processes].sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101)).map((p) => ({ id: p.id, name: p.name, compliance: p.compliance, tier: getTier(p.compliance, db.settings.thresholds), due: p.stats.due, overdue: p.stats.overdue }))}
                threshold={threshold}
                onSelect={(d) => router.push(`/processes/${d.id}`)}
              />
            </ChartCard>
            <ChartCard title="Process Completion Status" description="Share of department tasks by status · click to open tasks">
              <StatusStackedBars
                data={m.processes.map((p) => ({ id: p.id, name: p.name, completed: p.stats.completed, awaiting: p.stats.awaitingReview, pending: p.stats.pending - p.stats.awaitingReview, overdue: p.stats.overdue, rejected: p.stats.rejected }))}
                onSelect={(d) => router.push(`/compliance${q({ process: d.id })}`)}
              />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Top Performing Employees" description="Highest compliance in the period">
              <EmployeeRankList rows={top} empty="No employees with due tasks." />
            </ChartCard>
            <ChartCard title="Employees Requiring Attention" description={`Below ${threshold}% or with overdue work`}>
              <EmployeeRankList rows={attention} empty="Everyone is on target." tone="attention" />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Pending Tasks" description="Open tasks, earliest due first" footer={<Link className="text-primary hover:underline" href={`/compliance${q()}`}>View all pending tasks</Link>}>
              <TaskMiniList tasks={pending} today={today} empty="No pending tasks." />
            </ChartCard>
            <ChartCard title="Overdue Tasks" description="Most recent first" footer={<Link className="text-primary hover:underline" href={`/compliance${q({ status: "overdue" })}`}>View all overdue tasks</Link>}>
              <TaskMiniList tasks={overdue} today={today} empty="No overdue tasks — great work." />
            </ChartCard>
          </div>
          <p className="text-xs text-muted-foreground">Department compliance changed {formatDelta(k.compliance.delta)} versus {formatRange(m.previousRange)}.</p>
        </>
      )}
    </div>
  );
}
