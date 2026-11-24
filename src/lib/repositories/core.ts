/**
 * Shared repository plumbing. Repositories are async on purpose: their
 * signatures match what a Supabase-backed implementation will return,
 * so UI code (await + loading states) does not change at migration time.
 */
import type { AppRole, AuditLog, AuditModule, Database } from "@/types";
import { getDb, updateDb } from "@/lib/store/mock-db";
import { getUiState } from "@/lib/store/ui-store";
import { uid } from "@/lib/utils/random";

/** Simulated network latency so loading/saving states are visible. */
export const latency = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms));

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export interface Actor {
  name: string;
  role: AppRole;
  employeeId: string | null;
}

export function currentActor(db: Database = getDb()): Actor {
  const user = db.users.find((u) => u.id === getUiState().currentUserId) ?? db.users[0];
  return { name: user?.name ?? "System", role: user?.role ?? "super_admin", employeeId: user?.employeeId ?? null };
}

export function auditEntry(
  db: Database,
  module: AuditModule,
  action: string,
  recordId: string,
  recordLabel: string,
  description: string,
): AuditLog {
  const actor = currentActor(db);
  return {
    id: uid("AUD"),
    timestamp: nowIso(),
    userName: actor.name,
    userRole: actor.role,
    module,
    action,
    recordId,
    recordLabel,
    description,
  };
}

/** Apply a write and append audit entries in one atomic store update. */
export function write(recipe: (db: Database) => { patch: Partial<Database>; audit?: AuditLog[] }): void {
  updateDb((db) => {
    const { patch, audit } = recipe(db);
    return audit?.length ? { ...patch, auditLogs: [...audit, ...(patch.auditLogs ?? db.auditLogs)] } : patch;
  });
}

export function replaceById<T extends { id: string }>(items: readonly T[], id: string, next: (item: T) => T): T[] {
  let found = false;
  const out = items.map((i) => {
    if (i.id !== id) return i;
    found = true;
    return next(i);
  });
  if (!found) throw new RepositoryError(`Record ${id} was not found.`);
  return out;
}

export { getDb };
