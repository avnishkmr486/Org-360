/**
 * Applied-for scope, meeting / follow-up dates and governance fields for the seed processes.
 * Dates are relative to "today" so the demo always has upcoming and overdue items.
 */
import type { Assignment, ISODate, Process, ProcessScope, RiskLevel } from "@/types";
import { resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { addDaysISO } from "@/lib/utils/dates";
import { departmentsSeed } from "./departments";
import { teamsSeed } from "./teams";
import { employeesSeed } from "./employees";

interface Schedule {
  /** Days relative to today (negative = past). */
  meeting: number;
  followUp: number;
  review: number;
  lastReview: number | null;
  risk: RiskLevel;
  sla: number | null;
  tags: string[];
  remarks?: string;
}

const SCHEDULE: Record<string, Schedule> = {
  "PRC-001": { meeting: -20, followUp: 5, review: 40, lastReview: -50, risk: "low", sla: 1, tags: ["delivery", "daily-ops"] },
  "PRC-002": { meeting: -35, followUp: -4, review: 25, lastReview: -35, risk: "medium", sla: 3, tags: ["quality", "engineering"], remarks: "Follow-up on reviewer capacity is overdue." },
  "PRC-003": { meeting: -9, followUp: 4, review: 30, lastReview: -30, risk: "low", sla: 2, tags: ["agile", "planning"] },
  "PRC-004": { meeting: -10, followUp: 3, review: 20, lastReview: -10, risk: "high", sla: 3, tags: ["release", "quality-gate"] },
  "PRC-005": { meeting: -14, followUp: 8, review: 45, lastReview: -14, risk: "medium", sla: 5, tags: ["testing"] },
  "PRC-006": { meeting: -45, followUp: -12, review: -3, lastReview: -60, risk: "high", sla: 5, tags: ["customer", "go-live"], remarks: "Kick-off checklist adherence has dropped for enterprise accounts." },
  "PRC-007": { meeting: -25, followUp: 6, review: 35, lastReview: -25, risk: "high", sla: 7, tags: ["migration", "data"] },
  "PRC-008": { meeting: -15, followUp: 2, review: 28, lastReview: -40, risk: "high", sla: 2, tags: ["support", "sla"], remarks: "SLA breaches clustering on Monday mornings." },
  "PRC-009": { meeting: -7, followUp: 10, review: 60, lastReview: -7, risk: "medium", sla: 1, tags: ["operations", "monitoring"] },
  "PRC-010": { meeting: -30, followUp: 14, review: 50, lastReview: -30, risk: "high", sla: 9, tags: ["dr", "security"] },
  "PRC-011": { meeting: -18, followUp: 7, review: 90, lastReview: -90, risk: "medium", sla: 30, tags: ["security", "training"] },
  "PRC-012": { meeting: -60, followUp: -2, review: 30, lastReview: -60, risk: "low", sla: 5, tags: ["hr", "timesheet"] },
  "PRC-013": { meeting: -12, followUp: 9, review: 20, lastReview: -12, risk: "medium", sla: 6, tags: ["finance", "month-end"] },
  "PRC-014": { meeting: -22, followUp: 12, review: 65, lastReview: -22, risk: "low", sla: 15, tags: ["people", "feedback"] },
  "PRC-015": { meeting: -28, followUp: 15, review: 75, lastReview: -28, risk: "low", sla: 4, tags: ["onboarding"] },
};

/** Seed scope mirrors what the process's real assignments cover, so the demo starts "in sync". */
function seedScope(p: Process, assignments: Assignment[]): ProcessScope {
  const mine = assignments.filter((a) => a.processId === p.id && a.status === "active");
  const allDepts = departmentsSeed.map((d) => d.id);
  if (mine.length && mine.every((a) => a.level === "organization")) return { level: "department", departmentIds: allDepts, teamIds: [], employeeIds: [] };
  if (mine.length && mine.every((a) => a.level === "department")) {
    return { level: "department", departmentIds: [...new Set(mine.map((a) => a.departmentId!))], teamIds: [], employeeIds: [] };
  }
  if (mine.length && mine.every((a) => a.level === "team")) {
    return { level: "team", departmentIds: [...new Set(mine.map((a) => a.departmentId!))], teamIds: [...new Set(mine.map((a) => a.teamId!))], employeeIds: [] };
  }
  const ids = [...new Set(mine.flatMap((a) => resolveAssignmentEmployees(a, p, { employees: employeesSeed, teams: teamsSeed }).map((e) => e.id)))];
  const depts = [...new Set(employeesSeed.filter((e) => ids.includes(e.id)).map((e) => e.departmentId))];
  return { level: "employee", departmentIds: depts.length ? depts : p.departmentId ? [p.departmentId] : allDepts, teamIds: [], employeeIds: ids };
}

export function applyProcessExtras(processes: Process[], today: ISODate, assignments: Assignment[]): Process[] {
  const empIds = new Set(employeesSeed.map((e) => e.id));
  return processes.map((p) => {
    const s = SCHEDULE[p.id];
    if (!s) return { ...p, scope: seedScope(p, assignments) };
    const deptHead = p.departmentId ? departmentsSeed.find((d) => d.id === p.departmentId)?.headId : null;
    const attendees = [p.ownerId, p.reviewerId, p.responsibleId].filter((x): x is string => Boolean(x) && empIds.has(x as string));
    return {
      ...p,
      scope: seedScope(p, assignments),
      meetingDate: addDaysISO(today, s.meeting),
      meetingAgenda: `Review adherence, blockers and ownership for "${p.name}".`,
      meetingAttendeeIds: [...new Set(attendees)],
      meetingNotes: s.remarks ?? "Process reviewed; no changes to the definition were required.",
      followUpDate: addDaysISO(today, s.followUp),
      followUpAction: s.followUp < 0 ? "Confirm corrective actions with the process owner and report back." : "Share adherence trend with stakeholders and agree next actions.",
      followUpOwnerId: p.ownerId,
      nextReviewDate: addDaysISO(today, s.review),
      lastReviewedOn: s.lastReview === null ? null : addDaysISO(today, s.lastReview),
      riskLevel: s.risk,
      slaDays: s.sla,
      successMetric: `≥ ${p.complianceThreshold}% of required occurrences completed on time`,
      escalationContactId: deptHead ?? "EMP-1043",
      stakeholderIds: [...new Set([p.reviewerId, deptHead].filter((x): x is string => Boolean(x)))],
      tags: s.tags,
      remarks: s.remarks ?? "",
    };
  });
}
