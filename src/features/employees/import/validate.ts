/**
 * Pure validation for employee import rows — no React, no storage.
 *
 * Accepts messy, partial data and resolves it against master data:
 *  - names from First/Last columns OR a single Full Name column (split automatically)
 *  - blank cells filled from "defaults" (new employees) or the existing record (updates)
 *  - Employee ID is a free-form string and optional: generated (EMP-<max+1>) or matched through the email address
 *  - Email is OPTIONAL ("" = not provided); it is only used to match existing employees
 *  - flexible dates, statuses and phone numbers
 *  - Department / Band read from the file and reconciled with the master tables
 *    (create new, map typos to existing records, or leave unresolved — see master-reconcile.ts)
 *  - Team matched by name / code / id, with "did you mean" suggestions
 *  - reporting manager as Employee ID, email or full name
 *
 * Safeguards are unchanged: Employee ID is the key, existing employees are only ever
 * flagged as "update" candidates (the UI requires an explicit opt-in), and nothing
 * missing from the file is ever deleted.
 */
import type { Database, Employee, EmploymentStatus, ISODate } from "@/types";
import type { EmployeeInput } from "@/lib/repositories";
import type { MasterPlan, PlannedMasterItem } from "@/lib/repositories/employee-import";
import { closestMatches, findExact, normalizeKey, parseFlexibleDate, splitFullName, type Candidate } from "@/lib/import/sheet-parser";
import { EMPLOYEE_ID_PATTERN } from "../employee-schema";
import { IMPORT_FIELDS, type FieldMapping, type ImportFieldKey } from "./fields";
import {
  buildMasterContext,
  closestMaster,
  MASTER_FIELDS,
  MASTER_META,
  type MasterDecisions,
  type MasterField,
  type MasterResolution,
  type PlannedMaster,
  type UnknownMasterValue,
} from "./master-reconcile";

export interface ImportRecord {
  /** 1-based row number in the source file (excluding header). */
  rowNumber: number;
  values: Record<ImportFieldKey, string>;
  /** Raw value of a mapped "Full name" column (split when First/Last are blank). */
  fullName: string;
}

/** valid = new employee ready to create · update = matches an existing employee · invalid = has errors · duplicate = same employee repeated within the file. */
export type RecordState = "valid" | "update" | "invalid" | "duplicate";

/** Where an effective cell value came from when it was not typed in the file. */
export type ValueSource = "default" | "existing" | "generated" | "split" | "mapped" | "new";

export interface ImportOptions {
  /** Text values (names, codes) applied to blank cells of NEW employees. */
  defaults: Partial<Record<ImportFieldKey, string>>;
  /** Ambiguous numeric dates (01/02/2026) are read as day/month. */
  dayFirst: boolean;
  /** Per master field: create values that are not in the master table? (default on). Off = leave them unresolved. */
  createMaster: Record<MasterField, boolean>;
  /** User choices for individual unknown values (field → normalized value → decision). */
  masterDecisions: MasterDecisions;
}

export const DEFAULT_OPTIONS: ImportOptions = {
  defaults: { status: "Active" },
  dayFirst: true,
  createMaster: { department: true, band: true },
  masterDecisions: {},
};

/** What happened to a Department / Band value of a row (only when it was not an exact existing match). */
export interface MasterNote {
  value: string;
  kind: "map" | "create" | "skip";
  /** Target (mapped) or the name that will be created. */
  name?: string;
}

export interface ValidatedRecord extends ImportRecord {
  state: RecordState;
  errors: Partial<Record<ImportFieldKey, string>>;
  /** Soft notices that do not block the import. */
  warnings: string[];
  existing: Employee | null;
  resolved: EmployeeInput | null;
  /** Values after defaults / existing-record fallbacks / generation / master mapping. */
  effective: Record<ImportFieldKey, string>;
  sources: Partial<Record<ImportFieldKey, ValueSource>>;
  /** One-click corrections for unknown master-data values. */
  suggestions: Partial<Record<ImportFieldKey, string[]>>;
  /** How this row's Department / Band were reconciled with master data. */
  master: Partial<Record<MasterField, MasterNote>>;
  /** Synthetic ids of master records this row needs created. */
  masterRefs: string[];
  effectiveId: string;
  idSource: "file" | "email-match" | "generated" | "";
}

