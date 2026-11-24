/**
 * Employee import with master-data creation.
 *
 * Departments and Bands found in an import file can be created in the master
 * tables as part of the same import. Everything happens inside ONE store write:
 * if anything fails (unknown synthetic id, bad data), nothing — neither master data
 * nor employees — is changed.
 */
import type { AuditLog, Band, Department } from "@/types";
import { auditEntry, latency, nowIso, RepositoryError, write } from "./core";
import { applyEmployeeRows, type ImportCommitRow, type ImportMeta, type ImportSummary } from "./employees";

export interface PlannedMasterItem {
  /** `__new:<field>:<key>` — what import rows reference until commit. */
  syntheticId: string;
  field: "department" | "band";
  key: string;
  name: string;
  code?: string;
  level?: number;
  description: string;
  /** Importable rows that reference this record (informational). */
  rows: number;
}

export interface MasterPlan {
  departments: PlannedMasterItem[];
  bands: PlannedMasterItem[];
  total: number;
}

export const EMPTY_MASTER_PLAN: MasterPlan = { departments: [], bands: [], total: 0 };

export interface CreatedMaster {
  departments: Department[];
  bands: Band[];
}

export type ImportWithMasterResult = ImportSummary & { createdMaster: CreatedMaster };

const pad2 = (n: number) => String(n).padStart(2, "0");
const maxNum = (ids: string[]) => ids.reduce((m, id) => Math.max(m, Number(id.replace(/\D/g, "")) || 0), 0);
const SYNTHETIC = /^__new:/;

/**
 * Create the planned master records (re-using any that appeared in the meantime),
 * substitute their real ids into the employee rows, then import the employees.
 */
export async function importEmployeesWithMaster(plan: MasterPlan, rows: ImportCommitRow[], meta: ImportMeta): Promise<ImportWithMasterResult> {
  await latency(500);
  let result!: ImportWithMasterResult;
  write((d) => {
    const ts = nowIso();
    const note = (what: string) => `${what} created from employee import "${meta.fileName}".`;
    const idMap = new Map<string, string>();
    const audit: AuditLog[] = [];
    const created: CreatedMaster = { departments: [], bands: [] };
    let departments = d.departments;
    let bands = d.bands;

    for (const p of plan.departments) {
      const hit = departments.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (hit) {
        idMap.set(p.syntheticId, hit.id);
        continue;
      }
      let code = (p.code ?? p.name.slice(0, 3)).toUpperCase();
      const base = code;
      for (let n = 2; departments.some((x) => x.code.toUpperCase() === code); n++) code = `${base}${n}`;
      const dep: Department = { id: `DEP-${pad2(maxNum(departments.map((x) => x.id)) + 1)}`, code, name: p.name, description: p.description, headId: null, status: "active", createdAt: ts, updatedAt: ts };
      departments = [...departments, dep];
      created.departments.push(dep);
      idMap.set(p.syntheticId, dep.id);
      audit.push(auditEntry(d, "Departments", "Created", dep.id, dep.name, note("Department")));
    }

    for (const p of plan.bands) {
      const hit = bands.find((x) => x.name.toLowerCase() === p.name.toLowerCase() || (p.code && x.code.toUpperCase() === p.code.toUpperCase()));
      if (hit) {
        idMap.set(p.syntheticId, hit.id);
        continue;
      }
      let level = p.level ?? Math.max(0, ...bands.map((b) => b.level)) + 1;
      while (bands.some((b) => b.level === level)) level++;
      const band: Band = { id: `BAND-${pad2(maxNum(bands.map((x) => x.id)) + 1)}`, code: (p.code ?? `B${level}`).toUpperCase(), name: p.name, level, description: p.description, status: "active" };
      bands = [...bands, band];
      created.bands.push(band);
      idMap.set(p.syntheticId, band.id);
      audit.push(auditEntry(d, "Master Data", "Created", band.id, band.name, note("Employee Band")));
    }

    const mapped: ImportCommitRow[] = rows.map((r) => ({
      ...r,
      employee: {
        ...r.employee,
        departmentId: idMap.get(r.employee.departmentId) ?? r.employee.departmentId,
        bandId: idMap.get(r.employee.bandId) ?? r.employee.bandId,
      },
    }));
    for (const r of mapped) {
      const e = r.employee;
      for (const id of [e.departmentId, e.bandId]) {
        if (SYNTHETIC.test(id)) throw new RepositoryError(`Employee ${e.id} refers to master data that was not part of the import plan. Nothing was imported.`);
      }
      if (!departments.some((x) => x.id === e.departmentId) || !bands.some((x) => x.id === e.bandId)) {
        throw new RepositoryError(`Employee ${e.id} refers to a Department or Band that does not exist. Nothing was imported.`);
      }
    }

    const parts = [created.departments.length && `${created.departments.length} department(s)`, created.bands.length && `${created.bands.length} band(s)`].filter(Boolean);
    const applied = applyEmployeeRows({ ...d, departments, bands }, mapped, meta, parts.length ? `Master data created: ${parts.join(", ")}.` : "");
    result = { ...applied.summary, createdMaster: created };
    return { patch: { departments, bands, ...applied.patch }, audit: [...audit, ...applied.audit] };
  });
  return result;
}
