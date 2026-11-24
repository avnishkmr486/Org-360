"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AppRole, AppUser } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/common/filters";
import { useDatabase } from "@/hooks/use-data";
import { createUser, updateUser } from "@/lib/repositories";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  // Optional: people without an email sign in with their Employee ID.
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]),
  role: z.enum(ROLES as [AppRole, ...AppRole[]]),
  employeeId: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;

export function UserFormDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: AppUser | null }) {
  const db = useDatabase();
  const [saving, setSaving] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", role: "employee", employeeId: null, status: "active" },
  });
  const { register, handleSubmit, control, reset, setValue, watch, formState } = form;
  const role = watch("role");

  useEffect(() => {
    if (open) reset(user ? { name: user.name, email: user.email, role: user.role, employeeId: user.employeeId, status: user.status } : { name: "", email: "", role: "employee", employeeId: null, status: "active" });
  }, [open, user, reset]);

  const onSubmit = async (v: Values) => {
    if (v.role !== "super_admin" && v.role !== "administrator" && !v.employeeId) {
      form.setError("employeeId", { message: "Link an employee — it determines this user's data scope." });
      return;
    }
    setSaving(true);
    try {
      if (user) {
        await updateUser(user.id, v);
        toast.success("User updated", { description: v.name });
      } else {
        await createUser(v);
        toast.success("User created", { description: `${v.name} · ${ROLE_LABELS[v.role]}` });
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not save user", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const employees = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>Application users and their demo access role. Linking an employee scopes the data they can see.</DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" {...register("name")} aria-invalid={!!formState.errors.name} />
              {formState.errors.name ? <p className="text-xs text-destructive">{formState.errors.name.message}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email (optional)</Label>
              <Input id="u-email" type="email" {...register("email")} aria-invalid={!!formState.errors.email} />
              {formState.errors.email ? <p className="text-xs text-destructive">{formState.errors.email.message}</p> : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Application role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Linked employee</Label>
            <Controller
              control={control}
              name="employeeId"
              render={({ field }) => (
                <Combobox
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    const e = db.employees.find((x) => x.id === v);
                    if (e && !form.getValues("name")) setValue("name", `${e.firstName} ${e.lastName}`);
                    if (e?.email && !form.getValues("email")) setValue("email", e.email);
                  }}
                  options={employees}
                  placeholder="Select employee…"
                  searchPlaceholder="Search employees…"
                  ariaInvalid={!!formState.errors.employeeId}
                />
              )}
            />
            {formState.errors.employeeId ? <p className="text-xs text-destructive">{formState.errors.employeeId.message}</p> : <p className="text-xs text-muted-foreground">Optional for Super Admin and Administrator.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={control}
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
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {user ? "Save changes" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