export interface Analysis {
  rows: ValidatedRecord[];
  /** Every distinct Department / Band value in the file that is not in the master tables. */
  unknown: UnknownMasterValue[];
  /** All records that WOULD be created (before restricting to importable rows). */
  planned: PlannedMaster[];
  /** Records needed by rows that are New or Existing-ID candidates. */
  masterPlan: MasterPlan;
}

type MasterDb = Pick<Database, "employees" | "departments" | "teams" | "bands"> & Partial<Pick<Database, "designations">>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const lc = (s: string) => s.trim().toLowerCase();

export const NO_IDENTITY_WARNING = "No ID/email — re-uploading creates a new record";

export function buildRecords(rows: string[][], mapping: FieldMapping): ImportRecord[] {
  return rows.map((r, i) => {
    const values = {} as Record<ImportFieldKey, string>;
    for (const f of IMPORT_FIELDS) {
      const col = mapping[f.key];
      values[f.key] = col === null || col === undefined ? "" : (r[col] ?? "").trim();
    }
    const fnCol = mapping.fullName;
    return { rowNumber: i + 1, values, fullName: fnCol === null || fnCol === undefined ? "" : (r[fnCol] ?? "").trim() };
  });
}

/** Kept for compatibility: strict-ish date parse (see parseFlexibleDate for the formats accepted). */
export function normalizeDate(input: string, dayFirst = true): ISODate | null {
  return parseFlexibleDate(input, { dayFirst });
}

const STATUS_ACTIVE = new Set(["", "active", "working", "current", "employed", "present", "onnotice", "noticeperiod", "yes", "y", "1"]);
const STATUS_LEAVE = new Set(["onleave", "leave", "loa", "maternity", "maternityleave", "sabbatical", "longleave"]);
const STATUS_INACTIVE = new Set(["inactive", "terminated", "resigned", "left", "exited", "separated", "relieved", "absconded", "former", "ex", "no", "n", "0", "notactive"]);

export function normalizeStatus(input: string): EmploymentStatus | null {
  const v = lc(input).replace(/[\s_\-./]+/g, "");
  if (STATUS_ACTIVE.has(v)) return "active";
  if (STATUS_LEAVE.has(v)) return "on_leave";
  if (STATUS_INACTIVE.has(v)) return "inactive";
  return null;
}

/** Employee IDs are free-form strings ("2011-256", "EMP-1001"): trimmed and upper-cased so matching is case-insensitive. Invalid characters → null. */
export function normalizeEmployeeId(raw: string): string | null {
  const v = raw.trim();
  return EMPLOYEE_ID_PATTERN.test(v) ? v.toUpperCase() : null;
}

/** Lenient phone: strips (), dots and spaces; accepts 8–15 digits; normalised to "+<digits>"/digits. */
export function normalizePhone(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "";
  if (/[A-Za-z]{2,}/.test(v)) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `${/^[^\d]*\+/.test(v) ? "+" : ""}${digits}`;
}

const STATUS_LABEL: Record<EmploymentStatus, string> = { active: "Active", on_leave: "On Leave", inactive: "Inactive" };

function existingText(e: Employee, db: MasterDb): Record<ImportFieldKey, string> {
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone,
    band: db.bands.find((b) => b.id === e.bandId)?.code ?? "",
    designation: e.designationId ? (db.designations?.find((d) => d.id === e.designationId)?.name ?? "") : "",
    department: db.departments.find((d) => d.id === e.departmentId)?.name ?? "",
    team: e.teamId ? (db.teams.find((t) => t.id === e.teamId)?.name ?? "") : "",
    reportingManagerId: e.reportingManagerId ?? "",
    dateOfJoining: e.dateOfJoining,
    status: STATUS_LABEL[e.status],
  };
}

