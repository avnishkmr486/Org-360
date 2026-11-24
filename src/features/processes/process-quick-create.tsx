"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Frequency } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/common/filters";
import { useCurrentUser, useDatabase, useToday } from "@/hooks/use-data";
import { createProcess } from "@/lib/repositories";
import { FREQUENCY_LABELS } from "@/lib/constants";

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Create a process without leaving the Process Management screen. Only the essentials are asked;
 * the new process opens straight in Manage & Track, where KPIs, items, actions and meetings are set up.
 */
export function ProcessQuickCreate({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">{open ? <Form onClose={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function Form({ onClose }: { onClose: () => void }) {
  const db = useDatabase();
  const today = useToday();
  const router = useRouter();
  const { user } = useCurrentUser();
  const cfg = db.settings.processConfig;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(user.employeeId);
  const [frequency, setFrequency] = useState<Frequency>(cfg.defaultFrequency);
  const [start, setStart] = useState(today);
  const [activate, setActivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const people = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!categoryId) return setError("Choose a category.");
    if (!departmentId) return setError("Choose the department this process belongs to.");
    if (!ownerId) return setError("Choose an owner.");
    setSaving(true);
    try {
      const p = await createProcess({
        name,
        categoryId,
        description: description.trim(),
        objective: "",
        departmentId,
        priority: "medium",
        status: activate ? "active" : "draft",
        riskLevel: "medium",
        tags: [],
        scope: { level: "department", departmentIds: [departmentId], teamIds: [], employeeIds: [] },
        escalationContactId: null,
        stakeholderIds: [],
        applicableTeamIds: [],
        applicableBandIds: [],
        ownerId,
        responsibleId: null,
        reviewerId: null,
        frequency,
        customIntervalDays: null,
        effectiveDate: start,
        expiryDate: null,
        slaDays: null,
        successMetric: "",
        meetingDate: null,
        meetingAgenda: "",
        meetingAttendeeIds: [],
        meetingNotes: "",
        followUpDate: null,
        followUpAction: "",
        followUpOwnerId: null,
        nextReviewDate: null,
        lastReviewedOn: null,
        references: [],
        remarks: "",
        complianceThreshold: cfg.defaultThreshold,
        isMandatory: true,
        requiresApproval: cfg.approvalRequiredByDefault,
        sopAttachment: null,
        steps: [{ id: `STP-${Date.now().toString(36)}`, name: "Complete the process", description: "", instructions: "", mandatory: true, expectedMinutes: 30, evidenceRequired: cfg.evidenceRequiredByDefault, approvalRequired: false }],
      });
      toast.success("Process created", { description: `${p.id} · ${p.name}${activate ? "" : " (draft)"}` });
      onClose();
      router.push(`/processes/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the process.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Create process</DialogTitle>
        <DialogDescription>Start with the basics. You will then set up KPIs, tracked items, action items and meetings on the process itself.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Process name" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design Review" required autoFocus />
        </F>
        <F label="Category">
          <Combobox value={categoryId} onChange={setCategoryId} options={db.processCategories.filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name }))} placeholder="Select category" allowClear={false} />
        </F>
        <F label="Department">
          <Combobox value={departmentId} onChange={setDepartmentId} options={db.departments.filter((d) => d.status === "active").map((d) => ({ value: d.id, label: d.name }))} placeholder="Select department" allowClear={false} />
        </F>
        <F label="Owner">
          <Combobox value={ownerId} onChange={setOwnerId} options={people} placeholder="Who owns it?" searchPlaceholder="Search employees…" allowClear={false} />
        </F>
        <F label="Frequency">
          <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
            <SelectTrigger aria-label="Frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FREQUENCY_LABELS) as Frequency[]).filter((f) => f !== "custom").map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Start date">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </F>
        <F label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this process for?" />
        </F>
      </div>
      <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <Switch checked={activate} onCheckedChange={setActivate} aria-label="Activate now" />
        <span>
          <span className="font-medium">Activate now</span>
          <span className="block text-xs text-muted-foreground">Starts generating compliance tasks for the department. Leave off to save it as a draft while you set it up.</span>
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="items-center sm:justify-between">
        <Button type="button" variant="link" className="px-0" onClick={() => { onClose(); router.push("/processes/new"); }}>
          Need every setting? Use the full wizard
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Create process
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
