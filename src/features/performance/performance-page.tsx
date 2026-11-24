"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { ArrowDownRight, ArrowUpRight, Info, Minus, Star, X } from "lucide-react";
import type { ComplianceTier, Employee } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/states";
import { TierBadge } from "@/components/common/badges";
import { ComplianceBar, ComplianceRing } from "@/components/common/compliance-indicator";
import { PersonCell } from "@/components/common/user-avatar";
import { SearchInput } from "@/components/common/filters";
import { AXIS_PROPS, CategoryTick, ChartCard, ChartLegend, TooltipCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AnalyticsFilterBar, useAnalyticsFilter } from "@/components/dashboard/analytics-filters";
import { StatPill } from "@/features/dashboards/widgets";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { computeStats, employeeMatches, filterTasks, getTier, groupStats, type ComplianceStats } from "@/lib/calculations/compliance";
import { inScope } from "@/lib/auth/permissions";
import { TIER_META } from "@/lib/constants";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatDelta, formatPercent } from "@/lib/utils/format";
import { formatRange, monthBuckets, previousPeriod } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

interface PerfRow {
  employee: Employee;
  name: string;
  stats: ComplianceStats;
  tier: ComplianceTier;
  delta: number | null;
  rejectionRate: number | null;
}

const TIER_FILTER_LABEL: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  needs_improvement: "Needs Improvement",
  critical: "Critical",
  compliant: "Compliant (≥ target)",
  noncompliant: "Non-compliant (< target)",
};