function suggestionText(value: string, list: Candidate[], kind: string): { id?: string; error?: string; suggestions: string[] } {
  const exact = findExact(value, list);
  if (exact) return { id: exact.id, suggestions: [] };
  const near = closestMatches(value, list, 3, 0.6).map((m) => m.candidate.label);
  return {
    error: `Unknown ${kind} "${value}"${near.length ? ` — did you mean ${near.join(" / ")}?` : ""}`,
    suggestions: near,
  };
}

/** Restrict the global plan to records actually referenced by the given rows, with row counts. */
export function masterPlanFor(planned: PlannedMaster[], rows: ValidatedRecord[]): MasterPlan {
  const counts = new Map<string, number>();
  for (const r of rows) for (const id of new Set(r.masterRefs)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const items: PlannedMasterItem[] = planned.filter((p) => counts.has(p.syntheticId)).map((p) => ({ ...p, rows: counts.get(p.syntheticId)! }));
  const byField = (f: MasterField) => items.filter((i) => i.field === f);
  return { departments: byField("department"), bands: byField("band"), total: items.length };
}

export function analyzeRecords(records: ImportRecord[], db: MasterDb, today: ISODate, options: ImportOptions = DEFAULT_OPTIONS): Analysis {
  const existingById = new Map(db.employees.map((e) => [e.id.toUpperCase(), e]));
  const existingByEmail = new Map(db.employees.filter((e) => e.email.trim()).map((e) => [lc(e.email), e]));

  /* ---- pass 1: names, ids, existing match ---- */
  interface Pre {
    rec: ImportRecord;
    first: string;
    last: string;
    idRaw: string;
    idNorm: string | null;
    existing: Employee | null;
    idSource: ValidatedRecord["idSource"];
    effectiveId: string;
  }
  const pre: Pre[] = records.map((rec) => {
    const idRaw = rec.values.id.trim();
    const idNorm = idRaw ? normalizeEmployeeId(idRaw) : null;
    let existing: Employee | null = null;
    let idSource: Pre["idSource"] = "";
    if (idNorm) {
      existing = existingById.get(idNorm) ?? null;
      idSource = "file";
    } else if (!idRaw && rec.values.email.trim()) {
      existing = existingByEmail.get(lc(rec.values.email)) ?? null;
      if (existing) idSource = "email-match";
    }
    let first = rec.values.firstName.trim();
    let last = rec.values.lastName.trim();
    if (!first && rec.fullName) {
      const s = splitFullName(rec.fullName);
      first = s.first;
      last = last || s.last;
    } else if (first && !last && rec.fullName && lc(rec.fullName).startsWith(lc(first))) {
      last = splitFullName(rec.fullName).last;
    }
    if (existing) {
      if (!first) first = existing.firstName;
      if (!last && !rec.fullName) last = existing.lastName;
    }
    return { rec, first, last, idRaw, idNorm, existing, idSource, effectiveId: idNorm ?? existing?.id ?? "" };
  });

  // Generated IDs continue after the highest number in the system AND in the file.
  let maxNum = 1000;
  const bump = (id: string) => {
    const m = id.match(/^EMP-(\d+)$/i);
    if (m && Number(m[1]) > maxNum) maxNum = Number(m[1]);
  };
  db.employees.forEach((e) => bump(e.id));
  pre.forEach((p) => p.effectiveId && bump(p.effectiveId));
  const takenIds = new Set([...db.employees.map((e) => e.id.toUpperCase()), ...pre.map((p) => p.effectiveId).filter(Boolean)]);
  for (const p of pre) {
    if (p.effectiveId || p.idRaw) continue; // provided (even if malformed) → never generate
    let id: string;
    do id = `EMP-${++maxNum}`;
    while (takenIds.has(id));
    takenIds.add(id);
    p.effectiveId = id;
    p.idSource = "generated";
  }

  /* ---- file-wide lookups ---- */
  const idRows = new Map<string, number[]>();
  const emailRows = new Map<string, number[]>();
  for (const p of pre) {
    if (p.effectiveId) idRows.set(p.effectiveId, [...(idRows.get(p.effectiveId) ?? []), p.rec.rowNumber]);
    const em = lc(p.rec.values.email);
    if (em) emailRows.set(em, [...(emailRows.get(em) ?? []), p.rec.rowNumber]);
  }

  const personById = new Map<string, { email: string; name: string }>();
  db.employees.forEach((e) => personById.set(e.id.toUpperCase(), { email: lc(e.email), name: normalizeKey(`${e.firstName} ${e.lastName}`) }));
  pre.forEach((p) => p.effectiveId && personById.set(p.effectiveId, { email: lc(p.rec.values.email) || personById.get(p.effectiveId)?.email || "", name: normalizeKey(`${p.first} ${p.last}`) }));
  const managerByEmail = new Map<string, string>();
  const managersByName = new Map<string, string[]>();
  for (const [id, who] of personById) {
    if (who.email) managerByEmail.set(who.email, id);
    if (who.name) managersByName.set(who.name, [...(managersByName.get(who.name) ?? []), id]);
  }

  /* ---- master data: Department / Band reconciliation (file-wide) ---- */
  const uses: Record<MasterField, string[]> = { department: [], band: [] };
  for (const p of pre) {
    const ev = p.existing ? existingText(p.existing, db) : null;
    for (const f of MASTER_FIELDS) {
      const text = p.rec.values[f].trim() || ev?.[f] || (!p.existing ? (options.defaults[f]?.trim() ?? "") : "");
      if (text) uses[f].push(text);
    }
  }
  const ctx = buildMasterContext(uses, db, options);

  /* ---- pass 2: validate each row ---- */
  const rows: ValidatedRecord[] = pre.map((p) => {
    const { rec, existing } = p;
    const src = rec.values;
    const errors: ValidatedRecord["errors"] = {};
    const warnings: string[] = [];
    const sources: ValidatedRecord["sources"] = {};
    const suggestions: ValidatedRecord["suggestions"] = {};
    const master: ValidatedRecord["master"] = {};
    const masterRefs: string[] = [];
    const existingVals = existing ? existingText(existing, db) : null;

    /** typed value → existing record (updates) → default (new employees) */
    const pick = (key: ImportFieldKey, typed?: string): string => {
      const t = (typed ?? src[key]).trim();
      if (t) return t;
      if (existingVals && existingVals[key]) {
        sources[key] = "existing";
        return existingVals[key];
      }
      const d = options.defaults[key]?.trim();
      if (!existing && d) {
        sources[key] = "default";
        return d;
      }
      return "";
    };

    const eff = {} as Record<ImportFieldKey, string>;
    eff.firstName = p.first;
    eff.lastName = p.last;
    if (!src.firstName.trim() && p.first && (rec.fullName || existing)) sources.firstName = rec.fullName ? "split" : "existing";
    if (!src.lastName.trim() && p.last && (rec.fullName || existing)) sources.lastName = rec.fullName ? "split" : "existing";

    // identity
    eff.id = p.effectiveId || src.id;
    if (p.idSource === "generated") sources.id = "generated";
    else if (p.idSource === "email-match") sources.id = "existing";

    if (p.idRaw && !p.idNorm) errors.id = "Use letters, numbers and - . _ only (max 30), e.g. 2011-256";
    const dupRows = p.effectiveId ? (idRows.get(p.effectiveId) ?? []) : [];
    const isDuplicate = dupRows.length > 1 && dupRows[0] !== rec.rowNumber;
    if (isDuplicate) errors.id = `Duplicate — ${p.idSource === "email-match" ? "same employee (email)" : `Employee ID ${p.effectiveId}`} already on row ${dupRows[0]}`;

    // name (the only thing every row must provide)
    if (!p.first) errors.firstName = "Name is required — map a Name column";

    // email — optional; only validated and de-duplicated when provided
    const email = pick("email");
    eff.email = email;
    if (email) {
      if (!EMAIL.test(email)) errors.email = "Invalid email format";
      else if (!sources.email) {
        const rowsWith = emailRows.get(lc(email)) ?? [];
        const owner = db.employees.find((e) => e.email && lc(e.email) === lc(email));
        if (rowsWith.length > 1 && rowsWith[0] !== rec.rowNumber && !isDuplicate) errors.email = `Email repeated in file (row ${rowsWith[0]})`;
        else if (owner && owner.id.toUpperCase() !== p.effectiveId.toUpperCase()) errors.email = `Email already belongs to ${owner.id}`;
      }
    }
    if (p.idSource === "generated" && !src.email.trim()) warnings.push(NO_IDENTITY_WARNING);

    // phone (optional)
    const phoneRaw = pick("phone");
    const phone = normalizePhone(phoneRaw);
    eff.phone = phone ?? phoneRaw;
    if (phone === null) errors.phone = "Invalid phone number";

    /** Department / Band: existing record, mapped (typo), created from the file, or unresolved. */
    const masterField = (field: MasterField): { res: MasterResolution | null; id?: string } => {
      eff[field] = pick(field);
      const label = MASTER_META[field].singular;
      if (!eff[field]) {
        errors[field] = `${IMPORT_FIELDS.find((f) => f.key === field)!.header} is required — map a column or set a default`;
        return { res: null };
      }
      const typed = eff[field];
      const res = ctx.resolve(field, typed)!;
      if (res.kind === "skip") {
        const near = closestMaster(field, typed, db, 3, 0.6).map((m) => m.label);
        errors[field] = `Unknown ${label.toLowerCase()} "${typed}"${near.length ? ` — did you mean ${near.join(" / ")}?` : ""}`;
        if (near.length) suggestions[field] = near;
        master[field] = { value: typed, kind: "skip" };
        return { res };
      }
      if (res.status && res.status !== "active") errors[field] = `${label} "${res.name}" is inactive`;
      if (res.kind === "map") {
        eff[field] = res.name;
        sources[field] = "mapped";
        master[field] = { value: typed, kind: "map", name: res.name };
      } else if (res.kind === "create") {
        sources[field] = "new";
        master[field] = { value: typed, kind: "create", name: res.name };
        masterRefs.push(res.id!);
      }
      return { res, id: res.id };
    };

    // department / team
    const deptRes = masterField("department");
    const deptIsNew = deptRes.res?.kind === "create";
    const dept = deptRes.id && !deptIsNew ? db.departments.find((d) => d.id === deptRes.id) : undefined;

    let teamId: string | null = null;
    let teamTyped = src.team.trim();
    if (!teamTyped && existingVals?.team) {
      teamTyped = existingVals.team;
      sources.team = "existing";
    }
    if (!teamTyped && !existing && !deptIsNew) {
      const defTeam = options.defaults.team?.trim();
      const t = defTeam ? db.teams.find((x) => normalizeKey(x.name) === normalizeKey(defTeam)) : undefined;
      if (t && (!dept || t.departmentId === dept.id)) {
        teamTyped = t.name;
        sources.team = "default";
      }
    }
    eff.team = teamTyped;
    if (teamTyped) {
      if (deptIsNew) {
        errors.team = `Team "${teamTyped}" not found — new departments have no teams yet`;
      } else {
        const inDept: Candidate[] = db.teams.filter((t) => !dept || t.departmentId === dept.id).map((t) => ({ id: t.id, label: t.name }));
        const r = suggestionText(teamTyped, inDept, "team");
        if (r.id) teamId = r.id;
        else {
          const elsewhere = db.teams.find((t) => normalizeKey(t.name) === normalizeKey(teamTyped) || normalizeKey(t.id) === normalizeKey(teamTyped));
          if (elsewhere && dept) errors.team = `Team "${teamTyped}" does not belong to ${dept.name}`;
          else {
            errors.team = r.error;
            if (r.suggestions.length) suggestions.team = r.suggestions;
          }
        }
      }
    }

    // band (reconciled against master data)
    const bandRes = masterField("band");

    // designation (optional): must match Master Data → Designations; unknown names are left blank with a warning
    eff.designation = pick("designation");
    let designationId: string | null = existing?.designationId ?? null;
    if (eff.designation) {
      const r = suggestionText(eff.designation, (db.designations ?? []).map((d) => ({ id: d.id, label: d.name })), "designation");
      if (r.id) designationId = r.id;
      else {
        warnings.push(`${r.error} — left blank. Add it under Master Data → Designations.`);
        if (r.suggestions.length) suggestions.designation = r.suggestions;
      }
    }

    // date of joining
    eff.dateOfJoining = pick("dateOfJoining");
    let doj: string | null = null;
    if (!eff.dateOfJoining) errors.dateOfJoining = "Date of joining is required — map a column or set a default";
    else {
      doj = parseFlexibleDate(eff.dateOfJoining, { dayFirst: options.dayFirst });
      if (!doj) errors.dateOfJoining = `Unrecognised date "${eff.dateOfJoining}" (try 2026-11-20 or 20-Nov-2026)`;
      else if (doj > today) errors.dateOfJoining = "Date of joining is in the future";
      else eff.dateOfJoining = doj;
    }

    // status
    eff.status = pick("status") || "Active";
    const status = normalizeStatus(eff.status);
    if (!status) errors.status = `Unknown status "${eff.status}" (Active / On Leave / Inactive)`;

    // reporting manager: Employee ID, email or full name
    eff.reportingManagerId = pick("reportingManagerId");
    let managerId: string | null = null;
    const mRaw = eff.reportingManagerId;
    if (mRaw) {
      const asId = normalizeEmployeeId(mRaw);
      const byEmail = managerByEmail.get(lc(mRaw));
      const byName = managersByName.get(normalizeKey(mRaw)) ?? [];
      const found = asId && personById.has(asId) ? asId : byEmail ? byEmail : byName.length === 1 ? byName[0] : null;
      if (found) {
        if (found === p.effectiveId.toUpperCase()) errors.reportingManagerId = "Employee cannot report to themselves";
        else managerId = found;
      } else if (byName.length > 1) errors.reportingManagerId = `Several employees are named "${mRaw}" — use their Employee ID or email`;
      else errors.reportingManagerId = `Manager "${mRaw}" not found (use Employee ID, email or full name)`;
    }

    const hasErrors = Object.keys(errors).length > 0;
    const state: RecordState = isDuplicate ? "duplicate" : hasErrors ? "invalid" : existing ? "update" : "valid";
    const resolved: EmployeeInput | null =
      hasErrors || isDuplicate
        ? null
        : {
            id: p.effectiveId,
            firstName: p.first,
            lastName: p.last,
            email: eff.email.toLowerCase(),
            phone: eff.phone,
            bandId: bandRes.id!,
            designationId,
            departmentId: deptRes.id!,
            teamId,
            reportingManagerId: managerId,
            dateOfJoining: doj!,
            status: status!,
          };
    return { ...rec, state, errors, warnings, existing, resolved, effective: eff, sources, suggestions, master, masterRefs, effectiveId: p.effectiveId, idSource: p.idSource };
  });

  const masterPlan = masterPlanFor(
    ctx.planned,
    rows.filter((r) => r.state === "valid" || r.state === "update"),
  );
  return { rows, unknown: ctx.unknown, planned: ctx.planned, masterPlan };
}

/** Rows only (the original API). Use analyzeRecords() when you also need the master-data reconciliation. */
export function validateRecords(records: ImportRecord[], db: MasterDb, today: ISODate, options: ImportOptions = DEFAULT_OPTIONS): ValidatedRecord[] {
  return analyzeRecords(records, db, today, options).rows;
}

export function summarize(records: ValidatedRecord[]) {
  return {
    total: records.length,
    valid: records.filter((r) => r.state === "valid").length,
    update: records.filter((r) => r.state === "update").length,
    invalid: records.filter((r) => r.state === "invalid").length,
    duplicate: records.filter((r) => r.state === "duplicate").length,
  };
}
