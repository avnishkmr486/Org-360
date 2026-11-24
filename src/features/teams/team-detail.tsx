"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlarmClock, ArrowLeft, Briefcase, ClipboardList, Loader2, Pencil, ShieldCheck, UserCog, UserMinus, UserPlus, Users, Workflow } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiCard } from "@/components/common/kpi-card";
import { ChartCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart, GroupComplianceBars, MonthlyPerformanceChart } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { EmploymentStatusBadge, RecordStatusBadge, TierBadge, ToneBadge } from "@/components/common/badges";
import { PersonCell, UserAvatar } from "@/components/common/user-avatar";
import { ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MultiSelect } from "@/components/common/filters";
import { ExportMenu } from "@/components/common/export-menu";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { getDashboardMetrics } from "@/lib/calculations/dashboard";
import { computeEmployeeCompliance, filterTasks, getTier, type EmployeeCompliance } from "@/lib/calculations/compliance";
import { assignProjectManager, assignTeamSupervisor, setTeamMembers } from "@/lib/repositories";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatPercent } from "@/lib/utils/format";
import { formatRange } from "@/lib/utils/dates";
import { TeamFormDialog } from "@/features/organization/team-form-dialog";
import { AssignPersonDialog } from "@/features/organization/assign-person-dialog";

