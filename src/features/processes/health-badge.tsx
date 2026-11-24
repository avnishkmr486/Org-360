"use client";

import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, PauseCircle } from "lucide-react";
import type { ReactNode } from "react";
import { ToneBadge } from "@/components/common/badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HEALTH_META, type HealthResult, type ProcessHealth } from "@/lib/calculations/process-health";

const ICONS: Record<ProcessHealth, ReactNode> = {
  healthy: <CheckCircle2 className="size-3" />,
  at_risk: <AlertTriangle className="size-3" />,
  critical: <AlertOctagon className="size-3" />,
  no_data: <CircleDashed className="size-3" />,
  not_active: <PauseCircle className="size-3" />,
};

/** Severity order for sorting: critical first. */
export const HEALTH_RANK: Record<ProcessHealth, number> = { critical: 0, at_risk: 1, healthy: 2, no_data: 3, not_active: 4 };

export function HealthBadge({ result, withTooltip = true }: { result: HealthResult; withTooltip?: boolean }) {
  const meta = HEALTH_META[result.health];
  const badge = (
    <ToneBadge tone={meta.tone} icon={ICONS[result.health]}>
      {meta.label}
      {result.compliance !== null && result.health !== "not_active" ? <span className="font-normal opacity-80">· {result.compliance.toFixed(0)}%</span> : null}
    </ToneBadge>
  );
  if (!withTooltip) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <Activity className="size-3" /> Process health: {meta.label}
        </div>
        <ul className="space-y-0.5 text-[11px] opacity-90">
          {result.reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
