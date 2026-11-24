"use client";

import { useDatabase } from "@/hooks/use-data";
import { getTier } from "@/lib/calculations/compliance";
import { TIER_META } from "@/lib/constants";
import { formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** Inline bar + value, colored by the configured compliance tier. */
export function ComplianceBar({ value, className, showLabel = true, size = "sm" }: { value: number | null; className?: string; showLabel?: boolean; size?: "sm" | "md" }) {
  const { settings } = useDatabase();
  const tier = getTier(value, settings.thresholds);
  const m = TIER_META[tier];
  return (
    <div className={cn("flex min-w-[120px] items-center gap-2", className)} title={`${formatPercent(value)} · ${m.label}`}>
      <div className={cn("relative flex-1 overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2.5")}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: m.color }} />
      </div>
      {showLabel ? <span className="w-12 text-right text-xs font-medium tabular-nums text-foreground">{formatPercent(value)}</span> : null}
    </div>
  );
}

/** Circular gauge for headline compliance numbers. */
export function ComplianceRing({ value, size = 120, stroke = 10, label }: { value: number | null; size?: number; stroke?: number; label?: string }) {
  const { settings } = useDatabase();
  const tier = getTier(value, settings.thresholds);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TIER_META[tier].color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-semibold tabular-nums">{formatPercent(value)}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label ?? TIER_META[tier].label}</div>
      </div>
    </div>
  );
}