export function TeamDetail({ id }: { id: string }) {
  const db = useDatabase();
  const lk = useLookups();
  const today = useToday();
  const router = useRouter();
  const { range } = useGlobalDateRange();
  const { scope, can } = useCurrentUser();
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [removing, setRemoving] = useState<EmployeeCompliance | null>(null);
  const [assign, setAssign] = useState<"supervisor" | "pm" | null>(null);

  const team = db.teams.find((t) => t.id === id);
  const filter = useMemo(() => ({ range, teamId: id }), [range, id]);
  const m = useMemo(() => getDashboardMetrics(db, filter, null, today), [db, filter, today]);
  const members = useMemo(() => db.employees.filter((e) => e.teamId === id), [db.employees, id]);
  const memberRows = useMemo(() => computeEmployeeCompliance(members, filterTasks(db, filter), today, db.settings.thresholds), [members, db, filter, today]);

  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Team Management", href: "/teams" }, { label: "Not found" }]} title="Team not found" />
        <ErrorState
          title={`No team with ID “${id}”`}
          description="It may have been removed, or the link is incorrect."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/teams">
                <ArrowLeft /> Back to teams
              </Link>
            </Button>
          }
        />
      </div>
    );
  }
  if ((scope.teamIds && !scope.teamIds.includes(id)) || (scope.departmentIds && !scope.departmentIds.includes(team.departmentId))) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Team Management", href: "/teams" }, { label: team.name }]} title={team.name} />
        <ErrorState title="Outside your scope" description="Your current persona cannot view this team." />
      </div>
    );
  }

  const canManage = can("organization.manage");
  const k = m.kpis;
  const s = m.stats;
  const threshold = db.settings.thresholds.good;
  const sup = team.supervisorId ? lk.employees.get(team.supervisorId) : undefined;
  const pm = team.projectManagerId ? lk.employees.get(team.projectManagerId) : undefined;

  const cols: Column<EmployeeCompliance>[] = [
    {
      id: "name",
      header: "Employee",
      cell: (r) => (
        <Link href={`/employees/${r.employee.id}`} onClick={(e) => e.stopPropagation()}>
          <PersonCell name={`${r.employee.firstName} ${r.employee.lastName}`} sub={lk.bandName(r.employee.bandId)} />
        </Link>
      ),
      sortValue: (r) => r.employee.firstName,
    },
    {
      id: "pos",
      header: "Position",
      cell: (r) => (r.employee.id === team.supervisorId ? <ToneBadge tone="teal">Supervisor</ToneBadge> : r.employee.id === team.projectManagerId ? <ToneBadge tone="info">Project Manager</ToneBadge> : <span className="text-xs text-muted-foreground">Member</span>),
    },
    { id: "band", header: "Band", cell: (r) => lk.bandCode(r.employee.bandId), sortValue: (r) => lk.bandCode(r.employee.bandId) },
    { id: "status", header: "Status", cell: (r) => <EmploymentStatusBadge status={r.employee.status} /> },
    { id: "due", header: "Due", align: "right", cell: (r) => r.stats.due, sortValue: (r) => r.stats.due },
    { id: "ontime", header: "On-time", align: "right", cell: (r) => formatPercent(r.stats.onTimeRate, 0), sortValue: (r) => r.stats.onTimeRate ?? -1 },
    { id: "over", header: "Overdue", align: "right", cell: (r) => <span className={r.stats.overdue ? "font-medium text-danger" : ""}>{r.stats.overdue}</span>, sortValue: (r) => r.stats.overdue },
    { id: "comp", header: "Compliance", cell: (r) => <ComplianceBar value={r.stats.compliance} />, sortValue: (r) => r.stats.compliance ?? -1 },
    { id: "tier", header: "Rating", cell: (r) => <TierBadge tier={r.tier} /> },
    ...(canManage
      ? [
          {
            id: "act",
            header: "",
            align: "right" as const,
            cell: (r: EmployeeCompliance) => (
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.employee.firstName} from team`} onClick={(e) => { e.stopPropagation(); setRemoving(r); }}>
                <UserMinus />
              </Button>
            ),
          },
        ]
      : []),
  ];

  const exportSummary = [
    { label: "Team compliance", value: formatPercent(k.compliance.value) },
    { label: "Members", value: k.activeEmployees },
    { label: "Pending", value: s.pending },
    { label: "Overdue", value: s.overdue },
  ];
  const exportBase = { organizationName: db.organization.name, title: `${team.name} — Team Compliance`, subtitle: `${lk.deptName(team.departmentId)} · Period ${formatRange(range)}`, fileName: `Team_${team.id}_Compliance_${range.to}`, summary: exportSummary, rows: memberRows, footer: db.settings.reportFooter };

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Team Management", href: "/teams" }, { label: lk.deptName(team.departmentId), href: `/departments/${team.departmentId}` }, { label: team.name }]}
        title={team.name}
        titleAdornment={<RecordStatusBadge status={team.status} />}
        description={team.description || `${lk.deptName(team.departmentId)} team`}
        actions={
          <>
            <ExportMenu
              onExcel={() =>
                exportToExcel({
                  ...exportBase,
                  columns: [
                    { header: "Employee ID", value: (r: EmployeeCompliance) => r.employee.id },
                    { header: "Employee", value: (r) => `${r.employee.firstName} ${r.employee.lastName}`, width: 24 },
                    { header: "Due", value: (r) => r.stats.due },
                    { header: "Completed", value: (r) => r.stats.completedDue },
                    { header: "Overdue", value: (r) => r.stats.overdue },
                    { header: "On-time %", value: (r) => r.stats.onTimeRate, numFmt: '0.0"%"' },
                    { header: "Compliance %", value: (r) => r.stats.compliance, numFmt: '0.0"%"' },
                  ],
                })
              }
              onPdf={() =>
                exportToPdf({
                  ...exportBase,
                  columns: [
                    { header: "Employee", value: (r: EmployeeCompliance) => `${r.employee.firstName} ${r.employee.lastName}` },
                    { header: "Due", value: (r) => r.stats.due, align: "right" },
                    { header: "Overdue", value: (r) => r.stats.overdue, align: "right" },
                    { header: "On-time", value: (r) => formatPercent(r.stats.onTimeRate), align: "right" },
                    { header: "Compliance", value: (r) => formatPercent(r.stats.compliance), align: "right" },
                  ],
                })
              }
            />
            {canManage ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
                  <UserPlus /> Manage members
                </Button>
                <Button size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil /> Edit team
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        <LeaderCard label="Team supervisor" icon={UserCog} person={sup ? { id: sup.id, name: `${sup.firstName} ${sup.lastName}`, sub: lk.bandName(sup.bandId) } : null} onAssign={canManage ? () => setAssign("supervisor") : undefined} />
        <LeaderCard label="Project manager" icon={Briefcase} person={pm ? { id: pm.id, name: `${pm.firstName} ${pm.lastName}`, sub: lk.deptName(pm.departmentId) } : null} onAssign={canManage ? () => setAssign("pm") : undefined} />
      </div>

      <section className="kpi-strip">
        <KpiCard label="Members" value={k.activeEmployees} icon={Users} tone="info" hint={`${members.length} on record`} />
        <KpiCard label="Team compliance" value={formatPercent(k.compliance.value)} icon={ShieldCheck} tone="info" delta={k.compliance.delta} href={`/compliance?team=${id}`} />
        <KpiCard label="Participation" value={formatPercent(k.participation.value)} icon={Activity} tone="teal" delta={k.participation.delta} />
        <KpiCard label="Assigned processes" value={m.processes.length} icon={Workflow} tone="neutral" />
        <KpiCard label="Pending tasks" value={s.pending} icon={ClipboardList} tone="neutral" hint={`${s.awaitingReview} awaiting review`} href={`/compliance?team=${id}&status=in_progress`} />
        <KpiCard label="Overdue tasks" value={s.overdue} icon={AlarmClock} tone="danger" delta={k.overdueTasks.delta} deltaUnit="" goodWhen="down" href={`/compliance?team=${id}&status=overdue`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Team compliance trend" description="Last six months · click a month to open its tasks">
          <ComplianceTrendChart data={m.trend} threshold={threshold} onPointClick={(d) => {
            const b = m.trend.find((t) => t.key === d.key);
            if (b) router.push(`/compliance?team=${id}&from=${b.range.from}&to=${b.range.to}`);
          }} />
        </ChartCard>
        <ChartCard title="Employee-wise compliance" description="Click an employee to open their profile">
          <GroupComplianceBars
            data={[...m.employees].sort((a, b) => (a.stats.compliance ?? 101) - (b.stats.compliance ?? 101)).map((e) => ({ id: e.employee.id, name: `${e.employee.firstName} ${e.employee.lastName}`, compliance: e.stats.compliance, tier: e.tier, due: e.stats.due, overdue: e.stats.overdue }))}
            threshold={threshold}
            onSelect={(d) => router.push(`/employees/${d.id}`)}
          />
        </ChartCard>
      </div>

      <DataTable columns={cols} rows={memberRows} getRowId={(r) => r.employee.id} onRowClick={(r) => router.push(`/employees/${r.employee.id}`)} initialSort={{ id: "comp", dir: "asc" }} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Assigned processes" description="Process-wise adherence for this team">
          <GroupComplianceBars
            data={[...m.processes].sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101)).map((p) => ({ id: p.id, name: p.name, compliance: p.compliance, tier: getTier(p.compliance, db.settings.thresholds), due: p.stats.due, overdue: p.stats.overdue, sub: `Owner ${p.ownerName}` }))}
            threshold={threshold}
            onSelect={(d) => router.push(`/processes/${d.id}`)}
          />
        </ChartCard>
        <ChartCard title="Monthly completion" description="Due tasks completed vs not completed">
          <MonthlyPerformanceChart data={m.trend} />
        </ChartCard>
      </div>

      <TeamFormDialog open={editOpen} onOpenChange={setEditOpen} team={team} />
      <ManageMembersDialog open={membersOpen} onOpenChange={setMembersOpen} teamId={id} teamName={team.name} departmentId={team.departmentId} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.employee.firstName} ${removing?.employee.lastName} from ${team.name}?`}
        description="The employee stays in their department without a team. Their compliance history is kept."
        confirmLabel="Remove from team"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            await setTeamMembers(id, members.filter((e) => e.id !== removing.employee.id).map((e) => e.id));
            toast.success("Member removed", { description: `${removing.employee.firstName} ${removing.employee.lastName}` });
          } catch (err) {
            toast.error("Could not remove member", { description: err instanceof Error ? err.message : String(err) });
          }
        }}
      />
      <AssignPersonDialog
        open={assign !== null}
        onOpenChange={(o) => !o && setAssign(null)}
        title={assign === "pm" ? "Assign project manager" : "Assign team supervisor"}
        description={`Who is accountable for ${team.name}?`}
        label={assign === "pm" ? "Project manager" : "Team supervisor"}
        options={db.employees
          .filter((e) => e.status !== "inactive" && (assign === "pm" ? e.bandId === "BAND-4" || e.bandId === "BAND-5" : e.departmentId === team.departmentId))
          .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: assign === "pm" ? lk.deptName(e.departmentId) : lk.bandName(e.bandId) }))}
        currentId={assign === "pm" ? team.projectManagerId : team.supervisorId}
        successMessage={assign === "pm" ? "Project manager assigned" : "Team supervisor assigned"}
        onSave={async (pid) => {
          if (assign === "pm") await assignProjectManager(id, pid);
          else await assignTeamSupervisor(id, pid);
        }}
      />
    </div>
  );
}

