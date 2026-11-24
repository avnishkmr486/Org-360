import type { Assignment, Database, Employee } from "@/types";
import { resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { ASSIGNMENT_LEVEL_LABELS } from "@/lib/constants";

/** Distinct employees covered by a process's active assignments. */
export function assignedEmployeesByProcess(db: Database): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const procs = new Map(db.processes.map((p) => [p.id, p]));
  for (const a of db.assignments) {
    if (a.status !== "active") continue;
    const set = out.get(a.processId) ?? new Set<string>();
    for (const e of resolveAssignmentEmployees(a, procs.get(a.processId), db)) set.add(e.id);
    out.set(a.processId, set);
  }
  return out;
}

export function assignmentEmployees(db: Database, a: Assignment): Employee[] {
  return resolveAssignmentEmployees(a, db.processes.find((p) => p.id === a.processId), db);
}

/** Human description of an assignment's target, e.g. "Team · QA Automation". */
export function describeAssignmentTarget(db: Database, a: Assignment): string {
  const dept = db.departments.find((d) => d.id === a.departmentId)?.name;
  const team = db.teams.find((t) => t.id === a.teamId)?.name;
  const band = db.bands.find((b) => b.id === a.bandId);
  switch (a.level) {
    case "organization":
      return "Entire organization";
    case "department":
      return dept ?? "—";
    case "team":
      return team ? `${team}${dept ? ` (${dept})` : ""}` : "—";
    case "band":
      return `${band ? `${band.code} · ${band.name}` : "—"}${dept ? ` in ${dept}` : ""}`;
    case "employee":
      return `${a.employeeIds.length} selected employee${a.employeeIds.length === 1 ? "" : "s"}`;
  }
}

export { ASSIGNMENT_LEVEL_LABELS };
