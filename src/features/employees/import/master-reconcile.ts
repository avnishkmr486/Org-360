/**
 * Master-data reconciliation for the employee import — pure, no React, no storage.
 *
 * Departments and Bands found in the file are compared with the master tables:
 *   - a known value resolves to the existing record
 *   - an unknown value gets a DECISION: create it, map it to an existing record
 *     (typos / abbreviations such as "Engg"), or leave it
 *     unresolved (rows using it become invalid)
 * Created records get a synthetic id (`__new:<field>:<key>`) until the import is committed.
 */
import type { Database } from "@/types";
import type { PlannedMasterItem } from "@/lib/repositories/employee-import";
import { findExact, normalizeKey, similarity, type Candidate } from "@/lib/import/sheet-parser";

export type MasterField = "department" | "band";
export const MASTER_FIELDS: MasterField[] = ["department", "band"];

export const MASTER_META: Record<MasterField, { singular: string; plural: string; menu: string; href: string }> = {
  department: { singular: "Department", plural: "Departments", menu: "Master Data → Departments", href: "/master-data/departments" },
  band: { singular: "Band", plural: "Employee Bands", menu: "Master Data → Employee Bands", href: "/master-data/bands" },
};

export type MasterAction = "create" | "map" | "skip";
export interface MasterDecision {
  action: MasterAction;
  /** Existing record id when action = "map". */
  targetId?: string;
}
/** field → normalized value → decision */
export type MasterDecisions = Partial<Record<MasterField, Record<string, MasterDecision>>>;

/** A close match at or above this score is mapped automatically (unless the user changes it). */
export const AUTO_MAP_THRESHOLD = 0.8;

type MasterDb = Pick<Database, "departments" | "bands">;

export interface ExistingMaster {
  id: string;
  /** What the UI shows: department name, band code. */
  name: string;
  status: "active" | "inactive";
}

export interface MasterMatch {
  id: string;
  label: string;
  score: number;
}

export interface UnknownMasterValue {
  field: MasterField;
  /** Normalized key (the decision is stored under it). */
  key: string;
  /** First spelling seen in the file. */
  value: string;
  variants: string[];
  /** Number of file rows using this value. */
  rows: number;
  /** Best existing match with score ≥ AUTO_MAP_THRESHOLD. */
  suggestion: MasterMatch | null;
  /** Effective decision after defaults / switches / user choices. */
  decision: MasterDecision;
  /** True when the decision is the automatic default (not chosen by the user). */
  defaulted: boolean;
}

export type PlannedMaster = Omit<PlannedMasterItem, "rows">;

export interface MasterResolution {
  kind: "existing" | "map" | "create" | "skip";
  /** Real id (existing / map) or synthetic id (create). */
  id?: string;
  name: string;
  status?: "active" | "inactive";
}

/* ------------------------------------------------------------------ */
/* Keys & lookups                                                      */
/* ------------------------------------------------------------------ */

const BAND_PATTERN = /^b(?:and)?[\s\-_.]*0*(\d{1,2})$/i;

/** "B6", "b 6", "Band 6" and "6" all mean band code B6. */
export function canonicalBandKey(value: string): string | null {
  const t = value.trim();
  const m = t.match(BAND_PATTERN) ?? t.match(/^0*(\d{1,2})$/);
  return m ? `B${Number(m[1])}` : null;
}

export function masterKey(field: MasterField, value: string): string {
  return field === "band" ? (canonicalBandKey(value) ?? normalizeKey(value)) : normalizeKey(value);
}

function candidates(field: MasterField, db: MasterDb): Candidate[] {
  switch (field) {
    case "department":
      return db.departments.map((d) => ({ id: d.id, label: d.name, aliases: [d.code] }));
    case "band":
      return db.bands.map((b) => ({ id: b.id, label: b.code, aliases: [b.name, `${b.code} ${b.name}`] }));
  }
}

