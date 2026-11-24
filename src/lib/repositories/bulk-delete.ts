/**
 * Bulk hard-delete for organization and master data.
 *
 * Deleting a record that other data depends on needs the user's permission: the UI
 * shows `previewDelete()` (what else would go) and, once granted, `bulkDelete()`
 * removes the selected records together with everything that depends on them and
 * clears the remaining soft references — all in one atomic write, so nothing is
 * ever left pointing at a deleted record.
 */
import type { AuditModule, Database } from "@/types";
import { auditEntry, latency, RepositoryError, write } from "./core";

export type BulkDeleteKind = "employees" | "departments" | "teams" | "bands" | "processCategories" | "designations";

export const BULK_DELETE_META: Record<BulkDeleteKind, { label: string; singular: string; module: AuditModule }> = {
  employees: { label: "Employees", singular: "Employee", module: "Employees" },
  departments: { label: "Departments", singular: "Department", module: "Departments" },
  teams: { label: "Teams", singular: "Team", module: "Teams" },
  bands: { label: "Bands", singular: "Band", module: "Master Data" },
  processCategories: { label: "Process Categories", singular: "Process Category", module: "Master Data" },
  designations: { label: "Designations", singular: "Designation", module: "Master Data" },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Records that other data depends on right now: id → human-readable description. Records nothing points at are absent. */
export function findDeleteBlockers(db: Database, kind: BulkDeleteKind): Map<string, string> {
  const out = new Map<string, string>();
  const block = (id: string, reasons: [number, string][]) => {
    const parts = reasons.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
    if (parts.length) out.set(id, `Linked to ${parts.join(", ")}`);
  };
  const count = <T,>(items: T[], pred: (x: T) => boolean) => items.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);

  switch (kind) {
    case "employees": {
      const taskCounts = new Map<string, number>();
      for (const t of db.tasks) taskCounts.set(t.employeeId, (taskCounts.get(t.employeeId) ?? 0) + 1);
      for (const e of db.employees) {
        block(e.id, [
          [taskCounts.get(e.id) ?? 0, "compliance task(s)"],
          [count(db.employees, (x) => x.reportingManagerId === e.id), "direct report(s)"],
          [count(db.departments, (d) => d.headId === e.id) + count(db.teams, (t) => t.supervisorId === e.id || t.projectManagerId === e.id), "leadership mapping(s)"],
          [count(db.users, (u) => u.employeeId === e.id), "user account(s)"],
          [
            count(db.processes, (p) => p.ownerId === e.id || p.responsibleId === e.id || p.reviewerId === e.id || p.scope.employeeIds.includes(e.id)),
            "process(es)",
          ],
          [count(db.assignments, (a) => a.ownerId === e.id || a.reviewerId === e.id || a.employeeIds.includes(e.id)), "assignment(s)"],
        ]);
      }
      break;
    }
    case "departments":
      for (const d of db.departments) {
        block(d.id, [
          [count(db.employees, (e) => e.departmentId === d.id), "employee(s)"],
          [count(db.teams, (t) => t.departmentId === d.id), "team(s)"],
          [count(db.processes, (p) => p.departmentId === d.id || p.scope.departmentIds.includes(d.id)), "process(es)"],
          [count(db.assignments, (a) => a.departmentId === d.id), "assignment(s)"],
        ]);
      }
      break;
    case "teams":
      for (const t of db.teams) {
        block(t.id, [
          [count(db.employees, (e) => e.teamId === t.id), "employee(s)"],
          [count(db.processes, (p) => p.applicableTeamIds.includes(t.id) || p.scope.teamIds.includes(t.id)), "process(es)"],
          [count(db.assignments, (a) => a.teamId === t.id), "assignment(s)"],
        ]);
      }
      break;
    case "bands":
      for (const b of db.bands) {
        block(b.id, [
          [count(db.employees, (e) => e.bandId === b.id), "employee(s)"],
          [count(db.processes, (p) => p.applicableBandIds.includes(b.id)), "process(es)"],
          [count(db.assignments, (a) => a.bandId === b.id), "assignment(s)"],
        ]);
      }
      break;
    case "processCategories":
      for (const x of db.processCategories) block(x.id, [[count(db.processes, (p) => p.categoryId === x.id), "process(es)"]]);
      break;
    case "designations":
      for (const x of db.designations) block(x.id, [[count(db.employees, (e) => e.designationId === x.id), "employee(s)"]]);
      break;
  }
  return out;
}

export interface DeleteImpact {
  /** Everything removed besides the selected records, e.g. {label:"Employees", count:12}. */
  removed: { label: string; count: number }[];
  /** Optional references (manager, reviewer, scope lists…) cleared on records that stay. */
  cleared: number;
  /** Selected records that exist. */
  selected: number;
}

interface Plan {
  impact: DeleteImpact;
  patch: Partial<Database>;
  /** Ids removed per table. */
  gone: Record<string, Set<string>>;
}

const keep = <T extends { id: string }>(arr: T[], gone: Set<string>) => arr.filter((x) => !gone.has(x.id));

