/** Notifications, master data, users, settings and audit repositories. */
import type {
  AppNotification,
  AppRole,
  AppSettings,
  AppUser,
  AuditLog,
  Band,
  Database,
  Designation,
  FrequencyDefinition,
  GridColumn,
  HubTile,
  ProcessCategory,
  RecordStatus,
} from "@/types";
import { can } from "@/lib/auth/permissions";
import { auditEntry, currentActor, getDb, latency, nowIso, replaceById, RepositoryError, write } from "./core";
import { resetDb } from "@/lib/store/mock-db";
import { uid } from "@/lib/utils/random";

/* ----------------------------- Notifications ---------------------------- */

export function notificationsFor(db: Pick<Database, "notifications">, role: AppRole, employeeId: string | null): AppNotification[] {
  const admin = role === "super_admin" || role === "administrator" || role === "senior_management";
  return db.notifications.filter((n) => {
    if (n.audienceRoles.length && !n.audienceRoles.includes(role)) return false;
    if (n.recipientEmployeeId && !admin && n.recipientEmployeeId !== employeeId) {
      // Managers still see team-member alerts for overdue items.
      return role !== "employee" && n.type === "overdue";
    }
    return true;
  });
}

export async function getNotifications(): Promise<AppNotification[]> {
  await latency(60);
  return getDb().notifications;
}

export async function markNotificationRead(id: string, read = true): Promise<void> {
  write((d) => ({ patch: { notifications: replaceById(d.notifications, id, (n) => ({ ...n, read })) } }));
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  const set = new Set(ids);
  write((d) => ({ patch: { notifications: d.notifications.map((n) => (set.has(n.id) ? { ...n, read: true } : n)) } }));
}

export async function createNotification(n: Omit<AppNotification, "id" | "createdAt" | "read">): Promise<void> {
  write((d) => ({ patch: { notifications: [{ ...n, id: uid("NTF"), createdAt: nowIso(), read: false }, ...d.notifications] } }));
}

/* ------------------------------ Master data ----------------------------- */

export interface MasterTables {
  bands: Band;
  processCategories: ProcessCategory;
  designations: Designation;
  frequencies: FrequencyDefinition;
}
export type MasterTable = keyof MasterTables;

const MASTER_PREFIX: Record<MasterTable, string> = {
  bands: "BAND",
  processCategories: "CAT",
  designations: "DES",
  frequencies: "FRQ",
};

export const MASTER_LABELS: Record<MasterTable, string> = {
  bands: "Employee Band",
  processCategories: "Process Category",
  designations: "Designation",
  frequencies: "Process Frequency",
};

export async function upsertMasterRecord<T extends MasterTable>(table: T, record: Omit<MasterTables[T], "id"> & { id?: string }): Promise<MasterTables[T]> {
  await latency();
  let saved: MasterTables[T] | undefined;
  write((d) => {
    const items = d[table] as unknown as MasterTables[T][];
    const name = (record as { name: string }).name.trim();
    if (!name) throw new RepositoryError("Name is required.");
    if (items.some((i) => i.id !== record.id && (i as { name: string }).name.toLowerCase() === name.toLowerCase())) {
      throw new RepositoryError(`${MASTER_LABELS[table]} "${name}" already exists.`);
    }
    let next: MasterTables[T][];
    if (record.id && items.some((i) => i.id === record.id)) {
      next = items.map((i) => (i.id === record.id ? (saved = { ...i, ...record, name } as MasterTables[T]) : i));
    } else {
      if (table === "frequencies") throw new RepositoryError("Frequencies are system-defined; edit or deactivate existing ones.");
      const max = items.reduce((m, i) => Math.max(m, Number(i.id.replace(/\D/g, "")) || 0), 0);
      saved = { ...record, name, id: `${MASTER_PREFIX[table]}-${String(max + 1).padStart(2, "0")}` } as MasterTables[T];
      next = [...items, saved];
    }
    return {
      patch: { [table]: next } as Partial<Database>,
      audit: [auditEntry(d, "Master Data", record.id ? "Updated" : "Created", saved!.id, name, `${MASTER_LABELS[table]} ${record.id ? "updated" : "created"}.`)],
    };
  });
  return saved!;
}

