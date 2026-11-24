import type { AnalyticsFilter, AppNotification, Attachment, ComplianceTask, DataScope, TaskEvent, TaskStatus } from "@/types";
import { auditEntry, currentActor, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";
import { filterTasks } from "@/lib/calculations/compliance";
import { uid } from "@/lib/utils/random";

export async function getCompliance(filter: Partial<AnalyticsFilter> = {}, scope?: DataScope | null): Promise<ComplianceTask[]> {
  await latency(60);
  return filterTasks(getDb(), filter, scope);
}

export async function getTask(id: string): Promise<ComplianceTask | undefined> {
  await latency(60);
  return getDb().tasks.find((t) => t.id === id);
}

function event(kind: TaskEvent["kind"], text: string): TaskEvent {
  return { id: uid("EV"), kind, authorName: currentActor().name, text, createdAt: nowIso() };
}

function labelFor(taskId: string) {
  const db = getDb();
  const t = db.tasks.find((x) => x.id === taskId);
  const p = db.processes.find((x) => x.id === t?.processId);
  const e = db.employees.find((x) => x.id === t?.employeeId);
  return { task: t, process: p, employee: e, label: `${p?.name ?? "Task"} — ${e ? `${e.firstName} ${e.lastName}` : ""}` };
}

/** Generic patch — the spec's updateCompliance(). Prefer the intent-specific helpers below. */
export async function updateCompliance(taskId: string, patch: Partial<ComplianceTask>, note?: string): Promise<ComplianceTask> {
  await latency();
  let updated: ComplianceTask | undefined;
  write((d) => {
    const tasks = replaceById(d.tasks, taskId, (t) => {
      updated = { ...t, ...patch, id: t.id, history: note ? [...t.history, event("status", note)] : t.history, updatedAt: nowIso() };
      return updated;
    });
    return { patch: { tasks } };
  });
  return updated!;
}

export async function toggleStep(taskId: string, stepId: string, done: boolean): Promise<void> {
  const t = getDb().tasks.find((x) => x.id === taskId);
  if (!t) throw new RepositoryError("Task not found.");
  if (t.status === "completed" || t.status === "submitted") throw new RepositoryError("Task is already submitted.");
  const completedStepIds = done ? [...new Set([...t.completedStepIds, stepId])] : t.completedStepIds.filter((s) => s !== stepId);
  await updateCompliance(taskId, { completedStepIds, status: t.status === "not_started" || t.status === "rejected" ? "in_progress" : t.status });
}

export async function addComment(taskId: string, text: string): Promise<void> {
  if (!text.trim()) throw new RepositoryError("Comment cannot be empty.");
  await latency(150);
  write((d) => ({ patch: { tasks: replaceById(d.tasks, taskId, (t) => ({ ...t, history: [...t.history, event("comment", text.trim())], updatedAt: nowIso() })) } }));
}

export async function addEvidence(taskId: string, file: { name: string; size: number; type: string }): Promise<void> {
  await latency(300);
  const att: Attachment = { id: uid("EVD"), name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", uploadedAt: nowIso(), uploadedBy: currentActor().name };
  write((d) => ({
    patch: { tasks: replaceById(d.tasks, taskId, (t) => ({ ...t, evidence: [...t.evidence, att], history: [...t.history, event("evidence", `Uploaded evidence: ${file.name}`)], updatedAt: nowIso() })) },
  }));
}

export async function removeEvidence(taskId: string, attachmentId: string): Promise<void> {
  await latency(150);
  write((d) => ({ patch: { tasks: replaceById(d.tasks, taskId, (t) => ({ ...t, evidence: t.evidence.filter((a) => a.id !== attachmentId), updatedAt: nowIso() })) } }));
}

/**
 * Submit process completion. Validates mandatory steps and evidence.
 * Tasks requiring approval move to "submitted"; others complete immediately.
 */
export async function submitTask(taskId: string, comment?: string): Promise<TaskStatus> {
  await latency(350);
  const { task, process, label } = labelFor(taskId);
  if (!task || !process) throw new RepositoryError("Task not found.");
  const missing = process.steps.filter((s) => s.mandatory && !task.completedStepIds.includes(s.id));
  if (missing.length) throw new RepositoryError(`Complete mandatory steps first: ${missing.map((s) => s.name).join(", ")}.`);
  if (process.steps.some((s) => s.evidenceRequired) && task.evidence.length === 0) throw new RepositoryError("This process requires evidence. Upload at least one file.");
  const next: TaskStatus = task.requiresApproval ? "submitted" : "completed";
  write((d) => {
    const ts = nowIso();
    const tasks = replaceById(d.tasks, taskId, (t) => ({
      ...t,
      status: next,
      submittedAt: ts,
      reviewedAt: null,
      reviewedBy: null,
      history: [...t.history, ...(comment?.trim() ? [event("comment", comment.trim())] : []), event("status", next === "submitted" ? "Submitted for approval." : "Submitted and completed.")],
      updatedAt: ts,
    }));
    const n: AppNotification = {
      id: uid("NTF"),
      type: next === "submitted" ? "approval_pending" : "submission_completed",
      title: next === "submitted" ? "Approval pending" : "Submission completed",
      message: next === "submitted" ? `${label} is awaiting your review.` : `${label} was completed.`,
      createdAt: ts,
      read: false,
      audienceRoles: next === "submitted" ? ["super_admin", "senior_management", "department_head", "project_manager", "team_supervisor"] : [],
      recipientEmployeeId: next === "submitted" ? null : task.employeeId,
      link: `/compliance/${encodeURIComponent(taskId)}`,
    };
    return { patch: { tasks, notifications: [n, ...d.notifications] }, audit: [auditEntry(d, "Compliance", "Submitted", process.id, label, next === "submitted" ? "Compliance submitted for approval." : "Compliance submitted and completed.")] };
  });
  return next;
}

export async function reviewTask(taskId: string, decision: "approve" | "reject", remarks: string, qualityScore?: number): Promise<void> {
  await latency(350);
  const { task, process, label } = labelFor(taskId);
  if (!task || !process) throw new RepositoryError("Task not found.");
  if (task.status !== "submitted") throw new RepositoryError("Only submitted tasks can be reviewed.");
  if (decision === "reject" && !remarks.trim()) throw new RepositoryError("Remarks are required when rejecting.");
  write((d) => {
    const ts = nowIso();
    const reviewer = currentActor(d).name;
    const tasks = replaceById(d.tasks, taskId, (t) => ({
      ...t,
      status: (decision === "approve" ? "completed" : "rejected") as TaskStatus,
      reviewedAt: ts,
      reviewedBy: reviewer,
      qualityScore: decision === "approve" ? (qualityScore ?? 4) : null,
      remarks: remarks.trim(),
      history: [...t.history, event("review", decision === "approve" ? `Approved${remarks.trim() ? `: ${remarks.trim()}` : "."}` : `Rejected: ${remarks.trim()}`)],
      updatedAt: ts,
    }));
    const n: AppNotification = {
      id: uid("NTF"),
      type: decision === "approve" ? "submission_completed" : "submission_rejected",
      title: decision === "approve" ? "Submission approved" : "Submission rejected",
      message: decision === "approve" ? `${label} was approved by ${reviewer}.` : `${label} was rejected: ${remarks.trim()}`,
      createdAt: ts,
      read: false,
      audienceRoles: [],
      recipientEmployeeId: task.employeeId,
      link: `/compliance/${encodeURIComponent(taskId)}`,
    };
    return {
      patch: { tasks, notifications: [n, ...d.notifications] },
      audit: [auditEntry(d, "Compliance", decision === "approve" ? "Approved" : "Rejected", process.id, label, decision === "approve" ? "Submission approved." : `Submission rejected: ${remarks.trim()}`)],
    };
  });
}

/** Manual status override (e.g. mark Not Applicable / Approved Exception) with a mandatory note. */
export async function setTaskStatus(taskId: string, status: TaskStatus, note: string): Promise<void> {
  if ((status === "approved_exception" || status === "not_applicable") && !note.trim()) {
    throw new RepositoryError("A justification is required for exceptions.");
  }
  const { label, process } = labelFor(taskId);
  await updateCompliance(
    taskId,
    {
      status,
      remarks: note.trim(),
      ...(status === "completed" ? { submittedAt: nowIso(), reviewedAt: nowIso(), reviewedBy: currentActor().name } : {}),
    },
    `Status changed to ${status.replace(/_/g, " ")}${note.trim() ? `: ${note.trim()}` : ""}.`,
  );
  write((d) => ({ patch: {}, audit: [auditEntry(d, "Compliance", "Status Updated", process?.id ?? taskId, label, `Status set to ${status.replace(/_/g, " ")}.`)] }));
}

export async function bulkReview(taskIds: string[], decision: "approve" | "reject", remarks: string): Promise<number> {
  let n = 0;
  for (const id of taskIds) {
    try {
      await reviewTask(id, decision, remarks);
      n++;
    } catch {
      /* skip non-reviewable */
    }
  }
  return n;
}
