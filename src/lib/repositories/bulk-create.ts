/**
 * Multi-row add for departments, teams and master data (Master Data screens).
 * All-or-nothing: if any row is invalid nothing is saved, and every problem is
 * reported against its row so the user can fix the whole sheet in one pass.
 */
import type { Band, Database, Department, Designation, ProcessCategory, RecordStatus, Team } from "@/types";
import { auditEntry, latency, nowIso, RepositoryError, write } from "./core";

export type BulkCreateKind = "departments" | "teams" | "bands" | "processCategories" | "designations";

/** One spreadsheet-style row; values are raw strings straight from the inputs. */
export type BulkRow = Record<string, string>;

const PREFIX: Record<BulkCreateKind, string> = { departments: "DEP", teams: "TEAM", bands: "BAND", processCategories: "CAT", designations: "DES" };
const SINGULAR: Record<BulkCreateKind, string> = { departments: "Department", teams: "Team", bands: "Band", processCategories: "Process Category", designations: "Designation" };
const MODULE = { departments: "Departments", teams: "Teams" } as const;

const norm = (s: string | undefined) => (s ?? "").trim();
const key = (s: string | undefined) => norm(s).toLowerCase();

/** True when a row has no content at all (blank rows are ignored, not errors). */
export function isBlankRow(row: BulkRow): boolean {
  return Object.entries(row).every(([k, v]) => k === "status" || !norm(v));
}

/** Row-index → message for every invalid row. Empty map = the batch can be saved. */
export function validateBulkCreate(db: Database, kind: BulkCreateKind, rows: BulkRow[]): Map<number, string> {
  const errors = new Map<number, string>();
  const seen = new Set<string>();
  const seenCodes = new Set<string>();
  rows.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const fail = (m: string) => {
      if (!errors.has(i)) errors.set(i, m);
    };
    const name = norm(row.name);
    if (!name) return fail("Name is required.");
    if (kind === "departments") {
      if (!norm(row.code)) return fail("Code is required.");
      if (norm(row.code).length > 10) return fail("Code must be at most 10 characters.");
      const c = key(row.code);
      if (db.departments.some((d) => key(d.code) === c) || seenCodes.has(c)) return fail(`Code "${norm(row.code).toUpperCase()}" is already used.`);
      seenCodes.add(c);
    }
    if (kind === "teams") {
      if (!norm(row.departmentId)) return fail("Department is required.");
      if (!db.departments.some((d) => d.id === row.departmentId)) return fail("Unknown department.");
    }
    if (kind === "bands") {
      if (!norm(row.code)) return fail("Code is required.");
      if (norm(row.code).length > 6) return fail("Code must be at most 6 characters.");
      const lvl = Number(row.level);
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > 99) return fail("Level must be a whole number from 1 to 99.");
    }
    // Names must be unique among existing records and within the batch (teams: per department).
    const scope = kind === "teams" ? `${row.departmentId}|` : "";
    const existing = (db[kind] as unknown as { name: string; departmentId?: string }[]).some((x) => key(x.name) === key(name) && (kind !== "teams" || x.departmentId === row.departmentId));
    if (existing || seen.has(scope + key(name))) return fail(`"${name}" already exists.`);
    seen.add(scope + key(name));
  });
  return errors;
}

export async function bulkCreate(kind: BulkCreateKind, rows: BulkRow[]): Promise<number> {
  await latency(300);
  const filled = rows.filter((r) => !isBlankRow(r));
  if (!filled.length) throw new RepositoryError("Add at least one row.");
  let created = 0;

  write((d) => {
    const errors = validateBulkCreate(d, kind, filled);
    if (errors.size) {
      const [i, m] = [...errors][0];
      throw new RepositoryError(`Row ${i + 1}: ${m}${errors.size > 1 ? ` (and ${errors.size - 1} more rows need fixing)` : ""}`);
    }
    const items = d[kind] as unknown as { id: string }[];
    let max = items.reduce((m, i) => Math.max(m, Number(i.id.replace(/\D/g, "")) || 0), 0);
    const ts = nowIso();
    const nextId = () => `${PREFIX[kind]}-${String(++max).padStart(2, "0")}`;
    const built = filled.map((r) => {
      const status: RecordStatus = r.status === "inactive" ? "inactive" : "active";
      const base = { id: nextId(), name: norm(r.name), description: norm(r.description), status };
      switch (kind) {
        case "departments":
          return { ...base, code: norm(r.code).toUpperCase(), headId: null, createdAt: ts, updatedAt: ts } satisfies Department;
        case "teams":
          return { ...base, departmentId: r.departmentId, supervisorId: null, projectManagerId: null, createdAt: ts, updatedAt: ts } satisfies Team;
        case "bands":
          return { ...base, code: norm(r.code).toUpperCase(), level: Number(r.level) } satisfies Band;
        case "processCategories":
          return base satisfies ProcessCategory;
        case "designations":
          return base satisfies Designation;
      }
    });
    created = built.length;
    const audit = built.map((b) => auditEntry(d, kind === "departments" || kind === "teams" ? MODULE[kind] : "Master Data", "Created", b.id, b.name, `${SINGULAR[kind]} created (bulk add).`));
    return { patch: { [kind]: [...items, ...built] } as Partial<Database>, audit };
  });
  return created;
}