/** Work out the full effect of deleting `ids`, cascading to everything that depends on them. Pure. */
function plan(db: Database, kind: BulkDeleteKind, ids: string[]): Plan {
  const gone = {
    departments: new Set<string>(),
    teams: new Set<string>(),
    bands: new Set<string>(),
    processCategories: new Set<string>(),
    designations: new Set<string>(),
    employees: new Set<string>(),
    processes: new Set<string>(),
    assignments: new Set<string>(),
    tasks: new Set<string>(),
    users: new Set<string>(),
    notifications: new Set<string>(),
  };
  const exists = new Set((db[kind] as { id: string }[]).map((x) => x.id));
  const seed = [...new Set(ids)].filter((id) => exists.has(id));
  for (const id of seed) gone[kind].add(id);

  let changed = true;
  const add = (set: Set<string>, id: string) => {
    if (!set.has(id)) {
      set.add(id);
      changed = true;
    }
  };
  while (changed) {
    changed = false;
    for (const t of db.teams) if (gone.departments.has(t.departmentId)) add(gone.teams, t.id);
    for (const e of db.employees) {
      if (gone.departments.has(e.departmentId) || gone.bands.has(e.bandId) || (e.teamId && gone.teams.has(e.teamId))) add(gone.employees, e.id);
    }
    for (const p of db.processes) {
      if ((p.departmentId && gone.departments.has(p.departmentId)) || gone.processCategories.has(p.categoryId) || gone.employees.has(p.ownerId)) add(gone.processes, p.id);
    }
    for (const a of db.assignments) {
      const emptied = a.level === "employee" && a.employeeIds.length > 0 && a.employeeIds.every((e) => gone.employees.has(e));
      if (
        gone.processes.has(a.processId) ||
        (a.departmentId && gone.departments.has(a.departmentId)) ||
        (a.teamId && gone.teams.has(a.teamId)) ||
        (a.bandId && gone.bands.has(a.bandId)) ||
        gone.employees.has(a.ownerId) ||
        emptied
      ) {
        add(gone.assignments, a.id);
      }
    }
    for (const t of db.tasks) if (gone.employees.has(t.employeeId) || gone.processes.has(t.processId) || gone.assignments.has(t.assignmentId)) add(gone.tasks, t.id);
  }
  for (const u of db.users) if (u.employeeId && gone.employees.has(u.employeeId)) gone.users.add(u.id);
  for (const n of db.notifications) if (n.recipientEmployeeId && gone.employees.has(n.recipientEmployeeId)) gone.notifications.add(n.id);

  // Clear soft references on whatever survives, counting each record that changed.
  let cleared = 0;
  const E = gone.employees;
  const gid = (id: string | null) => (id && E.has(id) ? null : id);
  const list = (arr: string[], g: Set<string>) => (arr.some((x) => g.has(x)) ? arr.filter((x) => !g.has(x)) : arr);
  const touch = <T,>(before: T, after: T) => {
    if (before !== after) cleared++;
    return after;
  };

  const departments = keep(db.departments, gone.departments).map((d) => touch(d, d.headId && E.has(d.headId) ? { ...d, headId: null } : d));
  const teams = keep(db.teams, gone.teams).map((t) =>
    touch(t, (t.supervisorId && E.has(t.supervisorId)) || (t.projectManagerId && E.has(t.projectManagerId)) ? { ...t, supervisorId: gid(t.supervisorId), projectManagerId: gid(t.projectManagerId) } : t),
  );
  const employees = keep(db.employees, E).map((e) => {
    const mgr = e.reportingManagerId && E.has(e.reportingManagerId);
    const des = e.designationId && gone.designations.has(e.designationId);
    return touch(e, mgr || des ? { ...e, ...(mgr ? { reportingManagerId: null } : {}), ...(des ? { designationId: null } : {}) } : e);
  });
  const processes = keep(db.processes, gone.processes).map((p) => {
    const next = {
      ...p,
      responsibleId: gid(p.responsibleId),
      reviewerId: gid(p.reviewerId),
      followUpOwnerId: gid(p.followUpOwnerId),
      escalationContactId: gid(p.escalationContactId),
      meetingAttendeeIds: list(p.meetingAttendeeIds, E),
      stakeholderIds: list(p.stakeholderIds, E),
      applicableTeamIds: list(p.applicableTeamIds, gone.teams),
      applicableBandIds: list(p.applicableBandIds, gone.bands),
      scope: {
        ...p.scope,
        departmentIds: list(p.scope.departmentIds, gone.departments),
        teamIds: list(p.scope.teamIds, gone.teams),
        employeeIds: list(p.scope.employeeIds, E),
      },
    };
    const same =
      next.responsibleId === p.responsibleId &&
      next.reviewerId === p.reviewerId &&
      next.followUpOwnerId === p.followUpOwnerId &&
      next.escalationContactId === p.escalationContactId &&
      next.meetingAttendeeIds === p.meetingAttendeeIds &&
      next.stakeholderIds === p.stakeholderIds &&
      next.applicableTeamIds === p.applicableTeamIds &&
      next.applicableBandIds === p.applicableBandIds &&
      next.scope.departmentIds === p.scope.departmentIds &&
      next.scope.teamIds === p.scope.teamIds &&
      next.scope.employeeIds === p.scope.employeeIds;
    return touch(p, same ? p : next);
  });
  const assignments = keep(db.assignments, gone.assignments).map((a) => {
    const employeeIds = list(a.employeeIds, E);
    const reviewerId = gid(a.reviewerId);
    return touch(a, employeeIds === a.employeeIds && reviewerId === a.reviewerId ? a : { ...a, employeeIds, reviewerId });
  });

  const ecoEntities = db.ecoEntities.map((e) => touch(e, e.ownerId && E.has(e.ownerId) ? { ...e, ownerId: null } : e));

  const removed: DeleteImpact["removed"] = [];
  const push = (set: Set<string>, selectedKind: BulkDeleteKind | null, one: string, many: string) => {
    const n = set.size - (selectedKind === kind ? seed.length : 0);
    if (n > 0) removed.push({ label: n === 1 ? one : many, count: n });
  };
  push(gone.departments, "departments", "Department", "Departments");
  push(gone.teams, "teams", "Team", "Teams");
  push(gone.bands, "bands", "Band", "Bands");
  push(gone.processCategories, "processCategories", "Process category", "Process categories");
  push(gone.designations, "designations", "Designation", "Designations");
  push(gone.employees, "employees", "Employee", "Employees");
  push(gone.processes, null, "Process", "Processes");
  push(gone.assignments, null, "Assignment", "Assignments");
  push(gone.tasks, null, "Compliance task", "Compliance tasks");
  push(gone.users, null, "User account", "User accounts");
  push(gone.notifications, null, "Notification", "Notifications");

  return {
    impact: { removed, cleared, selected: seed.length },
    gone,
    patch: {
      departments,
      teams,
      bands: keep(db.bands, gone.bands),
      processCategories: keep(db.processCategories, gone.processCategories),
      designations: keep(db.designations, gone.designations),
      employees,
      processes,
      assignments,
      tasks: keep(db.tasks, gone.tasks),
      users: keep(db.users, gone.users),
      notifications: keep(db.notifications, gone.notifications),
      ecoEntities,
    },
  };
}

