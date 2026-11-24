"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Employee } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/common/filters";
import { useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { createEmployee, updateEmployee } from "@/lib/repositories";
import { employeeFormSchema, type EmployeeFormValues } from "./employee-schema";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function Field({ label, error, required, children, className, hint }: { label: string; error?: string; required?: boolean; children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-[11px] text-danger">{error}</p> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SimpleSelect({ value, onChange, options, placeholder, invalid, allowNone }: { value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string }[]; placeholder: string; invalid?: boolean; allowNone?: string }) {
  return (
    <Select value={value ?? (allowNone ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{allowNone}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Add / edit employee dialog. Pass `employee` to edit. */
export function EmployeeFormDialog({ open, onOpenChange, employee, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: Employee | null; onSaved?: (e: Employee) => void }) {
  const db = useDatabase();
  const today = useToday();
  const L = useLookups();
  const isEdit = Boolean(employee);
  const schema = useMemo(() => employeeFormSchema(today), [today]);
  const [saving, setSaving] = useState(false);

  const defaults = (): EmployeeFormValues =>
    employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone,
          bandId: employee.bandId,
          designationId: employee.designationId ?? null,
          departmentId: employee.departmentId,
          teamId: employee.teamId,
          reportingManagerId: employee.reportingManagerId,
          dateOfJoining: employee.dateOfJoining,
          status: employee.status,
        }
      : {
          id: "",
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          bandId: "",
          designationId: null,
          departmentId: "",
          teamId: null,
          reportingManagerId: null,
          dateOfJoining: today,
          status: "active",
        };

  const form = useForm<EmployeeFormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });
  const { register, handleSubmit, control, watch, setValue, reset, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.id]);

  const departmentId = watch("departmentId");
  const teamId = watch("teamId");
  const teams = db.teams.filter((t) => t.status === "active" && t.departmentId === departmentId);
  const supervisor = teamId ? L.empName(L.teams.get(teamId)?.supervisorId) : "—";
  const active = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === "active");

  const onSubmit = async (values: EmployeeFormValues) => {
    setSaving(true);
    try {
      const payload = { ...values, id: values.id.toUpperCase(), email: values.email.toLowerCase() };
      if (isEdit && employee) {
        const { id: _id, ...patch } = payload;
        void _id;
        const saved = await updateEmployee(employee.id, patch);
        toast.success("Employee updated", { description: `${saved.firstName} ${saved.lastName}` });
        onSaved?.(saved);
      } else {
        const saved = await createEmployee(payload);
        toast.success("Employee added", { description: `${saved.firstName} ${saved.lastName} · ${saved.id}` });
        onSaved?.(saved);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(isEdit ? "Could not update employee" : "Could not add employee", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${employee?.firstName} ${employee?.lastName}` : "Add employee"}</DialogTitle>
          <DialogDescription>Employee ID is the unique identifier used across compliance tracking and Excel imports.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal & contact</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employee ID" required error={errors.id?.message} hint={isEdit ? "Employee ID cannot be changed" : "Letters, numbers, - . _ (e.g. 2011-256); must be unique"}>
                <Input {...register("id")} readOnly={isEdit} className={cn(isEdit && "bg-muted")} aria-invalid={Boolean(errors.id)} />
              </Field>
              <Field label="Employment status" required error={errors.status?.message}>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? "active")}
                      placeholder="Select status"
                      options={[
                        { value: "active", label: "Active" },
                        { value: "on_leave", label: "On Leave" },
                        { value: "inactive", label: "Inactive" },
                      ]}
                    />
                  )}
                />
              </Field>
              <Field label="First name" required error={errors.firstName?.message}>
                <Input {...register("firstName")} aria-invalid={Boolean(errors.firstName)} />
              </Field>
              <Field label="Last name" required error={errors.lastName?.message}>
                <Input {...register("lastName")} aria-invalid={Boolean(errors.lastName)} />
              </Field>
              <Field label="Email" hint="Optional" error={errors.email?.message}>
                <Input type="email" {...register("email")} aria-invalid={Boolean(errors.email)} />
              </Field>
              <Field label="Contact number" hint="Optional" error={errors.phone?.message}>
                <Input {...register("phone")} placeholder="+91 9812345678" aria-invalid={Boolean(errors.phone)} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organization</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Department" required error={errors.departmentId?.message}>
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value || null}
                      onChange={(v) => {
                        field.onChange(v ?? "");
                        setValue("teamId", null);
                      }}
                      invalid={Boolean(errors.departmentId)}
                      placeholder="Select department"
                      options={active(db.departments).map((d) => ({ value: d.id, label: d.name }))}
                    />
                  )}
                />
              </Field>
              <Field label="Team" hint={departmentId ? (teams.length ? "Optional — leave blank for department-level roles" : "No active teams in this department") : "Select a department first"}>
                <Controller
                  control={control}
                  name="teamId"
                  render={({ field }) => <SimpleSelect value={field.value} onChange={field.onChange} placeholder="Select team" allowNone="No team (department level)" options={teams.map((t) => ({ value: t.id, label: t.name }))} />}
                />
              </Field>
              <Field label="Band" required error={errors.bandId?.message}>
                <Controller
                  control={control}
                  name="bandId"
                  render={({ field }) => <SimpleSelect value={field.value || null} onChange={(v) => field.onChange(v ?? "")} invalid={Boolean(errors.bandId)} placeholder="Select band" options={active(db.bands).map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))} />}
                />
              </Field>
              <Field label="Designation">
                <Controller
                  control={control}
                  name="designationId"
                  render={({ field }) => (
                    <Combobox
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Search designation…"
                      options={db.designations.filter((d) => d.status === "active" || d.id === field.value).map((d) => ({ value: d.id, label: d.name }))}
                    />
                  )}
                />
              </Field>
              <Field label="Reporting manager">
                <Controller
                  control={control}
                  name="reportingManagerId"
                  render={({ field }) => (
                    <Combobox
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Search manager…"
                      options={db.employees.filter((e) => e.status !== "inactive" && e.id !== employee?.id).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: L.deptName(e.departmentId) }))}
                    />
                  )}
                />
              </Field>
              <Field label="Team supervisor" hint="Derived from the selected team">
                <Input value={supervisor} readOnly className="bg-muted" />
              </Field>
              <Field label="Date of joining" required error={errors.dateOfJoining?.message}>
                <Input type="date" max={today} {...register("dateOfJoining")} aria-invalid={Boolean(errors.dateOfJoining)} />
              </Field>
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {isEdit ? "Save changes" : "Add employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