function LeaderCard({ label, icon: Icon, person, onAssign }: { label: string; icon: typeof UserCog; person: { id: string; name: string; sub: string } | null; onAssign?: () => void }) {
  return (
    <div className="card-elevated flex items-center gap-3 p-4">
      {person ? <UserAvatar name={person.name} size="lg" /> : <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" /></span>}
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        {person ? (
          <Link href={`/employees/${person.id}`} className="font-semibold hover:text-primary hover:underline">
            {person.name}
          </Link>
        ) : (
          <div className="font-semibold text-warning">Unassigned</div>
        )}
        <div className="truncate text-xs text-muted-foreground">{person?.sub ?? "No one is accountable yet"}</div>
      </div>
      {onAssign ? (
        <Button variant="outline" size="sm" onClick={onAssign}>
          {person ? "Change" : "Assign"}
        </Button>
      ) : null}
    </div>
  );
}

function ManageMembersDialog({ open, onOpenChange, teamId, teamName, departmentId }: { open: boolean; onOpenChange: (o: boolean) => void; teamId: string; teamName: string; departmentId: string }) {
  const db = useDatabase();
  const lk = useLookups();
  const current = db.employees.filter((e) => e.teamId === teamId).map((e) => e.id);
  const [values, setValues] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValues(db.employees.filter((e) => e.teamId === teamId).map((e) => e.id));
  }, [open, db.employees, teamId]);

  const options = db.employees
    .filter((e) => e.status !== "inactive" || e.teamId === teamId)
    .sort((a, b) => Number(b.departmentId === departmentId) - Number(a.departmentId === departmentId))
    .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.teamId && e.teamId !== teamId ? `in ${lk.teamName(e.teamId)}` : lk.deptName(e.departmentId) }));
  const added = values.filter((v) => !current.includes(v));
  const removed = current.filter((v) => !values.includes(v));
  const movingFromOtherTeams = added.filter((v) => lk.employees.get(v)?.teamId);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage members · {teamName}</DialogTitle>
          <DialogDescription>Add or remove employees. Added employees move into this team and its department.</DialogDescription>
        </DialogHeader>
        <MultiSelect values={values} onChange={setValues} options={options} placeholder="Select team members" searchPlaceholder="Search employees…" />
        <div className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-success">{added.length} to add</span> · <span className="font-medium text-danger">{removed.length} to remove</span>
          </div>
          {movingFromOtherTeams.length ? <div className="text-warning">{movingFromOtherTeams.length} employee(s) will move from another team.</div> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || (!added.length && !removed.length)}
            onClick={async () => {
              setBusy(true);
              try {
                await setTeamMembers(teamId, values);
                toast.success("Team members updated", { description: `${added.length} added, ${removed.length} removed` });
                onOpenChange(false);
              } catch (err) {
                toast.error("Could not update members", { description: err instanceof Error ? err.message : String(err) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save members
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
