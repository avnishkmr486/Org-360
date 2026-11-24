"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import type { AnalyticsFilter, ProcessStatus } from "@/types";
import { FilterSelect, ResetFiltersButton } from "@/components/common/filters";
import { useBaseFilter, useCurrentUser, useDatabase, useGlobalDateRange } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { inScope } from "@/lib/auth/permissions";
import { DATE_PRESET_LABELS, formatRange } from "@/lib/utils/dates";
import { PROCESS_STATUS_META } from "@/lib/constants";

export const ANALYTICS_KEYS = ["department", "team", "employee", "band", "category", "pstatus", "process"] as const;
export type AnalyticsKey = (typeof ANALYTICS_KEYS)[number];

/** Combines the global date range with URL filters into an AnalyticsFilter. */
export function useAnalyticsFilter() {
  const base = useBaseFilter();
  const url = useUrlFilters(ANALYTICS_KEYS);
  const v = url.values;
  const filter: AnalyticsFilter = useMemo(
    () => ({
      range: base.range,
      departmentId: v.department || null,
      teamId: v.team || null,
      employeeId: v.employee || null,
      bandId: v.band || null,
      processCategoryId: v.category || null,
      processStatus: (v.pstatus as ProcessStatus) || null,
      processId: v.process || null,
    }),
    [base.range, v.department, v.team, v.employee, v.band, v.category, v.pstatus, v.process],
  );
  return { filter, ...url };
}

type FilterKey = "department" | "team" | "employee" | "band" | "role" | "category" | "pstatus" | "process";

/** Filter bar with cascading Department → Team → Employee selects. */
export function AnalyticsFilterBar({ show = ["department", "team", "employee", "band", "category", "pstatus"] }: { show?: FilterKey[] }) {
  const db = useDatabase();
  const { scope } = useCurrentUser();
  const { preset, range } = useGlobalDateRange();
  const { values: v, set, clear, activeCount } = useUrlFilters(ANALYTICS_KEYS);

  const departments = db.departments.filter((d) => d.status === "active" && (!scope.departmentIds || scope.departmentIds.includes(d.id)));
  const teams = db.teams.filter(
    (t) => t.status === "active" && (!v.department || t.departmentId === v.department) && (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)),
  );
  const employees = db.employees.filter((e) => inScope(e, scope) && (!v.department || e.departmentId === v.department) && (!v.team || e.teamId === v.team));
  const has = (k: FilterKey) => show.includes(k);

  return (
    <>
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground" title="Change the period from the date selector in the top bar">
        <CalendarDays className="size-3.5" />
        <span className="font-medium text-foreground">{DATE_PRESET_LABELS[preset]}</span>
        <span className="hidden sm:inline">· {formatRange(range)}</span>
      </span>
      {has("department") && departments.length > 1 ? (
        <FilterSelect label="Department" value={v.department} onChange={(x) => set({ department: x, team: null, employee: null })} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
      ) : null}
      {has("team") && teams.length > 1 ? <FilterSelect label="Team" value={v.team} onChange={(x) => set({ team: x, employee: null })} options={teams.map((t) => ({ value: t.id, label: t.name }))} /> : null}
      {has("employee") && employees.length > 1 ? (
        <FilterSelect label="Employee" value={v.employee} onChange={(x) => set({ employee: x })} options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))} />
      ) : null}
      {has("band") ? <FilterSelect label="Band" value={v.band} onChange={(x) => set({ band: x })} options={db.bands.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))} /> : null}
      {has("category") ? <FilterSelect label="Category" value={v.category} onChange={(x) => set({ category: x })} options={db.processCategories.map((c) => ({ value: c.id, label: c.name }))} /> : null}
      {has("process") ? <FilterSelect label="Process" value={v.process} onChange={(x) => set({ process: x })} options={db.processes.map((p) => ({ value: p.id, label: p.name }))} /> : null}
      {has("pstatus") ? (
        <FilterSelect
          label="Process status"
          value={v.pstatus}
          onChange={(x) => set({ pstatus: x })}
          options={(Object.keys(PROCESS_STATUS_META) as ProcessStatus[]).map((s) => ({ value: s, label: PROCESS_STATUS_META[s].label }))}
        />
      ) : null}
      <ResetFiltersButton count={activeCount} onClick={clear} />
    </>
  );
}

/** Builds a query string carrying the current analytics filters (for drill-down links). */
export function useFilterQuery() {
  const { values } = useUrlFilters(ANALYTICS_KEYS);
  return (extra: Record<string, string | null | undefined> = {}) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(values)) if (val) p.set(k, val);
    for (const [k, val] of Object.entries(extra)) {
      if (val) p.set(k, val);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };
}
