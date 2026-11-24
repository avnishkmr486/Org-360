"use client";

import { useMemo } from "react";
import { computeStats, filterTasks, groupStats } from "@/lib/calculations/compliance";
import { useDatabase, useGlobalDateRange, useToday } from "@/hooks/use-data";

/**
 * Compliance per department / team / employee for the global date range,
 * plus the set of processes assigned to each department and team.
 */
export function useOrgAnalytics() {
  const db = useDatabase();
  const today = useToday();
  const { range } = useGlobalDateRange();

  return useMemo(() => {
    const tasks = filterTasks(db, { range });
    const emp = new Map(db.employees.map((e) => [e.id, e]));
    const byDept = groupStats(tasks, (t) => emp.get(t.employeeId)?.departmentId, today);
    const byTeam = groupStats(tasks, (t) => emp.get(t.employeeId)?.teamId ?? null, today);
    const byEmp = groupStats(tasks, (t) => t.employeeId, today);
    const org = computeStats(tasks, today);

    const deptProcs = new Map<string, Set<string>>();
    const teamProcs = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, k: string, v: string) => {
      const s = m.get(k);
      if (s) s.add(v);
      else m.set(k, new Set([v]));
    };
    for (const t of db.tasks) {
      const e = emp.get(t.employeeId);
      if (!e) continue;
      add(deptProcs, e.departmentId, t.processId);
      if (e.teamId) add(teamProcs, e.teamId, t.processId);
    }
    for (const p of db.processes) if (p.departmentId) add(deptProcs, p.departmentId, p.id);

    const empty = computeStats([], today);
    return {
      range,
      tasks,
      org,
      empty,
      deptStats: (id: string) => byDept.get(id) ?? empty,
      teamStats: (id: string) => byTeam.get(id) ?? empty,
      empStats: (id: string) => byEmp.get(id) ?? empty,
      deptProcesses: (id: string) => deptProcs.get(id) ?? new Set<string>(),
      teamProcesses: (id: string) => teamProcs.get(id) ?? new Set<string>(),
    };
  }, [db, today, range]);
}

export type OrgAnalytics = ReturnType<typeof useOrgAnalytics>;
