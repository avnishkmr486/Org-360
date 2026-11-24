/**
 * Target fields for the process import — the main "Processes" sheet and the optional "Steps" sheet —
 * plus header/content based auto-mapping that tolerates any column naming or order.
 */
import { inferColumnKind, normalizeKey, similarity, type ColumnKind } from "@/lib/import/sheet-parser";

export type ProcessFieldKey =
  | "id"
  | "name"
  | "category"
  | "description"
  | "objective"
  | "department"
  | "appliedAt"
  | "appliedDepartments"
  | "appliedTeams"
  | "appliedEmployees"
  | "owner"
  | "responsible"
  | "reviewer"
  | "frequency"
  | "customInterval"
  | "startDate"
  | "endDate"
  | "priority"
  | "risk"
  | "threshold"
  | "status"
  | "mandatory"
  | "approval"
  | "slaDays"
  | "successMetric"
  | "meetingDate"
  | "meetingAgenda"
  | "followUpDate"
  | "followUpAction"
  | "followUpOwner"
  | "nextReviewDate"
  | "escalation"
  | "stakeholders"
  | "tags"
  | "remarks"
  | "steps";

export type StepFieldKey = "processName" | "stepNo" | "name" | "description" | "instructions" | "mandatory" | "minutes" | "evidence" | "approval";

export type FieldGroup = "Core" | "Applied for" | "People" | "Schedule & rules" | "Meeting & follow-up" | "Governance" | "Steps";

export interface FieldDef<K extends string> {
  key: K;
  /** Header used in the template ("*" marks template-required columns). */
  header: string;
  /** Hard-required for import (nothing else can supply it). */
  required: boolean;
  /** Marked * in the template; may be supplied by "Defaults for blank cells". */
  templateRequired?: boolean;
  aliases: string[];
  description: string;
  kind: ColumnKind | "list";
  group: FieldGroup;
}

