"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, CalendarClock, ClipboardCheck, Loader2, RotateCcw, Save } from "lucide-react";
import type { Process } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, MultiSelect } from "@/components/common/filters";
import { ToneBadge } from "@/components/common/badges";
import { useCurrentUser, useDatabase, useToday } from "@/hooks/use-data";
import { processAccess } from "@/lib/auth/process-access";
import { updateProcess } from "@/lib/repositories";
import { daysBetween, formatDate } from "@/lib/utils/dates";

interface Draft {
  meetingDate: string;
  meetingAgenda: string;
  meetingAttendeeIds: string[];
  meetingNotes: string;
  followUpDate: string;
  followUpAction: string;
  followUpOwnerId: string | null;
  nextReviewDate: string;
  lastReviewedOn: string;
}

const fromProcess = (p: Process): Draft => ({
  meetingDate: p.meetingDate ?? "",
  meetingAgenda: p.meetingAgenda,
  meetingAttendeeIds: p.meetingAttendeeIds,
  meetingNotes: p.meetingNotes,
  followUpDate: p.followUpDate ?? "",
  followUpAction: p.followUpAction,
  followUpOwnerId: p.followUpOwnerId,
  nextReviewDate: p.nextReviewDate ?? "",
  lastReviewedOn: p.lastReviewedOn ?? "",
});

/** Relative-date chip: "in 5 days" / "overdue by 3 days" / "today". */
function DueChip({ date, doneLabel }: { date: string | null; doneLabel?: string }) {
  const today = useToday();
  if (!date) return <ToneBadge tone="neutral">Not set</ToneBadge>;
  const d = daysBetween(today, date);
  if (d === 0) return <ToneBadge tone="warning">Today</ToneBadge>;
  if (d > 0) return <ToneBadge tone="info">in {d} day{d === 1 ? "" : "s"}</ToneBadge>;
  return doneLabel ? <ToneBadge tone="success">{doneLabel} {-d}d ago</ToneBadge> : <ToneBadge tone="danger">overdue by {-d} day{d === -1 ? "" : "s"}</ToneBadge>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** Meeting, follow-up and review planning for a process. */
export function GovernanceTab({ process: p }: { process: Process }) {
  const db = useDatabase();
  const today = useToday();
  const { role, employee } = useCurrentUser();
  const canEdit = processAccess(db, role, employee?.id ?? null, p).manage;
  const [d, setD] = useState<Draft>(fromProcess(p));
  const [saving, setSaving] = useState(false);
  useEffect(() => setD(fromProcess(p)), [p]);

  const people = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));
  const dirty = JSON.stringify(d) !== JSON.stringify(fromProcess(p));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const dateError = d.meetingDate && d.followUpDate && d.followUpDate < d.meetingDate ? "Follow-up date can't be before the meeting date." : null;

  const save = async (override?: Partial<Draft>, summary?: string) => {
    const x = { ...d, ...override };
    setSaving(true);
    try {
      await updateProcess(
        p.id,
        {
          meetingDate: x.meetingDate || null,
          meetingAgenda: x.meetingAgenda.trim(),
          meetingAttendeeIds: x.meetingAttendeeIds,
          meetingNotes: x.meetingNotes.trim(),
          followUpDate: x.followUpDate || null,
          followUpAction: x.followUpAction.trim(),
          followUpOwnerId: x.followUpOwnerId,
          nextReviewDate: x.nextReviewDate || null,
          lastReviewedOn: x.lastReviewedOn || null,
        },
        summary,
      );
      toast.success("Meeting & follow-up details saved", { description: "Recorded in the process timeline." });
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: CalendarCheck, label: "Meeting", date: p.meetingDate, done: "held" },
          { icon: CalendarClock, label: "Follow-up", date: p.followUpDate, done: undefined },
          { icon: ClipboardCheck, label: "Next review", date: p.nextReviewDate, done: undefined },
        ].map(({ icon: Icon, label, date, done }) => (
          <div key={label} className="card-elevated flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-teal-soft text-teal">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-sm font-semibold">{date ? formatDate(date) : "—"}</div>
            </div>
            <div className="ml-auto">
              <DueChip date={date} doneLabel={done} />
            </div>
          </div>
        ))}
      </div>

      <section className="card-elevated p-5">
        <h3 className="mb-4 text-sm font-semibold">Meeting</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Meeting date">
            <Input type="date" value={d.meetingDate} onChange={(e) => set("meetingDate", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Attendees">
            <MultiSelect values={d.meetingAttendeeIds} onChange={(v) => set("meetingAttendeeIds", v)} options={people} placeholder="Select attendees" searchPlaceholder="Search employees…" disabled={!canEdit} />
          </Field>
          <Field label="Agenda" className="md:col-span-2">
            <Textarea rows={2} value={d.meetingAgenda} onChange={(e) => set("meetingAgenda", e.target.value)} placeholder="What will be discussed?" disabled={!canEdit} />
          </Field>
          <Field label="Meeting notes / minutes" className="md:col-span-2">
            <Textarea rows={3} value={d.meetingNotes} onChange={(e) => set("meetingNotes", e.target.value)} placeholder="Decisions, blockers and agreed actions" disabled={!canEdit} />
          </Field>
        </div>
      </section>

      <section className="card-elevated p-5">
        <h3 className="mb-4 text-sm font-semibold">Follow-up &amp; review</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Follow-up date">
            <Input type="date" value={d.followUpDate} min={d.meetingDate || undefined} onChange={(e) => set("followUpDate", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Follow-up owner" className="md:col-span-2">
            <Combobox value={d.followUpOwnerId} onChange={(v) => set("followUpOwnerId", v)} options={people} placeholder="Who follows up?" searchPlaceholder="Search employees…" disabled={!canEdit} />
          </Field>
          <Field label="Follow-up action" className="md:col-span-3">
            <Textarea rows={2} value={d.followUpAction} onChange={(e) => set("followUpAction", e.target.value)} placeholder="What needs to happen by the follow-up date?" disabled={!canEdit} />
          </Field>
          <Field label="Next review date">
            <Input type="date" value={d.nextReviewDate} onChange={(e) => set("nextReviewDate", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Last reviewed on">
            <Input type="date" value={d.lastReviewedOn} max={today} onChange={(e) => set("lastReviewedOn", e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        {dateError ? <p className="mt-3 text-xs text-danger">{dateError}</p> : null}

        {canEdit ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => save({ lastReviewedOn: today }, "Marked as reviewed today.")}>
                <ClipboardCheck /> Mark reviewed today
              </Button>
              <Button variant="outline" size="sm" disabled={saving || !p.followUpDate} onClick={() => save({ followUpDate: "", followUpAction: "" }, "Follow-up completed and cleared.")}>
                Complete follow-up
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setD(fromProcess(p))} disabled={!dirty || saving}>
                <RotateCcw /> Reset
              </Button>
              <Button size="sm" onClick={() => save()} disabled={!dirty || saving || dateError !== null}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
