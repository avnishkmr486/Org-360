"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import {
  Activity,
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  Award,
  Briefcase,
  Building,
  Crown,
  FileBarChart2,
  Layers,
  LineChart,
  User,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/states";
import { TierBadge } from "@/components/common/badges";
import { AXIS_PROPS, CategoryTick, ChartCard, TooltipCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart, GroupComplianceBars } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand";
import { AnalyticsFilterBar, useAnalyticsFilter } from "@/components/dashboard/analytics-filters";
import { useCurrentUser, useDatabase, useToday } from "@/hooks/use-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { formatCell, getReport, REPORTS, type ReportDefinition, type ReportRow } from "./definitions";

const ICONS: Record<ReportDefinition["icon"], LucideIcon> = {
  building: Building,
  layers: Layers,
  users: Users,
  user: User,
  workflow: Workflow,
  alarm: AlarmClock,
  activity: Activity,
  trend: LineChart,
  award: Award,
  briefcase: Briefcase,
  crown: Crown,
};

/* -------------------------------- Catalog ------------------------------- */

export function ReportsCatalog() {
  const db = useDatabase();
  const groups: ReportDefinition["group"][] = ["Organization", "People", "Process"];
  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Reports & Analytics" }]}
        title="Reports & Analytics"
        description={`Branded, filterable compliance reports for ${db.organization.name}. Every report exports to Excel and PDF.`}
        actions={
          <Button size="sm" asChild>
            <Link href="/reports/organization">
              <FileBarChart2 /> Open organization report
            </Link>
          </Button>
        }
      />
      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g} reports</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {REPORTS.filter((r) => r.group === g).map((r) => {
              const Icon = ICONS[r.icon];
              return (
                <Link key={r.id} href={`/reports/${r.id}`} className="card-elevated card-hover group flex flex-col gap-3 p-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-teal-soft text-teal">
                    <Icon className="size-4" />
                  </span>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{r.title}</div>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Open report <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* --------------------------------- Viewer ------------------------------- */

export function ReportViewer({ reportId }: { reportId: string }) {
  const db = useDatabase();
  const today = useToday();
  const router = useRouter();
  const { scope, can } = useCurrentUser();
  const { filter } = useAnalyticsFilter();
  const def = getReport(reportId);
  const result = useMemo(() => (def ? def.build(db, filter, scope, today) : null), [def, db, filter, scope, today]);
  const generatedAt = useMemo(() => format(new Date(), "dd MMM yyyy, hh:mm a"), [result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!def || !result) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Reports & Analytics", href: "/reports" }, { label: "Not found" }]} title="Report not found" />
        <EmptyState
          icon={<FileBarChart2 className="size-5" />}
          title={`No report named "${reportId}"`}
          description="The report may have been renamed. Choose one from the catalog."
          action={
            <Button size="sm" asChild>
              <Link href="/reports">
                <ArrowLeft /> Back to reports
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const Icon = ICONS[def.icon];
  const filterLines = describeFilters(db, filter);
  const columns: Column<ReportRow>[] = result.columns.map((c, i) => ({
    id: c.key,
    header: c.header,
    align: c.align,
    sortValue: (r) => r[c.key],
    cell: (r) => {
      const text = formatCell(r[c.key], c.format);
      if (i === 0 && r._href) {
        return (
          <span className="flex items-center gap-2">
            <span className="font-medium text-foreground">{text}</span>
            {r._tier && c.key === "name" && result.columns.some((x) => x.key === "compliance") ? <TierBadge tier={r._tier} /> : null}
          </span>
        );
      }
      if (c.format === "delta" && typeof r[c.key] === "number") {
        const v = r[c.key] as number;
        return <span className={cn("tabular-nums", v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted-foreground")}>{text}</span>;
      }
      return <span className={cn(c.align === "right" && "tabular-nums", (c.width ?? 0) >= 40 && "line-clamp-2 max-w-[360px] text-xs text-muted-foreground")}>{text}</span>;
    },
  }));

  const exportBase = {
    organizationName: db.organization.name,
    title: def.title,
    subtitle: `Reporting period: ${formatRange(filter.range)}`,
    filters: [...filterLines, ...(result.note ? [result.note] : [])],
    fileName: `Altametrics_${def.title.replace(/\s+/g, "_")}_${filter.range.to}`,
    summary: result.summary,
    footer: db.settings.reportFooter,
    rows: result.rows,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: "Reports & Analytics", href: "/reports" }, { label: def.title }]}
        title={def.title}
        description={def.description}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/reports">
                <ArrowLeft /> All reports
              </Link>
            </Button>
            {can("reports.export") ? (
              <ExportMenu
                onExcel={() => exportToExcel({ ...exportBase, sheetName: def.title, columns: result.columns.map((c) => ({ header: c.header, width: c.width, value: (r: ReportRow) => r[c.key], numFmt: c.format === "percent" ? '0.0"%"' : undefined })) })}
                onPdf={() => exportToPdf({ ...exportBase, columns: result.columns.map((c) => ({ header: c.header, align: c.align, value: (r: ReportRow) => formatCell(r[c.key], c.format) })) })}
              />
            ) : null}
          </>
        }
        filters={<AnalyticsFilterBar show={def.filters} />}
      />

      {/* Branded report header */}
      <div className="card-elevated overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 bg-[var(--navy)] px-5 py-4 text-white dark:bg-[#0b1f47]">
          <BrandMark size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-[0.14em] text-white/70">{db.organization.name} · Organization 360</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Icon className="size-5 text-teal-300" /> {def.title}
            </div>
          </div>
          <div className="text-right text-xs text-white/75">
            <div>Period: {formatRange(filter.range)}</div>
            <div>Generated: {generatedAt}</div>
          </div>
        </div>
        <div className="h-[3px] bg-teal" />
        {filterLines.length ? <div className="border-b px-5 py-2 text-xs text-muted-foreground">{filterLines.join(" · ")}</div> : null}
        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          {result.summary.map((s) => (
            <div key={s.label} className="px-5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="text-xl font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {result.note ? <p className="text-xs text-muted-foreground">{result.note}</p> : null}

      {result.rows.length === 0 ? (
        <EmptyState title="No data for this selection" description="Widen the reporting period from the top bar or clear filters." />
      ) : (
        <>
          {result.chart ? (
            <ChartCard title={result.chartTitle ?? "Overview"}>
              {result.chart.kind === "trend" ? (
                <ComplianceTrendChart data={result.chart.data} threshold={db.settings.thresholds.good} />
              ) : result.chart.kind === "compliance-bars" ? (
                <GroupComplianceBars
                  data={result.chart.data}
                  threshold={db.settings.thresholds.good}
                  onSelect={result.chart.hrefPrefix ? (d) => router.push(`${(result.chart as { hrefPrefix?: string }).hrefPrefix}${d.id}`) : undefined}
                />
              ) : (
                <CountBars data={result.chart.data} label={result.chart.label} />
              )}
            </ChartCard>
          ) : null}
          <DataTable columns={columns} rows={result.rows} getRowId={(r) => r._id} onRowClick={(r) => r._href && router.push(r._href)} pageSize={20} />
        </>
      )}
    </div>
  );
}

function describeFilters(db: ReturnType<typeof useDatabase>, f: ReturnType<typeof useAnalyticsFilter>["filter"]): string[] {
  const out: string[] = [];
  const n = <T extends { id: string; name: string }>(list: T[], id?: string | null) => list.find((x) => x.id === id)?.name;
  if (f.departmentId) out.push(`Department: ${n(db.departments, f.departmentId)}`);
  if (f.teamId) out.push(`Team: ${n(db.teams, f.teamId)}`);
  if (f.employeeId) {
    const e = db.employees.find((x) => x.id === f.employeeId);
    if (e) out.push(`Employee: ${e.firstName} ${e.lastName}`);
  }
  if (f.bandId) out.push(`Band: ${n(db.bands, f.bandId)}`);
  if (f.processCategoryId) out.push(`Category: ${n(db.processCategories, f.processCategoryId)}`);
  if (f.processId) out.push(`Process: ${n(db.processes, f.processId)}`);
  return out;
}

type TT = TooltipProps<number, string>;

function CountBars({ data, label }: { data: { id: string; name: string; value: number }[]; label: string }) {
  const animate = !useReducedMotion();
  const height = Math.max(150, data.length * 30 + 30);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={178} interval={0} tick={<CategoryTick />} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }: TT) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return <TooltipCard title={d.name} rows={[{ label, value: String(d.value), color: "var(--danger)" }]} />;
            }}
          />
          <Bar isAnimationActive={animate} dataKey="value" fill="var(--danger)" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 10.5, fill: "var(--muted-foreground)" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
