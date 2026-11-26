/**
 * Mock database store — the temporary stand-in for Supabase.
 *
 * - Holds the whole Database in memory with immutable updates.
 * - Notifies subscribers (React binds via useSyncExternalStore).
 * - Optional browser persistence lives ONLY here. Because the seed is
 *   deterministic, we persist the small tables in full and only the
 *   compliance tasks that differ from the seed (a delta), keeping
 *   localStorage well under quota.
 *
 * Replacing this file + lib/repositories with Supabase calls is the
 * planned migration path; business logic in lib/calculations is untouched.
 */
import type { ComplianceTask, Database, ISODate } from "@/types";
import { ensureAccounts } from "@/lib/auth/accounts";
import { buildSeedDatabase, SCHEMA_VERSION } from "@/lib/mock-data";
import { todayISO } from "@/lib/utils/dates";
import { pullState, pushState, remoteEnabled } from "./remote";

const STORAGE_KEY = "org360:db";
/** Set while this browser holds changes the shared copy has not received yet. */
const DIRTY_KEY = "org360:dirty";
const isDirty = () => {
  try {
    return window.localStorage.getItem(DIRTY_KEY) === "1";
  } catch {
    return false;
  }
};
const setDirty = (on: boolean) => {
  try {
    if (on) window.localStorage.setItem(DIRTY_KEY, "1");
    else window.localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ignore */
  }
};
const isBrowser = typeof window !== "undefined";

/** Reference "today" for the session. */
export const TODAY: ISODate = todayISO();

interface PersistedState {
  schemaVersion: number;
  seedDate: ISODate;
  tables: Omit<Database, "tasks">;
  changedTasks: ComplianceTask[];
  removedTaskIds: string[];
  /** Set once the Back Office products and clients have been merged into this saved copy. */
  ecoBackOfficeSeeded?: boolean;
}

let seedDb: Database | null = null;
let seedDate: ISODate = TODAY;
let seedTaskIndex = new Map<string, ComplianceTask>();
let current: Database | null = null;
const listeners = new Set<() => void>();

function getSeed(date: ISODate): Database {
  if (!seedDb || seedDate !== date) {
    seedDb = buildSeedDatabase(date);
    seedDate = date;
    seedTaskIndex = new Map(seedDb.tasks.map((t) => [t.id, t]));
  }
  return seedDb;
}

/** Snapshot used during SSR and hydration — always the pristine seed for today. */
let serverSnapshot: Database | null = null;
export function getServerSnapshot(): Database {
  if (!serverSnapshot) serverSnapshot = getSeed(TODAY);
  return serverSnapshot;
}

/** Adds the seeded Back Office products/clients (and their links) that a saved copy doesn't have yet. Existing records are never changed. */
function withBackOfficeSeed(db: Database, seed: Database): Database {
  const isNew = (id: string) => id === "ECO-003" || /^ECO-00[3-6]$/.test(id) || /^ECO-1(1\d|2[0-7])$/.test(id);
  const taken = new Set(db.ecoEntities.map((e) => `${e.typeId}|${e.name.toLowerCase()}`));
  const have = new Set(db.ecoEntities.map((e) => e.id));
  const add = seed.ecoEntities.filter((e) => isNew(e.id) && !have.has(e.id) && !taken.has(`${e.typeId}|${e.name.toLowerCase()}`));
  if (!add.length) return db;
  const types = new Set(db.ecoTypes.map((t) => t.id));
  const ecoTypes = [...db.ecoTypes, ...seed.ecoTypes.filter((t) => !types.has(t.id) && add.some((e) => e.typeId === t.id))];
  const ids = new Set([...have, ...add.map((e) => e.id)]);
  const relIds = new Set(db.ecoRelations.map((r) => r.id));
  const addIds = new Set(add.map((e) => e.id));
  const rel = seed.ecoRelations.filter((r) => (addIds.has(r.fromId) || addIds.has(r.toId)) && ids.has(r.fromId) && ids.has(r.toId) && !relIds.has(r.id));
  return { ...db, ecoTypes, ecoEntities: [...db.ecoEntities, ...add], ecoRelations: [...db.ecoRelations, ...rel] };
}

