"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { HubTile, Process, ProcessKpi } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type Column } from "@/components/tables/data-table";
import { useDatabase } from "@/hooks/use-data";
import { removeKpi, saveHubTiles } from "@/lib/repositories";
import { DEFAULT_HUB_TILES } from "@/features/processes/hub-tiles";
import { TileForm, describeTile, saveHubTile } from "@/features/processes/hub-kpis";
import { KPI_TYPES, KpiForm, targetText } from "@/features/processes/kpi-settings";

const HUB_SCREEN = "__hub__";

/** One row of the master table: a KPI and the screen it is configured on. */
type KpiRow =
  | { source: "hub"; key: string; screen: string; screenId: string; name: string; kind: string; definition: string; tile: HubTile }
  | { source: "process"; key: string; screen: string; screenId: string; name: string; kind: string; definition: string; process: Process; kpi: ProcessKpi };

const fail = (e: unknown) => toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });

/** Super Admin: every KPI configured on any screen, with the screen it belongs to, and add / change / delete. */
export function KpiMasterPanel() {
  const db = useDatabase();
  const tiles = db.settings.hubTiles ?? DEFAULT_HUB_TILES;
  const [q, setQ] = useState("");
  const [screenFilter, setScreenFilter] = useState<string>("all");
  const [dialog, setDialog] = useState<{ row: KpiRow | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<KpiRow[]>(() => {
    const hub: KpiRow[] = tiles.map((t) => ({ source: "hub" as const, key: t.id, screen: "Process Management", screenId: HUB_SCREEN, name: t.label, kind: "Summary tile", definition: describeTile(t), tile: t }));
    const perProcess: KpiRow[] = db.processes.flatMap((p) =>
      (p.kpis ?? []).map<KpiRow>((k) => ({
        source: "process",
        key: `${p.id}:${k.id}`,
        screen: `Process · ${p.name}`,
        screenId: p.id,
        name: k.name,
        kind: `Tracked KPI · ${KPI_TYPES[k.type]}`,
        definition: [k.target ? `target ${targetText(k)}` : "no target", k.unit].filter(Boolean).join(" · "),
        process: p,
        kpi: k,
      })),
    );
    return [...hub, ...perProcess];
  }, [tiles, db.processes]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (screenFilter === "all" || r.screenId === screenFilter) && (!needle || `${r.screen} ${r.name} ${r.kind} ${r.definition}`.toLowerCase().includes(needle)));

  const remove = async (r: KpiRow) => {
    try {
      if (r.source === "hub") await saveHubTiles(tiles.filter((t) => t.id !== r.tile.id));
      else await removeKpi(r.screenId, r.kpi.id);
      toast.success("KPI deleted");
    } catch (e) {
      fail(e);
    }
  };

  const columns: Column<KpiRow>[] = [
    { id: "screen", header: "Screen", cell: (r) => <span className="font-medium">{r.screen}</span>, sortValue: (r) => r.screen },
    { id: "name", header: "KPI", cell: (r) => r.name, sortValue: (r) => r.name },
    { id: "kind", header: "Kind", cell: (r) => <span className="text-muted-foreground">{r.kind}</span>, sortValue: (r) => r.kind },
    { id: "definition", header: "Definition", cell: (r) => <span className="text-muted-foreground">{r.definition}</span>, sortValue: (r) => r.definition },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => setDialog({ row: r })}>
            <Pencil />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete “${r.name}”?`}
            description={r.source === "hub" ? "The tile disappears from Process Management for everyone." : "The KPI column and every value entered under it are removed from that process."}
            confirmLabel="Delete KPI"
            destructive
            onConfirm={() => remove(r)}
          />
        </div>
      ),
    },
  ];

  const screens = [{ id: HUB_SCREEN, name: "Process Management" }, ...db.processes.map((p) => ({ id: p.id, name: `Process · ${p.name}` }))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">KPI Master</h2>
          <p className="text-sm text-muted-foreground">Every KPI configured on any screen, with the screen it appears on. Add, change or delete them here.</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ row: null })}>
          <Plus /> Add KPI
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search KPI or screen…" className="w-64" aria-label="Search KPIs" />
        <Select value={screenFilter} onValueChange={setScreenFilter}>
          <SelectTrigger className="w-64" aria-label="Screen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All screens</SelectItem>
            {screens.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {shown.length} of {rows.length} KPIs
        </span>
      </div>

      <DataTable columns={columns} rows={shown} getRowId={(r) => r.key} pageSize={25} initialSort={{ id: "screen", dir: "asc" }} empty={<div className="py-6 text-center text-sm text-muted-foreground">No KPIs match.</div>} />

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">{dialog ? <KpiEditor row={dialog.row} processes={db.processes} tiles={tiles} busy={busy} setBusy={setBusy} onDone={() => setDialog(null)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}

function KpiEditor({ row, processes, tiles, busy, setBusy, onDone }: { row: KpiRow | null; processes: Process[]; tiles: HubTile[]; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void }) {
  // Changing an existing KPI keeps its screen; a new one first asks which screen it is for.
  const [screen, setScreen] = useState<string | null>(row ? row.screenId : null);
  if (!screen) {
    return <ScreenPicker processes={processes} onPick={setScreen} />;
  }
  if (screen === HUB_SCREEN) {
    return (
      <TileForm
        tile={row && row.source === "hub" ? row.tile : null}
        busy={busy}
        onCancel={onDone}
        onSave={async (t) => {
          setBusy(true);
          try {
            await saveHubTile(tiles, t);
            toast.success(row ? "KPI updated" : "KPI added");
            onDone();
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }
  return <KpiForm processId={screen} kpi={row && row.source === "process" ? row.kpi : null} onDone={onDone} />;
}

function ScreenPicker({ processes, onPick }: { processes: Process[]; onPick: (id: string) => void }) {
  const [value, setValue] = useState<string>(HUB_SCREEN);
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Add KPI</DialogTitle>
        <DialogDescription>Which screen should it appear on?</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label className="text-xs">Screen</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger aria-label="Screen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={HUB_SCREEN}>Process Management (summary tile)</SelectItem>
            {processes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                Process · {p.name} (tracked KPI)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onPick(value)}>Continue</Button>
      </div>
    </div>
  );
}
