"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Department } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { departmentHeadOptions } from "@/features/departments/department-head-select";
import { Combobox } from "@/components/common/filters";
import { useDatabase } from "@/hooks/use-data";
import { createDepartment, updateDepartment } from "@/lib/repositories";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60, "Name is too long"),
  code: z
    .string()
    .trim()
    .min(2, "Code must be 2–10 characters")
    .max(10, "Code must be 2–10 characters")
    .regex(/^[A-Za-z0-9&-]+$/, "Letters, numbers, & and - only"),
  description: z.string().trim().max(300, "Keep the description under 300 characters"),
  headId: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
});

type FormValues = z.infer<typeof schema>;

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-danger">{message}</p> : null;
}

export function DepartmentFormDialog({
  department,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: {
  department?: Department;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onSaved?: (d: Department | undefined) => void;
}) {
  const db = useDatabase();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const editing = Boolean(department);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", code: "", description: "", headId: null, status: "active" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        department
          ? { name: department.name, code: department.code, description: department.description, headId: department.headId, status: department.status }
          : { name: "", code: "", description: "", headId: null, status: "active" },
      );
    }
  }, [open, department, form]);

  const headOptions = departmentHeadOptions(db, department?.headId ?? null);

  const submit = form.handleSubmit(async (values) => {
    try {
      if (department) {
        await updateDepartment(department.id, { ...values, code: values.code.toUpperCase() });
        toast.success("Department updated", { description: values.name });
        onSaved?.(department);
      } else {
        const created = await createDepartment({ ...values, code: values.code.toUpperCase() });
        toast.success("Department created", { description: `${created.name} (${created.id})` });
        onSaved?.(created);
      }
      setOpen(false);
    } catch (err) {
      toast.error("Could not save department", { description: err instanceof Error ? err.message : String(err) });
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && setOpen(o)}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit department" : "Add department"}</DialogTitle>
          <DialogDescription>{editing ? `Update details for ${department!.name}.` : "Create a new functional department in the organization."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="dep-name">Department name *</Label>
              <Input id="dep-name" {...form.register("name")} aria-invalid={Boolean(errors.name)} placeholder="e.g. Data & Analytics" />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-code">Code *</Label>
              <Input id="dep-code" {...form.register("code")} aria-invalid={Boolean(errors.code)} placeholder="DATA" className="uppercase" />
              <FieldError message={errors.code?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-desc">Description</Label>
            <Textarea id="dep-desc" rows={3} {...form.register("description")} placeholder="What this department is accountable for" />
            <FieldError message={errors.description?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department head</Label>
              <Controller control={form.control} name="headId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={headOptions} placeholder="Select head" searchPlaceholder="Search employees…" />} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Save changes" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
