/**
 * Pure validation for process import rows — no React, no storage.
 * Resolves names/codes/e-mails to IDs, infers the "applied for" scope, parses steps,
 * applies "defaults for blank cells" and classifies each row.
 */
import type { Database, Employee, Frequency, ISODate, Priority, Process, ProcessScope, ProcessStatus, ProcessStep, RiskLevel } from "@/types";
import type { ProcessInput } from "@/lib/repositories/processes";
import {
  closestMatches,
  findExact,
  normalizeKey,
  parseBoolean,
  parseFlexibleDate,
  parseList,
  similarity,
  splitFullName,
  type Candidate,
} from "@/lib/import/sheet-parser";
import { defaultProcessExtras } from "@/lib/services/process-defaults";
import { describeScope, normalizeScope, resolveScopeEmployees, validateScope } from "@/lib/services/process-scope";
import type { ProcessFieldKey } from "./fields";
import type { ImportRecord } from "./parse";

export type RecordState = "valid" | "update" | "invalid" | "duplicate";

export interface Suggestion {
  label: string;
  /** Value that replaces the cell when the user clicks the suggestion. */
  value: string;
}

export interface ValidatedRecord extends ImportRecord {
  state: RecordState;
  errors: Partial<Record<ProcessFieldKey, string>>;
  suggestions: Partial<Record<ProcessFieldKey, Suggestion[]>>;
  infos: string[];
  /** Fields that were blank in the file and filled from "Defaults for blank cells". */
  defaultsApplied: string[];
  existing: Process | null;
  /** Full payload for creating a new process. */
  input: ProcessInput | null;
  /** Only the fields explicitly present in the file — used when updating an existing process. */
  patch: Partial<ProcessInput> | null;
  stepCount: number;
  scopeSummary: string;
}

export interface ImportDefaults {
  categoryId: string;
  /** null = organization-wide. */
  departmentId: string | null;
  frequency: Frequency;
  priority: Priority;
  riskLevel: RiskLevel;
  threshold: number;
  startDate: ISODate;
  ownerId: string;
  status: Extract<ProcessStatus, "draft" | "active">;
  mandatory: boolean;
  approval: boolean;
}

export function defaultImportDefaults(settings: Database["settings"], today: ISODate): ImportDefaults {
  return {
    categoryId: "",
    departmentId: null,
    frequency: settings.processConfig.defaultFrequency,
    priority: "medium",
    riskLevel: "medium",
    threshold: settings.processConfig.defaultThreshold,
    startDate: today,
    ownerId: "",
    status: "draft",
    mandatory: true,
    approval: settings.processConfig.approvalRequiredByDefault,
  };
}

export type ImportDb = Pick<Database, "processes" | "processCategories" | "departments" | "teams" | "employees">;

export interface ValidationContext {
  db: ImportDb;
  defaults: ImportDefaults;
  today: ISODate;
  /** When true, a Process ID column is used to match existing processes (still requires opt-in per row). */
  matchById: boolean;
}

const n = normalizeKey;

/* ------------------------------------------------------------------ */
/* Enumerations                                                         */
/* ------------------------------------------------------------------ */

const FREQUENCY_ALIASES: Record<string, { frequency: Frequency; interval?: number }> = {
  daily: { frequency: "daily" },
  "every day": { frequency: "daily" },
  day: { frequency: "daily" },
  weekly: { frequency: "weekly" },
  "every week": { frequency: "weekly" },
  week: { frequency: "weekly" },
  monthly: { frequency: "monthly" },
  "every month": { frequency: "monthly" },
  month: { frequency: "monthly" },
  quarterly: { frequency: "quarterly" },
  "every quarter": { frequency: "quarterly" },
  quarter: { frequency: "quarterly" },
  annually: { frequency: "annually" },
  annual: { frequency: "annually" },
  yearly: { frequency: "annually" },
  "once a year": { frequency: "annually" },
  year: { frequency: "annually" },
  "event based": { frequency: "event_based" },
  event: { frequency: "event_based" },
  "on event": { frequency: "event_based" },
  "ad hoc": { frequency: "event_based" },
  adhoc: { frequency: "event_based" },
  "on demand": { frequency: "event_based" },
  custom: { frequency: "custom" },
  fortnightly: { frequency: "custom", interval: 14 },
  "bi weekly": { frequency: "custom", interval: 14 },
  biweekly: { frequency: "custom", interval: 14 },
  "bi monthly": { frequency: "custom", interval: 61 },
  "semi annually": { frequency: "custom", interval: 182 },
  "half yearly": { frequency: "custom", interval: 182 },
  "twice a year": { frequency: "custom", interval: 182 },
};

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
  { value: "event_based", label: "Event Based" },
  { value: "custom", label: "Custom" },
];