export const PROCESS_FIELDS: FieldDef<ProcessFieldKey>[] = [
  { key: "id", header: "Process ID", required: false, aliases: ["process id", "process code", "process no", "proc id", "prc id", "sop id", "id", "code", "reference"], description: "Optional match key — never needed for new processes (IDs are auto-generated)", kind: "id", group: "Core" },
  { key: "name", header: "Process Name", required: true, templateRequired: true, aliases: ["process name", "process", "name", "title", "process title", "procedure", "procedure name", "sop name", "workflow", "workflow name", "activity", "activity name", "policy name"], description: "Unique name of the process", kind: "text", group: "Core" },
  { key: "category", header: "Category", required: false, templateRequired: true, aliases: ["category", "process category", "type", "process type", "area", "domain", "classification"], description: "Process category (see Reference sheet)", kind: "text", group: "Core" },
  { key: "description", header: "Description", required: false, templateRequired: true, aliases: ["description", "process description", "details", "summary", "scope description", "about"], description: "What the process is", kind: "text", group: "Core" },
  { key: "objective", header: "Objective", required: false, templateRequired: true, aliases: ["objective", "purpose", "goal", "aim", "intent", "process objective"], description: "Measurable outcome it protects", kind: "text", group: "Core" },
  { key: "department", header: "Owning Department", required: false, aliases: ["owning department", "department", "dept", "owner department", "function", "business unit", "owning dept", "primary department"], description: "Blank = organization-wide", kind: "text", group: "Core" },
  { key: "appliedAt", header: "Applied At", required: false, aliases: ["applied at", "applicability", "applicable at", "applied level", "applies at", "level", "applicability level", "scope level", "applied for level", "apply at"], description: "Department / Team / Employee", kind: "text", group: "Applied for" },
  { key: "appliedDepartments", header: "Applied Departments", required: false, aliases: ["applied departments", "applicable departments", "applied for departments", "departments", "applies to departments", "for departments", "applied for", "process applied for", "applicable to"], description: "Comma / semicolon separated department names or codes", kind: "list", group: "Applied for" },
  { key: "appliedTeams", header: "Applied Teams", required: false, aliases: ["applied teams", "applicable teams", "teams", "applies to teams", "for teams", "team names", "team"], description: "Team names (must belong to the departments)", kind: "list", group: "Applied for" },
  { key: "appliedEmployees", header: "Applied Employees", required: false, aliases: ["applied employees", "applicable employees", "employees", "applies to employees", "for employees", "employee ids", "applied to", "assignees", "assigned employees", "assigned to"], description: "Employee IDs, e-mails or full names", kind: "list", group: "Applied for" },
  { key: "owner", header: "Process Owner", required: false, templateRequired: true, aliases: ["process owner", "owner", "owned by", "accountable", "accountable person", "process lead", "process manager", "owner name", "responsible owner"], description: "Employee ID, e-mail or full name", kind: "text", group: "People" },
  { key: "responsible", header: "Responsible Person", required: false, aliases: ["responsible person", "responsible", "executor", "performer", "doer", "assigned person", "process responsible"], description: "Day-to-day responsible person", kind: "text", group: "People" },
  { key: "reviewer", header: "Reviewer", required: false, aliases: ["reviewer", "approver", "reviewed by", "review owner", "checker", "approved by"], description: "Reviews submissions", kind: "text", group: "People" },
  { key: "frequency", header: "Frequency", required: false, templateRequired: true, aliases: ["frequency", "periodicity", "cadence", "recurrence", "schedule", "how often", "repeat", "interval type"], description: "Daily / Weekly / Monthly / Quarterly / Annually / Event Based / Custom", kind: "text", group: "Schedule & rules" },
  { key: "customInterval", header: "Custom Interval Days", required: false, aliases: ["custom interval days", "interval days", "custom interval", "every n days", "repeat every days", "cycle days"], description: "Only when frequency is Custom", kind: "number", group: "Schedule & rules" },
  { key: "startDate", header: "Start Date", required: false, templateRequired: true, aliases: ["start date", "effective date", "effective from", "start", "go live", "go live date", "launch date", "begin date", "from date", "valid from", "starts on"], description: "yyyy-mm-dd (other formats accepted)", kind: "date", group: "Schedule & rules" },
  { key: "endDate", header: "End Date", required: false, aliases: ["end date", "expiry date", "expiry", "effective to", "valid till", "valid until", "end", "expires on", "to date", "retire date"], description: "Optional expiry", kind: "date", group: "Schedule & rules" },
  { key: "priority", header: "Priority", required: false, aliases: ["priority", "importance", "criticality", "severity"], description: "Low / Medium / High / Critical", kind: "text", group: "Schedule & rules" },
  { key: "risk", header: "Risk Level", required: false, aliases: ["risk level", "risk", "risk rating", "risk category"], description: "Low / Medium / High", kind: "text", group: "Governance" },
  { key: "threshold", header: "Compliance Threshold %", required: false, aliases: ["compliance threshold", "compliance threshold %", "threshold", "target", "target %", "target compliance", "sla %", "compliance target", "adherence target"], description: "0–100", kind: "number", group: "Schedule & rules" },
  { key: "status", header: "Status", required: false, aliases: ["status", "process status", "state", "lifecycle"], description: "Draft / Active / Under Review / Inactive", kind: "text", group: "Core" },
  { key: "mandatory", header: "Mandatory", required: false, aliases: ["mandatory", "is mandatory", "required", "compulsory", "mandatory process"], description: "Yes / No", kind: "boolean", group: "Schedule & rules" },
  { key: "approval", header: "Approval Required", required: false, aliases: ["approval required", "needs approval", "requires approval", "approval", "approval needed", "reviewer approval"], description: "Yes / No", kind: "boolean", group: "Schedule & rules" },
  { key: "slaDays", header: "SLA Days", required: false, aliases: ["sla days", "sla", "sla in days", "turnaround days", "target days", "completion days", "tat"], description: "Days to complete one occurrence", kind: "number", group: "Governance" },
  { key: "successMetric", header: "Success Metric", required: false, aliases: ["success metric", "kpi", "success criteria", "metric", "measure", "success measure"], description: "How success is measured", kind: "text", group: "Governance" },
  { key: "meetingDate", header: "Meeting Date", required: false, aliases: ["meeting date", "kickoff date", "kick off date", "kickoff meeting", "review meeting date", "meeting on", "meeting"], description: "Kick-off / review meeting", kind: "date", group: "Meeting & follow-up" },
  { key: "meetingAgenda", header: "Meeting Agenda", required: false, aliases: ["meeting agenda", "agenda", "meeting notes", "discussion points", "minutes of meeting", "mom"], description: "", kind: "text", group: "Meeting & follow-up" },
  { key: "followUpDate", header: "Follow-up Date", required: false, aliases: ["follow up date", "followup date", "follow-up date", "next follow up", "follow up on", "follow up", "followup"], description: "", kind: "date", group: "Meeting & follow-up" },
  { key: "followUpAction", header: "Follow-up Action", required: false, aliases: ["follow up action", "followup action", "follow-up action", "action item", "action items", "next action", "actions"], description: "", kind: "text", group: "Meeting & follow-up" },
  { key: "followUpOwner", header: "Follow-up Owner", required: false, aliases: ["follow up owner", "followup owner", "follow-up owner", "action owner", "follow up by", "follow up person"], description: "Employee ID, e-mail or name", kind: "text", group: "Meeting & follow-up" },
  { key: "nextReviewDate", header: "Next Review Date", required: false, aliases: ["next review date", "review date", "next review", "review due", "next review on", "due for review"], description: "", kind: "date", group: "Meeting & follow-up" },
  { key: "escalation", header: "Escalation Contact", required: false, aliases: ["escalation contact", "escalation", "escalate to", "escalation owner", "escalation person"], description: "Employee ID, e-mail or name", kind: "text", group: "Governance" },
  { key: "stakeholders", header: "Stakeholders", required: false, aliases: ["stakeholders", "stakeholder", "interested parties", "informed", "consulted", "cc"], description: "Comma separated people", kind: "list", group: "Governance" },
  { key: "tags", header: "Tags", required: false, aliases: ["tags", "tag", "keywords", "labels", "labels tags"], description: "Comma separated", kind: "list", group: "Governance" },
  { key: "remarks", header: "Remarks", required: false, aliases: ["remarks", "notes", "comments", "comment", "additional notes", "internal notes"], description: "", kind: "text", group: "Governance" },
  { key: "steps", header: "Steps", required: false, aliases: ["steps", "process steps", "checklist", "procedure steps", "activities", "step list", "tasks"], description: "One step per line: Step name | description | minutes | evidence Y/N | approval Y/N | mandatory Y/N", kind: "text", group: "Steps" },
];

