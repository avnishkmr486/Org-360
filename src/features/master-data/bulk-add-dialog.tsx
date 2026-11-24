"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDatabase } from "@/hooks/use-data";
import { bulkCreate, isBlankRow, validateBulkCreate, type BulkCreateKind, type BulkRow } from "@/lib/repositories";
import { cn } from "@/lib/utils";
import type { EntityConfig, FieldDef } from "./entities";

const START_ROWS = 5;
const MAX_ROWS = 200;

/** Employee pickers (department head, supervisor…) are assigned afterwards from the record itself. */
const editable = (f: FieldDef) => f.type !== "employee";

export function BulkAddDialog({ entity, open, onOpenChange }: { entity: EntityConfig; open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDatabase();
  const kind = entity.table as BulkCreateKind;
  const fields = useMemo(() => entity.fields.filter(editable), [entity]);
  const blank = (): BulkRow => Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: START_ROWS }, blank));
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => validateBulkCreate(db, kind, rows), [db, kind, rows]);
  const filled = rows.filter((r) => !isBlankRow(r)).length;
  const departments = db.departments.filter((d) => d.status === "active");

  const reset = () => {
    setRows(Array.from({ length: START_ROWS }, blank));
    setTouched(false);
  };
  const setCell = (i: number, k: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRows = (n: number) => setRows((rs) => [...rs, ...Array.from({ length: Math.min(n, MAX_ROWS - rs.length) }, blank)]);

  /** Paste a block copied from Excel / Sheets: tabs → columns, newlines → rows. */
  const onPaste = (e: React.ClipboardEvent, row: number, col: number) => {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const grid = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
    setRows((rs) => {
      const next = rs.map((r) => ({ ...r }));
      grid.forEach((cells, gi) => {
        const ri = row + gi;
        if (ri >= MAX_ROWS) return;
        while (next.length <= ri) next.push(blank());
        cells.forEach((c, gj) => {
          const f = fields[col + gj];
          if (!f) return;
          if (f.type === "department") {
            const match = db.departments.find((d) => d.name.toLowerCase() === c.trim().toLowerCase() || d.code.toLowerCase() === c.trim().toLowerCase() || d.id === c.trim());
            next[ri][f.key] = match?.id ?? "";
          } else next[ri][f.key] = c.trim();
        });
      });
      return next;
    });
  };

  const save = async () => {
    setTouched(true);
    if (!filled) {
      toast.error("Add at least one row");
      return;
    }
    if (errors.size) return;
    setSaving(true);
    try {
      const n = await bulkCreate(kind, rows);
      toast.success(`${n} ${(n === 1 ? entity.singular : entity.title).toLowerCase()} added`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Could not add ${entity.title.toLowerCase()}`, { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add multiple {entity.title.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Fill one row per record, or paste rows copied from Excel. Empty rows are ignored. Nothing is saved until every filled row is valid.
            {fields.length < entity.fields.length ? " Assign people (such as heads or supervisors) afterwards from each record." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-2 py-2 text-center font-semibold">#</th>
                {fields.map((f) => (
                  <th key={f.key} className="px-2 py-2 text-left font-semibold">
                    {f.label}
                    {f.required ? <span className="text-destructive"> *</span> : null}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const err = errors.get(i);
                return (
                  <tr key={i} className={cn("border-b last:border-0 align-top", err && touched && "bg-destructive/5")}>
                    <td className="px-2 py-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                    {fields.map((f, c) => (
                      <td key={f.key} className="min-w-36 px-1.5 py-1.5">
                        {f.type === "department" ? (
                          <Select value={row[f.key] || undefined} onValueChange={(v) => setCell(i, f.key, v)}>
                            <SelectTrigger size="sm" className="w-full" aria-label={`${f.label} row ${i + 1}`}>
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={row[f.key]}
                            onChange={(e) => setCell(i, f.key, e.target.value)}
                            onPaste={(e) => onPaste(e, i, c)}
                            type={f.type === "number" ? "number" : "text"}
                            placeholder={f.placeholder}
                            aria-label={`${f.label} row ${i + 1}`}
                            className="h-8"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-1 py-1.5">
                      <Button variant="ghost" size="icon-sm" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank()]))} aria-label={`Remove row ${i + 1}`}>
                        <X />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {touched && errors.size ? (
          <ul className="space-y-0.5 text-xs text-destructive">
            {[...errors].slice(0, 6).map(([i, m]) => (
              <li key={i}>
                Row {i + 1}: {m}
              </li>
            ))}
            {errors.size > 6 ? <li>…and {errors.size - 6} more.</li> : null}
          </ul>
        ) : null}

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => addRows(1)} disabled={rows.length >= MAX_ROWS}>
              <Plus /> Add row
            </Button>
            <Button variant="outline" size="sm" onClick={() => addRows(5)} disabled={rows.length >= MAX_ROWS}>
              <Plus /> Add 5 rows
            </Button>
            <span className="text-xs text-muted-foreground">{filled} filled</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || filled === 0}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Add {filled || ""} {(filled === 1 ? entity.singular : entity.title).toLowerCase()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
