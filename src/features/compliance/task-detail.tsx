"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import type { ComplianceTask, TaskStatus } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { PriorityBadge, TaskStatusBadge, ToneBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/states";
import { PersonCell, UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { getEffectiveStatus, isCompleted } from "@/lib/calculations/compliance";
import { addComment, addEvidence, removeEvidence, setTaskStatus, submitTask, toggleStep } from "@/lib/repositories";
import { inScope } from "@/lib/auth/permissions";
import { ASSIGNMENT_LEVEL_LABELS, FREQUENCY_LABELS, TASK_STATUS_META } from "@/lib/constants";
import { daysBetween, formatDate, formatDateTime, formatRelative } from "@/lib/utils/dates";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { ReviewDialog, type ReviewDecision } from "./review-dialog";

const WORKABLE: TaskStatus[] = ["not_started", "in_progress", "rejected", "overdue"];
const MANUAL_STATUSES: TaskStatus[] = ["not_started", "in_progress", "not_applicable", "approved_exception"];

export function TaskDetail({ taskId }: { taskId: string }) {
  const db = useDatabase();
  const { scope } = useCurrentUser();
  const task = db.tasks.find((t) => t.id === taskId);
  const emp = task ? db.employees.find((e) => e.id === task.employeeId) : undefined;
  if (!task || !emp) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Compliance Tracking", href: "/compliance" }, { label: "Task" }]} title="Task not found" />
        <EmptyState title="This compliance task doesn't exist" description="It may have been removed, or the link is incomplete." action={<Button asChild size="sm" variant="outline"><Link href="/compliance">Back to Task Tracker</Link></Button>} />
      </div>
    );
  }
  if (!inScope(emp, scope)) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Compliance Tracking", href: "/compliance" }, { label: "Task" }]} title="Not in your scope" />
        <EmptyState icon={<Lock className="size-5" />} title="You can't view this task" description="It belongs to an employee outside your department or team. Switch persona to view it." />
      </div>
    );
  }
  return <Detail task={task} />;
}