export const STEP_FIELDS: FieldDef<StepFieldKey>[] = [
  { key: "processName", header: "Process Name", required: true, aliases: ["process name", "process", "parent process", "procedure", "process title", "sop", "workflow"], description: "Links the step to a process in the first sheet", kind: "text", group: "Steps" },
  { key: "stepNo", header: "Step No", required: false, aliases: ["step no", "step number", "step", "step id", "sequence", "seq", "order", "no", "sr no", "s no", "sl no", "step #"], description: "Order of the step", kind: "number", group: "Steps" },
  { key: "name", header: "Step Name", required: true, aliases: ["step name", "step title", "activity", "task", "task name", "action", "name", "title", "step description short"], description: "", kind: "text", group: "Steps" },
  { key: "description", header: "Description", required: false, aliases: ["description", "step description", "details", "summary"], description: "", kind: "text", group: "Steps" },
  { key: "instructions", header: "Instructions", required: false, aliases: ["instructions", "how to", "procedure", "guidance", "instruction", "notes"], description: "", kind: "text", group: "Steps" },
  { key: "mandatory", header: "Mandatory", required: false, aliases: ["mandatory", "required", "is mandatory", "compulsory", "optional"], description: "Yes / No (blank = Yes)", kind: "boolean", group: "Steps" },
  { key: "minutes", header: "Expected Minutes", required: false, aliases: ["expected minutes", "minutes", "duration", "expected time", "time minutes", "expected completion time", "time", "effort minutes", "est minutes"], description: "", kind: "number", group: "Steps" },
  { key: "evidence", header: "Evidence Required", required: false, aliases: ["evidence required", "evidence", "proof", "attachment required", "proof required"], description: "Yes / No", kind: "boolean", group: "Steps" },
  { key: "approval", header: "Approval Required", required: false, aliases: ["approval required", "approval", "needs approval", "requires approval", "sign off"], description: "Yes / No", kind: "boolean", group: "Steps" },
];