export function PerformancePage() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const { scope, role, employee: me, can } = useCurrentUser();
  const { filter } = useAnalyticsFilter();
  const { values: tv, set: setTier } = useUrlFilters(["tier"] as const);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PerfRow | null>(null);
  const thresholds = db.settings.thresholds;
  const isEmployee = role === "employee";

  const rows = useMemo<PerfRow[]>(() => {
    const tasks = filterTasks(db, filter, scope);
    const prev = filterTasks(db, { ...filter, range: previousPeriod(filter.range) }, scope);
    const cur = groupStats(tasks, (t) => t.employeeId, today);
    const old = groupStats(prev, (t) => t.employeeId, today);
    const empty = computeStats([], today);
    return db.employees
      .filter((e) => e.status !== "inactive" && employeeMatches(e, filter, scope))
      .map((e) => {
        const s = cur.get(e.id) ?? empty;
        const p = old.get(e.id)?.compliance ?? null;
        const reviewed = s.completed + s.rejected;
        return {
          employee: e,
          name: `${e.firstName} ${e.lastName}`,
          stats: s,
          tier: getTier(s.compliance, thresholds),
          delta: s.compliance !== null && p !== null ? Math.round((s.compliance - p) * 10) / 10 : null,
          rejectionRate: reviewed ? Math.round((s.rejected / reviewed) * 1000) / 10 : null,
        };
      });
  }, [db, filter, scope, today, thresholds]);

  const tierFilter = tv.tier;
  const visible = rows.filter((r) => {
    if (search && !`${r.name} ${r.employee.id}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (!tierFilter) return true;
    if (tierFilter === "compliant") return r.stats.compliance !== null && r.stats.compliance >= thresholds.good;
    if (tierFilter === "noncompliant") return r.stats.compliance !== null && r.stats.compliance < thresholds.good;
    return r.tier === tierFilter;
  });

  // Team comparison
  const teamsInScope = db.teams.filter((t) => t.status === "active" && db.employees.some((e) => e.teamId === t.id && inScope(e, scope)));
  const [cmpTeamState, setCmpTeam] = useState<string>("");
  const cmpTeam = cmpTeamState || filter.teamId || me?.teamId || teamsInScope[0]?.id || "";
  const teamAvg = useMemo(() => {
    // Team average uses all team tasks (anonymized aggregate) regardless of persona scope.
    const t = filterTasks(db, { range: filter.range, teamId: cmpTeam }, null);
    return computeStats(t, today).compliance;
  }, [db, filter.range, cmpTeam, today]);
  const comparison = useMemo(() => {
    if (isEmployee) {
      const mine = rows.find((r) => r.employee.id === me?.id);
      return [
        ...(mine ? [{ id: mine.employee.id, name: "You", compliance: mine.stats.compliance, tier: mine.tier }] : []),
        { id: "avg", name: "Team average", compliance: teamAvg, tier: getTier(teamAvg, thresholds) },
      ];
    }
    return rows
      .filter((r) => r.employee.teamId === cmpTeam)
      .sort((a, b) => (b.stats.compliance ?? -1) - (a.stats.compliance ?? -1))
      .map((r) => ({ id: r.employee.id, name: r.name, compliance: r.stats.compliance, tier: r.tier }));
  }, [rows, cmpTeam, isEmployee, me, teamAvg, thresholds]);

  const columns: Column<PerfRow>[] = [
    { id: "name", header: "Employee", cell: (r) => <PersonCell name={r.name} sub={`${r.employee.id} · ${L.bandName(r.employee.bandId)}`} />, sortValue: (r) => r.name },
    { id: "team", header: "Team", cell: (r) => <span className="block max-w-[170px] truncate whitespace-nowrap text-xs text-muted-foreground">{r.employee.teamId ? L.teamName(r.employee.teamId) : L.deptName(r.employee.departmentId)}</span>, sortValue: (r) => L.teamName(r.employee.teamId) },
    { id: "compliance", header: "Compliance", cell: (r) => <ComplianceBar value={r.stats.compliance} />, sortValue: (r) => r.stats.compliance ?? -1 },
    { id: "rating", header: "Rating", cell: (r) => <TierBadge tier={r.tier} />, sortValue: (r) => r.stats.compliance ?? -1 },
    { id: "completion", header: "Completion", align: "right", cell: (r) => <span className="tabular-nums">{formatPercent(r.stats.completionRate)}</span>, sortValue: (r) => r.stats.completionRate ?? -1 },
    { id: "ontime", header: "On-time", align: "right", cell: (r) => <span className="tabular-nums">{formatPercent(r.stats.onTimeRate)}</span>, sortValue: (r) => r.stats.onTimeRate ?? -1 },
    { id: "pending", header: "Pending", align: "right", cell: (r) => <span className="tabular-nums">{r.stats.pending}</span>, sortValue: (r) => r.stats.pending },
    { id: "overdue", header: "Overdue", align: "right", cell: (r) => <span className={cn("tabular-nums", r.stats.overdue > 0 && "font-medium text-danger")}>{r.stats.overdue}</span>, sortValue: (r) => r.stats.overdue },
    {
      id: "quality",
      header: "Submission quality",
      cell: (r) => (
        <div className="text-xs">
          <span className="inline-flex items-center gap-0.5 font-medium">
            <Star className="size-3 fill-warning text-warning" /> {r.stats.avgQuality !== null ? `${r.stats.avgQuality.toFixed(1)}/5` : "—"}
          </span>
          <div className="text-muted-foreground">{r.rejectionRate !== null ? `${r.rejectionRate.toFixed(0)}% rejected` : "no reviews"}</div>
        </div>
      ),
      sortValue: (r) => r.stats.avgQuality ?? -1,
    },
    { id: "trend", header: "vs prev.", align: "right", cell: (r) => <DeltaChip delta={r.delta} />, sortValue: (r) => r.delta ?? -999 },
  ];

  const exportCols = [
    { header: "Employee ID", value: (r: PerfRow) => r.employee.id },
    { header: "Employee", value: (r: PerfRow) => r.name, width: 24 },
    { header: "Team", value: (r: PerfRow) => L.teamName(r.employee.teamId), width: 26 },
    { header: "Compliance %", value: (r: PerfRow) => r.stats.compliance, numFmt: '0.0"%"' },
    { header: "Completion %", value: (r: PerfRow) => r.stats.completionRate, numFmt: '0.0"%"' },
    { header: "On-time %", value: (r: PerfRow) => r.stats.onTimeRate, numFmt: '0.0"%"' },
    { header: "Pending", value: (r: PerfRow) => r.stats.pending },
    { header: "Overdue", value: (r: PerfRow) => r.stats.overdue },
    { header: "Avg quality (/5)", value: (r: PerfRow) => r.stats.avgQuality },
    { header: "Rejection %", value: (r: PerfRow) => r.rejectionRate },
  ];
  const note = "Compliance measures process adherence only and is not a complete measure of overall employee performance.";

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Employee Performance" }]}
        title="Employee Performance"
        description={`Process adherence analytics per employee · ${formatRange(filter.range)}`}
        actions={
          can("reports.export") ? (
            <ExportMenu
              onExcel={() => exportToExcel({ organizationName: db.organization.name, title: "Employee Process Performance", subtitle: `Period: ${formatRange(filter.range)}`, filters: [note], fileName: `Employee_Performance_${filter.range.to}`, columns: exportCols, rows: visible, footer: db.settings.reportFooter })}
              onPdf={() =>
                exportToPdf({
                  organizationName: db.organization.name,
                  title: "Employee Process Performance",
                  subtitle: `Period: ${formatRange(filter.range)}`,
                  filters: [note],
                  fileName: `Employee_Performance_${filter.range.to}`,
                  columns: exportCols.map((c) => ({ header: c.header, value: (r: PerfRow) => { const v = c.value(r); return typeof v === "number" && c.header.includes("%") ? formatPercent(v) : v; } })),
                  rows: visible,
                  footer: db.settings.reportFooter,
                })
              }
            />
          ) : null
        }
        filters={
          <>
            {!isEmployee ? <AnalyticsFilterBar show={["department", "team", "band", "category", "process"]} /> : null}
            {tierFilter ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-info-soft/50 px-2.5 text-xs">
                Rating: <span className="font-medium">{TIER_FILTER_LABEL[tierFilter] ?? tierFilter}</span>
                <button onClick={() => setTier({ tier: null })} aria-label="Clear rating filter" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft/50 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          <span className="font-medium">{note}</span> <span className="text-muted-foreground">Use it alongside goals, feedback and delivery outcomes in performance discussions.</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title={isEmployee ? "You vs. your team" : "Team comparison"}
          description={isEmployee ? "Your compliance against the anonymized team average" : "Compare employees within the same team against the team average"}
          actions={
            !isEmployee && teamsInScope.length > 1 ? (
              <Select value={cmpTeam} onValueChange={setCmpTeam}>
                <SelectTrigger size="sm" className="h-8 w-[220px] text-xs" aria-label="Comparison team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamsInScope.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null
          }
        >
          {comparison.length ? <TeamComparisonChart data={comparison} teamAvg={teamAvg} threshold={thresholds.good} onSelect={(id) => setSelected(rows.find((r) => r.employee.id === id) ?? null)} /> : <EmptyState title="No employees in this team for the current filters" />}
        </ChartCard>
        <ChartCard className="lg:col-span-2" title="Rating distribution" description="Click a rating to filter the table">
          <div className="space-y-2 px-2 pt-1">
            {(["excellent", "good", "needs_improvement", "critical", "na"] as ComplianceTier[]).map((t) => {
              const n = rows.filter((r) => r.tier === t).length;
              return (
                <button key={t} disabled={t === "na"} onClick={() => setTier({ tier: tierFilter === t ? null : t })} className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent", tierFilter === t && "bg-muted")}>
                  <span className="size-2.5 rounded-[3px]" style={{ background: TIER_META[t].color }} />
                  <span className="flex-1 text-muted-foreground">{t === "na" ? "No applicable tasks" : TIER_META[t].label}</span>
                  <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${rows.length ? (n / rows.length) * 100 : 0}%`, background: TIER_META[t].color }} />
                  </span>
                  <span className="w-6 text-right font-semibold tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        </ChartCard>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Employee metrics <span className="font-normal text-muted-foreground">({visible.length})</span>
          </h3>
          <SearchInput value={search} onChange={setSearch} placeholder="Search employees…" />
        </div>
        <DataTable columns={columns} rows={visible} getRowId={(r) => r.employee.id} onRowClick={setSelected} initialSort={{ id: "compliance", dir: "desc" }} empty={<EmptyState title="No employees match" description="Adjust filters or clear the rating filter." />} />
      </div>

      <EmployeeDrilldown row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground")}>
      <Icon className="size-3" />
      {formatDelta(delta)}
    </span>
  );
}

