"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Column } from "@/components/tables/data-table";
import { useCurrentUser, useDatabase } from "@/hooks/use-data";
import { setGridValue } from "@/lib/repositories";
import type { GridColumn } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Screens whose table grid can carry Super Admin-defined KPI columns. */
export const GRID_SCREENS: { id: string; label: string }[] = [
  { id: "employees", label: "Employees" },
  { id: "departments", label: "Departments" },
  { id: "teams", label: "Teams" },
  { id: "processes", label: "Process Management · Processes" },
  { id: "ecosystem", label: "Ecosystem" },
  { id: "compliance", label: "Compliance Tracker" },
];
export const gridScreenLabel = (id: string) => GRID_SCREENS.find((s) => s.id === id)?.label ?? id;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function numeric(c: GridColumn, v: string) {
  const n = Number(v);
  return v !== "" && Number.isFinite(n) ? n : null;
}

/** Green when the value meets the column's target, amber when it does not, nothing when there is no target. */
function met(c: GridColumn, v: string): boolean | null {
  if (!c.target || !v) return null;
  if (c.type === "yes_no" || c.type === "text") return v.toLowerCase() === c.target.toLowerCase();
  const n = numeric(c, v);
  const t = numeric(c, c.target);
  return n === null || t === null ? null : n >= t;
}

function Cell({ col, rowId, value, editable }: { col: GridColumn; rowId: string; value: string; editable: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const ok = met(col, value);
  const tone = ok === null ? "" : ok ? "border-success/50 text-success" : "border-warning/60 text-warning";
  const save = (v: string) => {
    if (v !== value) setGridValue(col.id, rowId, v).catch((e) => toast.error("Could not save", { description: e instanceof Error ? e.message : undefined }));
  };
  if (!editable) return <span className={cn("text-sm", ok === null ? "text-muted-foreground" : ok ? "text-success" : "text-warning")}>{value ? `${value}${col.type === "percent" ? "%" : col.unit ? ` ${col.unit}` : ""}` : "—"}</span>;
  if (col.type === "yes_no") {
    return (
      <div onClick={stop}>
        <Select value={value || "unset"} onValueChange={(v) => save(v === "unset" ? "" : v)}>
          <SelectTrigger size="sm" className={cn("h-7 w-[84px] text-xs", tone)} aria-label={col.name}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unset">—</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div onClick={stop} className="flex items-center gap-1">
      <Input
        type={col.type === "date" ? "date" : col.type === "text" ? "text" : "number"}
        step={col.type === "number" || col.type === "percent" ? "any" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(draft)}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
        aria-label={col.name}
        placeholder="—"
        className={cn("h-7 px-2 text-xs", col.type === "date" ? "w-[128px]" : col.type === "text" ? "w-[120px]" : "w-[78px]", tone)}
      />
      {col.type === "percent" ? <span className="text-xs text-muted-foreground">%</span> : col.unit ? <span className="text-xs text-muted-foreground">{col.unit}</span> : null}
    </div>
  );
}

/**
 * The KPI columns a Super Admin configured for `screen` (Settings → KPI Master), ready to add to its grid.
 * Use {@link withCustomColumns} to place them before the row-actions column.
 */
export function useCustomColumns<T>(screen: string, getId: (row: T) => string): Column<T>[] {
  const db = useDatabase();
  const { can } = useCurrentUser();
  const editable = can("settings.manage");
  const cols = db.settings.gridColumns;
  const values = db.settings.gridValues;
  return useMemo(
    () =>
      (cols ?? [])
        .filter((c) => c.screen === screen)
        .map<Column<T>>((c) => ({
          id: `gcol-${c.id}`,
          header: (
            <span title={c.description || undefined}>
              {c.name}
              {c.target ? <span className="ml-1 font-normal normal-case text-muted-foreground/70">/{c.target}{c.type === "percent" ? "%" : ""}</span> : null}
            </span>
          ),
          cell: (r) => <Cell col={c} rowId={getId(r)} value={values?.[`${c.id}|${getId(r)}`] ?? ""} editable={editable} />,
          sortValue: (r) => {
            const v = values?.[`${c.id}|${getId(r)}`];
            return v === undefined ? null : c.type === "number" || c.type === "percent" ? numeric(c, v) : v;
          },
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols, values, screen, editable],
  );
}

/** Insert custom columns just before the row-actions column (or at the end when there is none). */
export function withCustomColumns<T>(columns: Column<T>[], custom: Column<T>[]): Column<T>[] {
  if (!custom.length) return columns;
  const i = columns.findIndex((c) => c.id === "actions" || c.id === "act");
  return i === -1 ? [...columns, ...custom] : [...columns.slice(0, i), ...custom, ...columns.slice(i)];
}
