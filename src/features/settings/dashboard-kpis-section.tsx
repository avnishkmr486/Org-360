"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from "lucide-react";
import type { DashboardKey } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDatabase } from "@/hooks/use-data";
import { saveDashboardKpis } from "@/lib/repositories";
import { DASHBOARD_KEYS, DEFAULT_DASHBOARD_KPIS, buildKpiCatalog, selectedKpiIds } from "@/components/dashboard/dashboard-kpis";
import { TONE_VAR } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Super Admin: pick which KPI tiles each dashboard shows (employees, compliance, clients, modules, integrations…) and their order. */
export function DashboardKpisPanel() {
  const db = useDatabase();
  const [key, setKey] = useState<DashboardKey>("executive");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const catalog = useMemo(() => buildKpiCatalog(db), [db]);
  const byId = useMemo(() => new Map(catalog.map((k) => [k.id, k])), [catalog]);
  const ids = selectedKpiIds(db, key, catalog);
  const chosen = new Set(ids);

  const save = async (next: string[], ok: string) => {
    setBusy(true);
    try {
      await saveDashboardKpis(key, next);
      toast.success(ok);
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return save(next, "Order saved");
  };

  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, typeof catalog>();
    for (const k of catalog) {
      if (chosen.has(k.id) || (needle && !`${k.label} ${k.group} ${k.description}`.toLowerCase().includes(needle))) continue;
      m.set(k.group, [...(m.get(k.group) ?? []), k]);
    }
    return [...m];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, ids.join("|"), needle]);

  return (
    <section className="card-elevated fade-in">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">Dashboard KPIs</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Choose the KPI tiles each dashboard shows and the order they appear in. Changes apply to everyone.</p>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist">
          {DASHBOARD_KEYS.map((d) => (
            <button key={d.key} role="tab" aria-selected={key === d.key} onClick={() => setKey(d.key)} className={cn("flex-1 rounded-md px-3 py-1.5 font-medium transition-colors", key === d.key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shown on dashboard ({ids.length})</h3>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(DEFAULT_DASHBOARD_KPIS[key], "Standard KPIs restored")}>
                <RotateCcw /> Restore standard set
              </Button>
            </div>
            {ids.length ? (
              <ul className="divide-y rounded-lg border">
                {ids.map((id, i) => {
                  const k = byId.get(id)!;
                  return (
                    <li key={id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${TONE_VAR[k.tone]} 14%, transparent)`, color: TONE_VAR[k.tone] }}>
                        <k.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{k.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{k.group}</div>
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${k.label} up`} disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${k.label} down`} disabled={i === ids.length - 1 || busy} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${k.label}`} disabled={busy} onClick={() => save(ids.filter((x) => x !== id), "KPI removed")}>
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No tiles selected. Add some from the list.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available KPIs</h3>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search KPIs…" className="h-8 max-w-52" />
            </div>
            {groups.length ? (
              <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                {groups.map(([group, list]) => (
                  <div key={group}>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{group}</div>
                    <ul className="divide-y rounded-lg border">
                      {list.map((k) => (
                        <li key={k.id} className="flex items-center gap-2 px-3 py-2">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${TONE_VAR[k.tone]} 14%, transparent)`, color: TONE_VAR[k.tone] }}>
                            <k.icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{k.label}</div>
                            <div className="truncate text-xs text-muted-foreground" title={k.description}>{k.description}</div>
                          </div>
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => save([...ids, k.id], "KPI added")}>
                            <Plus /> Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{needle ? "No KPIs match." : "Every available KPI is already on this dashboard."}</p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Compliance, people and process KPIs follow the dashboard&apos;s filters. Client, module, integration and other ecosystem KPIs count the whole organization and follow the types defined under Ecosystem.</p>
      </div>
    </section>
  );
}