export function parseFrequency(value: string): { frequency: Frequency; interval?: number } | null {
  const k = n(value);
  if (FREQUENCY_ALIASES[k]) return FREQUENCY_ALIASES[k];
  const m = k.match(/^(?:every )?(\d{1,3}) days?$/);
  if (m) return { frequency: "custom", interval: Number(m[1]) };
  return null;
}

const PRIORITY_ALIASES: Record<string, Priority> = { low: "low", minor: "low", medium: "medium", med: "medium", normal: "medium", moderate: "medium", high: "high", major: "high", critical: "critical", urgent: "critical", blocker: "critical", p1: "critical", p2: "high", p3: "medium", p4: "low" };
const RISK_ALIASES: Record<string, RiskLevel> = { low: "low", medium: "medium", med: "medium", moderate: "medium", high: "high", severe: "high", critical: "high" };
const STATUS_ALIASES: Record<string, ProcessStatus> = {
  draft: "draft",
  active: "active",
  live: "active",
  published: "active",
  enabled: "active",
  "under review": "under_review",
  "in review": "under_review",
  review: "under_review",
  inactive: "inactive",
  retired: "inactive",
  disabled: "inactive",
  archived: "inactive",
  closed: "inactive",
};
const LEVEL_ALIASES: Record<string, ProcessScope["level"]> = {
  department: "department",
  departments: "department",
  dept: "department",
  "department level": "department",
  team: "team",
  teams: "team",
  "team level": "team",
  employee: "employee",
  employees: "employee",
  individual: "employee",
  person: "employee",
  people: "employee",
  "employee level": "employee",
};

const ORG_WIDE = new Set(["organization wide", "organisation wide", "org wide", "all", "all departments", "company wide", "none", "na", "n a", "organization", "organisation", "enterprise"]);

const PRIORITY_LABELS = ["Low", "Medium", "High", "Critical"];
const RISK_LABELS = ["Low", "Medium", "High"];
const STATUS_LABELS = ["Draft", "Active", "Under Review", "Inactive"];
const LEVEL_LABELS = ["Department", "Team", "Employee"];

