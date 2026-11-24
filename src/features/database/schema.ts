import type { Database } from "@/types";

/** Every collection of the mock database is a "table"; singletons hold exactly one row. */
export type TableName = Exclude<keyof Database, "schemaVersion" | "seededAt">;

export interface TableMeta {
  name: TableName;
  description: string;
  /** Singleton tables (organization, settings) are stored as one object, not an array. */
  singleton?: boolean;
  /** column → referenced table. Array columns reference many rows (a join table in Postgres). */
  fks: Record<string, TableName>;
}

export const TABLES: TableMeta[] = [
  { name: "organization", description: "The single organization profile and branding.", singleton: true, fks: {} },
  { name: "settings", description: "Application-wide settings (thresholds, process defaults, notifications).", singleton: true, fks: {} },
  { name: "departments", description: "Functional departments.", fks: { headId: "employees" } },
  { name: "teams", description: "Teams within departments.", fks: { departmentId: "departments", supervisorId: "employees", projectManagerId: "employees" } },
  { name: "employees", description: "People in the organization.", fks: { bandId: "bands", designationId: "designations", departmentId: "departments", teamId: "teams", reportingManagerId: "employees" } },
  { name: "bands", description: "Career bands / grade levels.", fks: {} },
  { name: "processCategories", description: "Process groupings.", fks: {} },
  { name: "designations", description: "Job titles held by employees.", fks: {} },
  { name: "frequencies", description: "Recurrence options (system-defined).", fks: {} },
  {
    name: "processes",
    description: "Compliance processes with steps, scope and versions.",
    fks: {
      categoryId: "processCategories",
      departmentId: "departments",
      ownerId: "employees",
      responsibleId: "employees",
      reviewerId: "employees",
      followUpOwnerId: "employees",
      escalationContactId: "employees",
      frequency: "frequencies",
      applicableTeamIds: "teams",
      applicableBandIds: "bands",
      meetingAttendeeIds: "employees",
      stakeholderIds: "employees",
    },
  },
  {
    name: "assignments",
    description: "Who a process is assigned to, and how often.",
    fks: { processId: "processes", departmentId: "departments", teamId: "teams", bandId: "bands", employeeIds: "employees", ownerId: "employees", reviewerId: "employees", frequency: "frequencies" },
  },
  { name: "tasks", description: "Compliance tasks generated from assignments.", fks: { assignmentId: "assignments", processId: "processes", employeeId: "employees" } },
  { name: "notifications", description: "In-app notifications.", fks: { recipientEmployeeId: "employees" } },
  { name: "auditLogs", description: "Append-only change history.", fks: {} },
  { name: "users", description: "Application users and their access roles.", fks: { employeeId: "employees" } },
  { name: "importHistory", description: "Employee import runs.", fks: {} },
  { name: "ecoTypes", description: "Kinds of things in the business ecosystem (Product, Client, Module, POS System…).", fks: {} },
  { name: "ecoEntities", description: "Products, clients, modules, integrations, POS systems… with owner and primary contact.", fks: { typeId: "ecoTypes", ownerId: "employees" } },
  { name: "ecoRelations", description: "Free-form links between any two ecosystem entities.", fks: { fromId: "ecoEntities", toId: "ecoEntities" } },
];

export interface ColumnInfo {
  name: string;
  /** App-level type as found in the data. */
  type: string;
  /** Suggested PostgreSQL type for the Supabase migration. */
  pgType: string;
  nullable: boolean;
  isPk: boolean;
  fk: TableName | null;
  /** Foreign key stored as an array of ids (needs a join table in Postgres). */
  fkMany: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Rows of a table, whether it is stored as an array or a singleton object. */
export function tableRows(db: Database, meta: TableMeta): Record<string, unknown>[] {
  const v = db[meta.name] as unknown;
  const rows = (Array.isArray(v) ? v : [v]) as Record<string, unknown>[];
  // Never show password hashes, even to a Super Admin.
  return meta.name === "users" ? rows.map((r) => (r.passwordHash ? { ...r, passwordHash: "••••••••" } : r)) : rows;
}

/** Infer columns from the data itself, so the view can never drift from what is stored. */
export function inferColumns(rows: Record<string, unknown>[], meta: TableMeta): ColumnInfo[] {
  const order: string[] = [];
  const types = new Map<string, Set<string>>();
  const sample = new Map<string, unknown>();
  const present = new Map<string, number>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (!types.has(k)) {
        types.set(k, new Set());
        order.push(k);
      }
      present.set(k, (present.get(k) ?? 0) + 1);
      const t = v === null || v === undefined ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v;
      types.get(k)!.add(t);
      if (v !== null && v !== undefined && !sample.has(k)) sample.set(k, v);
    }
  }
  return order.map((name) => {
    const set = types.get(name)!;
    const nullable = set.has("null") || (present.get(name) ?? 0) < rows.length;
    const concrete = [...set].filter((t) => t !== "null");
    const type = concrete.length === 0 ? "null" : concrete.length === 1 ? concrete[0] : concrete.join(" | ");
    const s = sample.get(name);
    const fk = meta.fks[name] ?? null;
    const fkMany = !!fk && type === "array";
    let pgType = "text";
    if (name === "id") pgType = "text";
    else if (type === "number") pgType = Number.isInteger(s) ? "integer" : "numeric";
    else if (type === "boolean") pgType = "boolean";
    else if (type === "array") pgType = fk ? "text[]" : "jsonb";
    else if (type === "object") pgType = "jsonb";
    else if (type === "string" && typeof s === "string") pgType = ISO_DATETIME.test(s) ? "timestamptz" : ISO_DATE.test(s) ? "date" : "text";
    else if (concrete.length > 1) pgType = "jsonb";
    return { name, type, pgType, nullable, isPk: name === "id", fk, fkMany };
  });
}

/** Every foreign-key relationship, for the overview. */
export function allRelations(): { from: TableName; column: string; to: TableName; many: boolean }[] {
  return TABLES.flatMap((t) => Object.entries(t.fks).map(([column, to]) => ({ from: t.name, column, to, many: /Ids$/.test(column) })));
}
