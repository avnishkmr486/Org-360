import { BadgeCheck, Building2, CalendarClock, Layers, Shapes, UsersRound, type LucideIcon } from "lucide-react";
import type { Database, RecordStatus } from "@/types";
import type { MasterTable } from "@/lib/repositories";

export type EntitySlug = "departments" | "teams" | "bands" | "designations" | "categories" | "frequencies";

export type FieldType = "text" | "textarea" | "number" | "employee" | "department";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  /** Show as a table column. */
  column?: boolean;
  max?: number;
}

/** Normalized row used by the generic master-data UI. */
export interface MasterRow {
  id: string;
  name: string;
  status: RecordStatus;
  [key: string]: unknown;
}

export interface UsageInfo {
  count: number;
  label: string;
  items: { id: string; name: string; href?: string }[];
}

export interface EntityConfig {
  slug: EntitySlug;
  title: string;
  singular: string;
  description: string;
  icon: LucideIcon;
  /** Master table for upsertMasterRecord, or the org repository for departments/teams. */
  table: MasterTable | "departments" | "teams";
  canAdd: boolean;
  fields: FieldDef[];
  rows: (db: Database) => MasterRow[];
  usage: (db: Database, row: MasterRow) => UsageInfo;
  /** Link to the full management module, if any. */
  manageHref?: (id: string) => string;
}

const empName = (db: Database, id: string) => {
  const e = db.employees.find((x) => x.id === id);
  return e ? `${e.firstName} ${e.lastName}` : id;
};

const employeesWhere = (db: Database, pred: (e: Database["employees"][number]) => boolean, label = "employees"): UsageInfo => {
  const list = db.employees.filter(pred);
  return { count: list.length, label, items: list.slice(0, 12).map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, href: `/employees/${e.id}` })) };
};

export const ENTITIES: EntityConfig[] = [
  {
    slug: "departments",
    title: "Departments",
    singular: "Department",
    description: "Functional departments of the organization and their heads.",
    icon: Building2,
    table: "departments",
    canAdd: true,
    fields: [
      { key: "name", label: "Department name", type: "text", required: true, column: true },
      { key: "code", label: "Code", type: "text", required: true, column: true, max: 10, placeholder: "e.g. ENG" },
      { key: "headId", label: "Department head", type: "employee", column: true },
      { key: "description", label: "Description", type: "textarea" },
    ],
    rows: (db) => db.departments.map((d) => ({ ...d })),
    usage: (db, r) => {
      const u = employeesWhere(db, (e) => e.departmentId === r.id);
      const teams = db.teams.filter((t) => t.departmentId === r.id).length;
      return { ...u, label: `employees · ${teams} teams` };
    },
    manageHref: (id) => `/departments/${id}`,
  },
  {
    slug: "teams",
    title: "Teams",
    singular: "Team",
    description: "Teams within departments, with supervisors and project managers.",
    icon: UsersRound,
    table: "teams",
    canAdd: true,
    fields: [
      { key: "name", label: "Team name", type: "text", required: true, column: true },
      { key: "departmentId", label: "Department", type: "department", required: true, column: true },
      { key: "supervisorId", label: "Team supervisor", type: "employee", column: true },
      { key: "projectManagerId", label: "Project manager", type: "employee" },
      { key: "description", label: "Description", type: "textarea" },
    ],
    rows: (db) => db.teams.map((t) => ({ ...t })),
    usage: (db, r) => employeesWhere(db, (e) => e.teamId === r.id, "members"),
    manageHref: (id) => `/teams/${id}`,
  },
  {
    slug: "bands",
    title: "Employee Bands",
    singular: "Band",
    description: "Career bands / grade levels used for eligibility and analysis.",
    icon: Layers,
    table: "bands",
    canAdd: true,
    fields: [
      { key: "code", label: "Code", type: "text", required: true, column: true, max: 6, placeholder: "e.g. B6" },
      { key: "name", label: "Band name", type: "text", required: true, column: true },
      { key: "level", label: "Level", type: "number", required: true, column: true },
      { key: "description", label: "Description", type: "textarea", column: true },
    ],
    rows: (db) => db.bands.map((b) => ({ ...b })),
    usage: (db, r) => employeesWhere(db, (e) => e.bandId === r.id),
  },
  {
    slug: "designations",
    title: "Designations",
    singular: "Designation",
    description: "Job titles held by employees, shown on employee records.",
    icon: BadgeCheck,
    table: "designations",
    canAdd: true,
    fields: [
      { key: "name", label: "Designation", type: "text", required: true, column: true },
      { key: "summary", label: "Role summary", type: "textarea", column: true, placeholder: "What this role is for" },
      { key: "responsibilities", label: "Key responsibilities (one per line)", type: "textarea", placeholder: "One responsibility per line" },
      { key: "description", label: "Notes", type: "textarea" },
    ],
    rows: (db) => db.designations.map((d) => ({ ...d })),
    usage: (db, r) => employeesWhere(db, (e) => e.designationId === r.id),
  },
  {
    slug: "categories",
    title: "Process Categories",
    singular: "Process Category",
    description: "Groupings used to organize and filter processes.",
    icon: Shapes,
    table: "processCategories",
    canAdd: true,
    fields: [
      { key: "name", label: "Category name", type: "text", required: true, column: true },
      { key: "description", label: "Description", type: "textarea", column: true },
    ],
    rows: (db) => db.processCategories.map((c) => ({ ...c })),
    usage: (db, r) => {
      const list = db.processes.filter((p) => p.categoryId === r.id);
      return { count: list.length, label: "processes", items: list.map((p) => ({ id: p.id, name: p.name, href: `/processes/${p.id}` })) };
    },
  },
  {
    slug: "frequencies",
    title: "Process Frequencies",
    singular: "Process Frequency",
    description: "System-defined recurrence options. Rename or deactivate; new frequencies require engine support.",
    icon: CalendarClock,
    table: "frequencies",
    canAdd: false,
    fields: [
      { key: "name", label: "Display name", type: "text", required: true, column: true },
      { key: "description", label: "Description", type: "textarea", column: true },
    ],
    rows: (db) => db.frequencies.map((f) => ({ ...f })),
    usage: (db, r) => {
      const list = db.processes.filter((p) => p.frequency === r.id);
      return { count: list.length, label: "processes", items: list.map((p) => ({ id: p.id, name: p.name, href: `/processes/${p.id}` })) };
    },
  },
];

export function getEntity(slug: string): EntityConfig | undefined {
  return ENTITIES.find((e) => e.slug === slug);
}

export { empName };
