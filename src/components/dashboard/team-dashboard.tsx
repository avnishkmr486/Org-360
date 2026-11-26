"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { UsersRound } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DashboardKpiStrip } from "./dashboard-kpi-strip";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/states";
import { TaskStatusBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { ChartCard } from "@/components/charts/chart-card";
import { GroupComplianceBars, MonthlyPerformanceChart } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AnalyticsFilterBar, useAnalyticsFilter, useFilterQuery } from "./analytics-filters";
import { dailyCompletion, overdueTasks, pendingTasks, TaskMiniList, weeklyCompletion } from "@/features/dashboards/widgets";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { getDashboardMetrics } from "@/lib/calculations/dashboard";
import { filterTasks, getEffectiveStatus } from "@/lib/calculations/compliance";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatPercent } from "@/lib/utils/format";
import { addDaysISO, formatDate, formatDateTime, formatRange } from "@/lib/utils/dates";
import type { ComplianceTask } from "@/types";

export function TeamDashboard() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { scope, can } = useCurrentUser();
  const { filter, values, set } = useAnalyticsFilter();
  const q = useFilterQuery();

  const teams = db.teams.filter((t) => t.status === "active" && (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)));
  const selectedId = teams.some((t) => t.id === values.team) ? values.team : (teams[0]?.id ?? "");
  useEffect(() => {
    if (selectedId && values.team !== selectedId) set({ team: selectedId, employee: null });
  }, [selectedId, values.team, set]);
  const team = db.teams.find((t) => t.id === selectedId);

  const teamFilter = useMemo(() => ({ ...filter, departmentId: null, teamId: selectedId || null }), [filter, selectedId]);
  const m = useMemo(() => getDashboardMetrics(db, teamFilter, scope, today), [db, teamFilter, scope, today]);
  const tasks = useMemo(() => filterTasks(db, teamFilter, scope), [db, teamFilter, scope]);
  const allTeamTasks = useMemo(() => filterTasks(db, teamFilter, scope, { ignoreRange: true }), [db, teamFilter, scope]);
  const pending = useMemo(() => pendingTasks(allTeamTasks.filter((t) => t.dueDate >= filter.range.from && t.dueDate <= addDaysISO(today, 14)), today), [allTeamTasks, filter.range.from, today]);
  const overdue = useMemo(() => overdueTasks(tasks, today), [tasks, today]);
  const daily = useMemo(() => dailyCompletion(allTeamTasks, today, 14), [allTeamTasks, today]);
  const weekly = useMemo(() => weeklyCompletion(allTeamTasks, today, 8), [allTeamTasks, today]);
  const history = useMemo(() => allTeamTasks.filter((t) => t.submittedAt).sort((a, b) => (a.submittedAt! < b.submittedAt! ? 1 : -1)).slice(0, 100), [allTeamTasks]);
  const threshold = db.settings.thresholds.good;

  if (!team) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Team Dashboard" }]} title="Team Dashboard" />
        <EmptyState icon={<UsersRound className="size-5" />} title="No team in your scope" description="Your persona is not mapped as a supervisor or project manager of an active team." />
      </div>
    );
  }
  const k = m.kpis;
  const historyCols: Column<ComplianceTask>[] = [
    { id: "emp", header: "Employee", cell: (t) => <PersonCell name={L.empName(t.employeeId)} size="xs" />, sortValue: (t) => L.empName(t.employeeId) },
    { id: "proc", header: "Process", cell: (t) => <span className="text-sm">{L.processName(t.processId)}</span>, sortValue: (t) => L.processName(t.processId) },
    { id: "due", header: "Due", cell: (t) => formatDate(t.dueDate), sortValue: (t) => t.dueDate },
    { id: "sub", header: "Submitted", cell: (t) => <span className="text-xs">{formatDateTime(t.submittedAt)}</span>, sortValue: (t) => t.submittedAt },
    {
      id: "ontime",
      header: "Timeliness",
      cell: (t) => (t.submittedAt!.slice(0, 10) <= t.dueDate ? <span className="text-xs text-success">On time</span> : <span className="text-xs text-warning">Late</span>),
      sortValue: (t) => (t.submittedAt!.slice(0, 10) <= t.dueDate ? 1 : 0),
    },
    { id: "status", header: "Status", cell: (t) => <TaskStatusBadge status={getEffectiveStatus(t, today)} />, sortValue: (t) => t.status },
  ];
  const summary = [
    { label: "Team compliance", value: formatPercent(k.compliance.value) },
    { label: "Members", value: k.activeEmployees },
    { label: "Pending", value: pending.length },
    { label: "Overdue", value: k.overdueTasks.value ?? 0 },
  ];
  const empRows = m.employees;

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Dashboards", href: "/" }, { label: "Team Dashboard" }]}
        title={`${team.name}`}
        description={
          <>
            {L.deptName(team.departmentId)} · Supervisor <span className="font-medium text-foreground">{L.empName(team.supervisorId)}</span>
            {team.projectManagerId ? (
              <>
                {" "}
                · Project manager <span className="font-medium text-foreground">{L.empName(team.projectManagerId)}</span>
              </>
            ) : null}{" "}
            · {formatRange(m.range)}
          </>
        }
        actions={
          <>
            {can("reports.export") ? (
              <ExportMenu
                onExcel={() =>
                  exportToExcel({
                    organizationName: db.organization.name,
                    title: `${team.name} — Team Compliance`,
                    subtitle: `Period: ${formatRange(m.range)}`,
                    fileName: `Team_Compliance_${team.id}_${m.range.to}`,
                    summary,
                    columns: [
                      { header: "Employee", value: (r) => `${r.employee.firstName} ${r.employee.lastName}`, width: 24 },
                      { header: "Compliance %", value: (r) => r.stats.compliance, numFmt: '0.0"%"' },
                      { header: "Due", value: (r) => r.stats.due },
                      { header: "Completed", value: (r) => r.stats.completed },
                      { header: "On-time %", value: (r) => r.stats.onTimeRate, numFmt: '0.0"%"' },
                      { header: "Overdue", value: (r) => r.stats.overdue },
                    ],
                    rows: empRows,
                    footer: db.settings.reportFooter,
                  })
                }
                onPdf={() =>
                  exportToPdf({
                    organizationName: db.organization.name,
                    title: `${team.name} — Team Compliance`,
                    subtitle: `Period: ${formatRange(m.range)}`,
                    fileName: `Team_Compliance_${team.id}_${m.range.to}`,
                    summary,
                    columns: [
                      { header: "Employee", value: (r) => `${r.employee.firstName} ${r.employee.lastName}` },
                      { header: "Compliance", value: (r) => formatPercent(r.stats.compliance), align: "right" },
                      { header: "Due", value: (r) => r.stats.due, align: "right" },
                      { header: "Completed", value: (r) => r.stats.completed, align: "right" },
                      { header: "On-time", value: (r) => formatPercent(r.stats.onTimeRate), align: "right" },
                      { header: "Overdue", value: (r) => r.stats.overdue, align: "right" },
                    ],
                    rows: empRows,
                    footer: db.settings.reportFooter,
                  })
                }
              />
            ) : null}
            <Button size="sm" asChild>
              <Link href={`/teams/${team.id}`}>
                <UsersRound /> Team details
              </Link>
            </Button>
          </>
        }
        filters={
          <>
            {teams.length > 1 ? (
              <Select value={selectedId} onValueChange={(v) => set({ team: v, employee: null })}>
                <SelectTrigger size="sm" className="h-8 min-w-[220px] bg-card text-xs" aria-label="Team">
                  <span className="mr-1 text-muted-foreground">Team:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <AnalyticsFilterBar show={["employee", "category"]} />
          </>
        }
      />

      <DashboardKpiStrip dashboard="team" m={m} q={q} label="Team KPIs" />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Employee-wise Compliance" description="Click an employee to open their profile">
          {empRows.length ? (
            <GroupComplianceBars
              data={[...empRows]
                .sort((a, b) => (a.stats.compliance ?? 101) - (b.stats.compliance ?? 101))
                .map((r) => ({ id: r.employee.id, name: `${r.employee.firstName} ${r.employee.lastName}`, compliance: r.stats.compliance, tier: r.tier, due: r.stats.due, overdue: r.stats.overdue }))}
              threshold={threshold}
              onSelect={(d) => router.push(`/employees/${d.id}`)}
            />
          ) : (
            <EmptyState title="No members" />
          )}
        </ChartCard>
        <div className="grid gap-4">
          <ChartCard title="Daily Completion" description="Due tasks per day over the last 14 days">
            <MonthlyPerformanceChart data={daily} height={170} />
          </ChartCard>
          <ChartCard title="Weekly Completion" description="Due tasks per week over the last 8 weeks">
            <MonthlyPerformanceChart data={weekly} height={170} />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pending Tasks" description="Open tasks due within 14 days">
          <TaskMiniList tasks={pending} today={today} empty="No pending tasks." />
        </ChartCard>
        <ChartCard title="Overdue Tasks" description="Requires follow-up with the employee">
          <TaskMiniList tasks={overdue} today={today} empty="No overdue tasks — great work." />
        </ChartCard>
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold">Employee Submission History</h3>
            <p className="text-xs text-muted-foreground">Latest submissions from team members · click a row for details</p>
          </div>
        </div>
        <DataTable columns={historyCols} rows={history} getRowId={(t) => t.id} onRowClick={(t) => router.push(`/compliance/${encodeURIComponent(t.id)}`)} initialSort={{ id: "sub", dir: "desc" }} dense />
      </div>
    </div>
  );
}
