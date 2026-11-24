/**
 * Bulk process import.
 *  - New processes are created through createProcess → Process IDs (PRC-nnn) are always auto-generated.
 *  - Existing processes are only changed for rows the user explicitly opted in to, and only the
 *    fields present in the file are touched.
 *  - Processes missing from the file are never deleted or modified.
 *  - One audit entry (module "Import", recordId "PIMP-nnnn") records the run and also powers the
 *    import-history table (no extra store table needed).
 */
import type { AuditLog } from "@/types";
import { auditEntry, getDb, latency, write } from "./core";
import { createProcess, syncScopeAssignments, updateProcess, type ProcessInput } from "./processes";
import { uid } from "@/lib/utils/random";

export interface ProcessImportRow {
  rowNumber: number;
  action: "create" | "update";
  /** Full payload (create). */
  input?: ProcessInput;
  /** Only the provided fields (update). */
  patch?: Partial<ProcessInput>;
  existingId?: string;
}

export interface ProcessImportSummary {
  id: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  createdIds: string[];
  updatedIds: string[];
  errors: { rowNumber: number; message: string }[];
  warnings: string[];
}

const PREFIX = "PIMP-";

function nextImportId(): string {
  const n = getDb().auditLogs.filter((a) => a.recordId.startsWith(PREFIX)).length + 1;
  return `${PREFIX}${String(n).padStart(4, "0")}`;
}

const reId = <T extends { steps: { id: string }[] }>(x: T): T => ({ ...x, steps: x.steps.map((s) => ({ ...s, id: uid("STP") })) });

export async function importProcesses(rows: ProcessImportRow[], meta: { fileName: string; skipped: number; failed: number }): Promise<ProcessImportSummary> {
  await latency(300);
  const summary: ProcessImportSummary = {
    id: nextImportId(),
    total: rows.length + meta.skipped + meta.failed,
    created: 0,
    updated: 0,
    skipped: meta.skipped,
    failed: meta.failed,
    createdIds: [],
    updatedIds: [],
    errors: [],
    warnings: [],
  };

  for (const row of rows) {
    try {
      if (row.action === "create" && row.input) {
        const p = await createProcess(reId(row.input));
        summary.created++;
        summary.createdIds.push(p.id);
      } else if (row.action === "update" && row.existingId && row.patch) {
        const patch = row.patch.steps ? reId(row.patch as { steps: { id: string }[] }) : row.patch;
        const p = await updateProcess(row.existingId, patch as Partial<ProcessInput>, "Updated via Excel import");
        summary.updated++;
        summary.updatedIds.push(p.id);
        if (row.patch.scope && p.status === "active") {
          await syncScopeAssignments(p.id).catch((e) => summary.warnings.push(`${p.id}: ${e instanceof Error ? e.message : "assignments could not be synced"}`));
        }
      } else {
        throw new Error("Row has no payload.");
      }
    } catch (e) {
      summary.failed++;
      summary.errors.push({ rowNumber: row.rowNumber, message: e instanceof Error ? e.message : String(e) });
    }
  }

  write((d) => ({
    patch: {},
    audit: [
      auditEntry(
        d,
        "Import",
        "Imported",
        summary.id,
        meta.fileName,
        `Process import: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed (total ${summary.total}).${summary.createdIds.length ? ` Created: ${summary.createdIds.join(", ")}.` : ""}`,
      ),
    ],
  }));
  return summary;
}

export interface ProcessImportHistoryEntry {
  id: string;
  fileName: string;
  importedAt: string;
  importedBy: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  createdIds: string[];
}

/** Parse past runs out of the audit log (most recent first). */
export function processImportHistory(logs: readonly AuditLog[]): ProcessImportHistoryEntry[] {
  return logs
    .filter((a) => a.module === "Import" && a.recordId.startsWith(PREFIX))
    .map((a) => {
      const num = (label: string) => Number(a.description.match(new RegExp(`(\\d+) ${label}`))?.[1] ?? 0);
      const created = a.description.match(/Created: ([^.]+)\./)?.[1];
      return {
        id: a.recordId,
        fileName: a.recordLabel,
        importedAt: a.timestamp,
        importedBy: a.userName,
        total: Number(a.description.match(/total (\d+)/)?.[1] ?? 0),
        created: num("created"),
        updated: num("updated"),
        skipped: num("skipped"),
        failed: num("failed"),
        createdIds: created ? created.split(",").map((s) => s.trim()) : [],
      };
    })
    .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
}