type TT = TooltipProps<number, string>;

function TeamComparisonChart({ data, teamAvg, threshold, onSelect }: { data: { id: string; name: string; compliance: number | null; tier: ComplianceTier }[]; teamAvg: number | null; threshold: number; onSelect: (id: string) => void }) {
  const animate = !useReducedMotion();
  const height = Math.max(160, data.length * 30 + 30);
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" domain={[0, 100]} {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={150} interval={0} tick={<CategoryTick maxChars={22} />} />
            {teamAvg !== null ? <ReferenceLine x={teamAvg} stroke="var(--chart-7)" strokeWidth={1.5} strokeDasharray="2 3" /> : null}
            <ReferenceLine x={threshold} stroke="var(--warning)" strokeDasharray="5 4" strokeWidth={1.5} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }: TT) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return <TooltipCard title={d.name} rows={[{ label: "Compliance", value: formatPercent(d.compliance), color: TIER_META[d.tier].color }, { label: "Team average", value: formatPercent(teamAvg) }, { label: "Gap to average", value: d.compliance !== null && teamAvg !== null ? formatDelta(d.compliance - teamAvg) : "—" }]} />;
              }}
            />
            <Bar isAnimationActive={animate} dataKey="compliance" radius={[0, 4, 4, 0]} maxBarSize={18} onClick={(d: unknown) => { const p = (d as { payload: { id: string } }).payload; if (p.id !== "avg") onSelect(p.id); }} style={{ cursor: "pointer" }} label={{ position: "right", fontSize: 10.5, fill: "var(--muted-foreground)", formatter: (v: number) => (v === null || v === undefined ? "N/A" : `${v.toFixed(1)}%`) }}>
              {data.map((d) => (
                <Cell key={d.id} fill={d.id === "avg" ? "var(--chart-7)" : TIER_META[d.tier].color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend className="mt-1" items={[{ label: `Team average ${formatPercent(teamAvg)}`, color: "var(--chart-7)", dashed: true }, { label: `Target ${threshold}%`, color: "var(--warning)", dashed: true }]} />
    </div>
  );
}

function EmployeeDrilldown({ row, onClose }: { row: PerfRow | null; onClose: () => void }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const trend = useMemo(() => {
    if (!row) return [];
    const mine = db.tasks.filter((t) => t.employeeId === row.employee.id);
    return monthBuckets(today, 6).map((b) => {
      const s = computeStats(mine.filter((t) => t.dueDate >= b.range.from && t.dueDate <= b.range.to), today);
      return { key: b.key, label: b.label, compliance: s.compliance, completed: s.completed, due: s.due, onTimeRate: s.onTimeRate };
    });
  }, [db.tasks, row, today]);
  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {row ? (
          <>
            <SheetHeader>
              <SheetTitle>{row.name}</SheetTitle>
              <SheetDescription>
                {L.bandName(row.employee.bandId)} · {L.teamName(row.employee.teamId)} · {L.deptName(row.employee.departmentId)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="flex items-center gap-4">
                <ComplianceRing value={row.stats.compliance} size={112} />
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <StatPill label="Completion rate" value={formatPercent(row.stats.completionRate)} />
                  <StatPill label="On-time rate" value={formatPercent(row.stats.onTimeRate)} />
                  <StatPill label="Pending" value={row.stats.pending} tone="warning" />
                  <StatPill label="Overdue" value={row.stats.overdue} tone={row.stats.overdue ? "danger" : undefined} />
                  <StatPill label="Avg quality" value={row.stats.avgQuality !== null ? `${row.stats.avgQuality}/5` : "—"} />
                  <StatPill label="Rejection rate" value={formatPercent(row.rejectionRate)} />
                </div>
              </div>
              <div>
                <h4 className="mb-1 text-sm font-semibold">Historical performance trend</h4>
                <ComplianceTrendChart data={trend} threshold={db.settings.thresholds.good} height={200} showParticipation={false} />
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Compliance measures process adherence only and is not a complete measure of overall employee performance.</p>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link href={`/employees/${row.employee.id}`}>Open employee profile</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/compliance?employee=${row.employee.id}`}>View tasks</Link>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