export function existingRecord(field: MasterField, id: string, db: MasterDb): ExistingMaster | undefined {
  switch (field) {
    case "department": {
      const d = db.departments.find((x) => x.id === id);
      return d && { id: d.id, name: d.name, status: d.status };
    }
    case "band": {
      const b = db.bands.find((x) => x.id === id);
      return b && { id: b.id, name: b.code, status: b.status };
    }
  }
}

/** All records of a master table as selectable options (active first). */
export function masterOptions(field: MasterField, db: MasterDb): ExistingMaster[] {
  const list: ExistingMaster[] =
    field === "department"
      ? db.departments.map((d) => ({ id: d.id, name: d.name, status: d.status }))
      : db.bands.map((b) => ({ id: b.id, name: `${b.code} · ${b.name}`, status: b.status }));
  return list.filter((x) => x.status === "active");
}

export function lookupExisting(field: MasterField, value: string, db: MasterDb): ExistingMaster | undefined {
  const cands = candidates(field, db);
  let hit = findExact(value, cands);
  if (!hit && field === "band") {
    const canon = canonicalBandKey(value);
    if (canon) hit = findExact(canon, cands);
  }
  return hit ? existingRecord(field, hit.id, db) : undefined;
}

function isSubsequence(small: string, big: string): boolean {
  let i = 0;
  for (const ch of big) if (ch === small[i]) i++;
  return i === small.length;
}

/** "Engg" → Engineering. */
function abbreviationScore(value: string, label: string): number {
  const a = normalizeKey(value).replace(/ /g, "");
  const b = normalizeKey(label).replace(/ /g, "");
  if (a.length < 3 || a.length >= b.length || a[0] !== b[0]) return 0;
  return isSubsequence(a, b) ? 0.8 + 0.1 * (a.length / b.length) : 0;
}