/** What else would be removed or changed if these records were deleted — shown before the user grants permission. */
export function previewDelete(db: Database, kind: BulkDeleteKind, ids: string[]): DeleteImpact {
  return plan(db, kind, ids).impact;
}

export const hasDependents = (i: DeleteImpact) => i.removed.length > 0 || i.cleared > 0;

export interface BulkDeleteResult {
  deleted: number;
  /** Dependent records removed along with the selection. */
  alsoRemoved: number;
  /** References cleared on records that were kept. */
  cleared: number;
}

/** Delete the selected records and everything that depends on them, atomically. Callers must have asked for permission first. */
export async function bulkDelete(kind: BulkDeleteKind, ids: string[]): Promise<BulkDeleteResult> {
  await latency(300);
  if (!ids.length) throw new RepositoryError("Nothing selected.");
  const meta = BULK_DELETE_META[kind];
  const result: BulkDeleteResult = { deleted: 0, alsoRemoved: 0, cleared: 0 };

  write((d) => {
    const p = plan(d, kind, ids);
    const items = d[kind] as unknown as { id: string }[];
    const labelOf = (x: unknown) => {
      const r = x as { name?: string; firstName?: string; lastName?: string; id: string };
      return r.name ?? (`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.id);
    };
    const doomed = [...p.gone[kind]];
    result.deleted = doomed.length;
    result.alsoRemoved = p.impact.removed.reduce((n, r) => n + r.count, 0);
    result.cleared = p.impact.cleared;
    if (!doomed.length) return { patch: {} };
    const byId = new Map(items.map((i) => [i.id, i]));
    const audit = doomed.map((id) => auditEntry(d, meta.module, "Deleted", id, labelOf(byId.get(id)), `${meta.singular} deleted${doomed.length > 1 ? " (bulk)" : ""}.`));
    if (doomed.length > 1) audit.unshift(auditEntry(d, meta.module, "Bulk Deleted", "BULK", meta.label, `${plural(doomed.length, meta.singular.toLowerCase())} deleted in bulk.`));
    if (p.impact.removed.length || p.impact.cleared) {
      const parts = p.impact.removed.map((r) => `${r.count} ${r.label.toLowerCase()}`);
      if (p.impact.cleared) parts.push(`${plural(p.impact.cleared, "reference")} cleared`);
      audit.unshift(auditEntry(d, meta.module, "Cascade Deleted", doomed[0], labelOf(byId.get(doomed[0])), `Deleted with permission together with dependent data: ${parts.join(", ")}.`));
    }
    return { patch: p.patch, audit };
  });

  return result;
}