function parseEnum<T>(value: string, map: Record<string, T>, labels: string[]): { hit?: T; suggestions: Suggestion[] } {
  const hit = map[n(value)];
  if (hit !== undefined) return { hit, suggestions: [] };
  const suggestions = labels
    .map((l) => ({ l, s: similarity(value, l) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => ({ label: x.l, value: x.l }));
  return { suggestions };
}

/* ------------------------------------------------------------------ */
/* People & master data                                                 */
/* ------------------------------------------------------------------ */

interface People {
  byId: Map<string, Employee>;
  byEmail: Map<string, Employee>;
  byName: Map<string, Employee[]>;
  candidates: Candidate[];
}

const fullName = (e: Employee) => `${e.firstName} ${e.lastName}`;

function buildPeople(employees: Employee[]): People {
  const byName = new Map<string, Employee[]>();
  for (const e of employees) {
    const k = n(fullName(e));
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  return {
    byId: new Map(employees.map((e) => [e.id.toUpperCase(), e])),
    byEmail: new Map(employees.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e])),
    byName,
    candidates: employees.map((e) => ({ id: e.id, label: fullName(e), aliases: [e.id, ...(e.email ? [e.email] : [])] })),
  };
}

/** Match a person by Employee ID, e-mail or full name ("First Last" or "Last, First"). */
export function resolvePerson(value: string, people: People): { employee?: Employee; error?: string; suggestions?: Suggestion[] } {
  const v = value.trim();
  if (!v) return {};
  let hit: Employee | undefined = people.byId.get(v.toUpperCase());
  if (!hit && v.includes("@")) hit = people.byEmail.get(v.toLowerCase());
  if (!hit) {
    const { first, last } = splitFullName(v);
    const matches = people.byName.get(n(`${first} ${last}`.trim())) ?? people.byName.get(n(v)) ?? [];
    if (matches.length > 1) return { error: `Ambiguous name "${v}" — matches ${matches.map((m) => m.id).join(", ")}. Use the Employee ID.`, suggestions: matches.map((m) => ({ label: `${fullName(m)} (${m.id})`, value: m.id })) };
    hit = matches[0];
  }
  if (!hit) {
    const suggestions = closestMatches(v, people.candidates, 3, 0.6).map((m) => ({ label: `${m.candidate.label} (${m.candidate.id})`, value: m.candidate.id }));
    return { error: `Unknown person "${v}"`, suggestions };
  }
  if (hit.status === "inactive") return { error: `${fullName(hit)} (${hit.id}) is inactive` };
  return { employee: hit };
}

const candidatesOf = (items: { id: string; name: string; code?: string }[]): Candidate[] => items.map((i) => ({ id: i.id, label: i.name, aliases: i.code ? [i.code] : [] }));
const toSuggestions = (value: string, cs: Candidate[]): Suggestion[] => closestMatches(value, cs, 3, 0.55).map((m) => ({ label: m.candidate.label, value: m.candidate.label }));

/* ------------------------------------------------------------------ */
/* Steps                                                                */
/* ------------------------------------------------------------------ */

const STEP_DEFAULT_MINUTES = 15;

function parseSteps(rec: ImportRecord): { steps: ProcessStep[]; errors: string[]; infos: string[] } {
  const errors: string[] = [];
  const infos: string[] = [];
  const steps: ProcessStep[] = [];
  const flag = (value: string, fallback: boolean, label: string, what: string): boolean => {
    if (!value.trim()) return fallback;
    const b = parseBoolean(value);
    if (b === null) {
      errors.push(`${label}: "${value}" is not Yes/No for ${what}.`);
      return fallback;
    }
    return b;
  };
  const minutes = (value: string, label: string): number => {
    if (!value.trim()) return STEP_DEFAULT_MINUTES;
    const num = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isNaN(num) || num < 0) {
      errors.push(`${label}: expected minutes "${value}" is not a number.`);
      return STEP_DEFAULT_MINUTES;
    }
    return Math.round(num);
  };

  if (rec.stepRows.length) {
    if (rec.values.steps.trim()) infos.push("Steps found in both the Steps sheet and the Steps column — the Steps sheet is used.");
    rec.stepRows.forEach((s, i) => {
      const label = `Step ${i + 1}`;
      const v = s.values;
      if (!v.name.trim()) {
        errors.push(`${label} (steps sheet row ${s.rowNumber}): step name is empty.`);
        return;
      }
      steps.push({
        id: `STP-R${rec.rowNumber}-${i + 1}`,
        name: v.name.trim(),
        description: v.description.trim(),
        instructions: v.instructions.trim() || v.description.trim(),
        mandatory: flag(v.mandatory, true, label, "Mandatory"),
        expectedMinutes: minutes(v.minutes, label),
        evidenceRequired: flag(v.evidence, false, label, "Evidence Required"),
        approvalRequired: flag(v.approval, false, label, "Approval Required"),
      });
    });
    return { steps, errors, infos };
  }

  const text = rec.values.steps.trim();
  if (!text) return { steps, errors, infos };
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // "Plan; Execute; Review" on a single line with no pipes → one step per segment.
  if (lines.length === 1 && !lines[0].includes("|") && lines[0].includes(";")) lines = lines[0].split(";").map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const label = `Step ${i + 1}`;
    const parts = line.replace(/^\s*(?:step\s*)?\d+[.):-]\s*/i, "").split("|").map((p) => p.trim());
    const [name, description = "", mins = "", evidence = "", approval = "", mandatory = ""] = parts;
    if (!name) {
      errors.push(`${label}: step name is empty.`);
      return;
    }
    steps.push({
      id: `STP-R${rec.rowNumber}-${i + 1}`,
      name,
      description,
      instructions: description,
      mandatory: flag(mandatory, true, label, "Mandatory"),
      expectedMinutes: minutes(mins, label),
      evidenceRequired: flag(evidence, false, label, "Evidence Required"),
      approvalRequired: flag(approval, false, label, "Approval Required"),
    });
  });
  return { steps, errors, infos };
}

