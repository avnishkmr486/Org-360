"use client";

import {
  Area,
  ComposedChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { ComplianceTier } from "@/types";
import { AngledTick, AXIS_PROPS, CategoryTick, ChartLegend, TooltipCard } from "./chart-card";
import { TIER_META } from "@/lib/constants";
import { formatPercent } from "@/lib/utils/format";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type TT = TooltipProps<number, string>;

/* --------------------------------- Trend -------------------------------- */

export interface TrendDatum {
  key: string;
  label: string;
  compliance: number | null;
  participation?: number | null;
  onTimeRate?: number | null;
  completed?: number;
  due?: number;
}

export function ComplianceTrendChart({ data, threshold, height = 260, onPointClick, showParticipation = true }: { data: TrendDatum[]; threshold: number; height?: number; onPointClick?: (d: TrendDatum) => void; showParticipation?: boolean }) {
  const animate = !useReducedMotion();
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 12, left: -12, bottom: 0 }}
            onClick={(e) => {
              const p = e?.activePayload?.[0]?.payload as TrendDatum | undefined;
              if (p && onPointClick) onPointClick(p);
            }}
            style={{ cursor: onPointClick ? "pointer" : undefined }}
          >
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="0" />
            <XAxis dataKey="label" {...AXIS_PROPS} dy={6} />
            <YAxis {...AXIS_PROPS} domain={[(min: number) => Math.max(0, Math.floor((min - 8) / 5) * 5), 100]} tickFormatter={(v) => `${v}%`} width={48} />
            <ReferenceLine y={threshold} stroke="var(--warning)" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Target ${threshold}%`, position: "insideTopRight", fill: "var(--warning)", fontSize: 10 }} />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
              content={({ active, payload }: TT) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as TrendDatum;
                return (
                  <TooltipCard
                    title={d.label}
                    rows={[
                      { label: "Compliance", value: formatPercent(d.compliance), color: "var(--chart-1)" },
                      ...(showParticipation ? [{ label: "Participation", value: formatPercent(d.participation ?? null), color: "var(--chart-3)" }] : []),
                      ...(d.onTimeRate !== undefined ? [{ label: "On-time rate", value: formatPercent(d.onTimeRate ?? null) }] : []),
                      ...(d.due !== undefined ? [{ label: "Completed / due", value: `${d.completed} / ${d.due}` }] : []),
                    ]}
                    footer={onPointClick ? "Click to open this month's tasks" : undefined}
                  />
                );
              }}
            />
            <Area isAnimationActive={animate} type="monotone" dataKey="compliance" stroke="var(--chart-1)" strokeWidth={2} fill="url(#trendFill)" dot={{ r: 3.5, strokeWidth: 2, fill: "var(--card)" }} activeDot={{ r: 5 }} connectNulls />
            {showParticipation ? <Line isAnimationActive={animate} type="monotone" dataKey="participation" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        className="mt-1"
        items={[
          { label: "Compliance", color: "var(--chart-1)" },
          ...(showParticipation ? [{ label: "Participation", color: "var(--chart-3)" }] : []),
          { label: "Target", color: "var(--warning)", dashed: true },
        ]}
      />
    </div>
  );
}

/* ------------------------- Compliance by group -------------------------- */

export interface GroupDatum {
  id: string;
  name: string;
  compliance: number | null;
  tier: ComplianceTier;
  sub?: string;
  delta?: number | null;
  due?: number;
  overdue?: number;
}

const TIER_ORDER: ComplianceTier[] = ["excellent", "good", "needs_improvement", "critical"];

function GroupTooltip({ active, payload, clickable }: TT & { clickable?: boolean }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as GroupDatum;
  return (
    <TooltipCard
      title={d.name}
      rows={[
        { label: "Compliance", value: formatPercent(d.compliance), color: TIER_META[d.tier].color },
        { label: "Rating", value: TIER_META[d.tier].label },
        ...(d.delta !== undefined && d.delta !== null ? [{ label: "vs previous period", value: `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(1)} pts` }] : []),
        ...(d.due !== undefined ? [{ label: "Due tasks", value: String(d.due) }] : []),
        ...(d.overdue !== undefined ? [{ label: "Overdue", value: String(d.overdue) }] : []),
      ]}
      footer={d.sub ?? (clickable ? "Click to drill down" : undefined)}
    />
  );
}

/** Vertical bars (categories on X), colored by tier, with target line. */
/** Groups with no applicable tasks have nothing to plot — hide them and say how many. */
function HiddenNote({ count }: { count: number }) {
  if (!count) return null;
  return <p className="mt-1 px-2 text-[11px] text-muted-foreground">{count} with no applicable tasks in this period {count === 1 ? "is" : "are"} not shown.</p>;
}

export function GroupComplianceColumns({ data: allData, threshold, height = 260, onSelect }: { data: GroupDatum[]; threshold: number; height?: number; onSelect?: (d: GroupDatum) => void }) {
  const animate = !useReducedMotion();
  const data = allData.filter((d) => d.compliance !== null);
  const hidden = allData.length - data.length;
  const tiers = TIER_ORDER.filter((t) => data.some((d) => d.tier === t));
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: 28, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" {...AXIS_PROPS} interval={0} height={74} tick={<AngledTick />} />
            <YAxis {...AXIS_PROPS} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={48} />
            <ReferenceLine y={threshold} stroke="var(--warning)" strokeDasharray="5 4" strokeWidth={1.5} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p: TT) => <GroupTooltip {...p} clickable={Boolean(onSelect)} />} />
            <Bar isAnimationActive={animate} dataKey="compliance" radius={[4, 4, 0, 0]} maxBarSize={44} onClick={(d: unknown) => onSelect?.((d as { payload: GroupDatum }).payload)} style={{ cursor: onSelect ? "pointer" : undefined }} label={{ position: "top", fontSize: 10, fill: "var(--muted-foreground)", formatter: (v: number) => (v === null || v === undefined ? "" : `${v.toFixed(0)}%`) }}>
              {data.map((d) => (
                <Cell key={d.id} fill={TIER_META[d.tier].color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend className="mt-1" items={[...tiers.map((t) => ({ label: TIER_META[t].label, color: TIER_META[t].color })), { label: `Target ${threshold}%`, color: "var(--warning)", dashed: true }]} />
      <HiddenNote count={hidden} />
    </div>
  );
}

/** Horizontal bars (categories on Y) — better for long names (teams, processes). */
export function GroupComplianceBars({ data: allData, threshold, onSelect, rowHeight = 30 }: { data: GroupDatum[]; threshold: number; onSelect?: (d: GroupDatum) => void; rowHeight?: number }) {
  const animate = !useReducedMotion();
  const data = allData.filter((d) => d.compliance !== null);
  const hidden = allData.length - data.length;
  const tiers = TIER_ORDER.filter((t) => data.some((d) => d.tier === t));
  const height = Math.max(160, data.length * rowHeight + 30);
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" domain={[0, 100]} {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={178} interval={0} tick={<CategoryTick />} />
            <ReferenceLine x={threshold} stroke="var(--warning)" strokeDasharray="5 4" strokeWidth={1.5} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={(p: TT) => <GroupTooltip {...p} clickable={Boolean(onSelect)} />} />
            <Bar isAnimationActive={animate} dataKey="compliance" radius={[0, 4, 4, 0]} maxBarSize={18} onClick={(d: unknown) => onSelect?.((d as { payload: GroupDatum }).payload)} style={{ cursor: onSelect ? "pointer" : undefined }} label={{ position: "right", fontSize: 10.5, fill: "var(--muted-foreground)", formatter: (v: number) => (v === null || v === undefined ? "N/A" : `${v.toFixed(1)}%`) }}>
              {data.map((d) => (
                <Cell key={d.id} fill={TIER_META[d.tier].color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend className="mt-1" items={[...tiers.map((t) => ({ label: TIER_META[t].label, color: TIER_META[t].color })), { label: `Target ${threshold}%`, color: "var(--warning)", dashed: true }]} />
      <HiddenNote count={hidden} />
    </div>
  );
}

/* ----------------------------- Distribution ----------------------------- */

export function TierDonut({ data, onSelect, height = 220, centerLabel = "Employees" }: { data: { tier: ComplianceTier; label: string; count: number }[]; onSelect?: (tier: ComplianceTier) => void; height?: number; centerLabel?: string }) {
  const animate = !useReducedMotion();
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative w-full max-w-[220px] shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }: TT) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return <TooltipCard title={d.label} rows={[{ label: "Employees", value: String(d.count), color: TIER_META[d.tier].color }, { label: "Share", value: formatPercent(total ? (d.count / total) * 100 : null) }]} footer={onSelect ? "Click to view employees" : undefined} />;
              }}
            />
            <Pie isAnimationActive={animate} data={data} dataKey="count" nameKey="label" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="var(--card)" strokeWidth={2} onClick={(d: unknown) => onSelect?.((d as { payload: { tier: ComplianceTier } }).payload.tier)} style={{ cursor: onSelect ? "pointer" : undefined }}>
              {data.map((d) => (
                <Cell key={d.tier} fill={TIER_META[d.tier].color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.tier}>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/60" onClick={() => onSelect?.(d.tier)}>
              <span className="size-2.5 rounded-[3px]" style={{ background: TIER_META[d.tier].color }} />
              <span className="flex-1 text-muted-foreground">{d.label}</span>
              <span className="font-semibold tabular-nums">{d.count}</span>
              <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{formatPercent(total ? (d.count / total) * 100 : null, 0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------- Status stacked ---------------------------- */

export interface StatusDatum {
  id: string;
  name: string;
  completed: number;
  awaiting: number;
  pending: number;
  overdue: number;
  rejected: number;
}

const STATUS_SERIES: { key: keyof Omit<StatusDatum, "id" | "name">; label: string; color: string }[] = [
  { key: "completed", label: "Completed", color: "var(--success)" },
  { key: "awaiting", label: "Awaiting review", color: "var(--teal)" },
  { key: "pending", label: "Pending", color: "var(--chart-axis)" },
  { key: "rejected", label: "Rejected", color: "var(--warning)" },
  { key: "overdue", label: "Overdue", color: "var(--danger)" },
];

export function StatusStackedBars({ data, onSelect, rowHeight = 30 }: { data: StatusDatum[]; onSelect?: (d: StatusDatum) => void; rowHeight?: number }) {
  const animate = !useReducedMotion();
  const height = Math.max(160, data.length * rowHeight + 30);
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap="22%" stackOffset="expand">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={178} interval={0} tick={<CategoryTick />} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }: TT) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as StatusDatum;
                const total = d.completed + d.awaiting + d.pending + d.overdue + d.rejected;
                return <TooltipCard title={d.name} rows={STATUS_SERIES.map((s) => ({ label: s.label, value: `${d[s.key]} (${total ? Math.round((d[s.key] / total) * 100) : 0}%)`, color: s.color }))} footer={onSelect ? "Click to open tasks" : `${total} tasks`} />;
              }}
            />
            {STATUS_SERIES.map((s, i) => (
              <Bar isAnimationActive={animate} key={s.key} dataKey={s.key} stackId="s" fill={s.color} stroke="var(--card)" strokeWidth={1} maxBarSize={18} radius={i === STATUS_SERIES.length - 1 ? [0, 4, 4, 0] : 0} onClick={(d: unknown) => onSelect?.((d as { payload: StatusDatum }).payload)} style={{ cursor: onSelect ? "pointer" : undefined }} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend className="mt-1" items={STATUS_SERIES.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}

/* -------------------------- Monthly performance ------------------------- */

export function MonthlyPerformanceChart({ data, height = 240, onSelect }: { data: TrendDatum[]; height?: number; onSelect?: (d: TrendDatum) => void }) {
  const animate = !useReducedMotion();
  const rows = data.map((d) => ({ ...d, missed: Math.max(0, (d.due ?? 0) - (d.completed ?? 0)), completedDue: Math.min(d.completed ?? 0, d.due ?? 0) }));
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 12, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} dy={6} />
            <YAxis {...AXIS_PROPS} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }: TT) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof rows)[number];
                return (
                  <TooltipCard
                    title={d.label}
                    rows={[
                      { label: "Completed", value: String(d.completedDue), color: "var(--chart-1)" },
                      { label: "Not completed", value: String(d.missed), color: "var(--chart-2)" },
                      { label: "Compliance", value: formatPercent(d.compliance) },
                      { label: "On-time rate", value: formatPercent(d.onTimeRate ?? null) },
                    ]}
                  />
                );
              }}
            />
            <Bar isAnimationActive={animate} dataKey="completedDue" stackId="m" fill="var(--chart-1)" maxBarSize={36} stroke="var(--card)" strokeWidth={1} onClick={(d: unknown) => onSelect?.((d as { payload: TrendDatum }).payload)} style={{ cursor: onSelect ? "pointer" : undefined }} />
            <Bar isAnimationActive={animate} dataKey="missed" stackId="m" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} stroke="var(--card)" strokeWidth={1} onClick={(d: unknown) => onSelect?.((d as { payload: TrendDatum }).payload)} style={{ cursor: onSelect ? "pointer" : undefined }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend className="mt-1" items={[{ label: "Completed", color: "var(--chart-1)" }, { label: "Not completed", color: "var(--chart-2)" }]} />
    </div>
  );
}
