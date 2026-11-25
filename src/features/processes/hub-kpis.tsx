"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import type { GridColumn, HubTile } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnArranger, useColumnOrder } from "@/components/tables/column-arranger";
import { useCurrentUser, useDatabase } from "@/hooks/use-data";
import { moveGridColumn, removeGridColumn, saveHubTiles } from "@/lib/repositories";
import { GridColumnForm } from "@/features/settings/grid-column-form";
import { KPI_TYPES } from "./kpi-settings";
import { uid } from "@/lib/utils/random";
import { DEFAULT_HUB_TILES, MANAGER_METRICS, METRIC_LABELS } from "./hub-tiles";

const TONES: HubTile["tone"][] = ["info", "success", "warning", "danger", "teal", "neutral"];
const HEALTHS = [
  { value: "healthy", label: "Healthy" },
  { value: "at_risk", label: "At risk" },
  { value: "critical", label: "Critical" },
];
const PROCESS_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "under_review", label: "Under review" },
  { value: "inactive", label: "Inactive" },
];
const ASSIGNMENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const ANY = "__any__";
const GRID_SCREEN = "processes";

/**
 * The summary tiles ("KPIs") at the top of Process Management.
 * Everyone can reorder them for themselves; only a Super Admin can add, change or remove them.
 */
export function useHubKpis(isEmployee: boolean) {
  const db = useDatabase();
  const { user, can } = useCurrentUser();
  const all = db.settings.hubTiles ?? DEFAULT_HUB_TILES;
  const visible = useMemo(() => all.filter((t) => !isEmployee || !MANAGER_METRICS.includes(t.metric)), [all, isEmployee]);
  const { ordered, ...arrange } = useColumnOrder(`org360:hubtiles:${user.id}`, visible);
  const [managing, setManaging] = useState(false);
  const canConfigure = can("processes.configure_kpis");

  const controls = (
    <>
      <ColumnArranger columns={ordered} labels={Object.fromEntries(visible.map((t) => [t.id, t.label]))} noun="KPIs" {...arrange} />
      {canConfigure ? (
        <Button variant="outline" size="icon-sm" aria-label="Manage KPIs" title="Add or change KPIs" onClick={() => setManaging(true)}>
          <Settings2 />
        </Button>
      ) : null}
      {canConfigure ? <ManageDialog open={managing} onOpenChange={setManaging} tiles={all} /> : null}
    </>
  );
  return { tiles: ordered, controls };
}

/** One line saying what a tile counts. */
export function describeTile(t: HubTile) {
  const parts: string[] = [METRIC_LABELS[t.metric]];
  if (t.metric === "processes") {
    if (t.status) parts.push(PROCESS_STATUSES.find((s) => s.value === t.status)?.label.toLowerCase() ?? t.status);
    if (t.health) parts.push(HEALTHS.find((h) => h.value === t.health)?.label.toLowerCase() ?? t.health);
  }
  if (t.metric === "assignments" && t.status) parts.push(t.status);
  return parts.join(" · ");
}

/** Save one tile into the current list (add when it is new) — shared by the hub dialog and Settings. */
export async function saveHubTile(current: HubTile[], tile: HubTile) {
  const exists = current.some((x) => x.id === tile.id);
  await saveHubTiles(exists ? current.map((x) => (x.id === tile.id ? tile : x)) : [...current, tile]);
}

