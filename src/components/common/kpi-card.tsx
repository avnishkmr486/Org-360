"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDelta } from "@/lib/utils/format";
import { TONE_VAR, type Tone } from "@/lib/constants";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  /** Change vs previous period. */
  delta?: number | null;
  deltaUnit?: string;
  /** Whether an increase is good (green) or bad (red). */
  goodWhen?: "up" | "down";
  hint?: ReactNode;
  href?: string;
  /** Alternative to href for in-page actions (e.g. applying a filter). */
  onClick?: () => void;
  className?: string;
}

export function KpiCard({ label, value, icon: Icon, tone = "info", delta, deltaUnit = " pts", goodWhen = "up", hint, href, onClick, className }: KpiCardProps) {
  const hasDelta = delta !== undefined && delta !== null;
  const positive = hasDelta && ((goodWhen === "up" && delta! > 0) || (goodWhen === "down" && delta! < 0));
  const negative = hasDelta && ((goodWhen === "up" && delta! < 0) || (goodWhen === "down" && delta! > 0));
  const DeltaIcon = !hasDelta || delta === 0 ? Minus : delta! > 0 ? ArrowUpRight : ArrowDownRight;

  const clickable = !!(href || onClick);
  const body = (
    <div
      className={cn("kpi-tile group flex h-full items-center gap-3 overflow-hidden px-3.5 py-4", clickable && "kpi-tile-clickable cursor-pointer", className)}
      style={{ "--tile": TONE_VAR[tone] } as CSSProperties}
      title={typeof hint === "string" ? `${label} — ${hint}` : label}
    >
      <span className="kpi-icon flex size-10 shrink-0 items-center justify-center rounded-[11px]">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-medium leading-tight text-muted-foreground">{label}</div>
        <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[22px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">{value}</span>
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-px text-[10px] font-medium",
                positive && "bg-success-soft text-success",
                negative && "bg-danger-soft text-danger",
                !positive && !negative && "bg-muted text-muted-foreground",
              )}
            >
              <DeltaIcon className="size-3" />
              {formatDelta(delta!, deltaUnit)}
            </span>
          ) : null}
        </div>
        {hint ? <div className="mt-0.5 truncate text-[10.5px] leading-tight text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-[0.9rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label} — view details`}>
      {body}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className="block h-full w-full rounded-[0.9rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label} — filter`}>
      {body}
    </button>
  ) : (
    body
  );
}
