/**
 * Field-level diff between two versions of a process — drives the audit trail
 * ("Owner: Karan Bhatia → Deepak Yadav").
 */
import type { Database, Process, ProcessChange } from "@/types";
import { FREQUENCY_LABELS, PRIORITY_META, PROCESS_STATUS_META } from "@/lib/constants";
import { describeScope } from "./process-scope";

type Db = Pick<Database, "employees" | "departments" | "teams" | "processCategories" | "bands">;

const NONE = "—";

interface FieldDef {
  field: keyof Process;
  label: string;
  format: (p: Process, db: Db) => string;
}

const emp = (db: Db, id: string | null) => {
  if (!id) return NONE;
  const e = db.employees.find((x) => x.id === id);
  return e ? `${e.firstName} ${e.lastName}` : id;
};
const names = (ids: string[], fn: (id: string) => string) => (ids.length ? ids.map(fn).join(", ") : NONE);

const FIELDS: FieldDef[] = [
  { field: "name", label: "Process name", format: (p) => p.name },
  { field: "categoryId", label: "Category", format: (p, db) => db.processCategories.find((c) => c.id === p.categoryId)?.name ?? p.categoryId },
  { field: "description", label: "Description", format: (p) => p.description || NONE },
  { field: "objective", label: "Objective", format: (p) => p.objective || NONE },
  { field: "departmentId", label: "Owning department", format: (p, db) => (p.departmentId ? (db.departments.find((d) => d.id === p.departmentId)?.name ?? p.departmentId) : "Organization-wide") },
  { field: "scope", label: "Applied for", format: (p, db) => describeScope(p.scope, db, 50) },
  { field: "ownerId", label: "Process owner", format: (p, db) => emp(db, p.ownerId) },
  { field: "responsibleId", label: "Responsible person", format: (p, db) => emp(db, p.responsibleId) },
  { field: "reviewerId", label: "Reviewer", format: (p, db) => emp(db, p.reviewerId) },
  { field: "frequency", label: "Frequency", format: (p) => FREQUENCY_LABELS[p.frequency] + (p.frequency === "custom" && p.customIntervalDays ? ` (${p.customIntervalDays}d)` : "") },
  { field: "effectiveDate", label: "Start date", format: (p) => p.effectiveDate },
  { field: "expiryDate", label: "End date", format: (p) => p.expiryDate ?? NONE },
  { field: "priority", label: "Priority", format: (p) => PRIORITY_META[p.priority].label },
  { field: "riskLevel", label: "Risk level", format: (p) => p.riskLevel },
  { field: "complianceThreshold", label: "Compliance threshold", format: (p) => `${p.complianceThreshold}%` },
  { field: "status", label: "Status", format: (p) => PROCESS_STATUS_META[p.status].label },
  { field: "isMandatory", label: "Mandatory", format: (p) => (p.isMandatory ? "Yes" : "No") },
  { field: "requiresApproval", label: "Approval required", format: (p) => (p.requiresApproval ? "Yes" : "No") },
  { field: "meetingDate", label: "Meeting date", format: (p) => p.meetingDate ?? NONE },
  { field: "meetingAgenda", label: "Meeting agenda", format: (p) => p.meetingAgenda || NONE },
  { field: "meetingAttendeeIds", label: "Meeting attendees", format: (p, db) => names(p.meetingAttendeeIds, (id) => emp(db, id)) },
  { field: "meetingNotes", label: "Meeting notes", format: (p) => p.meetingNotes || NONE },
  { field: "followUpDate", label: "Follow-up date", format: (p) => p.followUpDate ?? NONE },
  { field: "followUpAction", label: "Follow-up action", format: (p) => p.followUpAction || NONE },
  { field: "followUpOwnerId", label: "Follow-up owner", format: (p, db) => emp(db, p.followUpOwnerId) },
  { field: "nextReviewDate", label: "Next review date", format: (p) => p.nextReviewDate ?? NONE },
  { field: "lastReviewedOn", label: "Last reviewed on", format: (p) => p.lastReviewedOn ?? NONE },
  { field: "slaDays", label: "SLA (days)", format: (p) => (p.slaDays === null ? NONE : String(p.slaDays)) },
  { field: "successMetric", label: "Success metric", format: (p) => p.successMetric || NONE },
  { field: "escalationContactId", label: "Escalation contact", format: (p, db) => emp(db, p.escalationContactId) },
  { field: "stakeholderIds", label: "Stakeholders", format: (p, db) => names(p.stakeholderIds, (id) => emp(db, id)) },
  { field: "tags", label: "Tags", format: (p) => (p.tags.length ? p.tags.join(", ") : NONE) },
  { field: "references", label: "Reference links", format: (p) => (p.references.length ? p.references.map((r) => r.title).join(", ") : NONE) },
  { field: "remarks", label: "Remarks", format: (p) => p.remarks || NONE },
  { field: "applicableTeamIds", label: "Applicable teams (filter)", format: (p, db) => names(p.applicableTeamIds, (id) => db.teams.find((t) => t.id === id)?.name ?? id) },
  { field: "applicableBandIds", label: "Applicable bands (filter)", format: (p, db) => names(p.applicableBandIds, (id) => db.bands.find((b) => b.id === id)?.code ?? id) },
  { field: "sopAttachment", label: "SOP document", format: (p) => p.sopAttachment?.name ?? NONE },
];

const steps = (p: Process) => p.steps.map((s) => `${s.name}|${s.mandatory}|${s.expectedMinutes}|${s.evidenceRequired}|${s.approvalRequired}`).join("¦");

export function diffProcess(prev: Process, next: Process, db: Db): ProcessChange[] {
  const out: ProcessChange[] = [];
  for (const f of FIELDS) {
    const a = JSON.stringify(prev[f.field] ?? null);
    const b = JSON.stringify(next[f.field] ?? null);
    if (a === b) continue;
    const from = f.format(prev, db);
    const to = f.format(next, db);
    if (from === to) continue;
    out.push({ field: String(f.field), label: f.label, from, to });
  }
  if (steps(prev) !== steps(next)) {
    out.push({ field: "steps", label: "Process steps", from: `${prev.steps.length} steps`, to: `${next.steps.length} steps` });
  }
  return out;
}

export function summarizeChanges(changes: ProcessChange[]): string {
  if (!changes.length) return "Process saved with no field changes.";
  if (changes.length <= 3) return changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join("; ");
  return `${changes.length} fields updated: ${changes.slice(0, 4).map((c) => c.label).join(", ")}${changes.length > 4 ? ", …" : ""}`;
}
