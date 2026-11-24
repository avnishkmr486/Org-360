"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileUp, MoreHorizontal, Pencil, Plus, ShieldCheck, UserCheck, UserMinus, Trash2, Users, UserX, Plane } from "lucide-react";
import type { Employee } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { EmploymentStatusBadge } from "@/components/common/badges";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { PersonCell } from "@/components/common/user-avatar";
import { ExportMenu } from "@/components/common/export-menu";
import { CascadeDeleteDialog } from "@/components/common/cascade-delete-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { inScope } from "@/lib/auth/permissions";
import { computeEmployeeCompliance, filterTasks } from "@/lib/calculations/compliance";
import { deactivateEmployees, reactivateEmployee } from "@/lib/repositories";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { EMPLOYMENT_STATUS_META } from "@/lib/constants";
import { formatRange } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";
import { EmployeeFormDialog } from "./employee-form-dialog";

const KEYS = ["department", "team", "band", "designation", "status", "q"] as const;

export interface EmployeeRow {
  employee: Employee;
  name: string;
  compliance: number | null;
  due: number;
}

export function EmployeeDirectory() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { range } = useGlobalDateRange();
  const { scope, can } = useCurrentUser();
  const { values: f, set, clear, activeCount } = useUrlFilters(KEYS);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const canManage = can("employees.manage");

  const scoped = useMemo(() => db.employees.filter((e) => inScope(e, scope)), [db.employees, scope]);

  const complianceById = useMemo(() => {
    const tasks = filterTasks(db, { range }, scope);
    const rows = computeEmployeeCompliance(scoped, tasks, today, db.settings.thresholds);
    return new Map(rows.map((r) => [r.employee.id, r.stats]));
  }, [db, range, scope, scoped, today]);

  const rows: EmployeeRow[] = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return scoped
      .filter((e) => {
        if (f.department && e.departmentId !== f.department) return false;
        if (f.team && e.teamId !== f.team) return false;
        if (f.band && e.bandId !== f.band) return false;
        if (f.designation && (e.designationId ?? "") !== f.designation) return false;
        if (f.status && e.status !== f.status) return false;
        if (q && !`${e.firstName} ${e.lastName} ${e.id} ${e.email} ${e.designationId ? L.designationName(e.designationId) : ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((e) => {
        const s = complianceById.get(e.id);
        return { employee: e, name: `${e.firstName} ${e.lastName}`, compliance: s?.compliance ?? null, due: s?.due ?? 0 };
      });
  }, [scoped, f, complianceById, L]);

  const stats = useMemo(() => {
    const withC = rows.filter((r) => r.compliance !== null);
    return {
      total: rows.length,
      active: rows.filter((r) => r.employee.status === "active").length,
      onLeave: rows.filter((r) => r.employee.status === "on_leave").length,
      inactive: rows.filter((r) => r.employee.status === "inactive").length,
      avg: withC.length ? Math.round((withC.reduce((s, r) => s + r.compliance!, 0) / withC.length) * 10) / 10 : null,
    };
  }, [rows]);

  const departments = db.departments.filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id));
  const teams = db.teams.filter((t) => (!f.department || t.departmentId === f.department) && (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)));

  const openEdit = (e: Employee) => {
    setEditing(e);
    setFormOpen(true);
  };

  const columns: Column<EmployeeRow>[] = [
    { id: "id", header: "Employee ID", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.employee.id}</span>, sortValue: (r) => r.employee.id },
    {
      id: "name",
      header: "Employee",
      cell: (r) => (
        <Link href={`/employees/${r.employee.id}`} className="block w-[200px] hover:underline" onClick={(e) => e.stopPropagation()}>
          <PersonCell name={r.name} sub={r.employee.email || "No email"} />
        </Link>
      ),
      sortValue: (r) => r.name,
    },
    {
      id: "designation",
      header: "Designation",
      cell: (r) => (r.employee.designationId ? <span className="block min-w-[130px] max-w-[200px]">{L.designationName(r.employee.designationId)}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => (r.employee.designationId ? L.designationName(r.employee.designationId) : ""),
    },
    {
      id: "department",
      header: "Department / Team",
      cell: (r) => (
        <div className="min-w-[150px]">
          <div className="whitespace-nowrap">{L.deptName(r.employee.departmentId)}</div>
          <div className="whitespace-nowrap text-xs text-muted-foreground">{r.employee.teamId ? L.teamName(r.employee.teamId) : "No team"}</div>
        </div>
      ),
      sortValue: (r) => `${L.deptName(r.employee.departmentId)} ${L.teamName(r.employee.teamId)}`,
    },
    {
      id: "band",
      header: "Band",
      cell: (r) => (
        <div className="flex min-w-[110px] items-center gap-1.5 whitespace-nowrap">
          <span className="rounded border bg-muted px-1 py-px text-[10px] font-semibold">{L.bandCode(r.employee.bandId)}</span>
          {L.bandName(r.employee.bandId)}
        </div>
      ),
      sortValue: (r) => L.bandName(r.employee.bandId),
    },
    { id: "manager", header: "Reporting Manager", className: "hidden 2xl:table-cell", headerClassName: "hidden 2xl:table-cell", cell: (r) => <span className="block max-w-[130px] truncate">{L.empName(r.employee.reportingManagerId)}</span>, sortValue: (r) => L.empName(r.employee.reportingManagerId) },
    { id: "compliance", header: "Compliance", cell: (r) => <ComplianceBar value={r.compliance} className="min-w-[110px]" />, sortValue: (r) => r.compliance ?? -1 },
    { id: "status", header: "Status", cell: (r) => <EmploymentStatusBadge status={r.employee.status} />, sortValue: (r) => r.employee.status },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/employees/${r.employee.id}`)}>
                <Eye /> View profile
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem onSelect={() => openEdit(r.employee)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {r.employee.status === "inactive" ? (
                    <DropdownMenuItem
                      onSelect={async () => {
                        try {
                          await reactivateEmployee(r.employee.id);
                          toast.success(`${r.name} reactivated`);
                        } catch (err) {
                          toast.error("Could not reactivate", { description: err instanceof Error ? err.message : String(err) });
                        }
                      }}
                    >
                      <UserCheck /> Reactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ ids: [r.employee.id], label: r.name })}>
                      <UserMinus /> Deactivate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting([r.employee.id])}>
                    <Trash2 /> Delete permanently
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const exportCols = [
    { header: "Employee ID", value: (r: EmployeeRow) => r.employee.id, width: 14 },
    { header: "Employee Name", value: (r: EmployeeRow) => r.name, width: 24 },
    { header: "Designation", value: (r: EmployeeRow) => (r.employee.designationId ? L.designationName(r.employee.designationId) : ""), width: 26 },
    { header: "Email", value: (r: EmployeeRow) => r.employee.email, width: 32 },
    { header: "Contact", value: (r: EmployeeRow) => r.employee.phone, width: 18 },
    { header: "Department", value: (r: EmployeeRow) => L.deptName(r.employee.departmentId), width: 24 },
    { header: "Team", value: (r: EmployeeRow) => (r.employee.teamId ? L.teamName(r.employee.teamId) : ""), width: 26 },
    { header: "Band", value: (r: EmployeeRow) => L.bandCode(r.employee.bandId) },
    { header: "Reporting Manager", value: (r: EmployeeRow) => (r.employee.reportingManagerId ? L.empName(r.employee.reportingManagerId) : ""), width: 22 },
    { header: "Date of Joining", value: (r: EmployeeRow) => r.employee.dateOfJoining, width: 14 },
    { header: "Compliance %", value: (r: EmployeeRow) => r.compliance, numFmt: '0.0"%"' },
    { header: "Status", value: (r: EmployeeRow) => EMPLOYMENT_STATUS_META[r.employee.status].label },
  ];

  const doExcel = (list: EmployeeRow[], title = "Employee Directory") =>
    exportToExcel({
      organizationName: db.organization.name,
      title,
      subtitle: `Compliance period: ${formatRange(range)} · ${list.length} employees`,
      fileName: `Altametrics_${title.replace(/\s+/g, "_")}_${today}`,
      columns: exportCols,
      rows: list,
      footer: db.settings.reportFooter,
    });
  const doPdf = (list: EmployeeRow[], title = "Employee Directory") =>
    exportToPdf({
      organizationName: db.organization.name,
      title,
      subtitle: `Compliance period: ${formatRange(range)} · ${list.length} employees`,
      fileName: `Altametrics_${title.replace(/\s+/g, "_")}_${today}`,
      orientation: "landscape",
      columns: [
        { header: "ID", value: (r) => r.employee.id },
        { header: "Name", value: (r) => r.name },
        { header: "Designation", value: (r) => (r.employee.designationId ? L.designationName(r.employee.designationId) : "—") },
        { header: "Department", value: (r) => L.deptName(r.employee.departmentId) },
        { header: "Team", value: (r) => (r.employee.teamId ? L.teamName(r.employee.teamId) : "—") },
        { header: "Band", value: (r) => L.bandCode(r.employee.bandId) },
        { header: "Manager", value: (r) => L.empName(r.employee.reportingManagerId) },
        { header: "Compliance", value: (r) => formatPercent(r.compliance), align: "right" },
        { header: "Status", value: (r) => EMPLOYMENT_STATUS_META[r.employee.status].label },
      ],
      rows: list,
      footer: db.settings.reportFooter,
    });

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Master Data" }, { label: "Employee Directory" }]}
        title="Employee Directory"
        description={`Everyone at ${db.organization.name}, with compliance for ${formatRange(range)}. Employee ID is the unique key used for imports.`}
        actions={
          <>
            {can("reports.export") || canManage ? <ExportMenu onExcel={() => doExcel(rows)} onPdf={() => doPdf(rows)} disabled={!rows.length} /> : null}
            {can("employees.import") ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/employees/import">
                  <FileUp /> Import
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus /> Add Employee
              </Button>
            ) : null}
          </>
        }
        filters={
          <>
            <SearchInput value={f.q} onChange={(v) => set({ q: v })} placeholder="Search name, ID or email…" />
            {departments.length > 1 ? <FilterSelect label="Department" value={f.department} onChange={(v) => set({ department: v, team: null })} options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            {teams.length > 1 ? <FilterSelect label="Team" value={f.team} onChange={(v) => set({ team: v })} options={teams.map((t) => ({ value: t.id, label: t.name }))} /> : null}
            <FilterSelect label="Designation" value={f.designation} onChange={(v) => set({ designation: v })} options={db.designations.filter((d) => db.employees.some((e) => e.designationId === d.id)).map((d) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Band" value={f.band} onChange={(v) => set({ band: v })} options={db.bands.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))} />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set({ status: v })}
              options={(Object.keys(EMPLOYMENT_STATUS_META) as (keyof typeof EMPLOYMENT_STATUS_META)[]).map((s) => ({ value: s, label: EMPLOYMENT_STATUS_META[s].label }))}
            />
            <ResetFiltersButton count={activeCount + (f.q ? 1 : 0)} onClick={clear} />
          </>
        }
      />

      <section className="kpi-strip">
        <KpiCard label="Employees in view" value={stats.total} icon={Users} tone="info" hint="matching filters" />
        <KpiCard label="Active" value={stats.active} icon={UserCheck} tone="success" hint={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of view` : undefined} />
        <KpiCard label="On Leave" value={stats.onLeave} icon={Plane} tone="warning" hint="exempted when approved" />
        <KpiCard label="Inactive" value={stats.inactive} icon={UserX} tone="neutral" hint="history retained" />
        <KpiCard label="Average Compliance" value={formatPercent(stats.avg)} icon={ShieldCheck} tone="teal" hint="employees with due tasks" />
      </section>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.employee.id}
        selectable
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
        onRowClick={(r) => router.push(`/employees/${r.employee.id}`)}
        initialSort={{ id: "id", dir: "asc" }}
        empty={
          <EmptyState
            title="No employees match these filters"
            description="Try a different search term or clear the filters."
            action={
              <Button variant="outline" size="sm" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        }
        bulkActions={(ids) => {
          const sel = rows.filter((r) => ids.includes(r.employee.id));
          return (
            <>
              <ExportMenu label="Export selected" onExcel={() => doExcel(sel, "Selected Employees")} onPdf={() => doPdf(sel, "Selected Employees")} />
              {canManage ? (
                <Button size="sm" variant="destructive" onClick={() => setConfirm({ ids, label: `${ids.length} employees` })}>
                  <UserMinus /> Deactivate
                </Button>
              ) : null}
              {canManage ? (
                <Button size="sm" variant="destructive" onClick={() => setDeleting(ids)}>
                  <Trash2 /> Delete
                </Button>
              ) : null}
            </>
          );
        }}
      />

      <CascadeDeleteDialog kind="employees" ids={deleting} onOpenChange={(o) => !o && setDeleting(null)} onDone={() => setSelected([])} />
      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Deactivate ${confirm?.label ?? ""}?`}
        description="Deactivated employees keep their full compliance history and can be reactivated later. They will no longer receive new process assignments."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          if (!confirm) return;
          try {
            const n = await deactivateEmployees(confirm.ids);
            toast.success(n ? `${n} employee${n === 1 ? "" : "s"} deactivated` : "Already inactive");
            setSelected((s) => s.filter((id) => !confirm.ids.includes(id)));
          } catch (err) {
            toast.error("Deactivation failed", { description: err instanceof Error ? err.message : String(err) });
          }
        }}
      />
    </div>
  );
}
