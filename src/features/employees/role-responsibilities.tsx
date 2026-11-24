"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Briefcase, CheckCircle2, Crown, ListChecks, Pencil, Workflow } from "lucide-react";
import type { Employee } from "@/types";
import { ToneBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { updateEmployee } from "@/lib/repositories";

const lines = (s: string | undefined) =>
  (s ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);

/** Process roles an employee holds, by process. */
const PROCESS_ROLES = [
  ["ownerId", "Owner"],
  ["responsibleId", "Responsible"],
  ["reviewerId", "Reviewer"],
  ["followUpOwnerId", "Follow-up owner"],
  ["escalationContactId", "Escalation contact"],
] as const;

/** Employee profile: what this person's role is, what they are responsible for, and the processes/teams they lead. */
export function RoleResponsibilities({ employee }: { employee: Employee }) {
  const db = useDatabase();
  const L = useLookups();
  const { can, role } = useCurrentUser();
  const canEdit = can("employees.manage");
  const [editing, setEditing] = useState(false);

  const designation = employee.designationId ? db.designations.find((d) => d.id === employee.designationId) : undefined;
  const fromRole = lines(designation?.responsibilities);
  const personal = lines(employee.responsibilities);

  const leads = [
    ...db.departments.filter((d) => d.headId === employee.id).map((d) => ({ key: d.id, label: `Head of ${d.name}`, href: `/departments/${d.id}` })),
    ...db.teams.filter((t) => t.supervisorId === employee.id).map((t) => ({ key: `${t.id}-s`, label: `Supervisor · ${t.name}`, href: `/teams/${t.id}` })),
    ...db.teams.filter((t) => t.projectManagerId === employee.id).map((t) => ({ key: `${t.id}-p`, label: `Project manager · ${t.name}`, href: `/teams/${t.id}` })),
  ];
  const directReports = db.employees.filter((e) => e.reportingManagerId === employee.id && e.status !== "inactive").length;
  const processRoles = db.processes
    .filter((p) => p.status !== "inactive")
    .map((p) => ({
      process: p,
      roles: [...PROCESS_ROLES.filter(([k]) => p[k] === employee.id).map(([, label]) => label), ...(p.stakeholderIds.includes(employee.id) ? ["Stakeholder"] : [])],
    }))
    .filter((x) => x.roles.length);

  return (
    <section className="card-elevated grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* role */}
      <div className="space-y-3 border-b p-4 lg:border-b-0 lg:border-r">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Briefcase className="size-4 text-info" /> Role
        </h3>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{designation?.name ?? "No designation set"}</span>
            <ToneBadge tone="neutral">{L.bandCode(employee.bandId)}</ToneBadge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {designation?.summary || (designation ? "No role summary yet." : canEdit ? "Set a designation with Edit employee." : "No designation has been set.")}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Department</dt>
            <dd className="font-medium">{L.deptName(employee.departmentId)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Team</dt>
            <dd className="font-medium">{employee.teamId ? L.teamName(employee.teamId) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reports to</dt>
            <dd className="font-medium">{L.empName(employee.reportingManagerId)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Direct reports</dt>
            <dd className="font-medium tabular-nums">{directReports}</dd>
          </div>
        </dl>
      </div>

      {/* responsibilities */}
      <div className="space-y-3 border-b p-4 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-success" /> Key responsibilities
          </h3>
          <div className="flex items-center gap-1">
            {role === "super_admin" && designation ? (
              <Button variant="ghost" size="xs" asChild>
                <Link href="/master-data/designations" title="Edit the responsibilities every employee with this designation shares">
                  <BadgeCheck /> Designation
                </Link>
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="outline" size="xs" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            ) : null}
          </div>
        </div>
        {fromRole.length || personal.length ? (
          <ul className="space-y-1.5 text-sm">
            {fromRole.map((r, i) => (
              <li key={`r${i}`} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                <span>{r}</span>
              </li>
            ))}
            {personal.map((r, i) => (
              <li key={`p${i}`} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-info" />
                <span>
                  {r} <span className="ml-1 rounded bg-info-soft px-1 py-px text-[10px] font-medium text-info">specific to {employee.firstName}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No responsibilities recorded yet.{canEdit ? " Use Edit to add them." : ""}</p>
        )}
      </div>

      {/* accountability: what they lead and the processes they hold a role in */}
      <div className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Workflow className="size-4 text-teal" /> Accountable for
        </h3>
        {leads.length ? (
          <ul className="space-y-1">
            {leads.map((l) => (
              <li key={l.key} className="flex items-center gap-2 text-sm">
                <Crown className="size-3.5 shrink-0 text-warning" />
                <Link href={l.href} className="truncate hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {processRoles.length ? (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {processRoles.map(({ process, roles }) => (
              <li key={process.id} className="text-sm">
                <Link href={`/processes/${process.id}`} className="block truncate font-medium hover:underline">
                  {process.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {roles.map((r) => (
                    <span key={r} className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      {r}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {!leads.length && !processRoles.length ? <p className="text-sm text-muted-foreground">No team leadership or process roles.</p> : null}
      </div>

      <EditDialog employee={employee} designationName={designation?.name} shared={fromRole} open={editing} onOpenChange={setEditing} />
    </section>
  );
}

function EditDialog({ employee, designationName, shared, open, onOpenChange }: { employee: Employee; designationName?: string; shared: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState(employee.responsibilities ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setText(employee.responsibilities ?? "");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Responsibilities for {employee.firstName}</DialogTitle>
          <DialogDescription>
            Add what is specific to this person, one per line.
            {designationName ? ` The ${shared.length} responsibilities shared by every ${designationName} are edited under Master Data → Designations.` : ""}
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"e.g. Owns the monthly release checklist\nPrimary contact for the Toast integration"} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateEmployee(employee.id, { responsibilities: lines(text).join("\n") });
                toast.success("Responsibilities saved");
                onOpenChange(false);
              } catch (e) {
                toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
