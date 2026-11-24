"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, RotateCcw, Save } from "lucide-react";
import type { Process, ProcessScope } from "@/types";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/common/badges";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { applyProcessScope } from "@/lib/repositories";
import { describeScope, normalizeScope, resolveScopeEmployees, SCOPE_LEVEL_LABELS, validateScope } from "@/lib/services/process-scope";
import { resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { ProcessScopeEditor } from "./process-scope-editor";

/**
 * "Process applied for" — pick the level, add departments, then pull teams and
 * employees from the employee data. Saving keeps assignments in sync for active processes.
 */
export function AppliedForTab({ process: p }: { process: Process }) {
  const db = useDatabase();
  const L = useLookups();
  const { can } = useCurrentUser();
  const canEdit = can("processes.manage");
  const [draft, setDraft] = useState<ProcessScope>(p.scope);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(p.scope), [p.scope]);

  const clean = useMemo(() => normalizeScope(draft, db), [draft, db]);
  const dirty = JSON.stringify(clean) !== JSON.stringify(p.scope);
  const error = validateScope(clean, db);

  const covered = useMemo(() => resolveScopeEmployees(p.scope, db, p), [db, p]);
  const assigned = useMemo(() => {
    const s = new Set<string>();
    db.assignments.filter((a) => a.processId === p.id && a.status === "active").forEach((a) => resolveAssignmentEmployees(a, p, db).forEach((e) => s.add(e.id)));
    return s;
  }, [db, p]);
  const notAssigned = covered.filter((e) => !assigned.has(e.id));

  // Coverage breakdown: department → team → employees
  const breakdown = useMemo(() => {
    const map = new Map<string, Map<string, typeof covered>>();
    for (const e of covered) {
      const teams = map.get(e.departmentId) ?? new Map<string, typeof covered>();
      const key = e.teamId ?? "__none";
      teams.set(key, [...(teams.get(key) ?? []), e]);
      map.set(e.departmentId, teams);
    }
    return [...map.entries()];
  }, [covered]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await applyProcessScope(p.id, clean);
      if (res.synced) {
        toast.success("Applied-for scope saved", {
          description: `${res.created} assignment${res.created === 1 ? "" : "s"} created${res.deactivated ? `, ${res.deactivated} removed` : ""}. ${res.employees ? `${res.employees} employees now receive tasks.` : ""}`,
        });
        res.warnings.forEach((w) => toast.info("Note", { description: w }));
      } else {
        toast.success("Applied-for scope saved", { description: "Assignments are created when the process becomes Active." });
      }
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card-elevated p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Process applied for</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Current: <span className="font-medium text-foreground">{describeScope(p.scope, db, 4)}</span>
            </p>
          </div>
          <ToneBadge tone="info">{SCOPE_LEVEL_LABELS[p.scope.level]}</ToneBadge>
        </div>

        {canEdit ? (
          <>
            <ProcessScopeEditor value={draft} onChange={setDraft} processFilters={p} />
            {error && dirty ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {p.status === "active" ? "Saving updates this process's assignments so the covered employees start receiving tasks." : `This process is ${p.status.replace("_", " ")}; assignments are created when it becomes Active.`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft(p.scope)} disabled={!dirty || saving}>
                  <RotateCcw /> Reset
                </Button>
                <Button size="sm" onClick={save} disabled={!dirty || saving || error !== null}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />} Save applied-for
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">You have read-only access. Ask a process manager to change who this process applies to.</p>
        )}
      </section>

      <section className="card-elevated p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Coverage ({covered.length} employees)</h3>
          {p.status === "active" ? (
            notAssigned.length ? (
              <ToneBadge tone="warning" icon={<AlertTriangle className="size-3" />}>
                {notAssigned.length} in scope not receiving tasks yet
              </ToneBadge>
            ) : (
              <ToneBadge tone="success" icon={<CheckCircle2 className="size-3" />}>
                All covered employees receive tasks
              </ToneBadge>
            )
          ) : null}
        </div>
        {breakdown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No employees are covered yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {breakdown.map(([deptId, teams]) => (
              <div key={deptId} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{L.deptName(deptId)}</span>
                  <span className="text-xs text-muted-foreground">{[...teams.values()].reduce((n, l) => n + l.length, 0)} employees</span>
                </div>
                <ul className="space-y-1.5">
                  {[...teams.entries()].map(([teamId, list]) => (
                    <li key={teamId} className="text-xs">
                      <span className="font-medium">{teamId === "__none" ? "Department leadership" : L.teamName(teamId)}</span>
                      <span className="text-muted-foreground"> · {list.map((e) => `${e.firstName} ${e.lastName}`).join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
