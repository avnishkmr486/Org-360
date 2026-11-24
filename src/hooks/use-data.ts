"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { AnalyticsFilter, AppUser, Database, DataScope, DateRange, Employee } from "@/types";
import { getDb, getServerSnapshot, subscribe, TODAY } from "@/lib/store/mock-db";
import { getUiServerSnapshot, getUiState, setUiState, subscribeUi, type UiState } from "@/lib/store/ui-store";
import { can as roleCan, getScope, homeDashboardFor, isUnrestricted, type Permission } from "@/lib/auth/permissions";
import { navForRole } from "@/lib/navigation";
import { resolvePreset, type DatePreset } from "@/lib/utils/dates";

/** Live database snapshot (re-renders on every store write). */
export function useDatabase(): Database {
  return useSyncExternalStore(subscribe, getDb, getServerSnapshot);
}

export function useUiState(): UiState {
  return useSyncExternalStore(subscribeUi, getUiState, getUiServerSnapshot);
}

const noop = () => () => {};
/** False during SSR/hydration, true once mounted on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useToday() {
  return TODAY;
}

/** Lookup maps for rendering names from IDs. */
export function useLookups() {
  const db = useDatabase();
  return useMemo(() => {
    const employees = new Map(db.employees.map((e) => [e.id, e]));
    const departments = new Map(db.departments.map((d) => [d.id, d]));
    const teams = new Map(db.teams.map((t) => [t.id, t]));
    const bands = new Map(db.bands.map((b) => [b.id, b]));
    const processes = new Map(db.processes.map((p) => [p.id, p]));
    const categories = new Map(db.processCategories.map((c) => [c.id, c]));
    const designations = new Map(db.designations.map((d) => [d.id, d]));
    const empName = (id: string | null | undefined) => {
      if (!id) return "—";
      const e = employees.get(id);
      return e ? `${e.firstName} ${e.lastName}` : id;
    };
    return {
      employees,
      departments,
      teams,
      bands,
      processes,
      categories,
      empName,
      deptName: (id: string | null | undefined) => (id ? (departments.get(id)?.name ?? id) : "—"),
      teamName: (id: string | null | undefined) => (id ? (teams.get(id)?.name ?? id) : "—"),
      bandName: (id: string | null | undefined) => (id ? (bands.get(id)?.name ?? id) : "—"),
      bandCode: (id: string | null | undefined) => (id ? (bands.get(id)?.code ?? id) : "—"),
      processName: (id: string | null | undefined) => (id ? (processes.get(id)?.name ?? id) : "—"),
      categoryName: (id: string | null | undefined) => (id ? (categories.get(id)?.name ?? id) : "—"),
      designationName: (id: string | null | undefined) => (id ? (designations.get(id)?.name ?? id) : "—"),
    };
  }, [db]);
}

export type Lookups = ReturnType<typeof useLookups>;

export interface CurrentUser {
  user: AppUser;
  employee: Employee | null;
  role: AppUser["role"];
  scope: DataScope;
  unrestricted: boolean;
  can: (p: Permission) => boolean;
  nav: ReturnType<typeof navForRole>;
  home: ReturnType<typeof homeDashboardFor>;
}

/** The demo persona currently selected in the role switcher. */
export function useCurrentUser(): CurrentUser {
  const db = useDatabase();
  const ui = useUiState();
  return useMemo(() => {
    const user = db.users.find((u) => u.id === ui.currentUserId) ?? db.users[0];
    const employee = user.employeeId ? (db.employees.find((e) => e.id === user.employeeId) ?? null) : null;
    const scope = getScope(user, employee, db);
    return {
      user,
      employee,
      role: user.role,
      scope,
      unrestricted: isUnrestricted(scope),
      can: (p: Permission) => roleCan(user.role, p),
      nav: navForRole(user.role, db.settings.menuHidden?.[user.role]),
      home: homeDashboardFor(user.role),
    };
  }, [db, ui.currentUserId]);
}

/** The account that actually signed in (null when signed out) — as opposed to whoever a Super Admin is "viewing as". */
export function useSignedInUser(): AppUser | null {
  const db = useDatabase();
  const ui = useUiState();
  return useMemo(() => (ui.signedInUserId ? (db.users.find((u) => u.id === ui.signedInUserId) ?? null) : null), [db, ui.signedInUserId]);
}

export function switchPersona(userId: string) {
  setUiState({ currentUserId: userId });
}

/** Global date range from the top bar. */
export function useGlobalDateRange(): { preset: DatePreset; range: DateRange; setPreset: (p: DatePreset, custom?: DateRange) => void } {
  const ui = useUiState();
  const range = useMemo(() => resolvePreset(ui.datePreset, TODAY, ui.customRange), [ui.datePreset, ui.customRange]);
  const setPreset = useCallback((p: DatePreset, custom?: DateRange) => setUiState({ datePreset: p, customRange: custom ?? (p === "custom" ? getUiState().customRange : null) }), []);
  return { preset: ui.datePreset, range, setPreset };
}

/** Base analytics filter = global date range; pages layer their own filters on top. */
export function useBaseFilter(): AnalyticsFilter {
  const { range } = useGlobalDateRange();
  return useMemo(() => ({ range }), [range]);
}