export async function setMasterStatus(table: MasterTable, id: string, status: RecordStatus): Promise<void> {
  await latency();
  write((d) => {
    const items = d[table] as unknown as { id: string; name: string; status: RecordStatus }[];
    const next = replaceById(items, id, (i) => ({ ...i, status }));
    const name = items.find((i) => i.id === id)?.name ?? id;
    return { patch: { [table]: next } as Partial<Database>, audit: [auditEntry(d, "Master Data", status === "inactive" ? "Deactivated" : "Activated", id, name, `${MASTER_LABELS[table]} ${status === "inactive" ? "deactivated" : "activated"}.`)] };
  });
}

/* --------------------------------- Users -------------------------------- */

export type UserInput = Pick<AppUser, "name" | "email" | "role" | "employeeId" | "status">;

export async function getUsers(): Promise<AppUser[]> {
  await latency(60);
  return getDb().users;
}

export async function createUser(input: UserInput): Promise<AppUser> {
  await latency();
  const db = getDb();
  if (input.email && db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw new RepositoryError("A user with this email already exists.");
  const max = db.users.reduce((m, u) => Math.max(m, Number(u.id.replace(/\D/g, "")) || 0), 0);
  const user: AppUser = { ...input, id: `USR-${String(max + 1).padStart(2, "0")}`, lastActiveAt: nowIso() };
  write((d) => ({ patch: { users: [...d.users, user] }, audit: [auditEntry(d, "Users", "Created", user.id, user.name, `User created with role ${input.role}.`)] }));
  return user;
}

export async function updateUser(id: string, patch: Partial<UserInput>): Promise<void> {
  await latency();
  write((d) => {
    if (patch.email && d.users.some((u) => u.id !== id && u.email.toLowerCase() === patch.email!.toLowerCase())) throw new RepositoryError("A user with this email already exists.");
    const prev = d.users.find((u) => u.id === id);
    const users = replaceById(d.users, id, (u) => ({ ...u, ...patch }));
    const desc = patch.role && prev && patch.role !== prev.role ? `Role changed to ${patch.role}.` : patch.status ? `Status set to ${patch.status}.` : "User updated.";
    return { patch: { users }, audit: [auditEntry(d, "Users", patch.role && prev?.role !== patch.role ? "Role Changed" : "Updated", id, prev?.name ?? id, desc)] };
  });
}

/* -------------------------------- Settings ------------------------------ */

export async function getSettings(): Promise<AppSettings> {
  await latency(60);
  return getDb().settings;
}

export async function updateSettings(patch: Partial<AppSettings>, description = "Settings updated."): Promise<void> {
  await latency();
  if (patch.thresholds) {
    const { excellent, good, needsImprovement } = patch.thresholds;
    if (!(excellent > good && good > needsImprovement && needsImprovement > 0 && excellent <= 100)) {
      throw new RepositoryError("Thresholds must satisfy 100 ≥ Excellent > Good > Needs Improvement > 0.");
    }
  }
  write((d) => ({ patch: { settings: { ...d.settings, ...patch } }, audit: [auditEntry(d, "Settings", "Updated", "SETTINGS", "Application settings", description)] }));
}

/** Super Admin: replace the summary tiles ("KPIs") shown on Process Management. */
export async function saveHubTiles(tiles: HubTile[]): Promise<void> {
  await latency();
  if (!can(currentActor().role, "processes.configure_kpis")) throw new RepositoryError("Only a Super Admin can add, change or remove KPIs.");
  const seen = new Set<string>();
  for (const t of tiles) {
    if (!t.label.trim()) throw new RepositoryError("Give every KPI a name.");
    const key = t.label.trim().toLowerCase();
    if (seen.has(key)) throw new RepositoryError(`There are two KPIs named "${t.label.trim()}".`);
    seen.add(key);
  }
  write((d) => ({
    patch: { settings: { ...d.settings, hubTiles: tiles.map((t) => ({ ...t, label: t.label.trim() })) } },
    audit: [auditEntry(d, "Settings", "KPIs Updated", "HUB-TILES", "Process Management KPIs", `Process Management now shows ${tiles.length} KPI${tiles.length === 1 ? "" : "s"}.`)],
  }));
}

/** Super Admin: add or change a KPI column on a screen's table grid. */
export async function saveGridColumn(input: Omit<GridColumn, "id"> & { id?: string }): Promise<void> {
  await latency();
  if (!can(currentActor().role, "processes.configure_kpis")) throw new RepositoryError("Only a Super Admin can add, change or remove KPIs.");
  const name = input.name.trim();
  if (!name) throw new RepositoryError("Give the KPI a name.");
  write((d) => {
    const cols = d.settings.gridColumns ?? [];
    if (cols.some((c) => c.id !== input.id && c.screen === input.screen && c.name.toLowerCase() === name.toLowerCase())) throw new RepositoryError(`This screen already has a KPI column named "${name}".`);
    const col: GridColumn = { ...input, name, id: input.id ?? uid("GCOL"), target: input.target.trim(), unit: input.unit.trim(), description: input.description.trim() };
    const next = cols.some((c) => c.id === col.id) ? cols.map((c) => (c.id === col.id ? col : c)) : [...cols, col];
    return {
      patch: { settings: { ...d.settings, gridColumns: next } },
      audit: [auditEntry(d, "Settings", input.id ? "KPI Updated" : "KPI Added", col.id, name, `KPI column "${name}" ${input.id ? "changed" : "added"} on ${col.screen}.`)],
    };
  });
}

/** Super Admin: remove a grid KPI column together with every value typed into it. */
export async function removeGridColumn(id: string): Promise<void> {
  await latency();
  if (!can(currentActor().role, "processes.configure_kpis")) throw new RepositoryError("Only a Super Admin can add, change or remove KPIs.");
  write((d) => {
    const col = (d.settings.gridColumns ?? []).find((c) => c.id === id);
    const values = Object.fromEntries(Object.entries(d.settings.gridValues ?? {}).filter(([k]) => !k.startsWith(`${id}|`)));
    return {
      patch: { settings: { ...d.settings, gridColumns: (d.settings.gridColumns ?? []).filter((c) => c.id !== id), gridValues: values } },
      audit: [auditEntry(d, "Settings", "KPI Removed", id, col?.name ?? id, `KPI column "${col?.name ?? id}" removed${col ? ` from ${col.screen}` : ""}.`)],
    };
  });
}

/** Super Admin: move a grid KPI column left or right among the columns of its screen (the order everyone sees). */
export async function moveGridColumn(id: string, delta: -1 | 1): Promise<void> {
  if (!can(currentActor().role, "processes.configure_kpis")) throw new RepositoryError("Only a Super Admin can add, change or remove KPIs.");
  write((d) => {
    const all = [...(d.settings.gridColumns ?? [])];
    const col = all.find((c) => c.id === id);
    if (!col) return { patch: {} };
    const same = all.filter((c) => c.screen === col.screen);
    const j = same.findIndex((c) => c.id === id) + delta;
    if (j < 0 || j >= same.length) return { patch: {} };
    const a = all.indexOf(col);
    const b = all.indexOf(same[j]);
    [all[a], all[b]] = [all[b], all[a]];
    return { patch: { settings: { ...d.settings, gridColumns: all } } };
  });
}

/** Fill in one cell of a grid KPI column (empty clears it). */
export async function setGridValue(columnId: string, rowId: string, value: string): Promise<void> {
  if (!can(currentActor().role, "settings.manage")) throw new RepositoryError("You don't have permission to fill in KPI columns.");
  write((d) => {
    const values = { ...(d.settings.gridValues ?? {}) };
    const key = `${columnId}|${rowId}`;
    if (value.trim()) values[key] = value.trim();
    else delete values[key];
    return { patch: { settings: { ...d.settings, gridValues: values } } };
  });
}

export async function resetDemoData(): Promise<void> {
  await latency(300);
  resetDb();
}

/* ---------------------------------- Audit ------------------------------- */

export async function getAuditLogs(): Promise<AuditLog[]> {
  await latency(60);
  return getDb().auditLogs;
}
