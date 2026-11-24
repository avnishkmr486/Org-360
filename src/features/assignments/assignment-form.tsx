"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building, Building2, Layers, Loader2, Send, User, Users, UsersRound } from "lucide-react";
import type { AssignmentLevel, Frequency } from "@/types";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, MultiSelect } from "@/components/common/filters";
import { UserAvatar } from "@/components/common/user-avatar";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { createAssignment, previewAssignment, type AssignmentInput } from "@/lib/repositories";
import { inScope } from "@/lib/auth/permissions";
import { ASSIGNMENT_LEVEL_LABELS, FREQUENCY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    processId: z.string().min(1, "Select a process"),
    level: z.enum(["organization", "department", "team", "band", "employee"]),
    departmentId: z.string(),
    teamId: z.string(),
    bandId: z.string(),
    employeeIds: z.array(z.string()),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string(),
    frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annually", "event_based", "custom"]),
    dueRule: z.enum(["end_of_period", "days_after_start"]),
    offsetDays: z.number({ invalid_type_error: "Enter days" }).int().min(0).max(365),
    graceDays: z.number({ invalid_type_error: "Enter days" }).int().min(0).max(30),
    ownerId: z.string().min(1, "Select a process owner"),
    reviewerId: z.string(),
    notes: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.level === "department" && !v.departmentId) ctx.addIssue({ code: "custom", path: ["departmentId"], message: "Select a department" });
    if (v.level === "team" && !v.teamId) ctx.addIssue({ code: "custom", path: ["teamId"], message: "Select a team" });
    if (v.level === "band" && !v.bandId) ctx.addIssue({ code: "custom", path: ["bandId"], message: "Select a band" });
    if (v.level === "employee" && !v.employeeIds.length) ctx.addIssue({ code: "custom", path: ["employeeIds"], message: "Select at least one employee" });
    if (v.endDate && v.endDate <= v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date" });
  });

type FormValues = z.infer<typeof schema>;

const LEVEL_ICONS: Record<AssignmentLevel, typeof Building> = {
  organization: Building,
  department: Building2,
  team: UsersRound,
  band: Layers,
  employee: User,
};