/* ------------------------------------------------------------------ */
/* Row validation                                                       */
/* ------------------------------------------------------------------ */

function createBase(d: ImportDefaults): ProcessInput {
  return {
    ...defaultProcessExtras(),
    name: "",
    categoryId: d.categoryId,
    description: "",
    objective: "",
    departmentId: d.departmentId,
    applicableTeamIds: [],
    applicableBandIds: [],
    ownerId: d.ownerId,
    responsibleId: null,
    reviewerId: null,
    frequency: d.frequency,
    customIntervalDays: d.frequency === "custom" ? 14 : null,
    effectiveDate: d.startDate,
    expiryDate: null,
    priority: d.priority,
    complianceThreshold: d.threshold,
    status: d.status,
    isMandatory: d.mandatory,
    requiresApproval: d.approval,
    sopAttachment: null,
    steps: [],
    riskLevel: d.riskLevel,
  };
}

export function validateRecords(records: ImportRecord[], ctx: ValidationContext): ValidatedRecord[] {
  const { db } = ctx;
  const people = buildPeople(db.employees);
  const nameRows = new Map<string, number[]>();
  for (const r of records) {
    const k = n(r.values.name);
    if (k) nameRows.set(k, [...(nameRows.get(k) ?? []), r.rowNumber]);
  }
  const byName = new Map(db.processes.map((p) => [n(p.name), p]));
  const byId = new Map(db.processes.map((p) => [p.id.toUpperCase(), p]));
  return records.map((r) => validateOne(r, ctx, people, nameRows, byName, byId));
}