function Detail({ task }: { task: ComplianceTask }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const { can, employee: me } = useCurrentUser();
  const process = L.processes.get(task.processId)!;
  const emp = L.employees.get(task.employeeId)!;
  const assignment = db.assignments.find((a) => a.id === task.assignmentId);
  const status = getEffectiveStatus(task, today);
  const isOwn = me?.id === task.employeeId;
  const canWork = can("tasks.submit") && WORKABLE.includes(status);
  const canReview = can("tasks.review") && status === "submitted" && !isOwn;
  const canOverride = can("tasks.review") && !isOwn;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<ReviewDecision | null>(null);
  const [newStatus, setNewStatus] = useState<TaskStatus | "">("");
  const [statusNote, setStatusNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const done = new Set(task.completedStepIds);
  const mandatory = process.steps.filter((s) => s.mandatory);
  const missing = mandatory.filter((s) => !done.has(s.id));
  const needsEvidence = process.steps.some((s) => s.evidenceRequired) && task.evidence.length === 0;
  const progress = process.steps.length ? Math.round((process.steps.filter((s) => done.has(s.id)).length / process.steps.length) * 100) : 0;
  const reviewerName = task.reviewedBy ?? L.empName(assignment?.reviewerId ?? process.reviewerId);
  const dueIn = daysBetween(today, task.dueDate);
  const subject = `${process.name} — ${emp.firstName} ${emp.lastName} (due ${formatDate(task.dueDate)})`;

  const run = async (fn: () => Promise<unknown>, ok: string, fail = "Action failed") => {
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(fail, { description: e instanceof Error ? e.message : undefined });
      return false;
    }
  };

  const onStep = async (stepId: string, checked: boolean) => {
    setBusyStep(stepId);
    try {
      await toggleStep(task.id, stepId, checked);
    } catch (e) {
      toast.error("Could not update step", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusyStep(null);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`${f.name} is too large`, { description: "Evidence files must be 15 MB or smaller." });
        continue;
      }
      await run(() => addEvidence(task.id, { name: f.name, size: f.size, type: f.type }), `Evidence uploaded: ${f.name}`, "Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const next = await submitTask(task.id, submitNote);
      toast.success(next === "submitted" ? "Submitted for approval" : "Process completed", { description: next === "submitted" ? `Sent to ${reviewerName} for review.` : "This task now counts toward compliance." });
      setSubmitNote("");
    } catch (e) {
      toast.error("Cannot submit yet", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSubmitting(false);
    }
  };

  const history = [...task.history].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Compliance Tracking", href: "/compliance" }, { label: "Task Tracker", href: "/compliance" }, { label: "Submission Details" }]}
        title={process.name}
        titleAdornment={
          <div className="flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge status={status} />
            <PriorityBadge priority={process.priority} />
          </div>
        }
        description={
          <>
            {emp.firstName} {emp.lastName} · {L.teamName(emp.teamId)} · {L.deptName(emp.departmentId)} · due <span className="font-medium text-foreground">{formatDate(task.dueDate)}</span>
            {WORKABLE.includes(status) ? <span className={cn("ml-1", dueIn < 0 ? "text-danger" : dueIn <= 2 ? "text-warning" : "")}>({dueIn < 0 ? `${-dueIn} day${dueIn === -1 ? "" : "s"} overdue` : dueIn === 0 ? "due today" : `in ${dueIn} days`})</span> : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/processes/${process.id}`}>
                <FileText /> Process definition
              </Link>
            </Button>
            {canReview ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => setReview("reject")}>
                  <XCircle /> Reject
                </Button>
                <Button size="sm" onClick={() => setReview("approve")}>
                  <CheckCircle2 /> Approve
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {status === "rejected" && task.remarks ? (
        <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger-soft/50 p-4 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <div className="font-medium">Rejected by {task.reviewedBy ?? "reviewer"} {task.reviewedAt ? `on ${formatDateTime(task.reviewedAt)}` : ""}</div>
            <div className="text-muted-foreground">{task.remarks}</div>
            {canWork ? <div className="mt-1 text-xs">Address the remarks, update the checklist or evidence, and resubmit.</div> : null}
          </div>
        </div>
      ) : null}
      {(status === "approved_exception" || status === "not_applicable") && task.remarks ? (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">{TASK_STATUS_META[status].label} — excluded from compliance</div>
            <div className="text-muted-foreground">{task.remarks}</div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Checklist */}
          <section className="card-elevated p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Process checklist</h3>
                <p className="text-xs text-muted-foreground">
                  {process.steps.filter((s) => done.has(s.id)).length} of {process.steps.length} steps complete · {mandatory.length} mandatory
                </p>
              </div>
              <div className="flex w-40 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs font-medium tabular-nums">{progress}%</span>
              </div>
            </div>
            <ol className="space-y-2">
              {process.steps.map((s, i) => {
                const checked = done.has(s.id);
                return (
                  <li key={s.id} className={cn("flex gap-3 rounded-lg border p-3 transition-colors", checked && "border-success/30 bg-success-soft/30")}>
                    <div className="pt-0.5">
                      {busyStep === s.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Checkbox checked={checked} disabled={!canWork} onCheckedChange={(c) => onStep(s.id, c === true)} aria-label={`Mark step ${i + 1} ${s.name} complete`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-sm font-medium", checked && "text-muted-foreground line-through decoration-1")}>
                          {i + 1}. {s.name}
                        </span>
                        {!s.mandatory ? <ToneBadge tone="neutral">Optional</ToneBadge> : null}
                        {s.evidenceRequired ? <ToneBadge tone="teal">Evidence</ToneBadge> : null}
                        {s.approvalRequired ? <ToneBadge tone="warning">Approval</ToneBadge> : null}
                      </div>
                      {s.instructions ? <p className="mt-0.5 text-xs text-muted-foreground">{s.instructions}</p> : null}
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-3" /> ~{s.expectedMinutes} min
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {canWork ? (
              <div className="mt-5 space-y-3 border-t pt-4">
                {missing.length || needsEvidence ? (
                  <div className="rounded-lg bg-warning-soft/60 px-3 py-2 text-xs text-warning">
                    {missing.length ? <div>Complete mandatory steps: {missing.map((s) => s.name).join(", ")}.</div> : null}
                    {needsEvidence ? <div>Upload at least one evidence file.</div> : null}
                  </div>
                ) : (
                  <div className="rounded-lg bg-success-soft/60 px-3 py-2 text-xs text-success">All mandatory requirements met — ready to submit.</div>
                )}
                <Textarea rows={2} value={submitNote} onChange={(e) => setSubmitNote(e.target.value)} placeholder="Optional note for the reviewer" aria-label="Submission note" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{task.requiresApproval ? `Requires approval by ${reviewerName}.` : "Completes immediately on submission."}</span>
                  <Button onClick={onSubmit} disabled={submitting}>
                    {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                    {status === "rejected" ? "Resubmit" : "Submit completion"}
                  </Button>
                </div>
              </div>
            ) : status === "submitted" ? (
              <p className="mt-4 rounded-lg bg-teal-soft/60 px-3 py-2 text-xs text-teal">
                Submitted {formatDateTime(task.submittedAt)} — awaiting review by {reviewerName}.{isOwn && can("tasks.review") ? " You cannot review your own submission." : ""}
              </p>
            ) : isCompleted(task) ? (
              <p className="mt-4 rounded-lg bg-success-soft/60 px-3 py-2 text-xs text-success">
                Completed {formatDateTime(task.submittedAt)}
                {task.reviewedAt ? ` · approved by ${task.reviewedBy} on ${formatDateTime(task.reviewedAt)}` : ""}.
              </p>
            ) : !can("tasks.submit") ? (
              <p className="mt-4 text-xs text-muted-foreground">Your role can view but not complete tasks.</p>
            ) : null}
          </section>

          {/* Evidence */}
          <section className="card-elevated p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Evidence</h3>
                <p className="text-xs text-muted-foreground">{process.steps.some((s) => s.evidenceRequired) ? "Required for this process." : "Optional supporting files."}</p>
              </div>
              {canWork ? (
                <>
                  <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => onUpload(e.target.files)} />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload evidence
                  </Button>
                </>
              ) : null}
            </div>
            {task.evidence.length ? (
              <ul className="divide-y rounded-lg border">
                {task.evidence.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(a.size)} · {a.uploadedBy} · {formatDateTime(a.uploadedAt)}
                      </div>
                    </div>
                    {canWork ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.name}`} onClick={() => run(() => removeEvidence(task.id, a.id), "Evidence removed")}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">No evidence uploaded yet.</div>
            )}
          </section>

          {/* Comments + timeline */}
          <section className="card-elevated p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="size-4 text-muted-foreground" /> Comments & activity
            </h3>
            <div className="mb-4 flex gap-2">
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment for the employee, reviewer or owner…" aria-label="New comment" />
              <Button
                className="self-end"
                disabled={!comment.trim() || posting}
                onClick={async () => {
                  setPosting(true);
                  if (await run(() => addComment(task.id, comment), "Comment added")) setComment("");
                  setPosting(false);
                }}
              >
                {posting ? <Loader2 className="animate-spin" /> : <Send />} Post
              </Button>
            </div>
            {history.length ? (
              <ol className="space-y-4">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <UserAvatar name={h.authorName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-foreground">{h.authorName}</span>
                        <ToneBadge tone={h.kind === "review" ? (h.text.startsWith("Rejected") ? "danger" : "success") : h.kind === "comment" ? "neutral" : h.kind === "evidence" ? "teal" : "info"}>{h.kind}</ToneBadge>
                        <span className="text-muted-foreground" title={formatDateTime(h.createdAt)}>
                          {formatRelative(h.createdAt)}
                        </span>
                      </div>
                      <p className={cn("mt-1 text-sm", h.kind === "comment" && "rounded-lg bg-muted/50 px-3 py-2")}>{h.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No activity yet.</p>
            )}
          </section>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <section className="card-elevated p-5">
            <h3 className="mb-3 text-sm font-semibold">Task details</h3>
            <Link href={`/employees/${emp.id}`} className="mb-4 block rounded-lg border p-2 hover:bg-muted/40">
              <PersonCell name={`${emp.firstName} ${emp.lastName}`} sub={`${emp.id} · ${L.bandName(emp.bandId)}`} />
            </Link>
            <dl className="space-y-2.5 text-sm">
              <Row label="Status" value={<TaskStatusBadge status={status} />} />
              <Row label="Period start" value={formatDate(task.periodStart)} />
              <Row label="Due date" value={<span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5 text-muted-foreground" />{formatDate(task.dueDate)}</span>} />
              <Row label="Submitted" value={task.submittedAt ? formatDateTime(task.submittedAt) : "—"} />
              <Row label="Timeliness" value={task.submittedAt ? (task.submittedAt.slice(0, 10) <= task.dueDate ? <span className="text-success">On time</span> : <span className="text-warning">{daysBetween(task.dueDate, task.submittedAt.slice(0, 10))} day(s) late</span>) : "—"} />
              <Row label="Reviewer" value={reviewerName} />
              <Row label="Reviewed" value={task.reviewedAt ? formatDateTime(task.reviewedAt) : "—"} />
              {task.qualityScore ? (
                <Row
                  label="Quality"
                  value={
                    <span className="inline-flex">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn("size-3.5", n <= task.qualityScore! ? "fill-warning text-warning" : "text-muted-foreground/30")} />
                      ))}
                    </span>
                  }
                />
              ) : null}
              <Row label="Counts toward compliance" value={task.required && status !== "not_applicable" && status !== "approved_exception" ? "Yes" : "No (excluded)"} />
              <Row label="Approval required" value={task.requiresApproval ? "Yes" : "No"} />
            </dl>
          </section>

          <section className="card-elevated p-5">
            <h3 className="mb-3 text-sm font-semibold">Assignment</h3>
            <dl className="space-y-2.5 text-sm">
              <Row label="Assignment" value={<span className="font-mono text-xs">{assignment?.id ?? "—"}</span>} />
              <Row label="Level" value={assignment ? ASSIGNMENT_LEVEL_LABELS[assignment.level] : "—"} />
              <Row label="Frequency" value={FREQUENCY_LABELS[assignment?.frequency ?? process.frequency]} />
              <Row label="Process owner" value={L.empName(assignment?.ownerId ?? process.ownerId)} />
              <Row label="Category" value={L.categoryName(process.categoryId)} />
            </dl>
          </section>

          {canReview ? (
            <section className="card-elevated border-teal/40 p-5">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-teal" /> Review submission
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">Approve to count it as completed, or reject with remarks for rework.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="destructive" size="sm" onClick={() => setReview("reject")}>
                  <XCircle /> Reject
                </Button>
                <Button size="sm" onClick={() => setReview("approve")}>
                  <CheckCircle2 /> Approve
                </Button>
              </div>
            </section>
          ) : null}

          {canOverride ? (
            <section className="card-elevated p-5">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <History className="size-4 text-muted-foreground" /> Update status
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">Mark exceptions or reset progress. A justification is recorded in the audit log.</p>
              <div className="space-y-2">
                <Select value={newStatus || undefined} onValueChange={(x) => setNewStatus(x as TaskStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose new status" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_STATUSES.filter((s) => s !== task.status).map((s) => (
                      <SelectItem key={s} value={s}>
                        {TASK_STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="status-note" className="sr-only">
                  Justification
                </Label>
                <Textarea id="status-note" rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder={newStatus === "approved_exception" || newStatus === "not_applicable" ? "Justification (required)" : "Note (optional)"} />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!newStatus || savingStatus}
                  onClick={async () => {
                    if (!newStatus) return;
                    setSavingStatus(true);
                    if (await run(() => setTaskStatus(task.id, newStatus, statusNote), `Status updated to ${TASK_STATUS_META[newStatus].label}`)) {
                      setNewStatus("");
                      setStatusNote("");
                    }
                    setSavingStatus(false);
                  }}
                >
                  {savingStatus ? <Loader2 className="animate-spin" /> : null} Apply status
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <ReviewDialog open={review !== null} onOpenChange={(o) => !o && setReview(null)} taskIds={[task.id]} decision={review ?? "approve"} subject={subject} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