function ManageDialog({ open, onOpenChange, tiles }: { open: boolean; onOpenChange: (o: boolean) => void; tiles: HubTile[] }) {
  const db = useDatabase();
  const [tab, setTab] = useState<"tiles" | "columns">("tiles");
  const [editing, setEditing] = useState<HubTile | "new" | null>(null);
  const [editingCol, setEditingCol] = useState<GridColumn | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const gridCols = (db.settings.gridColumns ?? []).filter((c) => c.screen === GRID_SCREEN);
  const run = async (action: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      return true;
    } catch (err) {
      toast.error("Could not save", { description: err instanceof Error ? err.message : undefined });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setEditing(null);
          setEditingCol(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {editingCol ? (
          <GridColumnForm screen={GRID_SCREEN} col={editingCol === "new" ? null : editingCol} onDone={() => setEditingCol(null)} />
        ) : editing ? (
          <TileForm
            key={editing === "new" ? "new" : editing.id}
            tile={editing === "new" ? null : editing}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={async (t) => {
              if (await run(() => saveHubTile(tiles, t), editing === "new" ? "KPI added" : "KPI updated")) setEditing(null);
            }}
          />
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Process Management KPIs</DialogTitle>
              <DialogDescription>The tiles shown at the top of Process Management. Everyone can reorder them for their own view; only you can add or change them.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist">
              {([["tiles", "Summary tiles"], ["columns", "Table columns"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === k ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
            {tab === "columns" ? (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra columns ({gridCols.length})</h4>
                  <Button size="sm" onClick={() => setEditingCol("new")}>
                    <Plus /> Add column
                  </Button>
                </div>
                {gridCols.length ? (
                  <ul className="divide-y rounded-lg border">
                    {gridCols.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-1 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{[KPI_TYPES[c.type], c.target ? `target ${c.target}${c.type === "percent" ? "%" : ""}` : "no target", c.unit].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Button variant="ghost" size="icon-sm" aria-label={`Move ${c.name} left`} disabled={i === 0 || busy} onClick={() => run(() => moveGridColumn(c.id, -1), "Order saved")}>
                          <ArrowUp />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Move ${c.name} right`} disabled={i === gridCols.length - 1 || busy} onClick={() => run(() => moveGridColumn(c.id, 1), "Order saved")}>
                          <ArrowDown />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditingCol(c)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} disabled={busy} onClick={() => run(() => removeGridColumn(c.id), "Column deleted")}>
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No extra columns. Add a KPI column to the processes table.</p>
                )}
                <p className="text-xs text-muted-foreground">These appear after the standard columns of the processes table, in this order, for everyone. Deleting a column also deletes its values. Anyone can still reorder their own view with the column button.</p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : null}
            {tab === "tiles" ? (
              <>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">KPIs ({tiles.length})</h4>
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> Add KPI
              </Button>
            </div>
            {tiles.length ? (
              <ul className="divide-y rounded-lg border">
                {tiles.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{describeTile(t)}</div>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.label}`} onClick={() => setEditing(t)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.label}`} disabled={busy} onClick={() => run(() => saveHubTiles(tiles.filter((x) => x.id !== t.id)), "KPI removed")}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No KPIs. Add one, or restore the standard set.</p>
            )}
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => saveHubTiles(DEFAULT_HUB_TILES), "Standard KPIs restored")}>
                <RotateCcw /> Restore standard set
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Form for one Process Management tile. Render it inside a Dialog. */
export function TileForm({ tile, busy, onCancel, onSave }: { tile: HubTile | null; busy: boolean; onCancel: () => void; onSave: (t: HubTile) => void }) {
  const [label, setLabel] = useState(tile?.label ?? "");
  const [metric, setMetric] = useState<HubTile["metric"]>(tile?.metric ?? "processes");
  const [status, setStatus] = useState<string | null>(tile?.status ?? null);
  const [health, setHealth] = useState<string | null>(tile?.health ?? null);
  const [tone, setTone] = useState<HubTile["tone"]>(tile?.tone ?? "info");
  const statusOptions = metric === "processes" ? PROCESS_STATUSES : metric === "assignments" ? ASSIGNMENT_STATUSES : [];
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return toast.error("Give the KPI a name.");
        onSave({ id: tile?.id ?? uid("TILE"), label, metric, status: statusOptions.length ? status : null, health: metric === "processes" ? health : null, tone });
      }}
    >
      <DialogHeader>
        <DialogTitle>{tile ? "Edit KPI" : "Add KPI"}</DialogTitle>
        <DialogDescription>Choose what to count. Clicking the tile filters Process Management to the same records.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Processes under review" required />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">What to count</Label>
        <Select
          value={metric}
          onValueChange={(v) => {
            setMetric(v as HubTile["metric"]);
            setStatus(null);
            setHealth(null);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METRIC_LABELS) as HubTile["metric"][]).map((m) => (
              <SelectItem key={m} value={m}>
                {METRIC_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {statusOptions.length ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Only with status</Label>
          <Select value={status ?? ANY} onValueChange={(v) => setStatus(v === ANY ? null : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {metric === "processes" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Only with health</Label>
          <Select value={health ?? ANY} onValueChange={(v) => setHealth(v === ANY ? null : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any health</SelectItem>
              {HEALTHS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label className="text-xs">Colour</Label>
        <Select value={tone} onValueChange={(v) => setTone(v as HubTile["tone"])}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TONES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} {tile ? "Save" : "Add KPI"}
        </Button>
      </DialogFooter>
    </form>
  );
}
