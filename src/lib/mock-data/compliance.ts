/**
 * Seed generator for compliance tasks. Deterministic: same `today` ⇒ same data.
 * Simulates a realistic history: department-level discipline differences,
 * gradual month-over-month improvement, pending approvals, rejections,
 * overdue work and approved exceptions.
 */
import type { Assignment, ComplianceTask, Employee, ISODate, Process, TaskEvent, TaskStatus, Team } from "@/types";
import { generateOccurrences, resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { addDaysISO, daysBetween } from "@/lib/utils/dates";
import { createRng, hashString } from "@/lib/utils/random";

const DEPARTMENT_DISCIPLINE: Record<string, number> = {
  "DEP-01": 0.9,
  "DEP-02": 0.905,
  "DEP-03": 0.935,
  "DEP-04": 0.82,
  "DEP-05": 0.78,
  "DEP-06": 0.955,
  "DEP-07": 0.915,
  "DEP-08": 0.885,
};

/** Notable individuals so insights have something to say. */
const INDIVIDUAL_OVERRIDES: Record<string, number> = {
  "EMP-1041": 0.995,
  "EMP-1020": 0.99,
  "EMP-1008": 0.985,
  "EMP-1045": 0.99,
  "EMP-1036": 0.6,
  "EMP-1028": 0.64,
  "EMP-1015": 0.7,
  "EMP-1031": 0.68,
};

/** Employees who have stopped submitting in the last ~5 weeks (drives participation < 100%). */
const DISENGAGED = new Set(["EMP-1036", "EMP-1031", "EMP-1015"]);

/** Monthly improvement slope per team (pts/month). Positive = improving. */
const TEAM_SLOPE: Record<string, number> = {
  "TEAM-07": 0.035,
  "TEAM-06": 0.03,
  "TEAM-03": 0.018,
  "TEAM-05": -0.012,
  "TEAM-10": -0.006,
};

const REJECTION_REMARKS = [
  "Evidence attached does not match the checklist item. Please re-upload.",
  "Variance explanation missing for two line items.",
  "Peer review not recorded in the tracker.",
  "Screenshots are from the wrong environment.",
  "Checklist incomplete — mandatory step skipped.",
];

const SEED_WINDOW_DAYS = 182;
const FUTURE_WINDOW_DAYS = 28;

export function buildComplianceSeed(
  today: ISODate,
  assignments: Assignment[],
  processes: Process[],
  employees: Employee[],
  teams: Team[],
): ComplianceTask[] {
  const processById = new Map(processes.map((p) => [p.id, p]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const from = addDaysISO(today, -SEED_WINDOW_DAYS);
  const to = addDaysISO(today, FUTURE_WINDOW_DAYS);
  const tasks: ComplianceTask[] = [];

  const discipline = (emp: Employee) => {
    if (INDIVIDUAL_OVERRIDES[emp.id]) return INDIVIDUAL_OVERRIDES[emp.id];
    const r = createRng(hashString(emp.id));
    return Math.min(0.995, Math.max(0.55, (DEPARTMENT_DISCIPLINE[emp.departmentId] ?? 0.85) + r.between(-0.06, 0.06)));
  };

  for (const asg of assignments) {
    const process = processById.get(asg.processId);
    if (!process) continue;
    const reviewer = asg.reviewerId ? empById.get(asg.reviewerId) : undefined;
    const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Process Owner";
    const members = resolveAssignmentEmployees(asg, process, { employees, teams });
    const occurrences = generateOccurrences(asg, process, from, to);

    for (const emp of members) {
      const base = discipline(emp);
      const slope = emp.teamId ? (TEAM_SLOPE[emp.teamId] ?? 0.012) : 0.012;
      const empName = `${emp.firstName} ${emp.lastName}`;

      for (const occ of occurrences) {
        const id = `TSK-${asg.id}-${emp.id}-${occ.dueDate}`;
        const rng = createRng(hashString(id));
        const daysAgo = daysBetween(occ.dueDate, today); // >0 ⇒ past due
        const monthsAgo = Math.max(0, daysAgo) / 30;
        const disengaged = DISENGAGED.has(emp.id) && daysAgo >= -7 && daysAgo < 40;
        const p = disengaged ? 0 : Math.min(0.995, Math.max(0.3, base + 0.005 - monthsAgo * slope));
        const allSteps = process.steps.map((s) => s.id);

        let status: TaskStatus = "not_started";
        let submittedAt: string | null = null;
        let reviewedAt: string | null = null;
        let reviewedBy: string | null = null;
        let qualityScore: number | null = null;
        let remarks = "";
        let completedStepIds: string[] = [];
        const history: TaskEvent[] = [];
        const at = (date: ISODate, hour: number) => `${date}T${String(hour).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}:00.000Z`;

        if (emp.status === "on_leave" && daysAgo < 30) {
          status = "approved_exception";
          remarks = "Approved leave — exempted for this period.";
          history.push({ id: `${id}-e1`, kind: "status", authorName: reviewerName, text: "Marked as approved exception (employee on leave).", createdAt: at(occ.dueDate, 6) });
        } else if (daysAgo > 0) {
          if (rng.next() < p) {
            const late = rng.chance(0.06 + (1 - base) * 0.6);
            const subDate = late ? addDaysISO(occ.dueDate, rng.int(1, 3)) : addDaysISO(occ.dueDate, -rng.int(0, 2));
            submittedAt = at(subDate, rng.int(5, 13));
            completedStepIds = allSteps;
            history.push({ id: `${id}-e1`, kind: "status", authorName: empName, text: "Submitted process completion.", createdAt: submittedAt });
            if (process.requiresApproval && daysAgo <= 4 && rng.chance(0.55)) {
              status = "submitted";
            } else {
              status = "completed";
              if (process.requiresApproval) {
                reviewedAt = at(addDaysISO(subDate, 1), rng.int(5, 12));
                reviewedBy = reviewerName;
                history.push({ id: `${id}-e2`, kind: "review", authorName: reviewerName, text: "Approved.", createdAt: reviewedAt });
              }
              qualityScore = Math.max(2, Math.min(5, Math.round(2.4 + base * 2.6 + rng.between(-0.6, 0.6))));
            }
          } else {
            const x = disengaged ? 0.99 : rng.next();
            if (x < 0.07) {
              status = "approved_exception";
              remarks = "Exception approved by process owner (customer-driven reschedule).";
            } else if (x < 0.12) {
              status = "not_applicable";
              remarks = "Not applicable for this period.";
            } else if (x < 0.32) {
              status = "rejected";
              submittedAt = at(occ.dueDate, rng.int(5, 12));
              reviewedAt = at(addDaysISO(occ.dueDate, 1), rng.int(5, 12));
              reviewedBy = reviewerName;
              remarks = rng.pick(REJECTION_REMARKS);
              completedStepIds = allSteps.slice(0, Math.max(1, allSteps.length - 1));
              history.push(
                { id: `${id}-e1`, kind: "status", authorName: empName, text: "Submitted process completion.", createdAt: submittedAt },
                { id: `${id}-e2`, kind: "review", authorName: reviewerName, text: `Rejected: ${remarks}`, createdAt: reviewedAt },
              );
            } else if (x < 0.42 && process.requiresApproval && daysAgo < 20) {
              status = "submitted";
              submittedAt = at(addDaysISO(occ.dueDate, rng.int(0, 2)), rng.int(5, 12));
              completedStepIds = allSteps;
              history.push({ id: `${id}-e1`, kind: "status", authorName: empName, text: "Submitted process completion (late).", createdAt: submittedAt });
            } else {
              status = rng.chance(0.4) ? "in_progress" : "not_started";
              if (status === "in_progress") completedStepIds = allSteps.slice(0, rng.int(1, Math.max(1, allSteps.length - 1)));
            }
          }
        } else {
          // Due today or in the future.
          const daysUntil = -daysAgo;
          if (!disengaged && daysUntil <= 7 && rng.chance(daysUntil === 0 ? p * 0.55 : 0.12)) {
            submittedAt = at(addDaysISO(today, -rng.int(0, 1)), rng.int(4, 8));
            completedStepIds = allSteps;
            status = process.requiresApproval ? "submitted" : "completed";
            history.push({ id: `${id}-e1`, kind: "status", authorName: empName, text: "Submitted process completion.", createdAt: submittedAt });
          } else if (daysUntil <= 7 && rng.chance(0.3)) {
            status = "in_progress";
            completedStepIds = allSteps.slice(0, 1);
          }
        }

        tasks.push({
          id,
          assignmentId: asg.id,
          processId: process.id,
          employeeId: emp.id,
          periodStart: occ.periodStart,
          dueDate: occ.dueDate,
          status,
          required: process.isMandatory,
          requiresApproval: process.requiresApproval,
          completedStepIds,
          submittedAt,
          reviewedAt,
          reviewedBy,
          qualityScore,
          remarks,
          evidence:
            submittedAt && daysAgo < 21 && process.steps.some((s) => s.evidenceRequired)
              ? [{ id: `${id}-ev`, name: `${process.id}-evidence-${occ.dueDate}.pdf`, size: 48_000 + rng.int(0, 200_000), mimeType: "application/pdf", uploadedAt: submittedAt, uploadedBy: empName }]
              : [],
          history,
          updatedAt: reviewedAt ?? submittedAt ?? `${occ.periodStart}T04:00:00.000Z`,
        });
      }
    }
  }
  return tasks;
}
