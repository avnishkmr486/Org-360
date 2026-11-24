/**
 * Day-to-day management of a process: the KPIs its owner defines, the items it tracks
 * (e.g. designs) with owner / ETA / KPI values, and its action list.
 * These edits do not create a new process version; they are recorded in the audit log.
 */
import type { ISODate, ItemEvent, Process, ProcessActionItem, ProcessActionStatus, ProcessKpi, TrackedItem, TrackedItemStatus } from "@/types";
import { processAccess } from "@/lib/auth/process-access";
import { uid } from "@/lib/utils/random";
import { auditEntry, currentActor, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";

const NO_ACCESS = "You don't have permission to do this on this process.";

function context(processId: string) {
  const db = getDb();
  const p = db.processes.find((x) => x.id === processId);
  if (!p) throw new RepositoryError("Process not found.");
  const actor = currentActor(db);
  return { p, actor, access: processAccess(db, actor.role, actor.employeeId, p) };
}

/** Apply `change` to one process and log it. */
function mutate(processId: string, action: string, description: string, change: (p: Process) => Partial<Process>) {
  write((d) => {
    const processes = replaceById(d.processes, processId, (p) => ({ ...p, ...change(p), updatedAt: nowIso() }));
    const name = d.processes.find((p) => p.id === processId)?.name ?? processId;
    return { patch: { processes }, audit: [auditEntry(d, "Processes", action, processId, name, description)] };
  });
}

/* ---------------------------------- KPIs ---------------------------------- */

export type KpiInput = Omit<ProcessKpi, "id"> & { id?: string };

export async function setItemLabel(processId: string, label: string): Promise<void> {
  await latency(150);
  const { access } = context(processId);
  if (!access.manage) throw new RepositoryError(NO_ACCESS);
  const itemLabel = label.trim() || "Item";
  mutate(processId, "Tracking Updated", `Process now tracks "${itemLabel}" items.`, () => ({ itemLabel }));
}

export async function saveKpi(processId: string, input: KpiInput): Promise<void> {
  await latency(200);
  const { p, access } = context(processId);
  if (!access.manage) throw new RepositoryError(NO_ACCESS);
  const name = input.name.trim();
  if (!name) throw new RepositoryError("Give the KPI a name.");
  const kpis = p.kpis ?? [];
  if (kpis.some((k) => k.id !== input.id && k.name.toLowerCase() === name.toLowerCase())) throw new RepositoryError(`A KPI named "${name}" already exists.`);
  if ((input.type === "number" || input.type === "percent") && input.target.trim() && Number.isNaN(Number(input.target))) throw new RepositoryError("Target must be a number.");
  const kpi: ProcessKpi = { id: input.id ?? uid("KPI"), name, type: input.type, target: input.target.trim(), unit: input.unit.trim(), description: input.description.trim() };
  mutate(processId, "KPI Saved", `KPI "${name}" ${input.id ? "updated" : "added"}.`, (x) => ({ kpis: input.id ? (x.kpis ?? []).map((k) => (k.id === kpi.id ? kpi : k)) : [...(x.kpis ?? []), kpi] }));
}

export async function removeKpi(processId: string, kpiId: string): Promise<void> {
  await latency(200);
  const { p, access } = context(processId);
  if (!access.manage) throw new RepositoryError(NO_ACCESS);
  const kpi = (p.kpis ?? []).find((k) => k.id === kpiId);
  if (!kpi) return;
  mutate(processId, "KPI Removed", `KPI "${kpi.name}" removed.`, (x) => ({
    kpis: (x.kpis ?? []).filter((k) => k.id !== kpiId),
    items: (x.items ?? []).map((i) => {
      const { [kpiId]: _gone, ...values } = i.values;
      void _gone;
      return { ...i, values };
    }),
  }));
}

/* ----------------------------------- Items ---------------------------------- */

export interface ItemInput {
  id?: string;
  title: string;
  section: string;
  details: string;
  ownerId: string | null;
  eta: ISODate | null;
  status: TrackedItemStatus;
  values: Record<string, string>;
  note?: string;
}

/** Fields that can be changed one at a time (inline edits). KPI `values` are merged by KPI id; "" clears one. */
export interface ItemPatch {
  status?: TrackedItemStatus;
  eta?: ISODate | null;
  ownerId?: string | null;
  note?: string;
  values?: Record<string, string>;
}

const canEditItem = (item: TrackedItem, manage: boolean, employeeId: string | null) => manage || (!!employeeId && (item.ownerId === employeeId || item.createdById === employeeId));

const STATUS_NAME: Record<TrackedItemStatus, string> = { not_started: "Not started", in_progress: "In progress", blocked: "Blocked", done: "Done" };

/** Return `next` with the changes since `prev` written to its history (the history feeds the item score). */
function withHistory(prev: TrackedItem, next: TrackedItem, kpis: ProcessKpi[], by: string, at: string): TrackedItem {
  const events: ItemEvent[] = [];
  const add = (kind: ItemEvent["kind"], text: string, from?: string, to?: string) => events.push({ at, by, kind, text, from, to });
  if (prev.status !== next.status) add("status", `Status: ${STATUS_NAME[prev.status]} → ${STATUS_NAME[next.status]}`, prev.status, next.status);
  if ((prev.eta ?? "") !== (next.eta ?? "")) add("eta", `ETA: ${prev.eta ?? "none"} → ${next.eta ?? "none"}`, prev.eta ?? "", next.eta ?? "");
  if (prev.ownerId !== next.ownerId) add("owner", "Owner changed", prev.ownerId ?? "", next.ownerId ?? "");
  for (const k of kpis) {
    const was = prev.values[k.id] ?? "";
    const now = next.values[k.id] ?? "";
    if (was !== now) add("kpi", `${k.name}: ${was || "—"} → ${now || "—"}`);
  }
  if ((prev.note ?? "") !== (next.note ?? "")) add("note", next.note ? `Note: ${next.note.length > 80 ? `${next.note.slice(0, 80)}…` : next.note}` : "Note cleared");
  return { ...next, history: [...(prev.history ?? []), ...events], updatedAt: events.length ? at : prev.updatedAt };
}

const cleanValues = (kpis: ProcessKpi[], values: Record<string, string>) => {
  const known = new Set(kpis.map((k) => k.id));
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => known.has(k) && v !== ""));
};