/** Rebuild the database from a saved state; null when it was saved by an incompatible version. */
function restore(saved: PersistedState): Database | null {
  {
    {
      // Saved data from an older build is kept and migrated (tables it lacks start from the seed). Only data from a newer build is refused.
      if (typeof saved.schemaVersion === "number" && saved.schemaVersion <= SCHEMA_VERSION && saved.seedDate && saved.tables) {
        const seed = getSeed(saved.seedDate);
        const removed = new Set(saved.removedTaskIds);
        const changed = new Map(saved.changedTasks.map((t) => [t.id, t]));
        const tasks: ComplianceTask[] = [];
        for (const t of seed.tasks) {
          if (removed.has(t.id)) continue;
          tasks.push(changed.get(t.id) ?? t);
          changed.delete(t.id);
        }
        for (const t of changed.values()) tasks.push(t);
        // Tables added after this browser saved its data (e.g. the ecosystem) start from the seed.
        const { tasks: _seedTasks, ...seedTables } = seed;
        void _seedTasks;
        let db = { ...seedTables, ...saved.tables, tasks } as Database;
        // Designations saved before role profiles existed pick up the seeded summary and responsibilities.
        const seedDes = new Map(seed.designations.map((d) => [d.id, d]));
        if (db.designations.some((d) => d.summary === undefined)) {
          db = {
            ...db,
            designations: db.designations.map((d) => {
              const s = seedDes.get(d.id);
              return d.summary === undefined && s && s.name === d.name ? { ...d, summary: s.summary, responsibilities: s.responsibilities } : d;
            }),
          };
        }
        // Designations arrived later: existing employees pick up their seeded designation once.
        if (!(saved.tables as Partial<Database>).designations) {
          const seeded = new Map(seed.employees.map((e) => [e.id, e.designationId ?? null]));
          db = { ...db, employees: db.employees.map((e) => (e.designationId === undefined ? { ...e, designationId: seeded.get(e.id) ?? null } : e)) };
        }
        // The Back Office products and clients are added once to existing saved data — nothing already there is touched.
        if (!saved.ecoBackOfficeSeeded) db = withBackOfficeSeed(db, seed);
        // Employees added before accounts existed get theirs now.
        return { ...db, users: ensureAccounts(db) };
      }
    }
  }
  return null;
}

function load(): Database {
  if (!isBrowser) return getSeed(TODAY);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const restored = restore(JSON.parse(raw) as PersistedState);
      if (restored) return restored;
      saveBackup(raw, "Saved data this version could not read");
    }
  } catch (err) {
    console.warn("[org360] Could not restore saved demo data; using fresh seed.", err);
  }
  return getSeed(TODAY);
}

/* ---- Safety copies ------------------------------------------------------------------------ */
// Whatever is about to be replaced is copied first, so a bad reset, version change or sync can always be undone.
const BACKUP_INDEX = "org360:backups";
const BACKUP_PREFIX = "org360:backup:";
const BACKUP_MAX = 6;
const AUTO_BACKUP_EVERY_MS = 30 * 60 * 1000;

export interface BackupInfo {
  key: string;
  at: string;
  reason: string;
  employees: number;
  bytes: number;
}

function readIndex(): BackupInfo[] {
  try {
    return JSON.parse(window.localStorage.getItem(BACKUP_INDEX) ?? "[]") as BackupInfo[];
  } catch {
    return [];
  }
}

function employeesIn(raw: string): number {
  try {
    return ((JSON.parse(raw) as PersistedState).tables?.employees ?? []).length;
  } catch {
    return 0;
  }
}

/** Keep a copy of `raw` (a saved state). Skips exact repeats; the copy with the most employees is never pruned. */
function saveBackup(raw: string | null, reason: string) {
  if (!isBrowser || !raw) return;
  try {
    const index = readIndex();
    const last = index[0];
    if (last && window.localStorage.getItem(last.key) === raw) return;
    const info: BackupInfo = { key: `${BACKUP_PREFIX}${Date.now()}`, at: new Date().toISOString(), reason, employees: employeesIn(raw), bytes: raw.length };
    window.localStorage.setItem(info.key, raw);
    let next = [info, ...index];
    while (next.length > BACKUP_MAX) {
      const richest = next.reduce((a, b) => (b.employees > a.employees ? b : a));
      const drop = [...next].reverse().find((b) => b.key !== richest.key && b !== info)!;
      window.localStorage.removeItem(drop.key);
      next = next.filter((b) => b.key !== drop.key);
    }
    window.localStorage.setItem(BACKUP_INDEX, JSON.stringify(next));
  } catch (err) {
    console.warn("[org360] Could not keep a safety copy (storage full?).", err);
  }
}

let lastAutoBackup = 0;
function autoBackup() {
  if (Date.now() - lastAutoBackup < AUTO_BACKUP_EVERY_MS) return;
  lastAutoBackup = Date.now();
  try {
    saveBackup(window.localStorage.getItem(STORAGE_KEY), "Automatic");
  } catch {
    /* ignore */
  }
}

export function listBackups(): BackupInfo[] {
  return isBrowser ? readIndex() : [];
}

/** The data as a JSON string, for downloading. */
export function exportBackupJson(): string {
  return JSON.stringify(snapshotState() ?? {}, null, 1);
}

