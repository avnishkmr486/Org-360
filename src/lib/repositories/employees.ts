import type { AuditLog, Database, Employee, ImportHistoryEntry } from "@/types";
import { auditEntry, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";
import { ensureAccounts } from "@/lib/auth/accounts";
import { uid } from "@/lib/utils/random";

export type EmployeeInput = Omit<Employee, "createdAt" | "updatedAt">;

export const fullName = (e: Pick<Employee, "firstName" | "lastName">) => `${e.firstName} ${e.lastName}`;

export async function getEmployees(): Promise<Employee[]> {
  await latency(60);
  return getDb().employees;
}

export async function getEmployee(id: string): Promise<Employee | undefined> {
  await latency(60);
  return getDb().employees.find((e) => e.id === id);
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  await latency();
  const db = getDb();
  if (db.employees.some((e) => e.id.toLowerCase() === input.id.toLowerCase())) {
    throw new RepositoryError(`Employee ID ${input.id} already exists.`);
  }
  // Email is optional ("" = not provided): only real addresses must be unique.
  if (input.email.trim() && db.employees.some((e) => e.email && e.email.toLowerCase() === input.email.toLowerCase())) {
    throw new RepositoryError(`Email ${input.email} is already used by another employee.`);
  }
  const ts = nowIso();
  const employee: Employee = { ...input, createdAt: ts, updatedAt: ts };
  write((d) => {
    const employees = [...d.employees, employee];
    return {
      patch: { employees, users: ensureAccounts({ ...d, employees }) },
      audit: [auditEntry(d, "Employees", "Created", employee.id, fullName(employee), "Employee record created with a login account.")],
    };
  });
  return employee;
}

export async function updateEmployee(id: string, patch: Partial<EmployeeInput>): Promise<Employee> {
  await latency();
  let updated: Employee | undefined;
  write((d) => {
    if (patch.email && d.employees.some((e) => e.id !== id && e.email && e.email.toLowerCase() === patch.email!.toLowerCase())) {
      throw new RepositoryError(`Email ${patch.email} is already used by another employee.`);
    }
    const employees = replaceById(d.employees, id, (e) => (updated = { ...e, ...patch, id: e.id, updatedAt: nowIso() }));
    const changed = Object.keys(patch).filter((k) => k !== "id").join(", ");
    return { patch: { employees }, audit: [auditEntry(d, "Employees", "Updated", id, fullName(updated!), `Updated fields: ${changed || "none"}.`)] };
  });
  return updated!;
}

export async function deactivateEmployees(ids: string[]): Promise<number> {
  await latency();
  let count = 0;
  write((d) => {
    const set = new Set(ids);
    const employees = d.employees.map((e) => {
      if (!set.has(e.id) || e.status === "inactive") return e;
      count++;
      return { ...e, status: "inactive" as const, updatedAt: nowIso() };
    });
    return {
      patch: { employees },
      audit: ids.map((id) => {
        const e = d.employees.find((x) => x.id === id);
        return auditEntry(d, "Employees", "Deactivated", id, e ? fullName(e) : id, "Employee deactivated.");
      }),
    };
  });
  return count;
}

export async function reactivateEmployee(id: string): Promise<void> {
  await updateEmployee(id, { status: "active" });
}

/**
 * Hard delete — only permitted when the employee has no compliance history,
 * no reports and no leadership mappings. Otherwise deactivate instead.
 */
export async function deleteEmployee(id: string): Promise<void> {
  await latency();
  const db = getDb();
  if (db.tasks.some((t) => t.employeeId === id)) throw new RepositoryError("Employee has compliance history. Deactivate instead of deleting.");
  if (db.employees.some((e) => e.reportingManagerId === id)) throw new RepositoryError("Employee is a reporting manager for others.");
  if (db.departments.some((d) => d.headId === id) || db.teams.some((t) => t.supervisorId === id || t.projectManagerId === id)) {
    throw new RepositoryError("Employee is mapped as a department head, supervisor or project manager.");
  }
  write((d) => {
    const e = d.employees.find((x) => x.id === id);
    return {
      patch: { employees: d.employees.filter((x) => x.id !== id) },
      audit: [auditEntry(d, "Employees", "Deleted", id, e ? fullName(e) : id, "Employee record deleted.")],
    };
  });
}

export interface ImportCommitRow {
  employee: EmployeeInput;
  action: "create" | "update";
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface ImportMeta {
  fileName: string;
  skipped: number;
  failed: number;
}

/**
 * Pure commit recipe for validated import rows (no store access) so it can run inside
 * a larger atomic write (see employee-import.ts, which also creates master data).
 * Employee ID is the unique key.
 * - "update" rows only overwrite when the user explicitly opted in.
 * - Employees missing from the file are NEVER deleted.
 */
export function applyEmployeeRows(d: Database, rows: ImportCommitRow[], meta: ImportMeta, note = ""): { patch: Partial<Database>; audit: AuditLog[]; summary: ImportSummary } {
  const summary: ImportSummary = { total: rows.length + meta.skipped + meta.failed, created: 0, updated: 0, skipped: meta.skipped, failed: meta.failed };
  const ts = nowIso();
  const byId = new Map(d.employees.map((e) => [e.id, e]));
  for (const r of rows) {
    const existing = byId.get(r.employee.id);
    if (existing && r.action === "update") {
      byId.set(existing.id, { ...existing, ...r.employee, createdAt: existing.createdAt, updatedAt: ts });
      summary.updated++;
    } else if (!existing && r.action === "create") {
      byId.set(r.employee.id, { ...r.employee, createdAt: ts, updatedAt: ts });
      summary.created++;
    } else {
      summary.skipped++;
    }
  }
  const entry: ImportHistoryEntry = {
    id: uid("IMP"),
    fileName: meta.fileName,
    importedAt: ts,
    importedBy: auditEntry(d, "Import", "", "", "", "").userName,
    ...summary,
  };
  const audit = [
    auditEntry(d, "Import", "Imported", entry.id, meta.fileName, `Employee import: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed.${note ? ` ${note}` : ""}`),
  ];
  const employees = [...byId.values()];
  return { patch: { employees, users: ensureAccounts({ ...d, employees }), importHistory: [entry, ...d.importHistory] }, audit, summary };
}

export async function importEmployees(rows: ImportCommitRow[], meta: ImportMeta): Promise<ImportSummary> {
  await latency(500);
  let summary!: ImportSummary;
  write((d) => {
    const r = applyEmployeeRows(d, rows, meta);
    summary = r.summary;
    return { patch: r.patch, audit: r.audit };
  });
  return summary;
}