export async function saveItem(processId: string, input: ItemInput): Promise<void> {
  await latency(250);
  const { p, actor, access } = context(processId);
  if (!access.contribute) throw new RepositoryError(NO_ACCESS);
  const title = input.title.trim();
  if (!title) throw new RepositoryError("Give it a title.");
  const label = p.itemLabel || "Item";
  const ts = nowIso();
  const kpis = p.kpis ?? [];
  const values = cleanValues(kpis, input.values);
  if (input.id) {
    const prev = (p.items ?? []).find((i) => i.id === input.id);
    if (!prev) throw new RepositoryError(`${label} not found.`);
    if (!canEditItem(prev, access.manage, actor.employeeId)) throw new RepositoryError(`You can only edit ${label.toLowerCase()}s you own or created.`);
    const next: TrackedItem = { ...prev, title, section: input.section.trim(), details: input.details.trim(), ownerId: input.ownerId, eta: input.eta, status: input.status, values, note: input.note ?? prev.note ?? "" };
    mutate(processId, "Item Updated", `${label} "${title}" updated.`, (x) => ({ items: (x.items ?? []).map((i) => (i.id === input.id ? withHistory(prev, next, kpis, actor.name, ts) : i)) }));
    return;
  }
  const item: TrackedItem = {
    id: uid("ITM"),
    title,
    section: input.section.trim(),
    details: input.details.trim(),
    // Contributors who leave the owner blank own what they add.
    ownerId: input.ownerId ?? actor.employeeId,
    eta: input.eta,
    status: input.status,
    values,
    note: (input.note ?? "").trim(),
    history: [{ at: ts, by: actor.name, kind: "created", text: `${label} added` }],
    createdById: actor.employeeId,
    createdBy: actor.name,
    createdAt: ts,
    updatedAt: ts,
  };
  mutate(processId, "Item Added", `${label} "${title}" added.`, (x) => ({ items: [...(x.items ?? []), item] }));
}

