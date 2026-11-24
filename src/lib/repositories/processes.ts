import type { Assignment, Attachment, Process, ProcessScope, ProcessStatus } from "@/types";
import { auditEntry, currentActor, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";
import { createAssignment, setAssignmentStatus, type AssignmentInput } from "./assignments";
import { resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { diffProcess, summarizeChanges } from "@/lib/services/process-diff";
import { describeScope, normalizeScope, resolveScopeEmployees, validateScope } from "@/lib/services/process-scope";
import { uid } from "@/lib/utils/random";

export type ProcessInput = Omit<Process, "id" | "version" | "versionHistory" | "createdAt" | "updatedAt">;

export async function getProcesses(): Promise<Process[]> {
  await latency(60);
  return getDb().processes;
}

export async function getProcess(id: string): Promise<Process | undefined> {
  await latency(60);
  return getDb().processes.find((p) => p.id === id);
}

/** Auto-generated, sequential, never reused — e.g. PRC-016. */
export function nextProcessId(): string {
  const max = getDb().processes.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, "")) || 0), 0);
  return `PRC-${String(max + 1).padStart(3, "0")}`;
}

export async function createProcess(input: ProcessInput): Promise<Process> {
  await latency(350);
  const db = getDb();
  if (db.processes.some((p) => p.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new RepositoryError(`A process named "${input.name}" already exists.`);
  }
  const ts = nowIso();
  const actor = currentActor(db);
  const process: Process = {
    ...input,
    name: input.name.trim(),
    id: nextProcessId(),
    version: 1,
    versionHistory: [{ version: 1, changedAt: ts, changedBy: actor.name, summary: "Process created." }],
    createdAt: ts,
    updatedAt: ts,
  };
  write((d) => ({
    patch: { processes: [...d.processes, process] },
    audit: [auditEntry(d, "Processes", "Created", process.id, process.name, `Process created with ${process.steps.length} steps (${describeScope(process.scope, d)}).`)],
  }));
  // Active processes with a defined scope start generating tasks immediately.
  if (process.status === "active" && !validateScope(process.scope, db)) await syncScopeAssignments(process.id).catch(() => undefined);
  return process;
}

/**
 * Updating a process bumps its version and records a field-level change list
 * (shown in the process timeline and audit log).
 */
export async function updateProcess(id: string, patch: Partial<ProcessInput>, summary?: string): Promise<Process> {
  await latency(300);
  let updated: Process | undefined;
  write((d) => {
    const actor = currentActor(d);
    const processes = replaceById(d.processes, id, (p) => {
      const candidate = { ...p, ...patch, id: p.id } as Process;
      const changes = diffProcess(p, candidate, d);
      const version = p.version + 1;
      updated = {
        ...candidate,
        version,
        versionHistory: [...p.versionHistory, { version, changedAt: nowIso(), changedBy: actor.name, summary: summary ?? summarizeChanges(changes), changes }],
        updatedAt: nowIso(),
      };
      return updated;
    });
    // Keep open tasks in sync with approval/mandatory flags.
    const tasks =
      patch.requiresApproval !== undefined || patch.isMandatory !== undefined
        ? d.tasks.map((t) =>
            t.processId === id && (t.status === "not_started" || t.status === "in_progress")
              ? { ...t, requiresApproval: updated!.requiresApproval, required: updated!.isMandatory }
              : t,
          )
        : d.tasks;
    const last = updated!.versionHistory[updated!.versionHistory.length - 1];
    return { patch: { processes, tasks }, audit: [auditEntry(d, "Processes", "Updated", id, updated!.name, `${last.summary} (v${updated!.version})`)] };
  });
  return updated!;
}

export async function cloneProcess(id: string): Promise<Process> {
  const src = getDb().processes.find((p) => p.id === id);
  if (!src) throw new RepositoryError("Process not found.");
  const { id: _id, version: _v, versionHistory: _vh, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _id; void _v; void _vh; void _c; void _u;
  let name = `${src.name} (Copy)`;
  let i = 2;
  while (getDb().processes.some((p) => p.name === name)) name = `${src.name} (Copy ${i++})`;
  return createProcess({
    ...rest,
    name,
    status: "draft",
    // A clone starts a fresh governance cycle.
    meetingDate: null,
    followUpDate: null,
    nextReviewDate: null,
    lastReviewedOn: null,
    steps: rest.steps.map((s) => ({ ...s, id: uid("STP") })),
  });
}

export async function setProcessStatus(id: string, status: ProcessStatus): Promise<void> {
  await updateProcess(id, { status });
  if (status === "active") await syncScopeAssignments(id).catch(() => undefined);
}

export async function attachSop(id: string, file: { name: string; size: number; type: string }): Promise<void> {
  const attachment: Attachment = {
    id: uid("SOP"),
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    uploadedAt: nowIso(),
    uploadedBy: currentActor().name,
  };
  await updateProcess(id, { sopAttachment: attachment }, `SOP uploaded: ${file.name}.`);
}

/* ------------------------------------------------------------------ */
/* "Process applied for" → assignments                                  */
/* ------------------------------------------------------------------ */

export interface ScopeSyncResult {
  created: number;
  deactivated: number;
  employees: number;
  warnings: string[];
}

interface Target {
  key: string;
  input: Omit<AssignmentInput, "processId" | "startDate" | "endDate" | "frequency" | "dueConfig" | "ownerId" | "reviewerId" | "notes">;
  label: string;
}

function targetsFor(scope: ProcessScope, db: ReturnType<typeof getDb>): Target[] {
  const blank = { bandId: null, employeeIds: [] as string[] };
  switch (scope.level) {
    case "department":
      return scope.departmentIds.map((id) => ({
        key: `department:${id}`,
        label: db.departments.find((d) => d.id === id)?.name ?? id,
        input: { ...blank, level: "department" as const, departmentId: id, teamId: null },
      }));
    case "team":
      return scope.teamIds.map((id) => {
        const t = db.teams.find((x) => x.id === id);
        return { key: `team:${id}`, label: t?.name ?? id, input: { ...blank, level: "team" as const, departmentId: t?.departmentId ?? null, teamId: id } };
      });
    case "employee":
      return [
        {
          key: `employee:${[...scope.employeeIds].sort().join(",")}`,
          label: `${scope.employeeIds.length} selected employees`,
          input: { ...blank, level: "employee" as const, departmentId: null, teamId: null, employeeIds: scope.employeeIds },
        },
      ];
  }
}

const MARKER = /\[scope:([^\]]+)\]/;
const markerOf = (a: Assignment) => MARKER.exec(a.notes)?.[1] ?? null;

/**
 * Make the process's active scope-managed assignments match its "applied for" scope:
 * creates what's missing and deactivates what was removed.
 *
 * Employees who already have an active *manual* assignment of this process are never
 * assigned a second time (that would double-count their tasks), and manual
 * assignments themselves are never modified.
 */
export async function syncScopeAssignments(processId: string): Promise<ScopeSyncResult> {
  const db = getDb();
  const process = db.processes.find((p) => p.id === processId);
  if (!process) throw new RepositoryError("Process not found.");
  const err = validateScope(process.scope, db);
  if (err) throw new RepositoryError(err);

  const active = db.assignments.filter((a) => a.processId === processId && a.status === "active");
  const managed = active.filter((a) => a.source === "process_scope");
  const manualCovered = new Set(active.filter((a) => a.source !== "process_scope").flatMap((a) => resolveAssignmentEmployees(a, process, db).map((e) => e.id)));

  const desired = targetsFor(process.scope, db);
  const desiredKeys = new Set(desired.map((t) => t.key));
  const existingKeys = new Set(managed.map(markerOf).filter(Boolean) as string[]);
  const result: ScopeSyncResult = { created: 0, deactivated: 0, employees: 0, warnings: [] };

  for (const a of managed) {
    const key = markerOf(a);
    if (!key || !desiredKeys.has(key)) {
      await setAssignmentStatus(a.id, "inactive");
      result.deactivated++;
    }
  }

  const base = {
    processId,
    startDate: process.effectiveDate,
    endDate: process.expiryDate,
    frequency: process.frequency,
    dueConfig: { rule: "end_of_period" as const, offsetDays: 0, graceDays: 0 },
    ownerId: process.ownerId,
    reviewerId: process.reviewerId,
    source: "process_scope" as const,
  };

  for (const t of desired) {
    if (existingKeys.has(t.key)) continue;
    const probe = { ...base, ...t.input, id: "PROBE", status: "active" as const, notes: "", createdAt: "", createdBy: "" } satisfies Assignment;
    const members = resolveAssignmentEmployees(probe, process, db);
    const remainder = members.filter((e) => !manualCovered.has(e.id));
    if (!remainder.length) {
      if (members.length) result.warnings.push(`${t.label}: already covered by existing manual assignments.`);
      else result.warnings.push(`${t.label}: no active employees.`);
      continue;
    }
    // Whole target is free → assign at the target's own level; otherwise only the uncovered employees.
    const input: AssignmentInput =
      remainder.length === members.length
        ? { ...base, ...t.input, notes: `[scope:${t.key}] Managed by "Applied for" settings of ${process.id}.` }
        : {
            ...base,
            level: "employee",
            departmentId: null,
            teamId: null,
            bandId: null,
            employeeIds: remainder.map((e) => e.id),
            notes: `[scope:${t.key}] Managed by "Applied for" settings of ${process.id} (employees not covered by manual assignments).`,
          };
    try {
      const res = await createAssignment(input);
      result.created++;
      result.employees += res.employees;
    } catch (e) {
      result.warnings.push(`${t.label}: ${e instanceof Error ? e.message : "could not be assigned"}`);
    }
  }
  return result;
}

/**
 * Save the "Process applied for" settings and (for active processes) sync assignments
 * so the covered employees start receiving tasks.
 */
export async function applyProcessScope(processId: string, scope: ProcessScope): Promise<ScopeSyncResult & { saved: true; synced: boolean }> {
  await latency(250);
  const db = getDb();
  const process = db.processes.find((p) => p.id === processId);
  if (!process) throw new RepositoryError("Process not found.");
  const clean = normalizeScope(scope, db);
  const err = validateScope(clean, db);
  if (err) throw new RepositoryError(err);
  const covered = resolveScopeEmployees(clean, db, process).length;
  if (!covered) throw new RepositoryError("No active employees match this selection.");

  await updateProcess(processId, { scope: clean }, `Applied for: ${describeScope(clean, db, 50)} (${covered} employees).`);
  if (process.status !== "active") return { saved: true, synced: false, created: 0, deactivated: 0, employees: covered, warnings: [] };
  const sync = await syncScopeAssignments(processId);
  return { saved: true, synced: true, ...sync };
}