function validateOne(
  rec: ImportRecord,
  ctx: ValidationContext,
  people: People,
  nameRows: Map<string, number[]>,
  byName: Map<string, Process>,
  byId: Map<string, Process>,
): ValidatedRecord {
  const { db, defaults, matchById } = ctx;
  const v = rec.values;
  const errors: ValidatedRecord["errors"] = {};
  const suggestions: ValidatedRecord["suggestions"] = {};
  const infos: string[] = [];
  const defaultsApplied: string[] = [];
  const touched = new Set<keyof ProcessInput>();
  const err = (k: ProcessFieldKey, m: string, s?: Suggestion[]) => {
    if (!errors[k]) errors[k] = m;
    if (s?.length && !suggestions[k]) suggestions[k] = s;
  };

  /* ---- identity ---- */
  const name = v.name.trim();
  if (!name) err("name", "Process name is required");
  const rows = name ? (nameRows.get(n(name)) ?? []) : [];
  const isDuplicate = rows.length > 1 && rows[0] !== rec.rowNumber;
  if (isDuplicate) err("name", `Duplicate process name — first used on row ${rows[0]}`);

  let existing: Process | null = null;
  if (v.id.trim() && matchById) {
    existing = byId.get(v.id.trim().toUpperCase()) ?? null;
    if (!existing) infos.push(`Process ID ${v.id.trim()} was not found — matched by name instead.`);
  }
  if (!existing && name) existing = byName.get(n(name)) ?? null;
  if (existing && name && n(existing.name) !== n(name)) {
    const other = byName.get(n(name));
    if (other && other.id !== existing.id) err("name", `Another process named "${name}" already exists (${other.id}).`);
  }

  let base: ProcessInput;
  if (existing) {
    const { id: _id, version: _v, versionHistory: _h, createdAt: _c, updatedAt: _u, ...rest } = existing;
    void _id; void _v; void _h; void _c; void _u;
    base = rest;
  } else base = createBase(defaults);
  const full: ProcessInput = { ...base, name: name || base.name };
  if (name) touched.add("name");

  const blankDefault = (label: string) => {
    if (!existing) defaultsApplied.push(label);
  };

  /* ---- plain text ---- */
  const text = (key: ProcessFieldKey, prop: "description" | "objective" | "successMetric" | "meetingAgenda" | "followUpAction" | "remarks") => {
    const val = v[key].trim();
    if (val) {
      full[prop] = val;
      touched.add(prop);
    }
  };
  text("description", "description");
  text("objective", "objective");
  text("successMetric", "successMetric");
  text("meetingAgenda", "meetingAgenda");
  text("followUpAction", "followUpAction");
  text("remarks", "remarks");
  if (!existing && !v.description.trim()) infos.push("Description is empty.");

  /* ---- category ---- */
  const categories = candidatesOf(db.processCategories.filter((c) => c.status === "active"));
  if (v.category.trim()) {
    const hit = findExact(v.category, categories);
    if (hit) {
      full.categoryId = hit.id;
      touched.add("categoryId");
    } else err("category", `Unknown category "${v.category}"`, toSuggestions(v.category, categories));
  } else if (!existing) {
    if (defaults.categoryId) blankDefault("category");
    else err("category", "Category is required — map a Category column or choose a default category");
  }

  /* ---- owning department ---- */
  const deptCands = candidatesOf(db.departments.filter((d) => d.status === "active").map((d) => ({ id: d.id, name: d.name, code: d.code })));
  if (v.department.trim()) {
    if (ORG_WIDE.has(n(v.department))) {
      full.departmentId = null;
      touched.add("departmentId");
    } else {
      const hit = findExact(v.department, deptCands);
      if (hit) {
        full.departmentId = hit.id;
        touched.add("departmentId");
      } else err("department", `Unknown department "${v.department}"`, toSuggestions(v.department, deptCands));
    }
  } else if (!existing && defaults.departmentId) blankDefault("owning department");

  /* ---- people ---- */
  const person = (key: ProcessFieldKey, prop: "ownerId" | "responsibleId" | "reviewerId" | "followUpOwnerId" | "escalationContactId", required = false) => {
    const val = v[key].trim();
    if (val) {
      const res = resolvePerson(val, people);
      if (res.error) err(key, res.error, res.suggestions);
      else if (res.employee) {
        (full as Record<string, unknown>)[prop] = res.employee.id;
        touched.add(prop);
      }
    } else if (!existing && required) {
      if (defaults.ownerId) blankDefault("owner");
      else err(key, "Process owner is required — map an Owner column or choose a default owner");
    }
  };
  person("owner", "ownerId", true);
  person("responsible", "responsibleId");
  person("reviewer", "reviewerId");
  person("followUpOwner", "followUpOwnerId");
  person("escalation", "escalationContactId");
  if (v.stakeholders.trim()) {
    const ids: string[] = [];
    for (const tok of parseList(v.stakeholders)) {
      const res = resolvePerson(tok, people);
      if (res.error) err("stakeholders", res.error, res.suggestions);
      else if (res.employee) ids.push(res.employee.id);
    }
    full.stakeholderIds = [...new Set(ids)];
    touched.add("stakeholderIds");
  }
  if (!existing && !full.followUpOwnerId) full.followUpOwnerId = full.ownerId || null;

  /* ---- frequency ---- */
  let freqInterval: number | undefined;
  if (v.frequency.trim()) {
    const f = parseFrequency(v.frequency);
    if (f) {
      full.frequency = f.frequency;
      freqInterval = f.interval;
      touched.add("frequency");
    } else
      err(
        "frequency",
        `Unknown frequency "${v.frequency}"`,
        FREQUENCY_OPTIONS.map((o) => ({ s: similarity(v.frequency, o.label), o }))
          .filter((x) => x.s >= 0.5)
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
          .map((x) => ({ label: x.o.label, value: x.o.label })),
      );
  } else blankDefault("frequency");

  if (v.customInterval.trim()) {
    const num = Number(v.customInterval.replace(/[^\d.]/g, ""));
    if (Number.isNaN(num) || num < 1 || num > 365) err("customInterval", "Custom interval must be between 1 and 365 days");
    else freqInterval = Math.round(num);
  }
  if (full.frequency === "custom") {
    if (freqInterval !== undefined) {
      full.customIntervalDays = freqInterval;
      touched.add("customIntervalDays");
    } else if (full.customIntervalDays === null || full.customIntervalDays === undefined) err("customInterval", "Custom frequency needs Custom Interval Days");
    else if (touched.has("frequency")) touched.add("customIntervalDays");
  } else if (touched.has("frequency")) {
    full.customIntervalDays = null;
    touched.add("customIntervalDays");
  }

  /* ---- dates ---- */
  const date = (key: ProcessFieldKey, prop: "effectiveDate" | "expiryDate" | "meetingDate" | "followUpDate" | "nextReviewDate", label: string) => {
    const val = v[key].trim();
    if (!val) return;
    const d = parseFlexibleDate(val);
    if (!d) err(key, `Invalid ${label} "${val}" — use yyyy-mm-dd`);
    else {
      (full as Record<string, unknown>)[prop] = d;
      touched.add(prop);
    }
  };
  date("startDate", "effectiveDate", "start date");
  if (!v.startDate.trim()) blankDefault("start date");
  date("endDate", "expiryDate", "end date");
  date("meetingDate", "meetingDate", "meeting date");
  date("followUpDate", "followUpDate", "follow-up date");
  date("nextReviewDate", "nextReviewDate", "next review date");
  if (!errors.endDate && full.expiryDate && full.expiryDate < full.effectiveDate) err("endDate", "End date is before the start date");
  if (!errors.followUpDate && full.followUpDate && full.meetingDate && full.followUpDate < full.meetingDate) err("followUpDate", "Follow-up date is before the meeting date");

  /* ---- enumerations ---- */
  const enumField = <T,>(key: ProcessFieldKey, map: Record<string, T>, labels: string[], label: string, apply: (x: T) => void, defaultLabel?: string) => {
    const val = v[key].trim();
    if (!val) {
      if (defaultLabel) blankDefault(defaultLabel);
      return;
    }
    const res = parseEnum(val, map, labels);
    if (res.hit !== undefined) apply(res.hit);
    else err(key, `Unknown ${label} "${val}"`, res.suggestions);
  };
  enumField("priority", PRIORITY_ALIASES, PRIORITY_LABELS, "priority", (x) => {
    full.priority = x;
    touched.add("priority");
  }, "priority");
  enumField("risk", RISK_ALIASES, RISK_LABELS, "risk level", (x) => {
    full.riskLevel = x;
    touched.add("riskLevel");
  });
  enumField("status", STATUS_ALIASES, STATUS_LABELS, "status", (x) => {
    full.status = x;
    touched.add("status");
  }, "status");

  /* ---- numbers ---- */
  if (v.threshold.trim()) {
    const raw = v.threshold.replace("%", "").trim();
    let num = Number(raw);
    if (!Number.isNaN(num) && num > 0 && num <= 1 && raw.includes(".")) num = Math.round(num * 100);
    if (Number.isNaN(num) || num < 0 || num > 100) err("threshold", `Compliance threshold "${v.threshold}" must be between 0 and 100`);
    else {
      full.complianceThreshold = Math.round(num * 10) / 10;
      touched.add("complianceThreshold");
    }
  } else blankDefault("threshold");
  if (v.slaDays.trim()) {
    const num = Number(v.slaDays.replace(/[^\d.]/g, ""));
    if (Number.isNaN(num) || num < 0) err("slaDays", `SLA days "${v.slaDays}" must be a positive number`);
    else {
      full.slaDays = Math.round(num);
      touched.add("slaDays");
    }
  }

  /* ---- yes / no ---- */
  const yesNo = (key: ProcessFieldKey, prop: "isMandatory" | "requiresApproval", label: string) => {
    const val = v[key].trim();
    if (!val) {
      blankDefault(label.toLowerCase());
      return;
    }
    const b = parseBoolean(val);
    if (b === null) err(key, `"${val}" is not Yes/No`, [{ label: "Yes", value: "Yes" }, { label: "No", value: "No" }]);
    else {
      full[prop] = b;
      touched.add(prop);
    }
  };
  yesNo("mandatory", "isMandatory", "Mandatory");
  yesNo("approval", "requiresApproval", "Approval required");

  if (v.tags.trim()) {
    full.tags = [...new Set(parseList(v.tags).map((t) => t.toLowerCase()))];
    touched.add("tags");
  }

  /* ---- applied for (scope) ---- */
  let scopeSummary = "";
  const scopeProvided = Boolean(v.appliedAt.trim() || v.appliedDepartments.trim() || v.appliedTeams.trim() || v.appliedEmployees.trim());
  if (scopeProvided || !existing) {
    const activeTeams = db.teams.filter((t) => t.status === "active");
    let level: ProcessScope["level"] | null = null;
    if (v.appliedAt.trim()) {
      const res = parseEnum(v.appliedAt, LEVEL_ALIASES, LEVEL_LABELS);
      if (res.hit) level = res.hit;
      else err("appliedAt", `Unknown level "${v.appliedAt}" — use Department, Team or Employee`, res.suggestions);
    }
    const deptTokens = parseList(v.appliedDepartments);
    const teamTokens = parseList(v.appliedTeams);
    const empTokens = parseList(v.appliedEmployees);
    if (!level) level = empTokens.length ? "employee" : teamTokens.length ? "team" : "department";

    const deptIds: string[] = [];
    for (const tok of deptTokens) {
      if (ORG_WIDE.has(n(tok))) {
        deptIds.push(...db.departments.filter((d) => d.status === "active").map((d) => d.id));
        continue;
      }
      const hit = findExact(tok, deptCands);
      if (hit) deptIds.push(hit.id);
      else err("appliedDepartments", `Unknown department "${tok}"`, toSuggestions(tok, deptCands));
    }
    const teamIds: string[] = [];
    for (const tok of teamTokens) {
      const inDepts = activeTeams.filter((t) => !deptIds.length || deptIds.includes(t.departmentId));
      const hit = findExact(tok, candidatesOf(inDepts));
      if (hit) teamIds.push(hit.id);
      else {
        const elsewhere = findExact(tok, candidatesOf(activeTeams));
        if (elsewhere) err("appliedTeams", `Team "${tok}" does not belong to the selected departments`);
        else err("appliedTeams", `Unknown team "${tok}"`, toSuggestions(tok, candidatesOf(inDepts)));
      }
    }
    const empIds: string[] = [];
    for (const tok of empTokens) {
      const res = resolvePerson(tok, people);
      if (res.error) err("appliedEmployees", res.error, res.suggestions);
      else if (res.employee) empIds.push(res.employee.id);
    }

    if (level === "department" && (teamTokens.length || empTokens.length)) infos.push("Teams / employees are ignored because the process is applied at department level.");
    if (level === "team" && empTokens.length) infos.push("Employees are ignored because the process is applied at team level.");

    // Departments: explicit → derived from teams/employees → owning department → whole organization.
    let departmentIds = [...new Set(deptIds)];
    if (!departmentIds.length && level === "team") departmentIds = [...new Set(teamIds.map((id) => db.teams.find((t) => t.id === id)!.departmentId))];
    if (!departmentIds.length && level === "employee") departmentIds = [...new Set(empIds.map((id) => db.employees.find((e) => e.id === id)!.departmentId))];
    if (!departmentIds.length && !deptTokens.length) {
      if (full.departmentId) departmentIds = [full.departmentId];
      else {
        departmentIds = db.departments.filter((d) => d.status === "active").map((d) => d.id);
        if (level === "department") infos.push("Applied to all departments (organization-wide).");
      }
    }

    const uniqueTeams = [...new Set(teamIds)];
    const uniqueEmps = [...new Set(empIds)];
    if (level === "employee") {
      for (const id of uniqueEmps) {
        const e = db.employees.find((x) => x.id === id)!;
        if (!departmentIds.includes(e.departmentId)) err("appliedEmployees", `${fullName(e)} is not in the selected departments`);
        else if (uniqueTeams.length && (!e.teamId || !uniqueTeams.includes(e.teamId))) err("appliedEmployees", `${fullName(e)} is not in the selected teams`);
      }
    }
    const rawScope: ProcessScope = { level, departmentIds, teamIds: level === "department" ? [] : uniqueTeams, employeeIds: level === "employee" ? uniqueEmps : [] };
    const scope = normalizeScope(rawScope, db);
    const scopeError = validateScope(scope, db);
    if (scopeError && !errors.appliedDepartments && !errors.appliedTeams && !errors.appliedEmployees && !errors.appliedAt) {
      const key: ProcessFieldKey = /employee/i.test(scopeError) ? "appliedEmployees" : /team/i.test(scopeError) ? "appliedTeams" : "appliedDepartments";
      err(key, scopeError);
    } else if (!scopeError && resolveScopeEmployees(scope, db).length === 0) {
      err(level === "employee" ? "appliedEmployees" : level === "team" ? "appliedTeams" : "appliedDepartments", "No active employees match this selection");
    }
    if (!scopeError) {
      full.scope = scope;
      scopeSummary = describeScope(scope, db, 2);
      touched.add("scope");
    }
  } else if (existing) {
    scopeSummary = describeScope(existing.scope, db, 2);
  }

  /* ---- steps ---- */
  const parsed = parseSteps(rec);
  infos.push(...parsed.infos);
  if (parsed.errors.length) err("steps", parsed.errors.slice(0, 2).join(" ") + (parsed.errors.length > 2 ? ` (+${parsed.errors.length - 2} more)` : ""));
  if (parsed.steps.length) {
    full.steps = parsed.steps;
    touched.add("steps");
  }
  if (full.status === "active" && full.steps.length === 0) err("steps", "Active processes need at least one step — add steps or import as Draft");

  /* ---- near-duplicate hint ---- */
  if (!existing && name) {
    const similar = [...byName.values()].find((p) => similarity(p.name, name) >= 0.92);
    if (similar) infos.push(`Very similar to existing process "${similar.name}" (${similar.id}).`);
  }

  const hasErrors = Object.keys(errors).length > 0;
  const state: RecordState = isDuplicate ? "duplicate" : hasErrors ? "invalid" : existing ? "update" : "valid";
  let patch: Partial<ProcessInput> | null = null;
  if (!hasErrors && existing) {
    patch = Object.fromEntries([...touched].map((k) => [k, full[k]])) as Partial<ProcessInput>;
  }
  return {
    ...rec,
    state,
    errors,
    suggestions,
    infos,
    defaultsApplied: [...new Set(defaultsApplied)],
    existing,
    input: hasErrors ? null : full,
    patch,
    stepCount: full.steps.length,
    scopeSummary,
  };
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

