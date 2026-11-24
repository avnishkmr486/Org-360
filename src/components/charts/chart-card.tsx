"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-elevated flex min-w-0 flex-col fade-in", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      <div className={cn("min-w-0 flex-1 px-3 pb-3 pt-2", bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t px-5 py-2.5 text-xs text-muted-foreground">{footer}</footer> : null}
    </section>
  );
}

/** Legend row — identity is never color-alone: swatch + text. */
export function ChartLegend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground", className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Shared tooltip surface for all Recharts charts. */
export function TooltipCard({ title, rows, footer }: { title: string; rows: TooltipRow[]; footer?: string }) {
  return (
    <div className="min-w-[180px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <div className="mb-1.5 font-semibold">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              {r.color ? <span className="size-2 rounded-[2px]" style={{ background: r.color }} /> : null}
              {r.label}
            </span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

const truncate = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

/** Single-line category tick for horizontal bar charts (Recharts wraps by default). */
export function CategoryTick({ x = 0, y = 0, payload, maxChars = 26 }: TickProps & { maxChars?: number }) {
  const v = payload?.value ?? "";
  return (
    <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
      <title>{v}</title>
      {truncate(v, maxChars)}
    </text>
  );
}

/** Angled tick for column charts with long category names. */
export function AngledTick({ x = 0, y = 0, payload, maxChars = 18 }: TickProps & { maxChars?: number }) {
  const v = payload?.value ?? "";
  return (
    <g transform={`translate(${x},${y + 6})`}>
      <text transform="rotate(-32)" textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
        <title>{v}</title>
        {truncate(v, maxChars)}
      </text>
    </g>
  );
}

export const AXIS_PROPS = {
  stroke: "var(--chart-axis)",
  tickLine: false,
  axisLine: false,
  fontSize: 11,
} as const;
