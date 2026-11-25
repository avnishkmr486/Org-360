"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { GridColumn, KpiType } from "@/types";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { gridScreenLabel } from "@/components/tables/custom-columns";
import { saveGridColumn } from "@/lib/repositories";
import { KPI_TYPES } from "@/features/processes/kpi-settings";

const fail = (e: unknown) => toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });

export function GridColumnForm({ screen, col, onDone }: { screen: string; col: GridColumn | null; onDone: () => void }) {
  const [name, setName] = useState(col?.name ?? "");
  const [type, setType] = useState<KpiType>(col?.type ?? "number");
  const [target, setTarget] = useState(col?.target ?? "");
  const [unit, setUnit] = useState(col?.unit ?? "");
  const [description, setDescription] = useState(col?.description ?? "");
  const [saving, setSaving] = useState(false);
  const numeric = type === "number" || type === "percent";
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await saveGridColumn({ id: col?.id, screen, name, type, target, unit, description });
          toast.success(col ? "KPI updated" : "KPI added");
          onDone();
        } catch (err) {
          fail(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{col ? "Edit KPI column" : "Add KPI column"}</DialogTitle>
        <DialogDescription>Adds a column to the {gridScreenLabel(screen)} table. Administrators and Super Admins fill it in on that screen; everyone can see, sort and reorder it.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Column name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Satisfaction score" required autoFocus />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as KpiType);
              setTarget("");
            }}
          >
            <SelectTrigger aria-label="KPI type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KPI_TYPES) as KpiType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {KPI_TYPES[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type === "yes_no" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Target</Label>
            <Select value={target || "none"} onValueChange={(v) => setTarget(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No target</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : numeric ? (
          <div className="space-y-1.5">
            <Label className="text-xs">{type === "percent" ? "Target (%)" : "Target"}</Label>
            <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optional" />
          </div>
        ) : (
          <div />
        )}
        {type === "number" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. days, pts" />
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">What does it measure?</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — shown when hovering the column heading" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {col ? "Save KPI" : "Add KPI"}
        </Button>
      </div>
    </form>
  );
}
