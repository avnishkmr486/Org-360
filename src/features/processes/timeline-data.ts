/**
 * Builds a process's full journey (timeline) and audit trail from the database.
 * Pure — no React. Everything shown is derived from real records:
 *   - definition history (versions, with field-level changes)
 *   - assignments (created / deactivated)
 *   - meeting, follow-up and review dates (past = done, future = upcoming)
 *   - approvals and rejections of submissions
 *   - monthly compliance milestones against the process's own target
 */
import type { AuditLog, Database, ID, ISODate, ProcessChange } from "@/types";
import type { Tone } from "@/lib/constants";
import { computeStats } from "@/lib/calculations/compliance";
import { assignmentEmployees, describeAssignmentTarget } from "./helpers";
import { FREQUENCY_LABELS, ASSIGNMENT_LEVEL_LABELS } from "@/lib/constants";
import { formatDate, monthBuckets } from "@/lib/utils/dates";

export type TimelineKind = "created" | "definition" | "status" | "scope" | "assignment" | "meeting" | "follow_up" | "review" | "approval" | "milestone";

export type TimelineGroup = "all" | "definition" | "assignments" | "governance" | "compliance";

export interface TimelineEvent {
  id: string;
  /** ISO datetime (or date) — used for ordering. */
  at: string;
  kind: TimelineKind;
  title: string;
  description?: string;
  actor?: string;
  tone: Tone;
  changes?: ProcessChange[];
  /** True when the event lies in the future (scheduled). */
  upcoming?: boolean;
  /** True when a scheduled event is past its date (e.g. follow-up overdue). */
  overdue?: boolean;
  href?: string;
}

export const KIND_GROUP: Record<TimelineKind, Exclude<TimelineGroup, "all">> = {
  created: "definition",
  definition: "definition",
  status: "definition",
  scope: "definition",
  assignment: "assignments",
  meeting: "governance",
  follow_up: "governance",
  review: "governance",
  approval: "compliance",
  milestone: "compliance",
};

const day = (d: ISODate) => `${d}T12:00:00.000Z`;