/** Inline edit: change status, ETA, owner, note or some KPI values of one item. Same permission as editing it. */
export async function updateItem(processId: string, itemId: string, patch: ItemPatch): Promise<void> {
  await latency(120);
  const { p, actor, access } = context(processId);
  const label = p.itemLabel || "Item";
  const prev = (p.items ?? []).find((i) => i.id === itemId);
  if (!prev) throw new RepositoryError(`${label} not found.`);
  if (!canEditItem(prev, access.manage, actor.employeeId)) throw new RepositoryError(`You can only update ${label.toLowerCase()}s you own or created.`);
  const kpis = p.kpis ?? [];
  const next: TrackedItem = {
    ...prev,
    status: patch.status ?? prev.status,
    eta: patch.eta === undefined ? prev.eta : patch.eta,
    ownerId: patch.ownerId === undefined ? prev.ownerId : patch.ownerId,
    note: patch.note === undefined ? prev.note : patch.note.trim(),
    values: patch.values ? cleanValues(kpis, { ...prev.values, ...patch.values }) : prev.values,
  };
  const ts = nowIso();
  const changed = withHistory(prev, next, kpis, actor.name, ts);
  if ((changed.history?.length ?? 0) === (prev.history?.length ?? 0)) return; // nothing actually changed
  mutate(processId, "Item Updated", `${label} "${prev.title}" updated.`, (x) => ({ items: (x.items ?? []).map((i) => (i.id === itemId ? changed : i)) }));
}

export async function removeItem(processId: string, itemId: string): Promise<void> {
  await latency(200);
  const { p, actor, access } = context(processId);
  const item = (p.items ?? []).find((i) => i.id === itemId);
  if (!item) return;
  if (!canEditItem(item, access.manage, actor.employeeId)) throw new RepositoryError(NO_ACCESS);
  mutate(processId, "Item Removed", `${p.itemLabel || "Item"} "${item.title}" removed.`, (x) => ({ items: (x.items ?? []).filter((i) => i.id !== itemId) }));
}

/* ------------------------------- Action items ------------------------------- */

export interface ActionInput {
  id?: string;
  title: string;
  notes: string;
  ownerId: string | null;
  eta: ISODate | null;
  status: ProcessActionStatus;
}

export async function saveAction(processId: string, input: ActionInput): Promise<void> {
  await latency(200);
  const { actor, access } = context(processId);
  if (!access.manage) throw new RepositoryError(NO_ACCESS);
  const title = input.title.trim();
  if (!title) throw new RepositoryError("Describe the action.");
  const ts = nowIso();
  if (input.id) {
    mutate(processId, "Action Updated", `Action "${title}" updated.`, (x) => ({
      actions: (x.actions ?? []).map((a) => (a.id === input.id ? { ...a, title, notes: input.notes.trim(), ownerId: input.ownerId, eta: input.eta, status: input.status, completedAt: input.status === "done" ? (a.completedAt ?? ts) : null } : a)),
    }));
    return;
  }
  const action: ProcessActionItem = { id: uid("ACT"), title, notes: input.notes.trim(), ownerId: input.ownerId, eta: input.eta, status: input.status, createdBy: actor.name, createdAt: ts, completedAt: input.status === "done" ? ts : null };
  mutate(processId, "Action Added", `Action "${title}" added.`, (x) => ({ actions: [...(x.actions ?? []), action] }));
}

/** Managers and the action's owner can move it along. */
export async function setActionStatus(processId: string, actionId: string, status: ProcessActionStatus): Promise<void> {
  await latency(150);
  const { p, actor, access } = context(processId);
  const action = (p.actions ?? []).find((a) => a.id === actionId);
  if (!action) return;
  if (!access.manage && !(actor.employeeId && action.ownerId === actor.employeeId)) throw new RepositoryError(NO_ACCESS);
  mutate(processId, "Action Updated", `Action "${action.title}" marked ${status.replace("_", " ")}.`, (x) => ({
    actions: (x.actions ?? []).map((a) => (a.id === actionId ? { ...a, status, completedAt: status === "done" ? nowIso() : null } : a)),
  }));
}

export async function removeAction(processId: string, actionId: string): Promise<void> {
  await latency(150);
  const { p, access } = context(processId);
  if (!access.manage) throw new RepositoryError(NO_ACCESS);
  const action = (p.actions ?? []).find((a) => a.id === actionId);
  if (!action) return;
  mutate(processId, "Action Removed", `Action "${action.title}" removed.`, (x) => ({ actions: (x.actions ?? []).filter((a) => a.id !== actionId) }));
}
