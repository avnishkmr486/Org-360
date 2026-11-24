import type { Department, Organization, RecordStatus, Team } from "@/types";
import { auditEntry, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";

/* ----------------------------- Organization ----------------------------- */

export async function updateOrganization(patch: Partial<Organization>): Promise<void> {
  await latency();
  write((d) => ({
    patch: { organization: { ...d.organization, ...patch } },
    audit: [auditEntry(d, "Organization", "Updated", d.organization.id, d.organization.name, "Organization profile updated.")],
  }));
}

/* ------------------------------ Departments ----------------------------- */

export type DepartmentInput = Pick<Department, "name" | "code" | "description" | "headId" | "status">;

export async function getDepartments(): Promise<Department[]> {
  await latency(60);
  return getDb().departments;
}

export async function createDepartment(input: DepartmentInput): Promise<Department> {
  await latency();
  const db = getDb();
  if (db.departments.some((d) => d.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new RepositoryError(`A department named "${input.name}" already exists.`);
  }
  const max = db.departments.reduce((m, d) => Math.max(m, Number(d.id.replace(/\D/g, "")) || 0), 0);
  const ts = nowIso();
  const dep: Department = { ...input, name: input.name.trim(), id: `DEP-${String(max + 1).padStart(2, "0")}`, createdAt: ts, updatedAt: ts };
  write((d) => ({ patch: { departments: [...d.departments, dep] }, audit: [auditEntry(d, "Departments", "Created", dep.id, dep.name, "Department created.")] }));
  return dep;
}

export async function updateDepartment(id: string, patch: Partial<DepartmentInput>): Promise<void> {
  await latency();
  write((d) => {
    if (patch.name && d.departments.some((x) => x.id !== id && x.name.toLowerCase() === patch.name!.trim().toLowerCase())) {
      throw new RepositoryError(`A department named "${patch.name}" already exists.`);
    }
    let name = "";
    const departments = replaceById(d.departments, id, (x) => {
      name = patch.name ?? x.name;
      return { ...x, ...patch, updatedAt: nowIso() };
    });
    const what = patch.headId !== undefined && Object.keys(patch).length === 1 ? "Department head assigned." : patch.status ? `Status set to ${patch.status}.` : "Department updated.";
    return { patch: { departments }, audit: [auditEntry(d, "Departments", "Updated", id, name, what)] };
  });
}

/** Deactivation keeps employees and history intact; the UI warns about active members first. */
export async function setDepartmentStatus(id: string, status: RecordStatus): Promise<void> {
  await updateDepartment(id, { status });
}

export async function assignDepartmentHead(id: string, headId: string | null): Promise<void> {
  await updateDepartment(id, { headId });
}

/* --------------------------------- Teams -------------------------------- */

export type TeamInput = Pick<Team, "name" | "description" | "departmentId" | "supervisorId" | "projectManagerId" | "status">;

export async function getTeams(): Promise<Team[]> {
  await latency(60);
  return getDb().teams;
}

export async function createTeam(input: TeamInput): Promise<Team> {
  await latency();
  const db = getDb();
  if (db.teams.some((t) => t.departmentId === input.departmentId && t.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new RepositoryError(`Team "${input.name}" already exists in this department.`);
  }
  const max = db.teams.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, "")) || 0), 0);
  const ts = nowIso();
  const team: Team = { ...input, name: input.name.trim(), id: `TEAM-${String(max + 1).padStart(2, "0")}`, createdAt: ts, updatedAt: ts };
  write((d) => ({ patch: { teams: [...d.teams, team] }, audit: [auditEntry(d, "Teams", "Created", team.id, team.name, "Team created.")] }));
  return team;
}

export async function updateTeam(id: string, patch: Partial<TeamInput>): Promise<void> {
  await latency();
  write((d) => {
    let name = "";
    const teams = replaceById(d.teams, id, (t) => {
      name = patch.name ?? t.name;
      return { ...t, ...patch, updatedAt: nowIso() };
    });
    const what =
      patch.supervisorId !== undefined && Object.keys(patch).length === 1
        ? "Team supervisor assigned."
        : patch.projectManagerId !== undefined && Object.keys(patch).length === 1
          ? "Project manager assigned."
          : patch.status
            ? `Status set to ${patch.status}.`
            : "Team updated.";
    return { patch: { teams }, audit: [auditEntry(d, "Teams", "Updated", id, name, what)] };
  });
}

export async function setTeamStatus(id: string, status: RecordStatus): Promise<void> {
  await updateTeam(id, { status });
}

export async function assignTeamSupervisor(id: string, supervisorId: string | null): Promise<void> {
  await updateTeam(id, { supervisorId });
}

export async function assignProjectManager(id: string, projectManagerId: string | null): Promise<void> {
  await updateTeam(id, { projectManagerId });
}

/**
 * Set team membership. Added employees move into the team (and its department);
 * removed employees become unassigned (teamId = null) within their department.
 */
export async function setTeamMembers(teamId: string, employeeIds: string[]): Promise<void> {
  await latency();
  write((d) => {
    const team = d.teams.find((t) => t.id === teamId);
    if (!team) throw new RepositoryError("Team not found.");
    const want = new Set(employeeIds);
    const ts = nowIso();
    let added = 0;
    let removed = 0;
    const employees = d.employees.map((e) => {
      if (want.has(e.id) && e.teamId !== teamId) {
        added++;
        return { ...e, teamId, departmentId: team.departmentId, reportingManagerId: team.supervisorId && team.supervisorId !== e.id ? team.supervisorId : e.reportingManagerId, updatedAt: ts };
      }
      if (!want.has(e.id) && e.teamId === teamId) {
        removed++;
        return { ...e, teamId: null, updatedAt: ts };
      }
      return e;
    });
    return { patch: { employees }, audit: [auditEntry(d, "Teams", "Members Updated", teamId, team.name, `${added} added, ${removed} removed.`)] };
  });
}
