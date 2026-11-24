"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Team } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/common/filters";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { createTeam, updateTeam } from "@/lib/repositories";
import { FieldError } from "./department-form-dialog";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60, "Name is too long"),
  description: z.string().trim().max(300, "Keep the description under 300 characters"),
  departmentId: z.string().min(1, "Select a department"),
  supervisorId: z.string().nullable(),
  projectManagerId: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
});

type FormValues = z.infer<typeof schema>;

export function TeamFormDialog({
  team,
  defaultDepartmentId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  team?: Team;
  defaultDepartmentId?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const db = useDatabase();
  const { deptName, bandName } = useLookups();
  const { scope } = useCurrentUser();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const editing = Boolean(team);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", departmentId: "", supervisorId: null, projectManagerId: null, status: "active" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        team
          ? { name: team.name, description: team.description, departmentId: team.departmentId, supervisorId: team.supervisorId, projectManagerId: team.projectManagerId, status: team.status }
          : { name: "", description: "", departmentId: defaultDepartmentId ?? (scope.departmentIds?.length === 1 ? scope.departmentIds[0] : ""), supervisorId: null, projectManagerId: null, status: "active" },
      );
    }
  }, [open, team, defaultDepartmentId, scope.departmentIds, form]);

  const departmentId = useWatch({ control: form.control, name: "departmentId" });
  const departments = db.departments.filter((d) => (d.status === "active" || d.id === team?.departmentId) && (!scope.departmentIds || scope.departmentIds.includes(d.id)));
  const active = db.employees.filter((e) => e.status !== "inactive");
  const supervisorOptions = active
    .filter((e) => !departmentId || e.departmentId === departmentId)
    .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: bandName(e.bandId) }));
  // Project managers: PM role, or manager/leadership bands, from any department.
  const pmOptions = active
    .filter((e) => e.bandId === "BAND-4" || e.bandId === "BAND-5")
    .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: deptName(e.departmentId) }));

  const submit = form.handleSubmit(async (values) => {
    try {
      if (team) {
        await updateTeam(team.id, values);
        toast.success("Team updated", { description: values.name });
      } else {
        const created = await createTeam(values);
        toast.success("Team created", { description: `${created.name} (${created.id})` });
      }
      setOpen(false);
    } catch (err) {
      toast.error("Could not save team", { description: err instanceof Error ? err.message : String(err) });
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && setOpen(o)}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team" : "Add team"}</DialogTitle>
          <DialogDescription>{editing ? `Update details for ${team!.name}.` : "Create a team within a department and assign its leadership."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name *</Label>
            <Input id="team-name" {...form.register("name")} aria-invalid={Boolean(errors.name)} placeholder="e.g. Reporting & Analytics" />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Department *</Label>
            <Controller
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue("supervisorId", null);
                  }}
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errors.departmentId)}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.departmentId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-desc">Description</Label>
            <Textarea id="team-desc" rows={2} {...form.register("description")} placeholder="Scope and responsibilities" />
            <FieldError message={errors.description?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Team supervisor</Label>
              <Controller control={form.control} name="supervisorId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={supervisorOptions} placeholder={departmentId ? "Select supervisor" : "Pick a department first"} disabled={!departmentId} />} />
            </div>
            <div className="space-y-1.5">
              <Label>Project manager</Label>
              <Controller control={form.control} name="projectManagerId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={pmOptions} placeholder="Optional" />} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Save changes" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
