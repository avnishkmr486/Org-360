/**
 * Who may do what inside one process.
 *  - manage:     owner / responsible / follow-up owner, or anyone with the "processes.manage" permission.
 *                Defines KPIs, runs the action list, edits and deletes any item.
 *  - contribute: manage, plus everyone responsible for or impacted by the process (reviewer, stakeholders,
 *                meeting attendees, people in its scope or assignments, anyone with tasks on it).
 *                Adds items and fills in KPI values on the items they own or created.
 */
import type { AppRole, Database, Process } from "@/types";
import { can } from "./permissions";

export interface ProcessAccess {
  manage: boolean;
  contribute: boolean;
}

/** Employees who are responsible for, or impacted by, a process. */
export function involvedEmployeeIds(db: Pick<Database, "tasks" | "assignments">, p: Process): Set<string> {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => id && ids.add(id);
  [p.ownerId, p.responsibleId, p.reviewerId, p.followUpOwnerId, p.escalationContactId].forEach(add);
  [...p.stakeholderIds, ...p.meetingAttendeeIds, ...p.scope.employeeIds].forEach(add);
  for (const a of db.assignments) if (a.processId === p.id) [a.ownerId, a.reviewerId, ...a.employeeIds].forEach(add);
  for (const t of db.tasks) if (t.processId === p.id) ids.add(t.employeeId);
  return ids;
}

export function processAccess(db: Pick<Database, "tasks" | "assignments">, role: AppRole, employeeId: string | null, p: Process): ProcessAccess {
  const lead = !!employeeId && (p.ownerId === employeeId || p.responsibleId === employeeId || p.followUpOwnerId === employeeId);
  const manage = can(role, "processes.manage") || lead;
  const contribute = manage || (!!employeeId && involvedEmployeeIds(db, p).has(employeeId));
  return { manage, contribute };
}
