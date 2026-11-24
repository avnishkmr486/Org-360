"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Paperclip, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ComplianceTask, ISODate } from "@/types";
import { TaskStatusBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLookups } from "@/hooks/use-data";
import { getEffectiveStatus, isCompleted, isDueForCompliance, isExcluded } from "@/lib/calculations/compliance";
import { addEvidence, RepositoryError, submitTask, toggleStep } from "@/lib/repositories";
import { addDaysISO, daysBetween, formatDate } from "@/lib/utils/dates";
import { formatBytes, formatPercent } from "@/lib/utils/format";
import type { EmployeeCompliance } from "@/lib/calculations/compliance";
import type { TrendDatum } from "@/components/charts/compliance-charts";
import { cn } from "@/lib/utils";

/* ------------------------------ Task lists ------------------------------ */

export function pendingTasks(tasks: readonly ComplianceTask[], today: ISODate) {
  return tasks
    .filter((t) => {
      const s = getEffectiveStatus(t, today);
      return s === "not_started" || s === "in_progress" || s === "submitted" || s === "rejected";
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export function overdueTasks(tasks: readonly ComplianceTask[], today: ISODate) {
  return tasks.filter((t) => getEffectiveStatus(t, today) === "overdue").sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
}

/** Compact task list linking to submission details. */
export function TaskMiniList({ tasks, today, empty, limit = 7, showEmployee = true }: { tasks: ComplianceTask[]; today: ISODate; empty: string; limit?: number; showEmployee?: boolean }) {
  const L = useLookups();
  if (!tasks.length) return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div>
      <ul className="divide-y">
        {tasks.slice(0, limit).map((t) => {
          const st = getEffectiveStatus(t, today);
          const days = daysBetween(t.dueDate, today);
          return (
            <li key={t.id}>
              <Link href={`/compliance/${encodeURIComponent(t.id)}`} className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{L.processName(t.processId)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {showEmployee ? `${L.empName(t.employeeId)} · ` : ""}Due {formatDate(t.dueDate)}
                    {st === "overdue" ? <span className="text-danger"> · {days}d overdue</span> : null}
                  </div>
                </div>
                <TaskStatusBadge status={st} />
              </Link>
            </li>
          );
        })}
      </ul>
      {tasks.length > limit ? <p className="px-2 pt-2 text-xs text-muted-foreground">+{tasks.length - limit} more</p> : null}
    </div>
  );
}

/** Ranked employee list with compliance bars. */
export function EmployeeRankList({ rows, empty, tone }: { rows: EmployeeCompliance[]; empty: string; tone?: "attention" }) {
  const L = useLookups();
  if (!rows.length) return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={r.employee.id}>
          <Link href={`/employees/${r.employee.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
            <div className="min-w-0 flex-1">
              <PersonCell name={`${r.employee.firstName} ${r.employee.lastName}`} sub={`${r.employee.teamId ? L.teamName(r.employee.teamId) : L.deptName(r.employee.departmentId)} · ${L.bandName(r.employee.bandId)}`} size="xs" />
            </div>
            <div className="w-36 shrink-0">
              <ComplianceBar value={r.stats.compliance} />
              {tone === "attention" ? <div className="mt-0.5 text-right text-[11px] text-danger">{r.stats.overdue} overdue</div> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- Period completion -------------------------- */

/** Due vs completed per day (last N days) — shaped for MonthlyPerformanceChart. */
export function dailyCompletion(tasks: readonly ComplianceTask[], today: ISODate, days = 14): TrendDatum[] {
  const out: TrendDatum[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDaysISO(today, -i);
    out.push(bucket(tasks.filter((t) => t.dueDate === d), today, d, formatDate(d, "dd MMM")));
  }
  return out;
}

/** Due vs completed per week (Mon–Sun) for the last N weeks. */
export function weeklyCompletion(tasks: readonly ComplianceTask[], today: ISODate, weeks = 8): TrendDatum[] {
  const t = new Date(`${today}T00:00:00`);
  const dow = (t.getDay() + 6) % 7; // Monday = 0
  const thisMonday = addDaysISO(today, -dow);
  const out: TrendDatum[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDaysISO(thisMonday, -7 * i);
    const to = addDaysISO(from, 6);
    out.push(bucket(tasks.filter((x) => x.dueDate >= from && x.dueDate <= to), today, from, `Wk ${formatDate(from, "dd MMM")}`));
  }
  return out;
}

function bucket(tasks: readonly ComplianceTask[], today: ISODate, key: string, label: string): TrendDatum {
  let due = 0;
  let completed = 0;
  let onTime = 0;
  for (const t of tasks) {
    if (!isDueForCompliance(t, today)) continue;
    due++;
    if (isCompleted(t)) {
      completed++;
      if (t.submittedAt && t.submittedAt.slice(0, 10) <= t.dueDate) onTime++;
    }
  }
  return { key, label, due, completed, compliance: due ? Math.round((completed / due) * 1000) / 10 : null, onTimeRate: completed ? Math.round((onTime / completed) * 1000) / 10 : null };
}

/* ---------------------------- Inline checklist -------------------------- */

/** Expandable task row with step checklist, evidence upload and submission. */
export function TaskChecklistRow({ task, today, canSubmit }: { task: ComplianceTask; today: ISODate; canSubmit: boolean }) {
  const L = useLookups();
  const process = L.processes.get(task.processId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const st = getEffectiveStatus(task, today);
  const locked = !canSubmit || task.status === "submitted" || task.status === "completed" || isExcluded(task.status);
  const steps = process?.steps ?? [];
  const done = steps.filter((s) => task.completedStepIds.includes(s.id)).length;
  const needsEvidence = steps.some((s) => s.evidenceRequired);

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof RepositoryError ? err.message : "Action failed", err instanceof RepositoryError ? undefined : { description: String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("rounded-lg border bg-card transition-shadow", open && "shadow-sm")}>
      <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{process?.name ?? task.processId}</div>
          <div className="text-xs text-muted-foreground">
            Due {formatDate(task.dueDate)} · {done}/{steps.length} steps
          </div>
        </div>
        <div className="hidden w-24 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-teal" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} />
          </div>
        </div>
        <TaskStatusBadge status={st} />
      </button>
      {open ? (
        <div className="space-y-3 border-t px-4 py-3">
          {task.status === "rejected" && task.remarks ? (
            <div className="rounded-md border border-danger/30 bg-danger-soft/50 px-3 py-2 text-xs text-danger">Rejected: {task.remarks}</div>
          ) : null}
          <ul className="space-y-2">
            {steps.map((s) => {
              const checked = task.completedStepIds.includes(s.id);
              return (
                <li key={s.id} className="flex items-start gap-2.5">
                  <Checkbox
                    id={`${task.id}-${s.id}`}
                    checked={checked}
                    disabled={locked || busy !== null}
                    onCheckedChange={(v) => run(s.id, () => toggleStep(task.id, s.id, v === true))}
                    className="mt-0.5"
                  />
                  <label htmlFor={`${task.id}-${s.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className={cn("text-sm", checked && "text-muted-foreground line-through")}>{s.name}</span>
                    {!s.mandatory ? <span className="ml-1.5 text-[11px] text-muted-foreground">(optional)</span> : null}
                    {s.evidenceRequired ? <span className="ml-1.5 text-[11px] text-warning">evidence required</span> : null}
                    <div className="text-xs text-muted-foreground">{s.description}</div>
                  </label>
                </li>
              );
            })}
          </ul>
          {task.evidence.length ? (
            <div className="flex flex-wrap gap-1.5">
              {task.evidence.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-[11px]">
                  <Paperclip className="size-3" /> {e.name} · {formatBytes(e.size)}
                </span>
              ))}
            </div>
          ) : null}
          {!locked ? (
            <>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment for the reviewer…" className="min-h-14 text-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) run("evidence", () => addEvidence(task.id, { name: f.name, size: f.size, type: f.type }), "Evidence uploaded");
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                  {busy === "evidence" ? <Loader2 className="animate-spin" /> : <Upload />} Upload evidence{needsEvidence ? " *" : ""}
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run("submit", async () => {
                      const next = await submitTask(task.id, comment);
                      setComment("");
                      toast.success(next === "submitted" ? "Submitted for approval" : "Process completed", { description: process?.name });
                    })
                  }
                >
                  {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />} Submit completion
                </Button>
                <Button variant="ghost" size="sm" asChild className="ml-auto">
                  <Link href={`/compliance/${encodeURIComponent(task.id)}`}>
                    Full details <ExternalLink />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {task.status === "submitted" ? "Awaiting reviewer approval." : task.status === "completed" ? `Completed${task.submittedAt ? ` on ${formatDate(task.submittedAt)}` : ""}.` : !canSubmit ? "Read-only for your role." : "No action required."}
              </span>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/compliance/${encodeURIComponent(task.id)}`}>
                  Full details <ExternalLink />
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StatPill({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "success" | "warning" }) {
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</div>
    </div>
  );
}

export { formatPercent };
