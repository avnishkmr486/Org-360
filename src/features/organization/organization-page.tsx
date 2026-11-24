"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, ChevronRight, Globe, ListTree, Mail, Network, Plus, Table2, UserCheck, UserCog, UsersRound, Workflow } from "lucide-react";
import type { Employee } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/common/kpi-card";
import { ComplianceBar, ComplianceRing } from "@/components/common/compliance-indicator";
import { DataTable, type Column } from "@/components/tables/data-table";
import { PersonCell, UserAvatar } from "@/components/common/user-avatar";
import { RecordStatusBadge, ToneBadge } from "@/components/common/badges";
import { SearchInput } from "@/components/common/filters";
import { EmptyState } from "@/components/common/states";
import { ExportMenu } from "@/components/common/export-menu";
import { BrandMark } from "@/components/layout/brand";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { inScope } from "@/lib/auth/permissions";
import { departmentHeadOptions } from "@/features/departments/department-head-select";
import { assignDepartmentHead, assignProjectManager, assignTeamSupervisor } from "@/lib/repositories";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatPercent } from "@/lib/utils/format";
import { formatRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { useOrgAnalytics } from "./use-org-analytics";
import { HierarchyTree } from "./hierarchy-tree";
import { DepartmentFormDialog } from "./department-form-dialog";
import { TeamFormDialog } from "./team-form-dialog";
import { AssignPersonDialog } from "./assign-person-dialog";

type AssignTarget = { kind: "head" | "supervisor" | "pm"; id: string; name: string; currentId: string | null; departmentId: string } | null;

interface FlatRow {
  employee: Employee;
  department: string;
  team: string;
  position: string;
  reportsTo: string;
  compliance: number | null;
}

export function OrganizationPage() {
  const db = useDatabase();
  const lk = useLookups();
  const { scope, can } = useCurrentUser();
  const analytics = useOrgAnalytics();
  const { values, set } = useUrlFilters(["tab", "view"] as const);
  const tab = values.tab || "hierarchy";
  const view = values.view === "table" ? "table" : "tree";
  const canManage = can("organization.manage");
  const [assign, setAssign] = useState<AssignTarget>(null);
  const [addDept, setAddDept] = useState(false);
  const [addTeam, setAddTeam] = useState(false);

  const departments = db.departments.filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id));
  const teams = db.teams.filter((t) => departments.some((d) => d.id === t.departmentId) && (!scope.teamIds || scope.teamIds.includes(t.id)));
  const employees = db.employees.filter((e) => inScope(e, scope));
  const org = db.organization;

  const flat: FlatRow[] = useMemo(
    () =>
      employees.map((e) => {
        const dep = db.departments.find((d) => d.id === e.departmentId);
        const team = e.teamId ? db.teams.find((t) => t.id === e.teamId) : undefined;
        const position = dep?.headId === e.id ? "Department Head" : team?.supervisorId === e.id ? "Team Supervisor" : team?.projectManagerId === e.id ? "Project Manager" : "Member";
        return { employee: e, department: dep?.name ?? "—", team: team?.name ?? "— (leadership)", position, reportsTo: lk.empName(e.reportingManagerId), compliance: analytics.empStats(e.id).compliance };
      }),
    [employees, db.departments, db.teams, lk, analytics],
  );

  const flatColumns: Column<FlatRow>[] = [
    { id: "dept", header: "Department", cell: (r) => r.department, sortValue: (r) => r.department },
    { id: "team", header: "Team", cell: (r) => <span className="text-muted-foreground">{r.team}</span>, sortValue: (r) => r.team },
    { id: "emp", header: "Employee", cell: (r) => <Link href={`/employees/${r.employee.id}`}><PersonCell name={`${r.employee.firstName} ${r.employee.lastName}`} sub={lk.bandName(r.employee.bandId)} /></Link>, sortValue: (r) => r.employee.firstName },
    { id: "pos", header: "Position", cell: (r) => (r.position === "Member" ? <span className="text-xs text-muted-foreground">Member</span> : <ToneBadge tone={r.position === "Department Head" ? "warning" : r.position === "Team Supervisor" ? "teal" : "info"}>{r.position}</ToneBadge>), sortValue: (r) => r.position },
    { id: "rt", header: "Reports to", cell: (r) => r.reportsTo, sortValue: (r) => r.reportsTo },
    { id: "comp", header: "Compliance", cell: (r) => <ComplianceBar value={r.compliance} />, sortValue: (r) => r.compliance ?? -1 },
  ];

  const headRows = departments;
  const supRows = teams;

  const empOptions = (departmentId?: string) =>
    db.employees
      .filter((e) => e.status !== "inactive")
      .sort((a, b) => (departmentId ? Number(b.departmentId === departmentId) - Number(a.departmentId === departmentId) : 0))
      .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: lk.deptName(e.departmentId) }));

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Organization Management" }]}
        title="Organization Management"
        description={`Structure, leadership mappings and reporting lines for ${org.name} Compliance shown for ${formatRange(analytics.range)}.`}
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddTeam(true)}>
                <UsersRound /> Add team
              </Button>
              <Button size="sm" onClick={() => setAddDept(true)}>
                <Plus /> Add department
              </Button>
            </>
          ) : null
        }
      />

      {/* Organization overview */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="card-elevated relative overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-navy via-brand-blue to-teal" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <BrandMark size={64} />
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-xl font-semibold">{org.name}</h2>
              <p className="text-sm font-medium text-teal">{org.tagline}</p>
              <p className="text-xs text-muted-foreground">{org.industry}</p>
            </div>
            <ComplianceRing value={analytics.org.compliance} size={112} label="overall" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{org.description}</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5" />{org.website}</span>
            <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{org.email}</span>
            <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" />{org.address}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Departments" value={departments.filter((d) => d.status === "active").length} icon={Building2} tone="info" hint={`${departments.length} total`} href="/departments" />
          <KpiCard label="Teams" value={teams.filter((t) => t.status === "active").length} icon={UsersRound} tone="teal" hint={`${teams.length} total`} href="/teams" />
          <KpiCard label="Active employees" value={employees.filter((e) => e.status === "active").length} icon={UserCheck} tone="success" hint={`${employees.length} on record`} href="/employees?status=active" />
          <KpiCard label="Processes in use" value={new Set(analytics.tasks.map((t) => t.processId)).size} icon={Workflow} tone="neutral" hint="with due tasks" href="/processes" />
        </div>
      </section>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "hierarchy" ? null : v })}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="hierarchy"><Network className="size-4" /> Hierarchy</TabsTrigger>
          <TabsTrigger value="heads"><UserCog className="size-4" /> Department heads</TabsTrigger>
          <TabsTrigger value="supervisors"><UsersRound className="size-4" /> Team supervisors</TabsTrigger>
          <TabsTrigger value="reporting"><ListTree className="size-4" /> Reporting structure</TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              <Button variant={view === "tree" ? "secondary" : "ghost"} size="sm" onClick={() => set({ view: null })}>
                <ListTree /> Tree view
              </Button>
              <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => set({ view: "table" })}>
                <Table2 /> Table view
              </Button>
            </div>
            <ExportMenu
              label="Export hierarchy"
              onExcel={() =>
                exportToExcel({
                  organizationName: org.name,
                  title: "Organization Hierarchy",
                  subtitle: `Compliance period ${formatRange(analytics.range)}`,
                  fileName: "Altametrics_Organization_Hierarchy",
                  columns: [
                    { header: "Department", value: (r: FlatRow) => r.department, width: 26 },
                    { header: "Team", value: (r) => r.team, width: 30 },
                    { header: "Employee ID", value: (r) => r.employee.id },
                    { header: "Employee", value: (r) => `${r.employee.firstName} ${r.employee.lastName}`, width: 24 },
                    { header: "Band", value: (r) => lk.bandName(r.employee.bandId), width: 28 },
                    { header: "Position", value: (r) => r.position, width: 18 },
                    { header: "Reports to", value: (r) => r.reportsTo, width: 22 },
                    { header: "Compliance %", value: (r) => r.compliance, numFmt: '0.0"%"' },
                  ],
                  rows: flat,
                  footer: db.settings.reportFooter,
                })
              }
              onPdf={() =>
                exportToPdf({
                  organizationName: org.name,
                  title: "Organization Hierarchy",
                  subtitle: `Compliance period ${formatRange(analytics.range)}`,
                  fileName: "Altametrics_Organization_Hierarchy",
                  columns: [
                    { header: "Department", value: (r: FlatRow) => r.department },
                    { header: "Team", value: (r) => r.team },
                    { header: "Employee", value: (r) => `${r.employee.firstName} ${r.employee.lastName}` },
                    { header: "Position", value: (r) => r.position },
                    { header: "Reports to", value: (r) => r.reportsTo },
                    { header: "Compliance", value: (r) => formatPercent(r.compliance), align: "right" },
                  ],
                  rows: flat,
                  footer: db.settings.reportFooter,
                })
              }
            />
          </div>
          {view === "tree" ? (
            <HierarchyTree departments={departments} teams={teams} employees={employees} analytics={analytics} />
          ) : (
            <DataTable columns={flatColumns} rows={flat} getRowId={(r) => r.employee.id} pageSize={20} initialSort={{ id: "dept", dir: "asc" }} />
          )}
        </TabsContent>

        <TabsContent value="heads" className="mt-4">
          <DataTable
            rows={headRows}
            getRowId={(d) => d.id}
            columns={[
              { id: "dept", header: "Department", cell: (d) => <Link href={`/departments/${d.id}`} className="font-medium hover:text-primary hover:underline">{d.name}</Link>, sortValue: (d) => d.name },
              { id: "code", header: "Code", cell: (d) => <span className="font-mono text-xs text-muted-foreground">{d.code}</span> },
              {
                id: "head",
                header: "Department head",
                cell: (d) => {
                  const h = d.headId ? lk.employees.get(d.headId) : undefined;
                  return h ? <PersonCell name={`${h.firstName} ${h.lastName}`} sub={lk.bandName(h.bandId)} /> : <ToneBadge tone="warning">Unassigned</ToneBadge>;
                },
                sortValue: (d) => lk.empName(d.headId),
              },
              { id: "emp", header: "Employees", align: "right", cell: (d) => db.employees.filter((e) => e.departmentId === d.id && e.status !== "inactive").length },
              { id: "comp", header: "Compliance", cell: (d) => <ComplianceBar value={analytics.deptStats(d.id).compliance} />, sortValue: (d) => analytics.deptStats(d.id).compliance ?? -1 },
              { id: "status", header: "Status", cell: (d) => <RecordStatusBadge status={d.status} /> },
              {
                id: "act",
                header: "",
                align: "right",
                cell: (d) =>
                  canManage ? (
                    <Button variant="outline" size="xs" onClick={() => setAssign({ kind: "head", id: d.id, name: d.name, currentId: d.headId, departmentId: d.id })}>
                      Assign head
                    </Button>
                  ) : null,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="supervisors" className="mt-4">
          <DataTable
            rows={supRows}
            getRowId={(t) => t.id}
            columns={[
              { id: "team", header: "Team", cell: (t) => <Link href={`/teams/${t.id}`} className="font-medium hover:text-primary hover:underline">{t.name}</Link>, sortValue: (t) => t.name },
              { id: "dept", header: "Department", cell: (t) => <span className="text-muted-foreground">{lk.deptName(t.departmentId)}</span>, sortValue: (t) => lk.deptName(t.departmentId) },
              {
                id: "sup",
                header: "Team supervisor",
                cell: (t) => {
                  const s = t.supervisorId ? lk.employees.get(t.supervisorId) : undefined;
                  return s ? <PersonCell name={`${s.firstName} ${s.lastName}`} sub={lk.bandName(s.bandId)} /> : <ToneBadge tone="warning">Unassigned</ToneBadge>;
                },
                sortValue: (t) => lk.empName(t.supervisorId),
              },
              {
                id: "pm",
                header: "Project manager",
                cell: (t) => {
                  const p = t.projectManagerId ? lk.employees.get(t.projectManagerId) : undefined;
                  return p ? <PersonCell name={`${p.firstName} ${p.lastName}`} sub={lk.deptName(p.departmentId)} /> : <span className="text-xs text-muted-foreground">—</span>;
                },
                sortValue: (t) => lk.empName(t.projectManagerId),
              },
              { id: "comp", header: "Compliance", cell: (t) => <ComplianceBar value={analytics.teamStats(t.id).compliance} />, sortValue: (t) => analytics.teamStats(t.id).compliance ?? -1 },
              {
                id: "act",
                header: "",
                align: "right",
                cell: (t) =>
                  canManage ? (
                    <div className="flex justify-end gap-1.5">
                      <Button variant="outline" size="xs" onClick={() => setAssign({ kind: "supervisor", id: t.id, name: t.name, currentId: t.supervisorId, departmentId: t.departmentId })}>
                        Supervisor
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => setAssign({ kind: "pm", id: t.id, name: t.name, currentId: t.projectManagerId, departmentId: t.departmentId })}>
                        PM
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="reporting" className="mt-4">
          <ReportingStructure employees={employees} />
        </TabsContent>
      </Tabs>

      <DepartmentFormDialog open={addDept} onOpenChange={setAddDept} />
      <TeamFormDialog open={addTeam} onOpenChange={setAddTeam} />
      <AssignPersonDialog
        open={assign !== null}
        onOpenChange={(o) => !o && setAssign(null)}
        title={assign?.kind === "head" ? "Assign department head" : assign?.kind === "supervisor" ? "Assign team supervisor" : "Assign project manager"}
        description={assign ? `Choose who is accountable for ${assign.name}.` : ""}
        label={assign?.kind === "head" ? "Department head" : assign?.kind === "supervisor" ? "Team supervisor" : "Project manager"}
        options={assign?.kind === "head" ? departmentHeadOptions(db, assign.currentId) : empOptions(assign?.departmentId)}
        currentId={assign?.currentId ?? null}
        successMessage={assign?.kind === "head" ? "Department head assigned" : assign?.kind === "supervisor" ? "Team supervisor assigned" : "Project manager assigned"}
        onSave={async (id) => {
          if (!assign) return;
          if (assign.kind === "head") await assignDepartmentHead(assign.id, id);
          else if (assign.kind === "supervisor") await assignTeamSupervisor(assign.id, id);
          else await assignProjectManager(assign.id, id);
        }}
      />
    </div>
  );
}

/** Manager → direct reports tree, searchable. */
function ReportingStructure({ employees }: { employees: Employee[] }) {
  const lk = useLookups();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const ids = new Set(employees.map((e) => e.id));
  const reportsOf = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const e of employees) {
      const key = e.reportingManagerId && ids.has(e.reportingManagerId) ? e.reportingManagerId : "__root__";
      const arr = m.get(key);
      if (arr) arr.push(e);
      else m.set(key, [e]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  const matches = (e: Employee) => `${e.firstName} ${e.lastName} ${e.id} ${lk.bandName(e.bandId)}`.toLowerCase().includes(q);
  const subtreeMatches = (e: Employee, depth = 0): boolean => depth < 12 && (matches(e) || (reportsOf.get(e.id) ?? []).some((c) => subtreeMatches(c, depth + 1)));
  const roots = reportsOf.get("__root__") ?? [];

  const render = (e: Employee, depth: number): React.ReactNode => {
    if (q && !subtreeMatches(e)) return null;
    const children = reportsOf.get(e.id) ?? [];
    const isCollapsed = !q && collapsed.has(e.id);
    return (
      <li key={e.id}>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
          {children.length ? (
            <button
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
              aria-label={isCollapsed ? "Expand reports" : "Collapse reports"}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")} />
            </button>
          ) : (
            <span className="size-5" />
          )}
          <UserAvatar name={`${e.firstName} ${e.lastName}`} size="sm" />
          <Link href={`/employees/${e.id}`} className={cn("text-sm font-medium hover:text-primary hover:underline", q && matches(e) && "text-primary")}>
            {e.firstName} {e.lastName}
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">{lk.bandName(e.bandId)} · {lk.deptName(e.departmentId)}</span>
          {children.length ? <ToneBadge tone="info" className="ml-auto">{children.length} direct report{children.length === 1 ? "" : "s"}</ToneBadge> : null}
        </div>
        {children.length && !isCollapsed ? <ul className="ml-[18px] border-l pl-3" style={{ marginLeft: depth < 8 ? 18 : 8 }}>{children.map((c) => render(c, depth + 1))}</ul> : null}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <SearchInput value={query} onChange={setQuery} placeholder="Search manager or employee…" />
      <div className="card-elevated p-3">
        {roots.length ? <ul className="space-y-0.5">{roots.map((r) => render(r, 0))}</ul> : <EmptyState title="No reporting lines in scope" />}
        {q && !roots.some((r) => subtreeMatches(r)) ? <EmptyState title="No matches" description="No one in the reporting structure matches your search." /> : null}
      </div>
    </div>
  );
}
