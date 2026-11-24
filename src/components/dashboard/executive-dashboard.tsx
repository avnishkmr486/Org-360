"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
  UserX,
  Workflow,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { ExportMenu } from "@/components/common/export-menu";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/charts/chart-card";
import {
  ComplianceTrendChart,
  GroupComplianceBars,
  GroupComplianceColumns,
  MonthlyPerformanceChart,
  StatusStackedBars,
  TierDonut,
} from "@/components/charts/compliance-charts";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { TierBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/states";
import { AnalyticsFilterBar, useAnalyticsFilter, useFilterQuery } from "./analytics-filters";
import { useCurrentUser, useDatabase, useToday } from "@/hooks/use-data";
import { getDashboardMetrics, type DashboardMetrics, type Insight } from "@/lib/calculations/dashboard";
import { getTier as getTierFor } from "@/lib/calculations/compliance";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatDelta, formatNumber, formatPercent } from "@/lib/utils/format";
import { formatRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export function ExecutiveDashboard() {
  const db = useDatabase();
  const today = useToday();
  const router = useRouter();
  const { scope, can } = useCurrentUser();
  const { filter } = useAnalyticsFilter();
  const q = useFilterQuery();
  const m = useMemo(() => getDashboardMetrics(db, filter, scope, today), [db, filter, scope, today]);
  const threshold = db.settings.thresholds.good;
  const org = db.organization;
  const k = m.kpis;

  const openMonth = (key: string) => {
    const month = m.trend.find((t) => t.key === key);
    if (month) router.push(`/compliance${q({ from: month.range.from, to: month.range.to })}`);
  };

  const exportRows = m.departments;
  const exportSummary = [
    { label: "Overall compliance", value: formatPercent(k.compliance.value) },
    { label: "Participation", value: formatPercent(k.participation.value) },
    { label: "Active employees", value: k.activeEmployees },
    { label: "Overdue tasks", value: k.overdueTasks.value ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Executive Dashboard" }]}
        title="Executive Dashboard"
        description={
          <>
            Organization-wide process adherence and accountability for <span className="font-medium text-foreground">{org.name}</span> · {formatRange(m.range)} compared with {formatRange(m.previousRange)}.
          </>
        }
        actions={
          <>
            {can("reports.export") ? (
              <ExportMenu
                label="Export summary"
                onExcel={() =>
                  exportToExcel({
                    organizationName: org.name,
                    title: "Executive Compliance Summary",
                    subtitle: `Period: ${formatRange(m.range)}`,
                    fileName: `Altametrics_Executive_Summary_${m.range.to}`,
                    summary: exportSummary,
                    columns: [
                      { header: "Department", value: (r) => r.name, width: 28 },
                      { header: "Employees", value: (r) => r.employees },
                      { header: "Compliance %", value: (r) => r.compliance, numFmt: '0.0"%"' },
                      { header: "Previous %", value: (r) => r.previous, numFmt: '0.0"%"' },
                      { header: "Change (pts)", value: (r) => r.delta },
                      { header: "Participation %", value: (r) => r.participation, numFmt: '0.0"%"' },
                      { header: "Due tasks", value: (r) => r.stats.due },
                      { header: "Overdue", value: (r) => r.stats.overdue },
                      { header: "Rating", value: (r) => r.tier.replace("_", " ") },
                    ],
                    rows: exportRows,
                    footer: db.settings.reportFooter,
                  })
                }
                onPdf={() =>
                  exportToPdf({
                    organizationName: org.name,
                    title: "Executive Compliance Summary",
                    subtitle: `Period: ${formatRange(m.range)}`,
                    fileName: `Altametrics_Executive_Summary_${m.range.to}`,
                    summary: exportSummary,
                    columns: [
                      { header: "Department", value: (r) => r.name },
                      { header: "Employees", value: (r) => r.employees, align: "right" },
                      { header: "Compliance", value: (r) => formatPercent(r.compliance), align: "right" },
                      { header: "Change", value: (r) => formatDelta(r.delta), align: "right" },
                      { header: "Participation", value: (r) => formatPercent(r.participation), align: "right" },
                      { header: "Overdue", value: (r) => r.stats.overdue, align: "right" },
                    ],
                    rows: exportRows,
                    footer: db.settings.reportFooter,
                  })
                }
              />
            ) : null}
            <Button size="sm" asChild>
              <Link href="/reports">
                <BarChart3 /> Reports & Analytics
              </Link>
            </Button>
          </>
        }
        filters={<AnalyticsFilterBar />}
      />

      {/* KPI cards */}
      <section className="kpi-strip" aria-label="Key performance indicators">
        <KpiCard label="Total Employees" value={formatNumber(k.totalEmployees)} icon={Users} tone="info" hint="in current view" href={`/employees${q()}`} />
        <KpiCard label="Active Employees" value={formatNumber(k.activeEmployees)} icon={UserCheck} tone="success" hint={`${k.totalEmployees - k.activeEmployees} on leave / inactive`} href={`/employees${q({ status: "active" })}`} />
        <KpiCard label="Departments" value={k.departments} icon={Building2} tone="neutral" hint="active" href="/departments" />
        <KpiCard label="Teams" value={k.teams} icon={UsersRound} tone="neutral" hint="active" href={`/teams${q()}`} />
        <KpiCard label="Active Processes" value={k.activeProcesses} icon={Workflow} tone="teal" hint="with assignments in view" href={`/processes?status=active`} />
        <KpiCard label="Overall Compliance" value={formatPercent(k.compliance.value)} icon={ShieldCheck} tone="info" delta={k.compliance.delta} hint="vs prev. period" href={`/compliance${q()}`} />
        <KpiCard label="Employee Participation" value={formatPercent(k.participation.value)} icon={Activity} tone="teal" delta={k.participation.delta} hint="submitted ≥ 1 task" href={`/reports/participation${q()}`} />
        <KpiCard label="Compliant Employees" value={k.compliantEmployees.value} icon={BadgeCheck} tone="success" delta={k.compliantEmployees.delta} deltaUnit="" hint={`≥ ${threshold}%`} href={`/performance${q({ tier: "compliant" })}`} />
        <KpiCard label="Non-Compliant Employees" value={k.nonCompliantEmployees.value} icon={UserX} tone="danger" delta={k.nonCompliantEmployees.delta} deltaUnit="" goodWhen="down" hint={`< ${threshold}%`} href={`/performance${q({ tier: "noncompliant" })}`} />
        <KpiCard label="Overdue Tasks" value={k.overdueTasks.value} icon={AlarmClock} tone="warning" delta={k.overdueTasks.delta} deltaUnit="" goodWhen="down" hint="vs prev. period" href={`/compliance${q({ status: "overdue" })}`} />
      </section>

      <InsightsStrip insights={m.insights} />

      {m.stats.totalAssigned === 0 ? (
        <EmptyState title="No compliance data for this selection" description="No tasks were due in the selected period for these filters. Widen the date range or clear filters." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Organization Compliance Trend"
              description="Monthly compliance and participation over the last six months · click a month to see its tasks"
              actions={<TrendBadge m={m} />}
            >
              <ComplianceTrendChart data={m.trend} threshold={threshold} onPointClick={(d) => openMonth(d.key)} />
            </ChartCard>
            <ChartCard title="Compliance Distribution" description="Active employees by compliance rating">
              <TierDonut data={m.distribution} onSelect={(tier) => router.push(`/performance${q({ tier })}`)} />
              {k.noApplicableTasks ? <p className="px-2 pt-2 text-[11px] text-muted-foreground">{k.noApplicableTasks} employee(s) had no applicable tasks and are excluded.</p> : null}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Department-wise Compliance" description="Click a department to open its dashboard">
              <GroupComplianceColumns
                data={m.departments.filter((d) => d.stats.totalAssigned > 0).map((d) => ({ id: d.id, name: d.name, compliance: d.compliance, tier: d.tier, delta: d.delta, due: d.stats.due, overdue: d.stats.overdue }))}
                threshold={threshold}
                onSelect={(d) => router.push(`/departments/${d.id}`)}
              />
            </ChartCard>
            <ChartCard title="Team-wise Compliance" description="Sorted lowest first · click a team for its dashboard">
              <GroupComplianceBars
                data={[...m.teams]
                  .sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101))
                  .map((t) => ({ id: t.id, name: t.name, compliance: t.compliance, tier: t.tier, delta: t.delta, due: t.stats.due, overdue: t.stats.overdue, sub: t.parentName }))}
                threshold={threshold}
                onSelect={(d) => router.push(`/teams/${d.id}`)}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Process-wise Compliance" description="Adherence per process against the organization target">
              <GroupComplianceBars
                data={[...m.processes]
                  .sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101))
                  .map((p) => ({ id: p.id, name: p.name, compliance: p.compliance, tier: getTierFor(p.compliance, db.settings.thresholds), due: p.stats.due, overdue: p.stats.overdue, sub: `${p.categoryName} · owner ${p.ownerName}` }))}
                threshold={threshold}
                onSelect={(d) => router.push(`/processes/${d.id}`)}
              />
            </ChartCard>
            <ChartCard title="Process Completion Status" description="Share of tasks by status for each process · click to open tasks">
              <StatusStackedBars
                data={[...m.processes]
                  .sort((a, b) => b.stats.overdue - a.stats.overdue)
                  .map((p) => ({ id: p.id, name: p.name, completed: p.stats.completed, awaiting: p.stats.awaitingReview, pending: p.stats.pending - p.stats.awaitingReview, overdue: p.stats.overdue, rejected: p.stats.rejected }))}
                onSelect={(d) => router.push(`/compliance${q({ process: d.id })}`)}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <ChartCard className="lg:col-span-2" title="Employee Participation" description="Employees who submitted at least one required task">
              <ParticipationPanel m={m} onSelect={(id) => router.push(`/departments/${id}`)} />
            </ChartCard>
            <ChartCard className="lg:col-span-3" title="Monthly Performance Trend" description="Due tasks per month split into completed and not completed">
              <MonthlyPerformanceChart data={m.trend} onSelect={(d) => openMonth(d.key)} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedDepartments title="Top Performing Departments" icon={TrendingUp} rows={[...m.departments].filter((d) => d.compliance !== null).sort((a, b) => b.compliance! - a.compliance!).slice(0, 4)} />
            <AttentionDepartments threshold={threshold} rows={[...m.departments].filter((d) => d.compliance !== null && (d.compliance < threshold || d.stats.overdue > 0)).sort((a, b) => a.compliance! - b.compliance!).slice(0, 4)} />
          </div>
        </>
      )}
    </div>
  );
}

