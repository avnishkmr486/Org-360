"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useDatabase } from "@/hooks/use-data";
import { bulkDelete, BULK_DELETE_META, hasDependents, previewDelete, type BulkDeleteKind } from "@/lib/repositories";

/**
 * Asks permission before deleting. When the selection is referenced by other data
 * (a department with employees, processes, …) the dialog lists exactly what else
 * would be removed; confirming deletes the references and the main records together.
 */
export function CascadeDeleteDialog({ kind, ids, onOpenChange, onDone }: { kind: BulkDeleteKind; ids: string[] | null; onOpenChange: (open: boolean) => void; onDone?: () => void }) {
  const db = useDatabase();
  const meta = BULK_DELETE_META[kind];
  const impact = useMemo(() => (ids ? previewDelete(db, kind, ids) : null), [db, kind, ids]);
  const count = impact?.selected ?? 0;
  const noun = (count === 1 ? meta.singular : meta.label).toLowerCase();
  const linked = impact ? hasDependents(impact) : false;
  const names = useMemo(() => {
    if (!ids) return [];
    const rows = db[kind] as unknown as { id: string; name?: string; firstName?: string; lastName?: string }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.slice(0, 5).map((id) => {
      const r = byId.get(id);
      return r?.name ?? (`${r?.firstName ?? ""} ${r?.lastName ?? ""}`.trim() || id);
    });
  }, [db, kind, ids]);

  return (
    <ConfirmDialog
      open={!!ids}
      onOpenChange={onOpenChange}
      title={linked ? `Delete ${count} ${noun} and related data?` : `Delete ${count} ${noun}?`}
      description={
        <div className="space-y-3">
          <p className="font-medium text-foreground">
            {names.join(", ")}
            {ids && ids.length > names.length ? ` and ${ids.length - names.length} more` : ""}
          </p>
          {linked && impact ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-foreground">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="size-4 text-warning" /> This data depends on the selection
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {impact.removed.map((r) => (
                  <li key={r.label}>
                    <span className="font-semibold tabular-nums">{r.count}</span> {r.label.toLowerCase()} will be deleted
                  </li>
                ))}
                {impact.cleared > 0 ? (
                  <li>
                    <span className="font-semibold tabular-nums">{impact.cleared}</span> other {impact.cleared === 1 ? "record" : "records"} will have the link removed (manager, reviewer, scope…)
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <p>
            {linked ? "Do you give permission to delete the related data and the selected records? " : ""}
            This cannot be undone (except by resetting all demo data).
          </p>
        </div>
      }
      confirmLabel={linked ? "Yes, delete everything" : `Delete ${count}`}
      destructive
      onConfirm={async () => {
        if (!ids) return;
        try {
          const res = await bulkDelete(kind, ids);
          if (!res.deleted) {
            toast.error("Nothing was deleted", { description: "The selected records no longer exist." });
            return;
          }
          const extra = [res.alsoRemoved ? `${res.alsoRemoved} related record${res.alsoRemoved === 1 ? "" : "s"} deleted` : "", res.cleared ? `${res.cleared} link${res.cleared === 1 ? "" : "s"} cleared` : ""].filter(Boolean).join(", ");
          toast.success(`${res.deleted} ${(res.deleted === 1 ? meta.singular : meta.label).toLowerCase()} deleted`, { description: extra || undefined });
          onDone?.();
        } catch (e) {
          toast.error("Could not delete records", { description: e instanceof Error ? e.message : undefined });
        }
      }}
    />
  );
}
