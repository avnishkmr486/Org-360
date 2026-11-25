"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, MoreHorizontal, Pencil, Plus, Power, PowerOff, UserCog, UsersRound, Briefcase } from "lucide-react";
import { toast } from "sonner";
import type { Team } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/tables/data-table";
import { useCustomColumns, withCustomColumns } from "@/components/tables/custom-columns";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { RecordStatusBadge, ToneBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { ExportMenu } from "@/components/common/export-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/states";
import { ChartCard } from "@/components/charts/chart-card";
import { GroupComplianceBars } from "@/components/charts/compliance-charts";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { assignProjectManager, assignTeamSupervisor, setTeamStatus } from "@/lib/repositories";
import { getTier } from "@/lib/calculations/compliance";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatPercent } from "@/lib/utils/format";
import { formatRange } from "@/lib/utils/dates";
import { useOrgAnalytics } from "@/features/organization/use-org-analytics";
import { TeamFormDialog } from "@/features/organization/team-form-dialog";
import { AssignPersonDialog } from "@/features/organization/assign-person-dialog";

interface Row {
  team: Team;
  department: string;
  supervisor: string;
  pm: string;
  members: number;
  processes: number;
  compliance: number | null;
  overdue: number;
}

export function TeamsPage() {
  const db = useDatabase();
  const lk = useLookups();
  const router = useRouter();
  const { scope, can } = useCurrentUser();
  const a = useOrgAnalytics();
  const { values, set, clear, activeCount } = useUrlFilters(["q", "department", "status"] as const);
  const canManage = can("organization.manage");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Team | undefined>();
  const [toggling, setToggling] = useState<Team | null>(null);
  const [assign, setAssign] = useState<{ kind: "supervisor" | "pm"; team: Team } | null>(null);

  const visible = db.teams.filter((t) => (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)));
  const rows: Row[] = useMemo(
    () =>
      visible.map((t) => {
        const s = a.teamStats(t.id);
        return {
          team: t,
          department: lk.deptName(t.departmentId),
          supervisor: lk.empName(t.supervisorId),
          pm: t.projectManagerId ? lk.empName(t.projectManagerId) : "—",
          members: db.employees.filter((e) => e.teamId === t.id && e.status !== "inactive").length,
          processes: a.teamProcesses(t.id).size,
          compliance: s.compliance,
          overdue: s.overdue,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, lk, a, scope],
  );

  const q = values.q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!values.department || r.team.departmentId === values.department) &&
      (!values.status || r.team.status === values.status) &&
      (!q || `${r.team.name} ${r.team.id} ${r.department} ${r.supervisor} ${r.pm}`.toLowerCase().includes(q)),
  );
  const threshold = db.settings.thresholds.good;

  const custom = useCustomColumns<Row>("teams", (r) => r.team.id);
  const columns: Column<Row>[] = [
    { id: "id", header: "ID", cell: (r) => <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.team.id}</span>, sortValue: (r) => r.team.id },
    { id: "name", header: "Team", cell: (r) => <Link href={`/teams/${r.team.id}`} className="inline-block min-w-[180px] font-medium hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.team.name}</Link>, sortValue: (r) => r.team.name },
    { id: "dept", header: "Department", cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{r.department}</span>, sortValue: (r) => r.department },
    { id: "sup", header: "Supervisor", cell: (r) => (r.team.supervisorId ? <PersonCell name={r.supervisor} size="xs" /> : <ToneBadge tone="warning">Unassigned</ToneBadge>), sortValue: (r) => r.supervisor },
    { id: "pm", header: "Project manager", cell: (r) => (r.team.projectManagerId ? <PersonCell name={r.pm} size="xs" /> : <span className="text-xs text-muted-foreground">—</span>), sortValue: (r) => r.pm },
    { id: "members", header: "Members", align: "right", cell: (r) => r.members, sortValue: (r) => r.members },
    { id: "proc", header: "Processes", align: "right", cell: (r) => r.processes, sortValue: (r) => r.processes },
    { id: "comp", header: "Compliance", cell: (r) => <ComplianceBar value={r.compliance} />, sortValue: (r) => r.compliance ?? -1 },
    { id: "status", header: "Status", cell: (r) => <RecordStatusBadge status={r.team.status} />, sortValue: (r) => r.team.status },
    {
      id: "act",
      header: "",
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.team.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/teams/${r.team.id}`)}>
                <Eye /> View team dashboard
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem onSelect={() => { setEditing(r.team); setFormOpen(true); }}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAssign({ kind: "supervisor", team: r.team })}>
                    <UserCog /> Assign supervisor
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAssign({ kind: "pm", team: r.team })}>
                    <Briefcase /> Assign project manager
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setToggling(r.team)} className={r.team.status === "active" ? "text-danger focus:text-danger" : ""}>
                    {r.team.status === "active" ? <PowerOff /> : <Power />}
                    {r.team.status === "active" ? "Deactivate" : "Activate"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const departments = db.departments.filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id));
  const chartRows = filtered
    .filter((r) => r.team.status === "active")
    .sort((x, y) => (x.compliance ?? 101) - (y.compliance ?? 101))
    .map((r) => ({ id: r.team.id, name: r.team.name, compliance: r.compliance, tier: getTier(r.compliance, db.settings.thresholds), overdue: r.overdue, due: a.teamStats(r.team.id).due, sub: r.department }));
  const assignOptions = (team: Team | undefined, kind: "supervisor" | "pm" | undefined) =>
    db.employees
      .filter((e) => e.status !== "inactive" && (kind === "pm" ? e.bandId === "BAND-4" || e.bandId === "BAND-5" : !team || e.departmentId === team.departmentId))
      .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: kind === "pm" ? lk.deptName(e.departmentId) : lk.bandName(e.bandId) }));

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Team Management" }]}
        title="Team Management"
        description={`Teams, their supervisors and project managers, with team-wise compliance for ${formatRange(a.range)}.`}
        actions={
          <>
            <ExportMenu
              onExcel={() =>
                exportToExcel({
                  organizationName: db.organization.name,
                  title: "Team Register",
                  subtitle: `Compliance period ${formatRange(a.range)}`,
                  fileName: "Altametrics_Teams",
                  columns: [
                    { header: "Team ID", value: (r: Row) => r.team.id },
                    { header: "Team", value: (r) => r.team.name, width: 30 },
                    { header: "Department", value: (r) => r.department, width: 26 },
                    { header: "Supervisor", value: (r) => r.supervisor, width: 22 },
                    { header: "Project manager", value: (r) => r.pm, width: 22 },
                    { header: "Members", value: (r) => r.members },
                    { header: "Processes", value: (r) => r.processes },
                    { header: "Compliance %", value: (r) => r.compliance, numFmt: '0.0"%"' },
                    { header: "Status", value: (r) => r.team.status },
                  ],
                  rows: filtered,
                  footer: db.settings.reportFooter,
                })
              }
              onPdf={() =>
                exportToPdf({
                  organizationName: db.organization.name,
                  title: "Team Register",
                  subtitle: `Compliance period ${formatRange(a.range)}`,
                  fileName: "Altametrics_Teams",
                  columns: [
                    { header: "Team", value: (r: Row) => r.team.name },
                    { header: "Department", value: (r) => r.department },
                    { header: "Supervisor", value: (r) => r.supervisor },
                    { header: "PM", value: (r) => r.pm },
                    { header: "Members", value: (r) => r.members, align: "right" },
                    { header: "Compliance", value: (r) => formatPercent(r.compliance), align: "right" },
                  ],
                  rows: filtered,
                  footer: db.settings.reportFooter,
                })
              }
            />
            {canManage ? (
              <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
                <Plus /> Add team
              </Button>
            ) : null}
          </>
        }
        filters={
          <>
            <SearchInput value={values.q} onChange={(v) => set({ q: v })} placeholder="Search teams, leaders…" />
            {departments.length > 1 ? <FilterSelect label="Department" value={values.department} onChange={(v) => set({ department: v })} options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            <ResetFiltersButton count={activeCount + (values.q ? 1 : 0)} onClick={clear} />
          </>
        }
      />

      {chartRows.length ? (
        <ChartCard title="Team-wise Compliance Analytics" description={`Lowest first · target ${threshold}% · click a team to open its dashboard`}>
          <GroupComplianceBars data={chartRows} threshold={threshold} onSelect={(d) => router.push(`/teams/${d.id}`)} />
        </ChartCard>
      ) : null}

      <DataTable
        columns={withCustomColumns(columns, custom)}
        rows={filtered}
        getRowId={(r) => r.team.id}
        onRowClick={(r) => router.push(`/teams/${r.team.id}`)}
        initialSort={{ id: "id", dir: "asc" }}
        empty={<EmptyState icon={<UsersRound className="size-5" />} title="No teams match" description="Adjust the search or filters." />}
      />

      <TeamFormDialog open={formOpen} onOpenChange={setFormOpen} team={editing} defaultDepartmentId={values.department || undefined} />
      <AssignPersonDialog
        open={assign !== null}
        onOpenChange={(o) => !o && setAssign(null)}
        title={assign?.kind === "pm" ? "Assign project manager" : "Assign team supervisor"}
        description={assign ? `Who is accountable for ${assign.team.name}?` : ""}
        label={assign?.kind === "pm" ? "Project manager" : "Team supervisor"}
        options={assignOptions(assign?.team, assign?.kind)}
        currentId={assign ? (assign.kind === "pm" ? assign.team.projectManagerId : assign.team.supervisorId) : null}
        successMessage={assign?.kind === "pm" ? "Project manager assigned" : "Team supervisor assigned"}
        onSave={async (id) => {
          if (!assign) return;
          if (assign.kind === "pm") await assignProjectManager(assign.team.id, id);
          else await assignTeamSupervisor(assign.team.id, id);
        }}
      />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.status === "active" ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.status === "active"
            ? `The team will be hidden from dashboards and new assignments. ${db.employees.filter((e) => e.teamId === toggling.id && e.status === "active").length} active member(s) keep their records and history.`
            : "The team will be available for assignments and reporting again."
        }
        confirmLabel={toggling?.status === "active" ? "Deactivate" : "Activate"}
        destructive={toggling?.status === "active"}
        onConfirm={async () => {
          if (!toggling) return;
          try {
            const next = toggling.status === "active" ? "inactive" : "active";
            await setTeamStatus(toggling.id, next);
            toast.success(`Team ${next === "active" ? "activated" : "deactivated"}`, { description: toggling.name });
          } catch (err) {
            toast.error("Status change failed", { description: err instanceof Error ? err.message : String(err) });
          }
        }}
      />
    </div>
  );
}