/** Field → source column index (null = not mapped). */
export type Mapping<K extends string> = Record<K, number | null>;
export type Confidence = "exact" | "alias" | "fuzzy" | "content";
export type ConfidenceMap<K extends string> = Record<K, Confidence | null>;

export const PROCESS_VOCABULARY = [...new Set(PROCESS_FIELDS.flatMap((f) => [normalizeKey(f.header), ...f.aliases.map(normalizeKey)]))].filter((v) => v.length > 2);
export const STEP_VOCABULARY = [...new Set(STEP_FIELDS.flatMap((f) => [normalizeKey(f.header), ...f.aliases.map(normalizeKey)]))].filter((v) => v.length > 2);

/** Which dates/booleans to try (in order) for unlabeled columns detected by content. */
const CONTENT_ORDER: Partial<Record<ColumnKind, string[]>> = {
  date: ["startDate", "endDate", "meetingDate", "followUpDate", "nextReviewDate"],
  boolean: ["mandatory", "approval"],
};

const isGenericHeader = (h: string) => /^column [a-z]+$/i.test(h.trim());

function headerScore<K extends string>(field: FieldDef<K>, header: string): { score: number; conf: Confidence } | null {
  const h = normalizeKey(header);
  if (!h) return null;
  if (h === normalizeKey(field.header)) return { score: 100, conf: "exact" };
  const aliases = field.aliases.map(normalizeKey);
  if (aliases.includes(h)) return { score: 90, conf: "alias" };
  // Containment only for reasonably long aliases to avoid "name" matching everything.
  if (aliases.some((a) => a.length > 4 && (h.includes(a) || (h.length > 4 && a.includes(h))))) return { score: 62, conf: "fuzzy" };
  const best = Math.max(similarity(h, field.header), ...aliases.map((a) => similarity(h, a)));
  if (best >= 0.84) return { score: Math.round(best * 70), conf: "fuzzy" };
  return null;
}

/**
 * Greedy best-match assignment of source columns to target fields.
 * Header text first (exact → alias → fuzzy); unlabeled columns are then
 * assigned by what their values look like (dates, Yes/No, 0–100 numbers).
 */
export function autoMap<K extends string>(fields: FieldDef<K>[], headers: string[], rows: string[][]): { mapping: Mapping<K>; confidence: ConfidenceMap<K> } {
  const mapping = {} as Mapping<K>;
  const confidence = {} as ConfidenceMap<K>;
  for (const f of fields) {
    mapping[f.key] = null;
    confidence[f.key] = null;
  }
  const pairs: { key: K; col: number; score: number; conf: Confidence }[] = [];
  fields.forEach((f) => {
    headers.forEach((h, col) => {
      const s = headerScore(f, h);
      if (s) pairs.push({ key: f.key, col, ...s });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const usedCols = new Set<number>();
  for (const p of pairs) {
    if (mapping[p.key] !== null || usedCols.has(p.col)) continue;
    mapping[p.key] = p.col;
    confidence[p.key] = p.conf;
    usedCols.add(p.col);
  }

  // Content-based fallback for columns with no usable header.
  headers.forEach((h, col) => {
    if (usedCols.has(col) || !isGenericHeader(h)) return;
    const kind = inferColumnKind(rows.map((r) => r[col] ?? ""));
    const candidates = CONTENT_ORDER[kind] as K[] | undefined;
    let key: K | undefined = candidates?.find((k) => mapping[k] === null && fields.some((f) => f.key === k));
    if (!key && kind === "number") {
      const nums = rows.map((r) => Number((r[col] ?? "").replace("%", ""))).filter((n) => !Number.isNaN(n));
      if (nums.length && nums.every((n) => n >= 0 && n <= 100)) key = (["threshold"] as K[]).find((k) => mapping[k] === null && fields.some((f) => f.key === k));
    }
    if (key) {
      mapping[key] = col;
      confidence[key] = "content";
      usedCols.add(col);
    }
  });
  return { mapping, confidence };
}

export function missingRequired<K extends string>(fields: FieldDef<K>[], mapping: Mapping<K>): K[] {
  return fields.filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined)).map((f) => f.key);
}

export const FIELD_GROUPS: FieldGroup[] = ["Core", "Applied for", "People", "Schedule & rules", "Meeting & follow-up", "Governance", "Steps"];
