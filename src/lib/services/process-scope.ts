/**
 * "Process applied for" — pure helpers for scope validation and resolution.
 */
import type { Database, Employee, Process, ProcessScope } from "@/types";

export const SCOPE_LEVEL_LABELS: Record<ProcessScope["level"], string> = {
  department: "Department level",
  team: "Team level",
  employee: "Employee level",
};

export const SCOPE_LEVEL_HELP: Record<ProcessScope["level"], string> = {
  department: "Applies to every active employee in the selected departments.",
  team: "Applies to every active employee in the selected teams.",
  employee: "Applies only to the employees you pick.",
};

export function emptyScope(): ProcessScope {
  return { level: "department", departmentIds: [], teamIds: [], employeeIds: [] };
}

type ScopeDb = Pick<Database, "employees" | "teams" | "departments">;

/** Teams that can be chosen once departments are selected. */
export function teamsForDepartments(db: Pick<Database, "teams">, departmentIds: string[]) {
  return db.teams.filter((t) => t.status === "active" && departmentIds.includes(t.departmentId));
}

/** Employees that can be chosen given selected departments (and optionally teams). */
export function employeesForSelection(db: Pick<Database, "employees">, departmentIds: string[], teamIds: string[] = []): Employee[] {
  return db.employees.filter((e) => {
    if (e.status === "inactive") return false;
    if (!departmentIds.includes(e.departmentId)) return false;
    return teamIds.length === 0 ? true : e.teamId !== null && teamIds.includes(e.teamId);
  });
}

/** Returns an error message, or null when the scope is valid. */
export function validateScope(scope: ProcessScope, db: ScopeDb): string | null {
  if (!scope.departmentIds.length) return "Select at least one department.";
  if (scope.level === "team" && !scope.teamIds.length) return "Select at least one team.";
  if (scope.level === "employee" && !scope.employeeIds.length) return "Select at least one employee.";
  const deptSet = new Set(scope.departmentIds);
  if (scope.teamIds.some((id) => !db.teams.find((t) => t.id === id && deptSet.has(t.departmentId)))) return "A selected team does not belong to the selected departments.";
  if (scope.employeeIds.some((id) => !db.employees.find((e) => e.id === id))) return "A selected employee no longer exists.";
  return null;
}

/** Make level-specific lists consistent (drops stale teams / employees). */
export function normalizeScope(scope: ProcessScope, db: ScopeDb): ProcessScope {
  const deptSet = new Set(scope.departmentIds);
  const teams = db.teams.filter((t) => deptSet.has(t.departmentId));
  const teamSet = new Set(teams.map((t) => t.id));
  const teamIds = scope.level === "department" ? [] : scope.teamIds.filter((id) => teamSet.has(id));
  const employeeIds =
    scope.level === "employee"
      ? scope.employeeIds.filter((id) => {
          const e = db.employees.find((x) => x.id === id);
          return e && deptSet.has(e.departmentId) && (teamIds.length === 0 || (e.teamId !== null && teamIds.includes(e.teamId)));
        })
      : [];
  return { level: scope.level, departmentIds: scope.departmentIds, teamIds, employeeIds };
}

/** Active employees covered by a scope (optionally narrowed by the process's band rules). */
export function resolveScopeEmployees(scope: ProcessScope, db: ScopeDb, process?: Pick<Process, "applicableBandIds">): Employee[] {
  let pool = db.employees.filter((e) => e.status !== "inactive");
  switch (scope.level) {
    case "department":
      pool = pool.filter((e) => scope.departmentIds.includes(e.departmentId));
      break;
    case "team":
      pool = pool.filter((e) => e.teamId !== null && scope.teamIds.includes(e.teamId));
      break;
    case "employee":
      pool = pool.filter((e) => scope.employeeIds.includes(e.id));
      break;
  }
  if (process?.applicableBandIds.length) pool = pool.filter((e) => process.applicableBandIds.includes(e.bandId));
  return pool;
}

/** Human summary, e.g. "Department level · Engineering, Quality Assurance". */
export function describeScope(scope: ProcessScope, db: ScopeDb, max = 3): string {
  const names = (ids: string[], list: { id: string; name: string }[]) => {
    const n = ids.map((id) => list.find((x) => x.id === id)?.name).filter(Boolean) as string[];
    return n.length > max ? `${n.slice(0, max).join(", ")} +${n.length - max} more` : n.join(", ");
  };
  if (!scope.departmentIds.length) return "Not defined";
  const depts = names(scope.departmentIds, db.departments);
  switch (scope.level) {
    case "department":
      return `Department level · ${depts}`;
    case "team":
      return `Team level · ${names(scope.teamIds, db.teams)} (${depts})`;
    case "employee": {
      const n = scope.employeeIds.length;
      return `Employee level · ${n} employee${n === 1 ? "" : "s"} (${depts})`;
    }
  }
}
