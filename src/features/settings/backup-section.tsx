"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DatabaseBackup, Download, History, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useDatabase } from "@/hooks/use-data";
import { exportBackupJson, listBackups, restoreBackup, restoreFromJson } from "@/lib/store/mock-db";
import { formatNumber } from "@/lib/utils/format";

const fail = (e: unknown) => toast.error("Could not restore", { description: e instanceof Error ? e.message : undefined });

/** Download everything as a file, restore from a file, or go back to an automatic safety copy kept in this browser. */
export function BackupPanel({ readOnly }: { readOnly: boolean }) {
  const db = useDatabase();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  void tick;
  const backups = listBackups();

  const download = () => {
    const blob = new Blob([exportBackupJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `organization-360-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Backup downloaded", { description: "Keep the file somewhere safe." });
  };

  return (
    <section className="card-elevated fade-in">
      <header className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <DatabaseBackup className="size-4" /> Backup &amp; Restore
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Download all your data as a file and bring it back at any time. Safety copies are also kept automatically in this browser.</p>
      </header>
      <div className="space-y-6 px-6 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="font-medium">Download a backup</div>
            <div className="text-xs text-muted-foreground">
              Currently {formatNumber(db.employees.length)} employees, {db.departments.length} departments, {db.processes.length} processes and {db.ecoEntities.length} ecosystem entries.
            </div>
          </div>
          <Button size="sm" onClick={download}>
            <Download /> Download backup
          </Button>
        </div>

        <div className="space-y-2 border-t pt-5">
          <div className="text-sm font-medium">Restore from a backup file</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="application/json,.json"
              disabled={readOnly}
              className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setFile(f ? { name: f.name, text: await f.text() } : null);
              }}
            />
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" disabled={readOnly || !file}>
                  <Upload /> Restore from file
                </Button>
              }
              title="Restore from this file?"
              description={`Everything now in the app is replaced with the contents of ${file?.name ?? "the file"}. A safety copy of the current data is kept first.`}
              confirmLabel="Restore"
              destructive
              onConfirm={async () => {
                try {
                  restoreFromJson(file!.text);
                  setFile(null);
                  setTick((t) => t + 1);
                  toast.success("Data restored from file");
                } catch (e) {
                  fail(e);
                }
              }}
            />
          </div>
        </div>

        <div className="space-y-2 border-t pt-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="size-4" /> Safety copies in this browser
          </div>
          {backups.length ? (
            <ul className="divide-y rounded-lg border">
              {backups.map((b) => (
                <li key={b.key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{new Date(b.at).toLocaleString()}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {b.reason} · {formatNumber(b.employees)} employees · {Math.round(b.bytes / 1024)} KB
                    </div>
                  </div>
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm" disabled={readOnly}>
                        Restore
                      </Button>
                    }
                    title="Restore this safety copy?"
                    description={`Everything now in the app is replaced with the copy from ${new Date(b.at).toLocaleString()} (${b.employees} employees). A safety copy of the current data is kept first.`}
                    confirmLabel="Restore"
                    destructive
                    onConfirm={async () => {
                      try {
                        restoreBackup(b.key);
                        setTick((t) => t + 1);
                        toast.success("Safety copy restored");
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No safety copies yet. One is kept whenever data is about to be replaced, and every 30 minutes while you work.</p>
          )}
          <p className="text-xs text-muted-foreground">The last six copies are kept, plus the one with the most employees. Safety copies live only in this browser, so download a backup file too.</p>
        </div>
      </div>
    </section>
  );
}
