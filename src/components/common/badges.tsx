import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, MinusCircle, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import type { ComplianceTier, EmploymentStatus, Priority, ProcessStatus, RecordStatus, TaskStatus } from "@/types";
import {
  EMPLOYMENT_STATUS_META,
  PRIORITY_META,
  PROCESS_STATUS_META,
  TASK_STATUS_META,
  TIER_META,
  TONE_CLASSES,
  type Tone,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ToneBadge({ tone, children, icon, className }: { tone: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const TASK_ICONS: Record<TaskStatus, ReactNode> = {
  not_started: <CircleDashed className="size-3" />,
  in_progress: <Clock className="size-3" />,
  submitted: <Sparkles className="size-3" />,
  completed: <CheckCircle2 className="size-3" />,
  rejected: <XCircle className="size-3" />,
  overdue: <AlertTriangle className="size-3" />,
  not_applicable: <MinusCircle className="size-3" />,
  approved_exception: <ShieldAlert className="size-3" />,
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const m = TASK_STATUS_META[status];
  return (
    <ToneBadge tone={m.tone} icon={TASK_ICONS[status]} className={className}>
      {m.label}
    </ToneBadge>
  );
}

export function TierBadge({ tier, className }: { tier: ComplianceTier; className?: string }) {
  const m = TIER_META[tier];
  return (
    <ToneBadge tone={m.tone} className={className}>
      <span className="size-1.5 rounded-full" style={{ background: m.color }} aria-hidden />
      {m.label}
    </ToneBadge>
  );
}

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  const m = PROCESS_STATUS_META[status];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}

export function EmploymentStatusBadge({ status }: { status: EmploymentStatus }) {
  const m = EMPLOYMENT_STATUS_META[status];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  return <ToneBadge tone={status === "active" ? "success" : "neutral"}>{status === "active" ? "Active" : "Inactive"}</ToneBadge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
}
