"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProcessKpi, TrackedItem, TrackedItemStatus } from "@/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToneBadge } from "@/components/common/badges";
import { updateItem, type ItemPatch } from "@/lib/repositories";
import { kpiMet } from "@/lib/utils/item-health";
import type { Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const ITEM_STATUS: Record<TrackedItemStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  blocked: { label: "Blocked", tone: "danger" },
  done: { label: "Done", tone: "success" },
};

export const fail = (title: string) => (e: unknown) => toast.error(title, { description: e instanceof Error ? e.message : undefined });

export const saveInline = (processId: string, itemId: string, patch: ItemPatch) => updateItem(processId, itemId, patch).catch(fail("Could not save"));

/** Clicks inside inline editors must not open the row's detail screen. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function StatusSelect({ processId, item, editable }: { processId: string; item: TrackedItem; editable: boolean }) {
  if (!editable) return <ToneBadge tone={ITEM_STATUS[item.status].tone}>{ITEM_STATUS[item.status].label}</ToneBadge>;
  return (
    <div onClick={stop}>
      <Select value={item.status} onValueChange={(v) => void saveInline(processId, item.id, { status: v as TrackedItemStatus })}>
        <SelectTrigger size="sm" className="h-7 w-[124px] text-xs" aria-label={`Status of ${item.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ITEM_STATUS) as TrackedItemStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {ITEM_STATUS[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One KPI value, editable in place. Saves when the field loses focus (or on Enter / selection). */
export function KpiInput({ processId, item, kpi, editable, wide }: { processId: string; item: TrackedItem; kpi: ProcessKpi; editable: boolean; wide?: boolean }) {
  const stored = item.values[kpi.id] ?? "";
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  const met = kpiMet(kpi, stored);
  const tone = met === null ? "" : met ? "border-success/50 text-success" : "border-warning/60 text-warning";
  const save = (v: string) => {
    if (v !== stored) void saveInline(processId, item.id, { values: { [kpi.id]: v } });
  };

  if (kpi.type === "yes_no") {
    return (
      <div onClick={stop}>
        <Select value={stored || "unset"} disabled={!editable} onValueChange={(v) => save(v === "unset" ? "" : v)}>
          <SelectTrigger size="sm" className={cn("h-7 text-xs", wide ? "w-full" : "w-[84px]", tone)} aria-label={kpi.name}>
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
    <div onClick={stop} className={cn("flex items-center gap-1", wide ? "w-full" : "")}>
      <Input
        type={kpi.type === "date" ? "date" : kpi.type === "text" ? "text" : "number"}
        step={kpi.type === "number" || kpi.type === "percent" ? "any" : undefined}
        value={draft}
        disabled={!editable}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(draft)}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
        aria-label={kpi.name}
        placeholder="—"
        className={cn("h-7 px-2 text-xs", wide ? "w-full" : kpi.type === "date" ? "w-[128px]" : kpi.type === "text" ? "w-[120px]" : "w-[78px]", tone)}
      />
      {kpi.type === "percent" ? <span className="text-xs text-muted-foreground">%</span> : kpi.unit ? <span className="text-xs text-muted-foreground">{kpi.unit}</span> : null}
    </div>
  );
}

/** The note box against an item. */
export function NoteInput({ processId, item, editable, rows }: { processId: string; item: TrackedItem; editable: boolean; rows?: number }) {
  const stored = item.note ?? "";
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  const save = () => {
    if (draft.trim() !== stored.trim()) void saveInline(processId, item.id, { note: draft });
  };
  if (rows) {
    return (
      <textarea
        value={draft}
        disabled={!editable}
        rows={rows}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder={editable ? "Add a note — decisions, blockers, next steps…" : "No note"}
        aria-label={`Note for ${item.title}`}
        className="w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
      />
    );
  }
  return (
    <div onClick={stop}>
      <Input
        value={draft}
        disabled={!editable}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
        placeholder={editable ? "Add a note…" : "—"}
        aria-label={`Note for ${item.title}`}
        className="h-7 w-[220px] px-2 text-xs"
      />
    </div>
  );
}
