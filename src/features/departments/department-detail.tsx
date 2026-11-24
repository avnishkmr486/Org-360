"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlarmClock, ArrowLeft, BarChart3, Building2, ClipboardList, FileSpreadsheet, Pencil, Plus, ShieldCheck, Users, UsersRound, Workflow } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/common/kpi-card";
import { ChartCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart, GroupComplianceBars, StatusStackedBars, TierDonut } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { EmploymentStatusBadge, PriorityBadge, RecordStatusBadge, TierBadge } from "@/components/common/badges";
import { PersonCell, UserAvatar } from "@/components/common/user-avatar";
import { ErrorState } from "@/components/common/states";
import { ExportMenu } from "@/components/common/export-menu";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { getDashboardMetrics, type GroupRow, type ProcessRow } from "@/lib/calculations/dashboard";
import { computeEmployeeCompliance, filterTasks, getTier, type EmployeeCompliance } from "@/lib/calculations/compliance";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { formatDelta, formatPercent } from "@/lib/utils/format";
import { formatDate, formatRange } from "@/lib/utils/dates";
import { DepartmentFormDialog } from "@/features/organization/department-form-dialog";
import { TeamFormDialog } from "@/features/organization/team-form-dialog";

export function DepartmentDetail({ id }: { id: string }) {
  const db = useDatabase();
  const lk = useLookups();
  const today = useToday();
  const router = useRouter();
  const { range } = useGlobalDateRange();
  const { scope, can } = useCurrentUser();
  const { values, set } = useUrlFilters(["tab"] as const);
  const [editOpen, setEditOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const dept = db.departments.find((d) => d.id === id);
  const filter = useMemo(() => ({ range, departmentId: id }), [range, id]);
  const m = useMemo(() => getDashboardMetrics(db, filter, null, today), [db, filter, today]);
  const allEmployees = useMemo(() => db.employees.filter((e) => e.departmentId === id), [db.employees, id]);
  const empRows = useMemo(() => computeEmployeeCompliance(allEmployees, filterTasks(db, filter), today, db.settings.thresholds), [allEmployees, db, filter, today]);
  const assigned = useMemo(() => {
    const ids = new Set(db.tasks.filter((t) => lk.employees.get(t.employeeId)?.departmentId === id).map((t) => t.processId));
    for (const p of db.processes) if (p.departmentId === id) ids.add(p.id);
    return db.processes.filter((p) => ids.has(p.id));
  }, [db.tasks, db.processes, lk, id]);

  if (!dept) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Department Management", href: "/departments" }, { label: "Not found" }]} title="Department not found" />
        <ErrorState
          title={`No department with ID “${id}”`}
          description="It may have been removed, or the link is incorrect."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/departments">
                <ArrowLeft /> Back to departments
              </Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (scope.departmentIds && !scope.departmentIds.includes(id)) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Department Management", href: "/departments" }, { label: dept.name }]} title={dept.name} />
        <ErrorState title="Outside your scope" description="Your current persona can only view their own department." />
      </div>
    );
  }

  const head = dept.headId ? lk.employees.get(dept.headId) : undefined;
  const k = m.kpis;
  const s = m.stats;
  const canManage = can("organization.manage");
  const threshold = db.settings.thresholds.good;
  const tab = values.tab || "overview";
  const processRowFor = (pid: string): ProcessRow | undefined => m.processes.find((p) => p.id === pid);

  const teamCols: Column<GroupRow>[] = [
    { id: "name", header: "Team", cell: (t) => <Link href={`/teams/${t.id}`} className="font-medium hover:text-primary hover:underline">{t.name}</Link>, sortValue: (t) => t.name },
    { id: "sup", header: "Supervisor", cell: (t) => <PersonCell name={lk.empName(db.teams.find((x) => x.id === t.id)?.supervisorId)} size="xs" />, sortValue: (t) => lk.empName(db.teams.find((x) => x.id === t.id)?.supervisorId) },
    { id: "emp", header: "Members", align: "right", cell: (t) => t.employees, sortValue: (t) => t.employees },
    { id: "due", header: "Due tasks", align: "right", cell: (t) => t.stats.due, sortValue: (t) => t.stats.due },
    { id: "over", header: "Overdue", align: "right", cell: (t) => <span className={t.stats.overdue ? "font-medium text-danger" : ""}>{t.stats.overdue}</span>, sortValue: (t) => t.stats.overdue },
    { id: "comp", header: "Compliance", cell: (t) => <ComplianceBar value={t.compliance} />, sortValue: (t) => t.compliance ?? -1 },
    { id: "delta", header: "Change", align: "right", cell: (t) => <span className={(t.delta ?? 0) >= 0 ? "text-success" : "text-danger"}>{formatDelta(t.delta)}</span>, sortValue: (t) => t.delta ?? 0 },
  ];

  const empCols: Column<EmployeeCompliance>[] = [
    { id: "name", header: "Employee", cell: (r) => <Link href={`/employees/${r.employee.id}`}><PersonCell name={`${r.employee.firstName} ${r.employee.lastName}`} sub={r.employee.id} /></Link>, sortValue: (r) => r.employee.firstName },
    { id: "team", header: "Team", cell: (r) => <span className="text-muted-foreground">{r.employee.teamId ? lk.teamName(r.employee.teamId) : "Leadership"}</span>, sortValue: (r) => lk.teamName(r.employee.teamId) },
    { id: "band", header: "Band", cell: (r) => lk.bandName(r.employee.bandId), sortValue: (r) => lk.bandName(r.employee.bandId) },
    { id: "status", header: "Status", cell: (r) => <EmploymentStatusBadge status={r.employee.status} /> },
    { id: "over", header: "Overdue", align: "right", cell: (r) => <span className={r.stats.overdue ? "font-medium text-danger" : ""}>{r.stats.overdue}</span>, sortValue: (r) => r.stats.overdue },
    { id: "comp", header: "Compliance", cell: (r) => <ComplianceBar value={r.stats.compliance} />, sortValue: (r) => r.stats.compliance ?? -1 },
    { id: "tier", header: "Rating", cell: (r) => <TierBadge tier={r.tier} />, sortValue: (r) => r.stats.compliance ?? -1 },
  ];

  const exportSummary = [
    { label: "Compliance", value: formatPercent(k.compliance.value) },
    { label: "Participation", value: formatPercent(k.participation.value) },
    { label: "Employees", value: k.activeEmployees },
    { label: "Overdue tasks", value: s.overdue },
  ];
  const exportEmployees = async (kind: "excel" | "pdf") => {
    const base = { organizationName: db.organization.name, title: `${dept.name} — Compliance Report`, subtitle: `Period: ${formatRange(range)} · Head: ${lk.empName(dept.headId)}`, fileName: `${dept.code}_Department_Compliance_${range.to}`, summary: exportSummary, rows: empRows, footer: db.settings.reportFooter };
    if (kind === "excel")
      await exportToExcel({
        ...base,
        columns: [
          { header: "Employee ID", value: (r: EmployeeCompliance) => r.employee.id },
          { header: "Employee", value: (r) => `${r.employee.firstName} ${r.employee.lastName}`, width: 24 },
          { header: "Team", value: (r) => lk.teamName(r.employee.teamId), width: 28 },
          { header: "Due", value: (r) => r.stats.due },
          { header: "Completed", value: (r) => r.stats.completedDue },
          { header: "Overdue", value: (r) => r.stats.overdue },
          { header: "Compliance %", value: (r) => r.stats.compliance, numFmt: '0.0"%"' },
          { header: "Rating", value: (r) => r.tier.replace("_", " ") },
        ],
      });
    else
      await exportToPdf({
        ...base,
        columns: [
          { header: "Employee", value: (r: EmployeeCompliance) => `${r.employee.firstName} ${r.employee.lastName}` },
          { header: "Team", value: (r) => lk.teamName(r.employee.teamId) },
          { header: "Due", value: (r) => r.stats.due, align: "right" },
          { header: "Overdue", value: (r) => r.stats.overdue, align: "right" },
          { header: "Compliance", value: (r) => formatPercent(r.stats.compliance), align: "right" },
        ],
      });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Department Management", href: "/departments" }, { label: dept.name }]}
        title={dept.name}
        titleAdornment={
          <>
            <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{dept.code}</span>
            <RecordStatusBadge status={dept.status} />
          </>
        }
        description={dept.description}
        actions={
          <>
            <ExportMenu label="Department report" onExcel={() => exportEmployees("excel")} onPdf={() => exportEmployees("pdf")} />
            {canManage ? (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit department
              </Button>
            ) : null}
          </>
        }
      />

      <div className="card-elevated flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        {head ? <UserAvatar name={`${head.firstName} ${head.lastName}`} size="lg" /> : <span className="flex size-12 items-center justify-center rounded-full bg-muted"><Building2 className="size-5 text-muted-foreground" /></span>}
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Department head</div>
          {head ? (
            <Link href={`/employees/${head.id}`} className="text-base font-semibold hover:text-primary hover:underline">
              {head.firstName} {head.lastName}
            </Link>
          ) : (
            <div className="text-base font-semibold text-warning">Unassigned</div>
          )}
          <div className="text-xs text-muted-foreground">{head ? [lk.bandName(head.bandId), head.email].filter(Boolean).join(" · ") : "Assign a head from Organization Management or Edit."}</div>
        </div>
        <div className="text-xs text-muted-foreground sm:text-right">
          Reporting period
          <div className="text-sm font-medium text-foreground">{formatRange(range)}</div>
        </div>
      </div>

      <section className="kpi-strip">
        <KpiCard label="Employees" value={k.activeEmployees} icon={Users} tone="info" hint={`${allEmployees.length} on record`} href={`/employees?department=${id}`} />
        <KpiCard label="Teams" value={k.teams} icon={UsersRound} tone="neutral" href={`/teams?department=${id}`} />
        <KpiCard label="Assigned processes" value={assigned.length} icon={Workflow} tone="teal" />
        <KpiCard label="Compliance" value={formatPercent(k.compliance.value)} icon={ShieldCheck} tone="info" delta={k.compliance.delta} href={`/compliance?department=${id}`} />
        <KpiCard label="Participation" value={formatPercent(k.participation.value)} icon={Activity} tone="teal" delta={k.participation.delta} />
        <KpiCard label="Pending" value={s.pending} icon={ClipboardList} tone="neutral" hint={`${s.awaitingReview} awaiting review`} href={`/compliance?department=${id}&status=in_progress`} />
        <KpiCard label="Overdue" value={s.overdue} icon={AlarmClock} tone="danger" delta={k.overdueTasks.delta} deltaUnit="" goodWhen="down" href={`/compliance?department=${id}&status=overdue`} />
      </section>

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "overview" ? null : v })}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teams">Teams ({db.teams.filter((t) => t.departmentId === id).length})</TabsTrigger>
          <TabsTrigger value="employees">Employees ({allEmployees.length})</TabsTrigger>
          <TabsTrigger value="processes">Assigned processes ({assigned.length})</TabsTrigger>
          <TabsTrigger value="compliance">Compliance dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Compliance trend" description="Last six months for this department">
              <ComplianceTrendChart data={m.trend} threshold={threshold} />
            </ChartCard>
            <ChartCard title="Employee ratings" description="Active employees by compliance rating">
              <TierDonut data={m.distribution} onSelect={(tier) => router.push(`/performance?department=${id}&tier=${tier}`)} />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Top performers" description="Highest compliance in the period">
              <ul className="space-y-1 px-2">
                {[...m.employees].filter((e) => e.stats.compliance !== null).sort((a, b) => b.stats.compliance! - a.stats.compliance! || b.stats.completed - a.stats.completed).slice(0, 5).map((e) => (
                  <li key={e.employee.id}>
                    <Link href={`/employees/${e.employee.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      <PersonCell name={`${e.employee.firstName} ${e.employee.lastName}`} sub={lk.teamName(e.employee.teamId)} size="xs" />
                      <ComplianceBar value={e.stats.compliance} className="ml-auto w-40" />
                    </Link>
                  </li>
                ))}
              </ul>
            </ChartCard>
            <ChartCard title="Requiring attention" description={`Below ${threshold}% or with overdue tasks`}>
              <ul className="space-y-1 px-2">
                {[...m.employees].filter((e) => e.stats.compliance !== null && (e.stats.compliance < threshold || e.stats.overdue > 0)).sort((a, b) => a.stats.compliance! - b.stats.compliance!).slice(0, 5).map((e) => (
                  <li key={e.employee.id}>
                    <Link href={`/employees/${e.employee.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      <PersonCell name={`${e.employee.firstName} ${e.employee.lastName}`} sub={`${e.stats.overdue} overdue`} size="xs" />
                      <ComplianceBar value={e.stats.compliance} className="ml-auto w-40" />
                    </Link>
                  </li>
                ))}
                {!m.employees.some((e) => e.stats.compliance !== null && (e.stats.compliance < threshold || e.stats.overdue > 0)) ? <li className="py-6 text-center text-sm text-muted-foreground">Everyone is on target.</li> : null}
              </ul>
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="teams" className="mt-4 space-y-3">
          {canManage ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTeamOpen(true)}>
                <Plus /> Add team
              </Button>
            </div>
          ) : null}
          <DataTable columns={teamCols} rows={m.teams} getRowId={(t) => t.id} onRowClick={(t) => router.push(`/teams/${t.id}`)} />
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <DataTable columns={empCols} rows={empRows} getRowId={(r) => r.employee.id} onRowClick={(r) => router.push(`/employees/${r.employee.id}`)} initialSort={{ id: "comp", dir: "asc" }} pageSize={20} />
        </TabsContent>

        <TabsContent value="processes" className="mt-4">
          <DataTable
            rows={assigned}
            getRowId={(p) => p.id}
            onRowClick={(p) => router.push(`/processes/${p.id}`)}
            columns={[
              { id: "id", header: "ID", cell: (p) => <span className="font-mono text-xs text-muted-foreground">{p.id}</span>, sortValue: (p) => p.id },
              { id: "name", header: "Process", cell: (p) => <span className="font-medium">{p.name}</span>, sortValue: (p) => p.name },
              { id: "cat", header: "Category", cell: (p) => <span className="text-muted-foreground">{lk.categoryName(p.categoryId)}</span>, sortValue: (p) => lk.categoryName(p.categoryId) },
              { id: "freq", header: "Frequency", cell: (p) => FREQUENCY_LABELS[p.frequency] },
              { id: "prio", header: "Priority", cell: (p) => <PriorityBadge priority={p.priority} /> },
              { id: "owner", header: "Owner", cell: (p) => lk.empName(p.ownerId), sortValue: (p) => lk.empName(p.ownerId) },
              { id: "due", header: "Due", align: "right", cell: (p) => processRowFor(p.id)?.stats.due ?? 0 },
              { id: "over", header: "Overdue", align: "right", cell: (p) => processRowFor(p.id)?.stats.overdue ?? 0, sortValue: (p) => processRowFor(p.id)?.stats.overdue ?? 0 },
              { id: "comp", header: "Compliance", cell: (p) => <ComplianceBar value={processRowFor(p.id)?.compliance ?? null} />, sortValue: (p) => processRowFor(p.id)?.compliance ?? -1 },
            ]}
          />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Monthly compliance trend" description="Compliance and participation, last six months">
              <ComplianceTrendChart data={m.trend} threshold={threshold} onPointClick={(d) => {
                const b = m.trend.find((t) => t.key === d.key);
                if (b) router.push(`/compliance?department=${id}&from=${b.range.from}&to=${b.range.to}`);
              }} />
            </ChartCard>
            <ChartCard title="Team-wise compliance" description="Click a team to open it">
              <GroupComplianceBars data={m.teams.map((t) => ({ id: t.id, name: t.name, compliance: t.compliance, tier: t.tier, delta: t.delta, due: t.stats.due, overdue: t.stats.overdue }))} threshold={threshold} onSelect={(d) => router.push(`/teams/${d.id}`)} />
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Process-wise compliance" description="Adherence per process in this department">
              <GroupComplianceBars data={[...m.processes].sort((a, b) => (a.compliance ?? 101) - (b.compliance ?? 101)).map((p) => ({ id: p.id, name: p.name, compliance: p.compliance, tier: getTier(p.compliance, db.settings.thresholds), due: p.stats.due, overdue: p.stats.overdue }))} threshold={threshold} onSelect={(d) => router.push(`/processes/${d.id}`)} />
            </ChartCard>
            <ChartCard title="Process completion status" description="Click to open the tasks">
              <StatusStackedBars data={m.processes.map((p) => ({ id: p.id, name: p.name, completed: p.stats.completed, awaiting: p.stats.awaitingReview, pending: p.stats.pending - p.stats.awaitingReview, overdue: p.stats.overdue, rejected: p.stats.rejected }))} onSelect={(d) => router.push(`/compliance?department=${id}&process=${d.id}`)} />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ReportCard icon={FileSpreadsheet} title="Department compliance (Excel)" description="Employee-level compliance with branding, for the selected period." onClick={() => exportEmployees("excel")} />
            <ReportCard icon={FileSpreadsheet} title="Department compliance (PDF)" description="Print-ready PDF summary for management reviews." onClick={() => exportEmployees("pdf")} />
            <Link href={`/reports/department?department=${id}`} className="card-elevated card-hover flex flex-col gap-2 p-5">
              <BarChart3 className="size-5 text-primary" />
              <div className="text-sm font-semibold">Open in Reports & Analytics</div>
              <p className="text-xs text-muted-foreground">Full Department Compliance Report with filters, pre-filtered to {dept.name}.</p>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Created {formatDate(dept.createdAt)} · last updated {formatDate(dept.updatedAt)}</p>
        </TabsContent>
      </Tabs>

      <DepartmentFormDialog open={editOpen} onOpenChange={setEditOpen} department={dept} />
      <TeamFormDialog open={teamOpen} onOpenChange={setTeamOpen} defaultDepartmentId={id} />
    </div>
  );
}

function ReportCard({ icon: Icon, title, description, onClick }: { icon: typeof FileSpreadsheet; title: string; description: string; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
          const { toast } = await import("sonner");
          toast.success("Report downloaded");
        } catch (err) {
          const { toast } = await import("sonner");
          toast.error("Export failed", { description: err instanceof Error ? err.message : String(err) });
        } finally {
          setBusy(false);
        }
      }}
      className="card-elevated card-hover flex flex-col gap-2 p-5 text-left disabled:opacity-60"
    >
      <Icon className="size-5 text-success" />
      <div className="text-sm font-semibold">{busy ? "Preparing…" : title}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

