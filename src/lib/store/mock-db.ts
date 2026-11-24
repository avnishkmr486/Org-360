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

const STORAGE_KEY = "org360:db";
const isBrowser = typeof window !== "undefined";

/** Reference "today" for the session. */
export const TODAY: ISODate = todayISO();

interface PersistedState {
  schemaVersion: number;
  seedDate: ISODate;
  tables: Omit<Database, "tasks">;
  changedTasks: ComplianceTask[];
  removedTaskIds: string[];
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

function load(): Database {
  if (!isBrowser) return getSeed(TODAY);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as PersistedState;
      if (saved.schemaVersion === SCHEMA_VERSION && saved.seedDate) {
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
        // Employees added before accounts existed get theirs now.
        return { ...db, users: ensureAccounts(db) };
      }
    }
  } catch (err) {
    console.warn("[org360] Could not restore saved demo data; using fresh seed.", err);
  }
  return getSeed(TODAY);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (!isBrowser) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
}

function persistNow() {
  if (!current) return;
  const { tasks, ...tables } = current;
  const present = new Set<string>();
  const changedTasks: ComplianceTask[] = [];
  for (const t of tasks) {
    present.add(t.id);
    if (seedTaskIndex.get(t.id) !== t) changedTasks.push(t);
  }
  const removedTaskIds = [...seedTaskIndex.keys()].filter((id) => !present.has(id));
  const state: PersistedState = { schemaVersion: SCHEMA_VERSION, seedDate, tables, changedTasks, removedTaskIds };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[org360] Demo data could not be saved to this browser (storage full or blocked).", err);
  }
}

function emit() {
  for (const l of listeners) l();
}

export function getDb(): Database {
  if (!current) current = load();
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
  emit();
  schedulePersist();
  return current;
}

/** Discard all demo changes and restore the original seed. */
export function resetDb(): void {
  if (isBrowser) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  current = getSeed(TODAY);
  emit();
}
