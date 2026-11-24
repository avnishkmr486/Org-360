import { inferColumnKind, normalizeKey, similarity, type ColumnKind } from "@/lib/import/sheet-parser";

/** Target fields of the employee import. */
export type ImportFieldKey =
  | "id"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "band"
  | "designation"
  | "department"
  | "team"
  | "reportingManagerId"
  | "dateOfJoining"
  | "status";

/** Source-only field: one column holding "First Last" (split automatically). */
export type VirtualFieldKey = "fullName";
export type MappingKey = ImportFieldKey | VirtualFieldKey;

export interface ImportField {
  key: ImportFieldKey;
  header: string;
  /**
   * "Needed" = the employee record cannot be created without it, but a default value
   * (or an existing record's value on update) can fill it. Only the minimum
   * (a name) must come from the file.
   */
  required: boolean;
  aliases: string[];
  description: string;
}

export const IMPORT_FIELDS: ImportField[] = [
  { key: "id", header: "Employee ID", required: false, aliases: ["employee id", "emp id", "empid", "employee code", "id", "emp code", "employee number", "emp no", "emp number", "staff id", "staff code", "personnel number", "worker id"], description: "Unique text key, e.g. 2011-256 or EMP-1051 (auto-generated if blank)" },
  { key: "firstName", header: "First Name", required: true, aliases: ["first name", "firstname", "given name", "first", "forename", "fname"], description: "" },
  { key: "lastName", header: "Last Name", required: false, aliases: ["last name", "lastname", "surname", "family name", "last", "lname"], description: "" },
  { key: "email", header: "Email", required: false, aliases: ["email", "email address", "e-mail", "mail", "work email", "official email", "email id", "mail id", "corporate email"], description: "Optional — unique when given; used to match existing employees" },
  { key: "phone", header: "Contact Number", required: false, aliases: ["contact number", "phone", "mobile", "phone number", "contact", "mobile number", "cell", "contact no", "mobile no", "telephone"], description: "e.g. +91 9812345678" },
  { key: "band", header: "Band", required: true, aliases: ["band", "grade", "level", "band code", "job grade", "employee grade"], description: "Band code or name (B1 / Associate)" },
  { key: "designation", header: "Designation", required: false, aliases: ["designation", "job title", "title", "position", "role", "job role", "designation name", "job designation"], description: "Name from Master Data → Designations (optional)" },
  { key: "department", header: "Department", required: true, aliases: ["department", "dept", "department name", "function", "dept name", "business unit", "division", "org unit"], description: "Department name or code" },
  { key: "team", header: "Team", required: false, aliases: ["team", "team name", "squad", "sub department", "group", "project team"], description: "Must belong to the department" },
  { key: "reportingManagerId", header: "Reporting Manager ID", required: false, aliases: ["reporting manager id", "manager id", "reporting manager", "manager", "reports to", "reporting to", "line manager", "manager name", "supervisor", "reporting manager name", "manager email"], description: "Manager's Employee ID, email or full name" },
  { key: "dateOfJoining", header: "Date of Joining", required: true, aliases: ["date of joining", "doj", "joining date", "start date", "hire date", "date joined", "date of hire", "joined on", "joined", "joining dt", "employment start date"], description: "Any date format, e.g. 2026-11-20 or 20-Nov-2026" },
  { key: "status", header: "Employment Status", required: false, aliases: ["employment status", "status", "employee status", "emp status", "working status", "active"], description: "Active / On Leave / Inactive (default Active)" },
];

export const FULL_NAME_ALIASES = ["name", "full name", "fullname", "employee name", "emp name", "staff name", "associate name", "person", "resource name", "name of employee", "employee full name"];

/** Target fields that can be pre-filled from the "Defaults for blank cells" panel. */
export const DEFAULTABLE_FIELDS: ImportFieldKey[] = ["department", "team", "band", "status", "dateOfJoining"];

/** Vocabulary (normalized) used to locate the header row and the best sheet. */
export const HEADER_VOCABULARY: string[] = [
  ...new Set([...IMPORT_FIELDS.flatMap((f) => [f.header, ...f.aliases]), ...FULL_NAME_ALIASES].map(normalizeKey).filter((v) => v.length > 2)),
];