/** Closest existing records for a free-text value (typos, abbreviations, partial names). */
export function closestMaster(field: MasterField, value: string, db: MasterDb, limit = 3, min = 0.6): MasterMatch[] {
  const out: MasterMatch[] = [];
  for (const c of candidates(field, db)) {
    const names = [c.label, ...(c.aliases ?? [])];
    const score = Math.max(...names.map((n) => Math.max(similarity(value, n), abbreviationScore(value, n))));
    if (score >= min) {
      const rec = existingRecord(field, c.id, db)!;
      out.push({ id: c.id, label: rec.name, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Record derivation for created master data                           */
/* ------------------------------------------------------------------ */

const clean = (v: string) => v.trim().replace(/\s+/g, " ");
/** "data science" → "Data Science"; mixed/upper case is kept as typed. */
function tidyName(v: string): string {
  const c = clean(v);
  return c === c.toLowerCase() ? c.replace(/\b[a-z]/g, (m) => m.toUpperCase()) : c;
}

const STOP = new Set(["and", "of", "the", "for"]);

export function deriveDepartmentCode(name: string, taken: Set<string>): string {
  const words = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  let base = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? name).slice(0, 3);
  base = base.toUpperCase().replace(/[^A-Z0-9]/g, "") || "DEP";
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}${n}`;
  taken.add(code);
  return code;
}

export const IMPORT_DESCRIPTION = "Created from employee import";

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface MasterOptions {
  createMaster: Record<MasterField, boolean>;
  masterDecisions: MasterDecisions;
}

export interface MasterContext {
  unknown: UnknownMasterValue[];
  planned: PlannedMaster[];
  resolve: (field: MasterField, value: string) => MasterResolution | null;
}

/**
 * Build the reconciliation context from every value used for Department / Band
 * (typed, from an existing record, or a default) in the file.
 */
export function buildMasterContext(uses: Record<MasterField, string[]>, db: MasterDb, options: MasterOptions): MasterContext {
  const unknown: UnknownMasterValue[] = [];
  const byKey = new Map<string, UnknownMasterValue>();

  for (const field of MASTER_FIELDS) {
    for (const raw of uses[field]) {
      const value = clean(raw);
      if (!value || lookupExisting(field, value, db)) continue;
      const key = masterKey(field, value);
      const id = `${field}|${key}`;
      const found = byKey.get(id);
      if (found) {
        found.rows++;
        if (!found.variants.includes(value)) found.variants.push(value);
        continue;
      }
      const best = closestMaster(field, value, db, 1, AUTO_MAP_THRESHOLD)[0] ?? null;
      const entry: UnknownMasterValue = { field, key, value, variants: [value], rows: 1, suggestion: best, decision: { action: "skip" }, defaulted: true };
      byKey.set(id, entry);
      unknown.push(entry);
    }
  }

  // Effective decisions
  for (const u of unknown) {
    const explicit = options.masterDecisions[u.field]?.[u.key];
    const switchOn = options.createMaster[u.field];
    if (explicit) {
      u.defaulted = false;
      u.decision = explicit.action === "create" && !switchOn ? { action: "skip" } : explicit;
    } else {
      u.defaulted = true;
      u.decision = !switchOn ? { action: "skip" } : u.suggestion ? { action: "map", targetId: u.suggestion.id } : { action: "create" };
    }
    if (u.decision.action === "map" && !(u.decision.targetId && existingRecord(u.field, u.decision.targetId, db))) u.decision = { action: "skip" };
  }

  // Planned records (first-appearance order, codes / levels unique among existing + planned)
  const planned: PlannedMaster[] = [];
  const takenDeptCodes = new Set(db.departments.map((d) => d.code.toUpperCase()));
  const takenBandCodes = new Set(db.bands.map((b) => b.code.toUpperCase()));
  const takenLevels = new Set(db.bands.map((b) => b.level));
  const nextLevel = () => Math.max(0, ...takenLevels) + 1;

  for (const u of unknown) {
    if (u.decision.action !== "create") continue;
    const syntheticId = `__new:${u.field}:${u.key}`;
    if (u.field === "department") {
      const name = tidyName(u.value);
      planned.push({ syntheticId, field: "department", key: u.key, name, code: deriveDepartmentCode(name, takenDeptCodes), description: IMPORT_DESCRIPTION });
    } else {
      const canon = canonicalBandKey(u.value);
      let level: number;
      let code: string;
      let name: string;
      if (canon) {
        const n = Number(canon.slice(1));
        level = takenLevels.has(n) ? nextLevel() : n;
        code = canon;
        name = `Band ${n}`;
      } else {
        level = nextLevel();
        code = `B${level}`;
        while (takenBandCodes.has(code)) code = `B${++level}`;
        name = tidyName(u.value);
      }
      takenLevels.add(level);
      takenBandCodes.add(code);
      planned.push({ syntheticId, field: "band", key: u.key, name, code, level, description: IMPORT_DESCRIPTION });
    }
  }
  const plannedById = new Map(planned.map((p) => [p.syntheticId, p]));

  const resolve: MasterContext["resolve"] = (field, text) => {
    const value = clean(text);
    if (!value) return null;
    const ex = lookupExisting(field, value, db);
    if (ex) return { kind: "existing", id: ex.id, name: ex.name, status: ex.status };
    const u = byKey.get(`${field}|${masterKey(field, value)}`);
    if (!u) return { kind: "skip", name: value };
    if (u.decision.action === "map") {
      const t = existingRecord(field, u.decision.targetId!, db)!;
      return { kind: "map", id: t.id, name: t.name, status: t.status };
    }
    if (u.decision.action === "create") {
      const p = plannedById.get(`__new:${field}:${u.key}`)!;
      return { kind: "create", id: p.syntheticId, name: field === "band" ? (p.code ?? p.name) : p.name, status: "active" };
    }
    return { kind: "skip", name: value };
  };

  return { unknown, planned, resolve };
}
