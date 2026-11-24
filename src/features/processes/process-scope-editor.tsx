"use client";

import { useMemo } from "react";
import { Building2, Users, UsersRound } from "lucide-react";
import type { ProcessApplicability, ProcessScope } from "@/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/common/filters";
import { UserAvatar } from "@/components/common/user-avatar";
import { useDatabase } from "@/hooks/use-data";
import {
  employeesForSelection,
  normalizeScope,
  resolveScopeEmployees,
  SCOPE_LEVEL_HELP,
  SCOPE_LEVEL_LABELS,
  teamsForDepartments,
} from "@/lib/services/process-scope";
import { cn } from "@/lib/utils";

const LEVEL_ICON: Record<ProcessApplicability, typeof Building2> = { department: Building2, team: UsersRound, employee: Users };

interface Props {
  value: ProcessScope;
  onChange: (next: ProcessScope) => void;
  /** Band filter of the process — narrows the live preview the same way assignments do. */
  processFilters?: { applicableBandIds: string[] };
  disabled?: boolean;
  className?: string;
}

/**
 * "Process applied for" editor.
 *   1. Pick the level (Department / Team / Employee).
 *   2. Add departments.
 *   3. Teams and employees are brought in from the employee data of those departments.
 */
export function ProcessScopeEditor({ value, onChange, processFilters, disabled, className }: Props) {
  const db = useDatabase();
  const departments = db.departments.filter((d) => d.status === "active");

  const teams = useMemo(() => teamsForDepartments(db, value.departmentIds), [db, value.departmentIds]);
  const memberCount = (teamId: string) => db.employees.filter((e) => e.teamId === teamId && e.status !== "inactive").length;
  const pool = useMemo(() => employeesForSelection(db, value.departmentIds, value.teamIds), [db, value.departmentIds, value.teamIds]);
  const covered = useMemo(() => resolveScopeEmployees(value, db, processFilters), [value, db, processFilters]);

  const set = (patch: Partial<ProcessScope>) => onChange(normalizeScope({ ...value, ...patch }, db));

  const deptName = (id: string) => db.departments.find((d) => d.id === id)?.name ?? id;
  const teamName = (id: string | null) => (id ? (db.teams.find((t) => t.id === id)?.name ?? id) : "No team");
  const LevelIcon = LEVEL_ICON[value.level];

  return (
    <div className={cn("space-y-5", className)}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
        <div className="space-y-1.5">
          <Label>Applied at</Label>
          <Select value={value.level} onValueChange={(v) => set({ level: v as ProcessApplicability })} disabled={disabled}>
            <SelectTrigger className="w-full" aria-label="Applicability level">
              <LevelIcon className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SCOPE_LEVEL_LABELS) as ProcessApplicability[]).map((l) => (
                <SelectItem key={l} value={l}>
                  {SCOPE_LEVEL_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{SCOPE_LEVEL_HELP[value.level]}</p>
        </div>

        <div className="space-y-1.5">
          <Label>Departments</Label>
          <MultiSelect
            values={value.departmentIds}
            onChange={(ids) => set({ departmentIds: ids })}
            options={departments.map((d) => ({ value: d.id, label: d.name, hint: `${db.employees.filter((e) => e.departmentId === d.id && e.status !== "inactive").length} employees` }))}
            placeholder="Select departments to apply this process to"
            searchPlaceholder="Search departments…"
            disabled={disabled}
          />
        </div>
      </div>

      {value.departmentIds.length > 0 && value.level !== "department" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Teams <span className="font-normal text-muted-foreground">(from employee data)</span>
            </Label>
            <MultiSelect
              values={value.teamIds}
              onChange={(ids) => set({ teamIds: ids })}
              options={teams.map((t) => ({ value: t.id, label: t.name, hint: `${memberCount(t.id)} members · ${deptName(t.departmentId)}` }))}
              placeholder={value.level === "team" ? "Select teams" : "Narrow employees by team (optional)"}
              searchPlaceholder="Search teams…"
              disabled={disabled}
            />
          </div>
          {value.level === "employee" ? (
            <div className="space-y-1.5">
              <Label>
                Employees <span className="font-normal text-muted-foreground">(from employee data)</span>
              </Label>
              <MultiSelect
                values={value.employeeIds}
                onChange={(ids) => set({ employeeIds: ids })}
                options={pool.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: `${teamName(e.teamId)} · ${e.id}` }))}
                placeholder="Select employees"
                searchPlaceholder="Search by name, team or ID…"
                disabled={disabled}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {covered.length ? (
              <>
                Covers <span className="text-primary">{covered.length}</span> active employee{covered.length === 1 ? "" : "s"}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {new Set(covered.map((e) => e.departmentId)).size} department(s) · {new Set(covered.filter((e) => e.teamId).map((e) => e.teamId)).size} team(s)
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No employees selected yet.</span>
            )}
          </div>
        </div>
        {covered.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {covered.slice(0, 14).map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2 text-[11px]" title={`${teamName(e.teamId)} · ${deptName(e.departmentId)}`}>
                <UserAvatar name={`${e.firstName} ${e.lastName}`} size="xs" />
                {e.firstName} {e.lastName}
              </span>
            ))}
            {covered.length > 14 ? <span className="self-center text-[11px] text-muted-foreground">+{covered.length - 14} more</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
