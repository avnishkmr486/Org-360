"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import type { KpiType, Process, ProcessKpi } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-data";
import { removeKpi, saveKpi, setItemLabel } from "@/lib/repositories";
import { fail } from "./item-inline";

export const KPI_TYPES: Record<KpiType, string> = { number: "Number", percent: "Percentage", text: "Text", date: "Date", yes_no: "Yes / No" };

export const targetText = (k: ProcessKpi) => (k.target ? `${k.type === "yes_no" ? (k.target === "yes" ? "Yes" : "No") : k.target}${k.type === "percent" ? "%" : ""}` : "");

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** Configure what the process measures: what it tracks (item name) and its KPIs. */
export function KpiSettingsDialog({ process: p, open, onOpenChange }: { process: Process; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { can } = useCurrentUser();
  const canConfigure = can("processes.configure_kpis");
  const [editing, setEditing] = useState<ProcessKpi | "new" | null>(null);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const label = p.itemLabel || "Item";
  const kpis = p.kpis ?? [];
  const close = (o: boolean) => {
    if (!o) {
      setEditing(null);
      setLabelDraft(null);
    }
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {editing ? (
          <KpiForm key={editing === "new" ? "new" : editing.id} processId={p.id} kpi={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>Configure KPIs</DialogTitle>
              <DialogDescription>Choose what this process tracks and the measures used to judge each one. Every KPI becomes an editable column.</DialogDescription>
            </DialogHeader>

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setItemLabel(p.id, labelDraft ?? label).then(() => toast.success("Saved")).catch(fail("Could not save"));
              }}
            >
              <F label="This process tracks" className="flex-1">
                <Input value={labelDraft ?? p.itemLabel ?? ""} onChange={(e) => setLabelDraft(e.target.value)} placeholder="Item, Design, Release…" />
              </F>
              <Button type="submit" variant="outline" disabled={labelDraft === null || (labelDraft.trim() || "Item") === label}>
                Rename
              </Button>
            </form>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">KPIs ({kpis.length})</h4>
                {canConfigure ? (
                  <Button size="sm" onClick={() => setEditing("new")}>
                    <Plus /> Add KPI
                  </Button>
                ) : null}
              </div>
              {kpis.length ? (
                <ul className="divide-y rounded-lg border">
                  {kpis.map((k) => (
                    <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Target className="size-4 shrink-0 text-teal" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{k.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {KPI_TYPES[k.type]}
                          {k.unit ? ` · ${k.unit}` : ""}
                          {k.target ? ` · target ${targetText(k)}` : " · no target"}
                        </div>
                      </div>
                      {canConfigure ? (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${k.name}`} onClick={() => setEditing(k)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${k.name}`} onClick={() => removeKpi(p.id, k.id).then(() => toast.success("KPI removed")).catch(fail("Could not remove"))}>
                            <Trash2 />
                          </Button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{canConfigure ? "No KPIs yet. Add your own — for example “Review score”, “Approved by client” or “Defects found”." : "No KPIs yet. A Super Admin adds them."}</p>
              )}
              <p className="text-xs text-muted-foreground">KPIs with a target feed each {label.toLowerCase()}’s health score.{canConfigure ? "" : " Only a Super Admin can add or change KPIs; you can reorder the columns with the column button above the grid."}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function KpiForm({ processId, kpi, onDone }: { processId: string; kpi: ProcessKpi | null; onDone: () => void }) {
  const [name, setName] = useState(kpi?.name ?? "");
  const [type, setType] = useState<KpiType>(kpi?.type ?? "number");
  const [target, setTarget] = useState(kpi?.target ?? "");
  const [unit, setUnit] = useState(kpi?.unit ?? "");
  const [description, setDescription] = useState(kpi?.description ?? "");
  const [saving, setSaving] = useState(false);
  const numeric = type === "number" || type === "percent";
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await saveKpi(processId, { id: kpi?.id, name, type, target, unit, description });
          toast.success(kpi ? "KPI updated" : "KPI added");
          onDone();
        } catch (err) {
          fail("Could not save the KPI")(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{kpi ? "Edit KPI" : "Add KPI"}</DialogTitle>
        <DialogDescription>Becomes a column that everyone working on the process can fill in.</DialogDescription>
      </DialogHeader>
      <F label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Review score" required autoFocus />
      </F>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Type">
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
        </F>
        {type === "yes_no" ? (
          <F label="Target">
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
          </F>
        ) : numeric ? (
          <F label={type === "percent" ? "Target (%)" : "Target"}>
            <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optional" />
          </F>
        ) : (
          <div />
        )}
        {type === "number" ? (
          <F label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. days, pts, defects" />
          </F>
        ) : null}
      </div>
      <F label="What does it measure?">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional guidance for whoever fills it in" />
      </F>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
          Back
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} {kpi ? "Save KPI" : "Add KPI"}
        </Button>
      </DialogFooter>
    </form>
  );
}
