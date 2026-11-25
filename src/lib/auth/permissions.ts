/**
 * Demo role model. FRONTEND SIMULATION ONLY — not a security boundary.
 * With Supabase this maps to RLS policies + a `user_roles` table.
 */
import type { AppRole, AppUser, Database, DataScope, Employee } from "@/types";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  senior_management: "Senior Management",
  department_head: "Department Head",
  project_manager: "Project Manager",
  team_supervisor: "Team Supervisor",
  employee: "Employee",
  administrator: "Administrator",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  super_admin: "Full access to every module, setting and record.",
  senior_management: "Organization-wide visibility, reports and approvals.",
  department_head: "Manages their department, teams, processes and approvals.",
  project_manager: "Oversees the teams they manage as project manager.",
  team_supervisor: "Supervises one team's compliance and reviews submissions.",
  employee: "Completes assigned processes and tracks their own compliance.",
  administrator: "Administers employees, master data, users and settings.",
};

export type Permission =
  | "employees.manage"
  | "employees.import"
  | "organization.manage"
  | "processes.manage"
  | "assignments.manage"
  | "tasks.review"
  | "tasks.submit"
  | "masterdata.manage"
  | "users.manage"
  | "settings.manage"
  | "reports.export"
  | "audit.view"
  | "database.view"
  | "menu.configure"
  | "ecosystem.manage"
  | "ecosystem.delete_linked"
  | "processes.configure_kpis";

const ALL: Permission[] = [
  "employees.manage",
  "employees.import",
  "organization.manage",
  "processes.manage",
  "assignments.manage",
  "tasks.review",
  "tasks.submit",
  "masterdata.manage",
  "users.manage",
  "settings.manage",
  "reports.export",
  "audit.view",
  "database.view",
  "menu.configure",
  "ecosystem.manage",
  "ecosystem.delete_linked",
  "processes.configure_kpis",
];

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: ALL,
  // Master Data and the database structure view are Super Admin only.
  administrator: ALL.filter((p) => p !== "tasks.review" && p !== "masterdata.manage" && p !== "database.view" && p !== "menu.configure" && p !== "ecosystem.delete_linked" && p !== "processes.configure_kpis"),
  senior_management: ["ecosystem.manage", "processes.manage", "assignments.manage", "tasks.review", "reports.export", "audit.view", "tasks.submit"],
  department_head: ["ecosystem.manage", "organization.manage", "processes.manage", "assignments.manage", "tasks.review", "tasks.submit", "reports.export", "employees.manage"],
  project_manager: ["ecosystem.manage", "assignments.manage", "tasks.review", "tasks.submit", "reports.export"],
  team_supervisor: ["tasks.review", "tasks.submit", "reports.export"],
  employee: ["tasks.submit"],
};

export function can(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Which records a persona may see. null fields = unrestricted. */
export function getScope(user: AppUser, employee: Employee | null, db: Pick<Database, "departments" | "teams">): DataScope {
  const none: DataScope = { departmentIds: null, teamIds: null, employeeIds: null };
  if (!employee) return none;
  switch (user.role) {
    case "super_admin":
    case "senior_management":
    case "administrator":
      return none;
    case "department_head": {
      const headed = db.departments.filter((d) => d.headId === employee.id).map((d) => d.id);
      return { ...none, departmentIds: headed.length ? headed : [employee.departmentId] };
    }
    case "project_manager": {
      const teams = db.teams.filter((t) => t.projectManagerId === employee.id).map((t) => t.id);
      return { ...none, teamIds: teams.length ? teams : employee.teamId ? [employee.teamId] : [] };
    }
    case "team_supervisor": {
      const teams = db.teams.filter((t) => t.supervisorId === employee.id).map((t) => t.id);
      return { ...none, teamIds: teams.length ? teams : employee.teamId ? [employee.teamId] : [] };
    }
    case "employee":
      return { ...none, employeeIds: [employee.id] };
  }
}

export function isUnrestricted(scope: DataScope): boolean {
  return !scope.departmentIds && !scope.teamIds && !scope.employeeIds;
}

export function inScope(e: Employee, scope: DataScope): boolean {
  if (scope.employeeIds && !scope.employeeIds.includes(e.id)) return false;
  if (scope.teamIds && (!e.teamId || !scope.teamIds.includes(e.teamId))) return false;
  if (scope.departmentIds && !scope.departmentIds.includes(e.departmentId)) return false;
  return true;
}

/** Default landing dashboard per role. */
export function homeDashboardFor(role: AppRole): "executive" | "department" | "team" | "employee" {
  switch (role) {
    case "department_head":
      return "department";
    case "project_manager":
    case "team_supervisor":
      return "team";
    case "employee":
      return "employee";
    default:
      return "executive";
  }
}