function applyRaw(raw: string, label: string) {
  let saved: PersistedState;
  try {
    saved = JSON.parse(raw) as PersistedState;
  } catch {
    throw new Error("That file isn't a valid backup.");
  }
  if (!saved?.tables || !Array.isArray(saved.tables.employees) || typeof saved.schemaVersion !== "number") throw new Error("That file isn't an Organization 360 backup.");
  const db = restore(saved);
  if (!db) throw new Error("That backup was made by a newer version of the app.");
  saveBackup(window.localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(snapshotState()), `Before restoring ${label}`);
  current = db;
  edited = true;
  emit();
  persistNow();
}

/** Replace everything with the contents of a backup file. Throws a readable error when the file is wrong. */
export function restoreFromJson(text: string) {
  applyRaw(text, "a file");
}

export function restoreBackup(key: string) {
  const raw = window.localStorage.getItem(key);
  if (!raw) throw new Error("That safety copy is no longer available.");
  applyRaw(raw, "a safety copy");
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (!isBrowser) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

function snapshotState(): PersistedState | null {
  if (!current) return null;
  const { tasks, ...tables } = current;
  const present = new Set<string>();
  const changedTasks: ComplianceTask[] = [];
  for (const t of tasks) {
    present.add(t.id);
    if (seedTaskIndex.get(t.id) !== t) changedTasks.push(t);
  }
  const removedTaskIds = [...seedTaskIndex.keys()].filter((id) => !present.has(id));
  return { schemaVersion: SCHEMA_VERSION, seedDate, tables, changedTasks, removedTaskIds, ecoBackOfficeSeeded: true };
}

function persistNow() {
  if (!isBrowser) return;
  const state = snapshotState();
  if (!state) return;
  autoBackup();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[org360] Demo data could not be saved to this browser (storage full or blocked).", err);
  }
  if (remoteEnabled) setDirty(true);
  scheduleRemotePush();
}

/* ---- Shared copy in Supabase -------------------------------------------------------------- */
// Nothing is pushed until the first pull has finished, so a fresh browser can never overwrite the shared data with the seed.
let remoteReady = false;
let edited = false;
let remoteTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRemotePush() {
  if (!remoteEnabled || !remoteReady) return;
  if (remoteTimer) clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => {
    const state = snapshotState();
    if (state) {
      pushState(state)
        .then(() => {
          // Only clear the flag if nothing changed while the save was in flight.
          if (!remoteTimer) setDirty(false);
        })
        .catch((err) => console.warn("[org360] Could not save to Supabase.", err));
    }
    remoteTimer = null;
  }, 1200);
}

let pulled = false;
/** Load the shared copy once per page load: it replaces this browser's data, unless the user already edited something. */
function pullRemote() {
  if (!isBrowser || !remoteEnabled || pulled) return;
  pulled = true;
  pullState<PersistedState>()
    .then((saved) => {
      // Unsent local changes (e.g. the page reloaded right after adding something) win over the shared copy and are sent on.
      const keepLocal = isDirty();
      if (saved) {
        saveBackup(JSON.stringify(saved), "Shared copy");
        try {
          saveBackup(window.localStorage.getItem(STORAGE_KEY), "This browser before syncing");
        } catch {
          /* ignore */
        }
      }
      if (saved && !edited && !keepLocal) {
        const db = restore(saved);
        if (db) {
          current = db;
          emit();
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
          } catch {
            /* ignore */
          }
        }
      }
      remoteReady = true;
      // First ever run against this project (or an incompatible saved version): publish what we have.
      // A shared copy this build cannot read (made by a newer version) is left alone; it is never overwritten.
      const unreadable = Boolean(saved) && !restore(saved as PersistedState);
      if (unreadable) {
        remoteReady = false;
        console.warn("[org360] The shared copy was saved by a newer version; this browser will not overwrite it.");
      } else if (!saved || edited || keepLocal) scheduleRemotePush();
    })
    .catch((err) => console.warn("[org360] Supabase unavailable; working on this browser's copy.", err));
}

function emit() {
  for (const l of listeners) l();
}

export function getDb(): Database {
  if (!current) {
    current = load();
    if (isBrowser) {
      setTimeout(pullRemote, 0);
      // A navigation that reloads the page must not lose a change still waiting for its delayed save.
      window.addEventListener("pagehide", () => {
        if (persistTimer) {
          clearTimeout(persistTimer);
          persistNow();
        }
      });
    }
  }
  return current;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply an immutable update. The recipe returns only the tables it replaced. */
export function updateDb(recipe: (db: Database) => Partial<Database>): Database {
  const prev = getDb();
  const patch = recipe(prev);
  current = { ...prev, ...patch };
  edited = true;
  emit();
  schedulePersist();
  return current;
}

/** Discard all demo changes and restore the original seed. */
export function resetDb(): void {
  if (isBrowser) {
    try {
      saveBackup(window.localStorage.getItem(STORAGE_KEY), "Before reset");
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  current = getSeed(TODAY);
  edited = true;
  emit();
  // The shared copy goes back to the seed too, otherwise the next page load would bring the old data back.
  persistNow();
}