export function NewAssignmentSheet({ open, onOpenChange, initialProcessId }: { open: boolean; onOpenChange: (o: boolean) => void; initialProcessId?: string }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const { scope, unrestricted } = useCurrentUser();
  const [saving, setSaving] = useState(false);

  const allowedLevels: AssignmentLevel[] = unrestricted
    ? ["organization", "department", "team", "band", "employee"]
    : scope.departmentIds
      ? ["department", "team", "band", "employee"]
      : ["team", "employee"];

  const blank = (processId = ""): FormValues => {
    const p = db.processes.find((x) => x.id === processId);
    return {
      processId,
      level: allowedLevels.includes("department") ? "department" : "team",
      departmentId: scope.departmentIds?.[0] ?? p?.departmentId ?? "",
      teamId: scope.teamIds?.[0] ?? "",
      bandId: "",
      employeeIds: [],
      startDate: today,
      endDate: "",
      frequency: p?.frequency ?? db.settings.processConfig.defaultFrequency,
      dueRule: "end_of_period",
      offsetDays: 3,
      graceDays: 0,
      ownerId: p?.ownerId ?? "",
      reviewerId: p?.reviewerId ?? "",
      notes: "",
    };
  };

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank(initialProcessId) });
  const { register, control, watch, setValue, handleSubmit, reset, formState } = form;
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(blank(initialProcessId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProcessId]);

  const v = watch();
  const process = db.processes.find((p) => p.id === v.processId);

  const departments = db.departments.filter((d) => d.status === "active" && (!scope.departmentIds || scope.departmentIds.includes(d.id)) && (!scope.teamIds || db.teams.some((t) => t.departmentId === d.id && scope.teamIds!.includes(t.id))));
  const teams = db.teams.filter((t) => t.status === "active" && (!v.departmentId || t.departmentId === v.departmentId) && (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)));
  const employees = db.employees.filter((e) => e.status !== "inactive" && inScope(e, scope) && (!v.departmentId || e.departmentId === v.departmentId) && (!v.teamId || e.teamId === v.teamId));
  const empOptions = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: L.deptName(e.departmentId) }));

  const toInput = (x: FormValues): AssignmentInput => ({
    processId: x.processId,
    level: x.level,
    departmentId: x.level === "organization" ? null : x.departmentId || null,
    teamId: ["team", "employee", "band"].includes(x.level) ? x.teamId || null : null,
    bandId: x.level === "band" ? x.bandId || null : null,
    employeeIds: x.level === "employee" ? x.employeeIds : [],
    startDate: x.startDate,
    endDate: x.endDate || null,
    frequency: x.frequency,
    dueConfig: { rule: x.dueRule, offsetDays: x.dueRule === "days_after_start" ? x.offsetDays : 0, graceDays: x.graceDays },
    ownerId: x.ownerId,
    reviewerId: x.reviewerId || null,
    notes: x.notes,
  });

  const preview = useMemo(() => {
    if (!v.processId) return [];
    try {
      let list = previewAssignment(toInput(v));
      if (!unrestricted) list = list.filter((e) => inScope(e, scope));
      return list;
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, JSON.stringify(v), unrestricted, scope]);

  const onSubmit = handleSubmit(async (x) => {
    setSaving(true);
    try {
      const r = await createAssignment(toInput(x));
      toast.success("Process assigned", { description: `${r.assignment.id} · ${r.employees} employees · ${r.tasks} tasks generated` });
      onOpenChange(false);
    } catch (e) {
      toast.error("Assignment failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  });

  const needsDept = v.level !== "organization";
  const missingTarget =
    (v.level === "department" && !v.departmentId) || (v.level === "team" && !v.teamId) || (v.level === "band" && !v.bandId) || (v.level === "employee" && !v.employeeIds.length);
  const targetLabel = { organization: "", department: "a department", team: "a team", band: "a band", employee: "employees" }[v.level];
  const showTeam = ["team", "employee", "band"].includes(v.level);

  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>New process assignment</SheetTitle>
          <SheetDescription>Assign a process to an organization, department, team, band or individual employees. Tasks are generated automatically.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <F label="Process" required error={errors.processId?.message}>
              <Controller
                control={control}
                name="processId"
                render={({ field }) => (
                  <Combobox
                    value={field.value || null}
                    onChange={(id) => {
                      field.onChange(id ?? "");
                      const p = db.processes.find((x) => x.id === id);
                      if (p) {
                        if (!scope.departmentIds && p.departmentId && !v.departmentId) setValue("departmentId", p.departmentId);
                        setValue("frequency", p.frequency);
                        setValue("ownerId", p.ownerId);
                        setValue("reviewerId", p.reviewerId ?? "");
                      }
                    }}
                    options={db.processes.filter((p) => p.status !== "inactive").map((p) => ({ value: p.id, label: p.name, hint: p.id }))}
                    placeholder="Select a process"
                    ariaInvalid={!!errors.processId}
                    allowClear={false}
                  />
                )}
              />
              {process ? (
                <p className="text-xs text-muted-foreground">
                  {L.categoryName(process.categoryId)} · {FREQUENCY_LABELS[process.frequency]} · {process.steps.length} steps{process.requiresApproval ? " · approval required" : ""}
                </p>
              ) : null}
            </F>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Assignment level</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allowedLevels.map((lvl) => {
                  const Icon = LEVEL_ICONS[lvl];
                  return (
                    <button
                      type="button"
                      key={lvl}
                      onClick={() => setValue("level", lvl, { shouldValidate: false })}
                      className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/50", v.level === lvl && "border-primary bg-info-soft/60 text-primary")}
                      aria-pressed={v.level === lvl}
                    >
                      <Icon className="size-4 shrink-0" /> {ASSIGNMENT_LEVEL_LABELS[lvl]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {needsDept ? (
                <F label={v.level === "department" ? "Department" : "Department (filter)"} required={v.level === "department"} error={errors.departmentId?.message}>
                  <Controller
                    control={control}
                    name="departmentId"
                    render={({ field }) => (
                      <Select
                        value={field.value || "all"}
                        onValueChange={(x) => {
                          field.onChange(x === "all" ? "" : x);
                          setValue("teamId", "");
                          setValue("employeeIds", []);
                        }}
                      >
                        <SelectTrigger className="w-full" aria-invalid={!!errors.departmentId}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {v.level !== "department" && !scope.departmentIds ? <SelectItem value="all">All departments</SelectItem> : null}
                          {v.level === "department" && !field.value ? <SelectItem value="all">Select department</SelectItem> : null}
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </F>
              ) : null}
              {showTeam ? (
                <F label={v.level === "team" ? "Team" : "Team (filter)"} required={v.level === "team"} error={errors.teamId?.message}>
                  <Controller
                    control={control}
                    name="teamId"
                    render={({ field }) => (
                      <Select
                        value={field.value || "all"}
                        onValueChange={(x) => {
                          field.onChange(x === "all" ? "" : x);
                          setValue("employeeIds", []);
                        }}
                      >
                        <SelectTrigger className="w-full" aria-invalid={!!errors.teamId}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{v.level === "team" ? "Select team" : "All teams"}</SelectItem>
                          {teams.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </F>
              ) : null}
              {v.level === "band" ? (
                <F label="Band" required error={errors.bandId?.message}>
                  <Controller
                    control={control}
                    name="bandId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full" aria-invalid={!!errors.bandId}>
                          <SelectValue placeholder="Select band" />
                        </SelectTrigger>
                        <SelectContent>
                          {db.bands.filter((b) => b.status === "active").map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.code} · {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </F>
              ) : null}
            </div>

            {v.level === "employee" ? (
              <F label="Employees" required error={errors.employeeIds?.message} hint={`${employees.length} employees match the department/team filter`}>
                <Controller
                  control={control}
                  name="employeeIds"
                  render={({ field }) => <MultiSelect values={field.value} onChange={field.onChange} options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: L.teamName(e.teamId) }))} placeholder="Select employees" searchPlaceholder="Search employees…" />}
                />
              </F>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Start date" required error={errors.startDate?.message}>
                <Input type="date" {...register("startDate")} />
              </F>
              <F label="End date" hint="Optional" error={errors.endDate?.message}>
                <Input type="date" {...register("endDate")} aria-invalid={!!errors.endDate} />
              </F>
              <F label="Frequency">
                <Controller
                  control={control}
                  name="frequency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(x) => field.onChange(x as Frequency)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                          <SelectItem key={f} value={f}>
                            {FREQUENCY_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </F>
              <F label="Due date rule">
                <Controller
                  control={control}
                  name="dueRule"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="end_of_period">End of each period</SelectItem>
                        <SelectItem value="days_after_start">N days after period start</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </F>
              {v.dueRule === "days_after_start" ? (
                <F label="Days after start" error={errors.offsetDays?.message}>
                  <Input type="number" min={0} {...register("offsetDays", { valueAsNumber: true })} />
                </F>
              ) : null}
              <F label="Grace days" hint="Before a task counts as overdue" error={errors.graceDays?.message}>
                <Input type="number" min={0} max={30} {...register("graceDays", { valueAsNumber: true })} />
              </F>
              <F label="Process owner" required error={errors.ownerId?.message}>
                <Controller control={control} name="ownerId" render={({ field }) => <Combobox value={field.value || null} onChange={(x) => field.onChange(x ?? "")} options={empOptions} placeholder="Select owner" ariaInvalid={!!errors.ownerId} />} />
              </F>
              <F label="Reviewer" hint={process?.requiresApproval ? "Approves submissions" : "Optional"}>
                <Controller control={control} name="reviewerId" render={({ field }) => <Combobox value={field.value || null} onChange={(x) => field.onChange(x ?? "")} options={empOptions} placeholder="Select reviewer" />} />
              </F>
            </div>
            <F label="Notes" hint="Optional context for assignees">
              <Textarea rows={2} {...register("notes")} />
            </F>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-teal" />
                {v.processId && missingTarget ? (
                  <span className="text-muted-foreground">Select {targetLabel} to preview eligible employees</span>
                ) : v.processId ? (
                  <span>
                    This will apply to <span className="text-teal">{preview.length}</span> eligible employee{preview.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select a process to preview who receives it</span>
                )}
              </div>
              {preview.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preview.slice(0, 24).map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2 text-[11px]" title={`${L.teamName(e.teamId)} · ${L.deptName(e.departmentId)}`}>
                      <UserAvatar name={`${e.firstName} ${e.lastName}`} size="xs" />
                      {e.firstName} {e.lastName}
                    </span>
                  ))}
                  {preview.length > 24 ? <span className="self-center text-xs text-muted-foreground">+{preview.length - 24} more</span> : null}
                </div>
              ) : v.processId && !missingTarget ? (
                <p className="mt-2 text-xs text-muted-foreground">No active employees match. Process applicability (teams/bands) also narrows the audience.</p>
              ) : null}
            </div>
          </div>
          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (Boolean(v.processId) && !missingTarget && preview.length === 0)}>
              {saving ? <Loader2 className="animate-spin" /> : <Send />} {missingTarget || !preview.length ? "Assign process" : `Assign to ${preview.length} employee${preview.length === 1 ? "" : "s"}`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function F({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
