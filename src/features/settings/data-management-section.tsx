"use client";

import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { Database } from "@/types";
import { CascadeDeleteDialog } from "@/components/common/cascade-delete-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDatabase } from "@/hooks/use-data";
import { BULK_DELETE_META, findDeleteBlockers, type BulkDeleteKind } from "@/lib/repositories";

interface Row {
  id: string;
  label: string;
  detail: string;
}

function rowsFor(db: Database, kind: BulkDeleteKind): Row[] {
  switch (kind) {
    case "employees": {
      const dep = new Map(db.departments.map((d) => [d.id, d.name]));
      return db.employees.map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}`.trim(), detail: `${dep.get(e.departmentId) ?? "—"} · ${e.status.replace("_", " ")}` }));
    }
    case "departments":
      return db.departments.map((d) => ({ id: d.id, label: d.name, detail: `${d.code} · ${d.status}` }));
    case "teams": {
      const dep = new Map(db.departments.map((d) => [d.id, d.name]));
      return db.teams.map((t) => ({ id: t.id, label: t.name, detail: `${dep.get(t.departmentId) ?? "—"} · ${t.status}` }));
    }
    case "bands":
      return db.bands.map((b) => ({ id: b.id, label: b.name, detail: `${b.code} · ${b.status}` }));
    case "processCategories":
      return db.processCategories.map((c) => ({ id: c.id, label: c.name, detail: c.status }));
    case "designations":
      return db.designations.map((c) => ({ id: c.id, label: c.name, detail: c.status }));
  }
}

const PAGE = 100;

export function DataManagementPanel({ readOnly }: { readOnly: boolean }) {
  const db = useDatabase();
  const [kind, setKind] = useState<BulkDeleteKind>("employees");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [confirming, setConfirming] = useState<string[] | null>(null);

  const meta = BULK_DELETE_META[kind];
  const rows = useMemo(() => rowsFor(db, kind), [db, kind]);
  const blockers = useMemo(() => findDeleteBlockers(db, kind), [db, kind]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? rows.filter((r) => `${r.id} ${r.label} ${r.detail}`.toLowerCase().includes(q)) : rows), [rows, q]);
  const visible = filtered.slice(0, limit);
  // Drop selections that no longer exist.
  const picked = [...selected].filter((id) => rows.some((r) => r.id === id));
  const allPicked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const somePicked = filtered.some((r) => selected.has(r.id));

  const switchKind = (k: BulkDeleteKind) => {
    setKind(k);
    setSelected(new Set());
    setQuery("");
    setLimit(PAGE);
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const toggleAll = (on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of filtered) {
        if (on) n.add(r.id);
        else n.delete(r.id);
      }
      return n;
    });

  return (
    <section className="card-elevated fade-in">
      <header className="border-b px-6 py-4">
        <h2 className="text-base font-semibold">Data Management</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Delete several records at once. If other data depends on a record (for example the employees and processes of a department) you are shown exactly what is affected and asked for permission before it is deleted together with the record.
        </p>
      </header>
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={kind} onValueChange={(v) => switchKind(v as BulkDeleteKind)}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Record type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BULK_DELETE_META) as BulkDeleteKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {BULK_DELETE_META[k].label} ({db[k].length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder={`Search ${meta.label.toLowerCase()}…`}
              className="pl-9"
              aria-label="Search records"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Checkbox
              checked={allPicked ? true : somePicked ? "indeterminate" : false}
              onCheckedChange={(v) => toggleAll(v === true)}
              disabled={readOnly || filtered.length === 0}
              aria-label="Select all records"
            />
            <span>{meta.label}</span>
            <span className="ml-auto font-normal normal-case tracking-normal">
              {filtered.length} {filtered.length === 1 ? "record" : "records"}
            </span>
          </div>
          <ul className="max-h-[420px] divide-y overflow-y-auto">
            {visible.map((r) => {
              const reason = blockers.get(r.id);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} disabled={readOnly} aria-label={`Select ${r.label}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.id} · {r.detail}
                    </div>
                  </div>
                  {reason ? <span className="max-w-[45%] shrink-0 truncate text-xs text-warning" title={reason}>{reason}</span> : null}
                </li>
              );
            })}
            {filtered.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No records found.</li> : null}
          </ul>
          {filtered.length > limit ? (
            <div className="border-t px-4 py-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({filtered.length - limit} remaining)
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3">
        <span className="text-sm text-muted-foreground">{picked.length} selected</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={picked.length === 0}>
            Clear selection
          </Button>
          <Button variant="destructive" size="sm" disabled={readOnly || picked.length === 0} onClick={() => setConfirming(picked)}>
            <Trash2 /> Delete selected
          </Button>
        </div>
      </footer>
      <CascadeDeleteDialog kind={kind} ids={confirming} onOpenChange={(o) => !o && setConfirming(null)} onDone={() => setSelected(new Set())} />
    </section>
  );
}