/** Field → source column index (null = not mapped). */
export type FieldMapping = Record<MappingKey, number | null>;
export type Confidence = "exact" | "likely" | "guessed";
export type MappingConfidence = Partial<Record<MappingKey, Confidence>>;

export interface AutoMapResult {
  mapping: FieldMapping;
  confidence: MappingConfidence;
}

export const MAPPING_KEYS: MappingKey[] = ["fullName", ...IMPORT_FIELDS.map((f) => f.key)];

export function emptyMapping(): FieldMapping {
  return Object.fromEntries(MAPPING_KEYS.map((k) => [k, null])) as FieldMapping;
}

interface Target {
  key: MappingKey;
  header: string;
  aliases: string[];
  kind?: ColumnKind;
}

const TARGETS: Target[] = [
  { key: "fullName", header: "Full name", aliases: FULL_NAME_ALIASES },
  ...IMPORT_FIELDS.map<Target>((f) => ({
    key: f.key,
    header: f.header,
    aliases: f.aliases,
    kind: ({ id: "id", email: "email", phone: "phone", dateOfJoining: "date" } as Partial<Record<ImportFieldKey, ColumnKind>>)[f.key],
  })),
];

/** Header-only score: exact 100 · alias 90 · partial containment 60 · fuzzy ≤ 55. */
function headerScore(target: Target, h: string): number {
  if (!h) return 0;
  if (h === normalizeKey(target.header)) return 100;
  const aliases = target.aliases.map(normalizeKey);
  if (aliases.includes(h)) return 90;
  let best = 0;
  for (const a of aliases) {
    const short = Math.min(a.length, h.length);
    const long = Math.max(a.length, h.length);
    if (short >= 4 && short / long >= 0.5 && (h.includes(a) || a.includes(h))) best = Math.max(best, 60);
    else if (short >= 4) {
      const sim = similarity(a, h);
      if (sim >= 0.78) best = Math.max(best, 40 + (sim - 0.78) * 70);
    }
  }
  return best;
}

/**
 * Map source columns to target fields.
 *  - header names (exact → alias → partial → fuzzy)
 *  - content inference for columns whose header is unrecognised
 *    (emails → Email, EMP-123 → Employee ID, phone-like → Contact, dates → Date of Joining).
 * Each column maps at most once; the best-scoring pairs are assigned first.
 */
export function autoMapHeaders(headers: string[], rows: string[][] = []): AutoMapResult {
  const normalized = headers.map(normalizeKey);
  const kinds: ColumnKind[] = headers.map((_, i) => inferColumnKind(rows.map((r) => r[i] ?? "")));

  const pairs: { key: MappingKey; col: number; score: number }[] = [];
  for (const t of TARGETS) {
    normalized.forEach((h, col) => {
      let score = headerScore(t, h);
      // Content inference only helps when the header itself was not a good match.
      if (score < 60 && t.kind && kinds[col] === t.kind) score = Math.max(score, 52);
      if (score > 0) pairs.push({ key: t.key, col, score });
    });
  }
  pairs.sort((a, b) => b.score - a.score);

  const mapping = emptyMapping();
  const confidence: MappingConfidence = {};
  const usedCols = new Set<number>();
  for (const p of pairs) {
    if (mapping[p.key] !== null || usedCols.has(p.col)) continue;
    // A full-name column is pointless if first AND last name already map elsewhere.
    mapping[p.key] = p.col;
    usedCols.add(p.col);
    confidence[p.key] = p.score >= 90 ? "exact" : p.score >= 60 ? "likely" : "guessed";
  }
  // Prefer explicit first/last columns over a generic name column.
  if (mapping.firstName !== null && mapping.lastName !== null && mapping.fullName !== null) {
    mapping.fullName = null;
    delete confidence.fullName;
  }
  return { mapping, confidence };
}

/** Human-readable reasons the mapping cannot proceed (the file-level minimum). */
export function missingMinimum(mapping: FieldMapping): string[] {
  const out: string[] = [];
  if (mapping.firstName === null && mapping.fullName === null) out.push("a Name column (First Name or Full Name)");
  return out;
}

export const MAPPING_LABELS: Record<MappingKey, string> = {
  fullName: "Full name (split automatically)",
  ...(Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f.header])) as Record<ImportFieldKey, string>),
};
