"use client";

import { useMemo } from "react";
import type { DashboardKey } from "@/types";
import type { DashboardMetrics } from "@/lib/calculations/dashboard";
import { KpiCard } from "@/components/common/kpi-card";
import { useDatabase } from "@/hooks/use-data";
import { buildKpiCatalog, selectedKpiIds } from "./dashboard-kpis";

/** The KPI tiles at the top of a dashboard — whichever ones a Super Admin chose in Settings → Dashboard KPIs. */
export function DashboardKpiStrip({ dashboard, m, q, label }: { dashboard: DashboardKey; m: DashboardMetrics; q: (extra?: Record<string, string>) => string; label: string }) {
  const db = useDatabase();
  const threshold = db.settings.thresholds.good;
  const tiles = useMemo(() => {
    const catalog = buildKpiCatalog(db);
    const byId = new Map(catalog.map((k) => [k.id, k]));
    return selectedKpiIds(db, dashboard, catalog).map((id) => byId.get(id)!);
  }, [db, dashboard]);

  if (!tiles.length) return <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">No KPI tiles selected. A Super Admin can add them in Settings → Dashboard KPIs.</p>;
  return (
    <section className="kpi-strip" aria-label={label}>
      {tiles.map((t) => {
        const r = t.compute({ db, m, q, threshold });
        return <KpiCard key={t.id} label={t.label} value={r.value} icon={t.icon} tone={t.tone} hint={r.hint} delta={r.delta} deltaUnit={r.deltaUnit} goodWhen={r.goodWhen} href={r.href} />;
      })}
    </section>
  );
}
