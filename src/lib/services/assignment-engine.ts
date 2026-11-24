/**
 * Assignment engine — pure business logic, independent of React and storage.
 *
 * Resolves which employees an assignment applies to, and generates the
 * periodic task occurrences (ComplianceTask) for each of them.
 */
import {
  addDays,
  endOfMonth,
  endOfQuarter,
  isWeekend,
  nextFriday,
  isFriday,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns";
import type { Assignment, ComplianceTask, Database, Employee, ISODate, Process } from "@/types";
import { addDaysISO, toISODate } from "@/lib/utils/dates";
import { createRng, hashString } from "@/lib/utils/random";

type EngineDb = Pick<Database, "employees" | "teams">;

/** Employees eligible for an assignment (active / on-leave only). */
export function resolveAssignmentEmployees(assignment: Assignment, process: Process | undefined, db: EngineDb): Employee[] {
  let pool = db.employees.filter((e) => e.status !== "inactive");

  switch (assignment.level) {
    case "organization":
      break;
    case "department":
      pool = pool.filter((e) => e.departmentId === assignment.departmentId);
      break;
    case "team":
      pool = pool.filter((e) => e.teamId === assignment.teamId);
      break;
    case "band":
      pool = pool.filter((e) => e.bandId === assignment.bandId);
      break;
    case "employee":
      pool = pool.filter((e) => assignment.employeeIds.includes(e.id));
      return pool;
  }

  // Optional narrowing filters on broader levels.
  if (assignment.level !== "department" && assignment.departmentId) pool = pool.filter((e) => e.departmentId === assignment.departmentId);
  if (assignment.level !== "team" && assignment.teamId) pool = pool.filter((e) => e.teamId === assignment.teamId);
  if (assignment.level !== "band" && assignment.bandId) pool = pool.filter((e) => e.bandId === assignment.bandId);

  // Process applicability rules (empty list = applies to all).
  if (process) {
    if (process.applicableBandIds.length) pool = pool.filter((e) => process.applicableBandIds.includes(e.bandId));
    if (process.applicableTeamIds.length) {
      pool = pool.filter((e) => e.teamId !== null && process.applicableTeamIds.includes(e.teamId));
    }
  }
  return pool;
}

export interface Occurrence {
  periodStart: ISODate;
  dueDate: ISODate;
}

/** All task occurrences for an assignment whose due date falls within [from, to]. */
export function generateOccurrences(assignment: Assignment, process: Process | undefined, from: ISODate, to: ISODate): Occurrence[] {
  const start = assignment.startDate > from ? assignment.startDate : from;
  const end = assignment.endDate && assignment.endDate < to ? assignment.endDate : to;
  if (start > end) return [];
  const out: Occurrence[] = [];
  const due = assignment.dueConfig;
  const offsetDue = (periodStart: Date, periodEnd: Date) =>
    due.rule === "days_after_start" ? toISODate(addDays(periodStart, due.offsetDays)) : toISODate(periodEnd);

  const s = parseISO(start);
  const e = parseISO(end);

  switch (assignment.frequency) {
    case "daily": {
      for (let d = s; d <= e; d = addDays(d, 1)) {
        if (isWeekend(d)) continue;
        out.push({ periodStart: toISODate(d), dueDate: toISODate(d) });
      }
      break;
    }
    case "weekly": {
      for (let w = startOfWeek(s, { weekStartsOn: 1 }); w <= e; w = addDays(w, 7)) {
        const fri = isFriday(w) ? w : nextFriday(w);
        out.push({ periodStart: toISODate(w), dueDate: offsetDue(w, fri) });
      }
      break;
    }
    case "monthly": {
      for (let m = startOfMonth(s); m <= e; m = startOfMonth(addDays(endOfMonth(m), 1))) {
        out.push({ periodStart: toISODate(m), dueDate: offsetDue(m, endOfMonth(m)) });
      }
      break;
    }
    case "quarterly": {
      for (let q = startOfQuarter(s); q <= e; q = startOfQuarter(addDays(endOfQuarter(q), 1))) {
        out.push({ periodStart: toISODate(q), dueDate: offsetDue(q, endOfQuarter(q)) });
      }
      break;
    }
    case "annually": {
      const ps = parseISO(assignment.startDate);
      out.push({ periodStart: assignment.startDate, dueDate: toISODate(addDays(ps, due.offsetDays || 30)) });
      break;
    }
    case "custom": {
      const interval = Math.max(1, process?.customIntervalDays ?? 14);
      // Anchor to the assignment start so cycles stay aligned.
      let c = parseISO(assignment.startDate);
      while (c < s) c = addDays(c, interval);
      for (; c <= e; c = addDays(c, interval)) {
        const pe = addDays(c, interval - 1);
        out.push({ periodStart: toISODate(c), dueDate: offsetDue(c, pe) });
      }
      break;
    }
    case "event_based": {
      // Deterministic pseudo-events every 3–6 weeks (releases, go-lives, joiners).
      const rng = createRng(hashString(assignment.id));
      let c = addDays(s, rng.int(2, 12));
      while (c <= e) {
        out.push({ periodStart: toISODate(c), dueDate: toISODate(addDays(c, due.offsetDays || 3)) });
        c = addDays(c, rng.int(21, 42));
      }
      break;
    }
  }
  return out.filter((o) => o.dueDate >= from && o.dueDate <= to && o.dueDate >= assignment.startDate);
}

/** Build fresh (not-started) tasks for an assignment — used when assigning at runtime. */
export function buildTasksForAssignment(
  assignment: Assignment,
  process: Process,
  db: EngineDb,
  window: { from: ISODate; to: ISODate },
  nowIso: string,
): ComplianceTask[] {
  const employees = resolveAssignmentEmployees(assignment, process, db);
  const occurrences = generateOccurrences(assignment, process, window.from, window.to);
  const tasks: ComplianceTask[] = [];
  for (const emp of employees) {
    for (const occ of occurrences) {
      tasks.push({
        id: `TSK-${assignment.id}-${emp.id}-${occ.dueDate}`,
        assignmentId: assignment.id,
        processId: process.id,
        employeeId: emp.id,
        periodStart: occ.periodStart,
        dueDate: occ.dueDate,
        status: "not_started",
        required: process.isMandatory,
        requiresApproval: process.requiresApproval,
        completedStepIds: [],
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        qualityScore: null,
        remarks: "",
        evidence: [],
        history: [{ id: `EV-${assignment.id}-${emp.id}-${occ.dueDate}`, kind: "status", authorName: "System", text: "Task generated from assignment.", createdAt: nowIso }],
        updatedAt: nowIso,
      });
    }
  }
  return tasks;
}

/** Default generation window for runtime-created assignments. */
export function defaultGenerationWindow(today: ISODate) {
  return { from: addDaysISO(today, -182), to: addDaysISO(today, 28) };
}