function TrendBadge({ m }: { m: DashboardMetrics }) {
  const pts = m.trend.filter((t) => t.compliance !== null);
  if (pts.length < 2) return null;
  const d = pts[pts.length - 1].compliance! - pts[0].compliance!;
  const Icon = d >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", d >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
      <Icon className="size-3.5" /> {formatDelta(d)} over 6 months
    </span>
  );
}

function InsightsStrip({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <section aria-label="Management insights" className="card-elevated p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-teal-soft text-teal">
          <Lightbulb className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Management Insights</h3>
          <p className="text-xs text-muted-foreground">Automatically derived from the current filters and period</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((i) => (
          <Link
            key={i.id}
            href={i.href}
            className={cn(
              "group rounded-lg border border-l-[3px] bg-background/60 p-3 transition-colors hover:bg-muted/60",
              i.tone === "positive" && "border-l-success",
              i.tone === "negative" && "border-l-danger",
              i.tone === "neutral" && "border-l-info",
            )}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{i.title}</div>
            <div className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">{i.headline}</div>
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.detail}</div>
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              View details <ArrowRight className="size-3" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ParticipationPanel({ m, onSelect }: { m: DashboardMetrics; onSelect: (id: string) => void }) {
  const rate = m.kpis.participation.value;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center">
      <div className="relative mx-auto size-[132px] shrink-0">
        <svg viewBox="0 0 132 132" className="-rotate-90">
          <circle cx="66" cy="66" r={r} fill="none" stroke="var(--muted)" strokeWidth="11" />
          <circle cx="66" cy="66" r={r} fill="none" stroke="var(--teal)" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - ((rate ?? 0) / 100) * c} style={{ transition: "stroke-dashoffset .6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">{formatPercent(rate)}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">participation</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {m.departments.filter((d) => d.stats.totalAssigned > 0).map((d) => (
          <li key={d.id}>
            <button className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60" onClick={() => onSelect(d.id)}>
              <span className="w-28 truncate text-muted-foreground">{d.name}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="absolute inset-y-0 left-0 rounded-full bg-teal" style={{ width: `${d.participation ?? 0}%` }} />
              </span>
              <span className="w-11 text-right font-medium tabular-nums">{formatPercent(d.participation, 0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankedDepartments({ title, icon: Icon, rows }: { title: string; icon: typeof TrendingUp; rows: DashboardMetrics["departments"] }) {
  return (
    <ChartCard title={title} description="Ranked by compliance in the selected period" actions={<Icon className="size-4 text-success" />}>
      <ol className="space-y-1 px-2">
        {rows.map((d, i) => (
          <li key={d.id}>
            <Link href={`/departments/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <span className={cn("text-xs tabular-nums", (d.delta ?? 0) >= 0 ? "text-success" : "text-danger")}>{formatDelta(d.delta)}</span>
                </div>
                <ComplianceBar value={d.compliance} className="mt-1" />
              </div>
            </Link>
          </li>
        ))}
        {!rows.length ? <li className="py-6 text-center text-sm text-muted-foreground">No departments with due tasks.</li> : null}
      </ol>
    </ChartCard>
  );
}

function AttentionDepartments({ rows, threshold }: { rows: DashboardMetrics["departments"]; threshold: number }) {
  return (
    <ChartCard title="Departments Requiring Attention" description={`Below the ${threshold}% target or carrying overdue work`} actions={<AlertTriangle className="size-4 text-warning" />}>
      <ul className="space-y-1 px-2">
        {rows.map((d) => (
          <li key={d.id}>
            <Link href={`/departments/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <TierBadge tier={d.tier} />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {d.stats.overdue} overdue · {d.stats.rejected} rejected · {d.stats.awaitingReview} awaiting review
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">{formatPercent(d.compliance)}</div>
                <div className="text-[11px] text-muted-foreground">gap {formatDelta(d.compliance !== null ? d.compliance - threshold : null)}</div>
              </div>
            </Link>
          </li>
        ))}
        {!rows.length ? <li className="py-6 text-center text-sm text-muted-foreground">All departments are on target with no overdue work.</li> : null}
      </ul>
    </ChartCard>
  );
}
