import type { AppNotification, Assignment, RecordStatus } from "@/types";
import { auditEntry, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";
import { buildTasksForAssignment, defaultGenerationWindow, resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { TODAY } from "@/lib/store/mock-db";
import { uid } from "@/lib/utils/random";

export type AssignmentInput = Omit<Assignment, "id" | "createdAt" | "createdBy" | "status">;

export async function getAssignments(): Promise<Assignment[]> {
  await latency(60);
  return getDb().assignments;
}

/** Preview who would receive an assignment, without saving. */
export function previewAssignment(input: AssignmentInput) {
  const db = getDb();
  const process = db.processes.find((p) => p.id === input.processId);
  const draft: Assignment = { ...input, id: "PREVIEW", createdAt: "", createdBy: "", status: "active" };
  return resolveAssignmentEmployees(draft, process, db);
}

/**
 * Create an assignment: resolves eligible employees, generates their task
 * occurrences, and notifies them.
 */
export async function createAssignment(input: AssignmentInput): Promise<{ assignment: Assignment; employees: number; tasks: number }> {
  await latency(400);
  let result = { employees: 0, tasks: 0 };
  let assignment: Assignment | undefined;
  write((d) => {
    const process = d.processes.find((p) => p.id === input.processId);
    if (!process) throw new RepositoryError("Select a valid process.");
    if (process.status === "inactive") throw new RepositoryError("Inactive processes cannot be assigned.");
    const max = d.assignments.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, "")) || 0), 0);
    const ts = nowIso();
    const actorAudit = auditEntry(d, "Assignments", "Assigned", "", "", "");
    assignment = { ...input, id: `ASG-${String(max + 1).padStart(3, "0")}`, status: "active", createdAt: ts, createdBy: actorAudit.userName };
    const employees = resolveAssignmentEmployees(assignment, process, d);
    if (!employees.length) throw new RepositoryError("No eligible active employees match this assignment.");
    const tasks = buildTasksForAssignment(assignment, process, d, defaultGenerationWindow(TODAY), ts);
    result = { employees: employees.length, tasks: tasks.length };
    const notification: AppNotification = {
      id: uid("NTF"),
      type: "process_assigned",
      title: "New process assigned",
      message: `${process.name} was assigned to ${employees.length} employee${employees.length === 1 ? "" : "s"} (${assignment.level} level).`,
      createdAt: ts,
      read: false,
      audienceRoles: [],
      recipientEmployeeId: employees.length === 1 ? employees[0].id : null,
      link: "/processes?tab=assignments",
    };
    return {
      patch: { assignments: [...d.assignments, assignment], tasks: [...d.tasks, ...tasks], notifications: [notification, ...d.notifications] },
      audit: [
        {
          ...actorAudit,
          recordId: assignment.id,
          recordLabel: process.name,
          description: `Process assigned at ${assignment.level} level to ${employees.length} employees (${tasks.length} tasks generated).`,
        },
      ],
    };
  });
  return { assignment: assignment!, ...result };
}

/** Deactivating an assignment marks its future, untouched tasks as Not Applicable. */
export async function setAssignmentStatus(id: string, status: RecordStatus): Promise<void> {
  await latency();
  write((d) => {
    const assignments = replaceById(d.assignments, id, (a) => ({ ...a, status }));
    const tasks =
      status === "inactive"
        ? d.tasks.map((t) =>
            t.assignmentId === id && t.dueDate >= TODAY && t.status === "not_started" ? { ...t, status: "not_applicable" as const, remarks: "Assignment deactivated.", updatedAt: nowIso() } : t,
          )
        : d.tasks;
    const a = d.assignments.find((x) => x.id === id);
    const pname = d.processes.find((p) => p.id === a?.processId)?.name ?? id;
    return { patch: { assignments, tasks }, audit: [auditEntry(d, "Assignments", status === "inactive" ? "Deactivated" : "Activated", id, pname, `Assignment ${status === "inactive" ? "deactivated; future tasks marked not applicable" : "re-activated"}.`)] };
  });
}