export function buildProcessTimeline(db: Database, processId: ID, today: ISODate): TimelineEvent[] {
  const p = db.processes.find((x) => x.id === processId);
  if (!p) return [];
  const emp = (id: string | null) => {
    const e = db.employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "—";
  };
  const events: TimelineEvent[] = [];

  /* Definition history */
  for (const v of p.versionHistory) {
    const onlyField = v.changes && v.changes.length === 1 ? v.changes[0].field : null;
    const kind: TimelineKind = v.version === 1 ? "created" : onlyField === "status" ? "status" : onlyField === "scope" ? "scope" : "definition";
    events.push({
      id: `v${v.version}`,
      at: v.changedAt,
      kind,
      title: v.version === 1 ? "Process created" : kind === "status" ? "Status changed" : kind === "scope" ? "Applied-for scope updated" : `Definition updated · v${v.version}`,
      description: v.summary,
      actor: v.changedBy,
      tone: v.version === 1 ? "success" : kind === "status" ? "warning" : "info",
      changes: v.changes,
    });
  }

  /* Effective / expiry */
  events.push({
    id: "effective",
    at: day(p.effectiveDate),
    kind: "milestone",
    title: p.effectiveDate > today ? "Process goes live" : "Process effective",
    description: `Start date ${formatDate(p.effectiveDate)} · ${FREQUENCY_LABELS[p.frequency]} frequency.`,
    tone: "teal",
    upcoming: p.effectiveDate > today,
  });
  if (p.expiryDate) {
    events.push({ id: "expiry", at: day(p.expiryDate), kind: "milestone", title: p.expiryDate > today ? "Process expires" : "Process expired", description: `End date ${formatDate(p.expiryDate)}.`, tone: p.expiryDate > today ? "neutral" : "danger", upcoming: p.expiryDate > today });
  }

  /* Assignments */
  const asgs = db.assignments.filter((a) => a.processId === p.id);
  const asgIds = new Set(asgs.map((a) => a.id));
  for (const a of asgs) {
    events.push({
      id: `asg-${a.id}`,
      at: a.createdAt,
      kind: "assignment",
      title: `Assigned · ${ASSIGNMENT_LEVEL_LABELS[a.level]}`,
      description: `${describeAssignmentTarget(db, a)} — ${assignmentEmployees(db, a).length} employees, ${FREQUENCY_LABELS[a.frequency]}.${a.status === "inactive" ? " (now inactive)" : ""}`,
      actor: a.createdBy,
      tone: "info",
      href: "/processes?tab=assignments",
    });
  }
  for (const log of db.auditLogs) {
    if (log.module === "Assignments" && asgIds.has(log.recordId) && (log.action === "Deactivated" || log.action === "Activated")) {
      events.push({ id: `aud-${log.id}`, at: log.timestamp, kind: "assignment", title: `Assignment ${log.action.toLowerCase()}`, description: log.description, actor: log.userName, tone: log.action === "Deactivated" ? "warning" : "success" });
    }
  }

  /* Meeting, follow-up, review */
  if (p.meetingDate) {
    const future = p.meetingDate > today;
    events.push({
      id: "meeting",
      at: day(p.meetingDate),
      kind: "meeting",
      title: future ? "Meeting scheduled" : "Meeting held",
      description: [p.meetingAgenda && `Agenda: ${p.meetingAgenda}`, !future && p.meetingNotes && `Notes: ${p.meetingNotes}`, p.meetingAttendeeIds.length ? `Attendees: ${p.meetingAttendeeIds.map(emp).join(", ")}` : ""].filter(Boolean).join("\n"),
      tone: "teal",
      upcoming: future,
    });
  }
  if (p.followUpDate) {
    const future = p.followUpDate >= today;
    events.push({
      id: "followup",
      at: day(p.followUpDate),
      kind: "follow_up",
      title: future ? "Follow-up due" : "Follow-up overdue",
      description: [p.followUpAction, p.followUpOwnerId ? `Owner: ${emp(p.followUpOwnerId)}` : ""].filter(Boolean).join("\n"),
      tone: future ? "warning" : "danger",
      upcoming: future,
      overdue: !future,
    });
  }
  if (p.lastReviewedOn) {
    events.push({ id: "last-review", at: day(p.lastReviewedOn), kind: "review", title: "Process reviewed", description: `Reviewed by ${emp(p.reviewerId)}.`, tone: "success" });
  }
  if (p.nextReviewDate) {
    const future = p.nextReviewDate >= today;
    events.push({ id: "next-review", at: day(p.nextReviewDate), kind: "review", title: future ? "Next review" : "Review overdue", description: `Scheduled review · ${emp(p.reviewerId)}.`, tone: future ? "neutral" : "danger", upcoming: future, overdue: !future });
  }

  /* Approvals / rejections */
  const tasks = db.tasks.filter((t) => t.processId === p.id);
  const reviews: TimelineEvent[] = [];
  for (const t of tasks) {
    for (const ev of t.history) {
      if (ev.kind !== "review") continue;
      const rejected = /^rejected/i.test(ev.text);
      reviews.push({
        id: `rev-${ev.id}`,
        at: ev.createdAt,
        kind: "approval",
        title: rejected ? "Submission rejected" : "Submission approved",
        description: `${emp(t.employeeId)} · due ${formatDate(t.dueDate)}${rejected ? ` — ${ev.text.replace(/^rejected:?\s*/i, "")}` : ""}`,
        actor: ev.authorName,
        tone: rejected ? "danger" : "success",
        href: `/compliance/${encodeURIComponent(t.id)}`,
      });
    }
  }
  events.push(...reviews.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8));

  /* Monthly compliance milestones */
  for (const b of monthBuckets(today, 6)) {
    const t = tasks.filter((x) => x.dueDate >= b.range.from && x.dueDate <= b.range.to);
    const s = computeStats(t, today);
    if (s.compliance === null) continue;
    const met = s.compliance >= p.complianceThreshold;
    events.push({
      id: `ms-${b.key}`,
      at: day(b.range.to > today ? today : b.range.to),
      kind: "milestone",
      title: `${formatDate(`${b.key}-01`, "MMMM yyyy")} · ${s.compliance.toFixed(1)}% compliance`,
      description: `${met ? "Met" : "Missed"} the ${p.complianceThreshold}% target · ${s.completedDue} of ${s.due} due tasks completed${s.overdue ? `, ${s.overdue} overdue` : ""}.`,
      tone: met ? "success" : s.compliance >= p.complianceThreshold - 10 ? "warning" : "danger",
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Raw audit entries relevant to a process (its own records, its assignments, its submissions). */
export function auditForProcess(db: Database, processId: ID): AuditLog[] {
  const asgIds = new Set(db.assignments.filter((a) => a.processId === processId).map((a) => a.id));
  return db.auditLogs.filter((l) => l.recordId === processId || asgIds.has(l.recordId)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

