"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, MoreHorizontal, Pencil, Plus, Power, PowerOff, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import type { Department } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { RecordStatusBadge } from "@/components/common/badges";
import { ExportMenu } from "@/components/common/export-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/states";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { setDepartmentStatus } from "@/lib/repositories";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatPercent } from "@/lib/utils/format";
import { formatRange } from "@/lib/utils/dates";
import { useOrgAnalytics } from "@/features/organization/use-org-analytics";
import { DepartmentHeadSelect } from "./department-head-select";
import { DepartmentFormDialog } from "@/features/organization/department-form-dialog";

interface Row {
  dept: Department;
  head: string;
  teams: number;
  employees: number;
  activeEmployees: number;
  processes: number;
  compliance: number | null;
  overdue: number;
}

export function DepartmentsPage() {
  const db = useDatabase();
  const lk = useLookups();
  const router = useRouter();
  const { scope, can } = useCurrentUser();
  const a = useOrgAnalytics();
  const { values, set, clear, activeCount } = useUrlFilters(["q", "status"] as const);
  const canManage = can("organization.manage");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | undefined>();
  const [toggling, setToggling] = useState<Department | null>(null);

  const rows: Row[] = useMemo(
    () =>
      db.departments
        .filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id))
        .map((d) => {
          const emps = db.employees.filter((e) => e.departmentId === d.id);
          const s = a.deptStats(d.id);
          return {
            dept: d,
            head: lk.empName(d.headId),
            teams: db.teams.filter((t) => t.departmentId === d.id && t.status === "active").length,
            employees: emps.length,
            activeEmployees: emps.filter((e) => e.status === "active").length,
            processes: a.deptProcesses(d.id).size,
            compliance: s.compliance,
            overdue: s.overdue,
          };
        }),
    [db, scope, lk, a],
  );

  const q = values.q.trim().toLowerCase();
  const filtered = rows.filter((r) => (!values.status || r.dept.status === values.status) && (!q || `${r.dept.name} ${r.dept.code} ${r.dept.id} ${r.head} ${r.dept.description}`.toLowerCase().includes(q)));

  const columns: Column<Row>[] = [
    { id: "id", header: "ID", cell: (r) => <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.dept.id}</span>, sortValue: (r) => r.dept.id },
    {
      id: "name",
      header: "Department",
      cell: (r) => (
        <div className="min-w-[180px] max-w-[280px]">
          <Link href={`/departments/${r.dept.id}`} className="font-medium hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.dept.name}
          </Link>
          <div className="line-clamp-1 text-xs text-muted-foreground">{r.dept.description}</div>
        </div>
      ),
      sortValue: (r) => r.dept.name,
    },
    { id: "head", header: "Department head", cell: (r) => <DepartmentHeadSelect db={db} departmentId={r.dept.id} headId={r.dept.headId} readOnly={!canManage} />, sortValue: (r) => r.head },
    { id: "teams", header: "Teams", align: "right", cell: (r) => r.teams, sortValue: (r) => r.teams },
    { id: "emps", header: "Employees", align: "right", cell: (r) => <span title={`${r.activeEmployees} active`}>{r.employees}</span>, sortValue: (r) => r.employees },
    { id: "proc", header: "Processes", align: "right", cell: (r) => r.processes, sortValue: (r) => r.processes },
    { id: "comp", header: "Compliance", cell: (r) => <ComplianceBar value={r.compliance} />, sortValue: (r) => r.compliance ?? -1 },
    { id: "status", header: "Status", cell: (r) => <RecordStatusBadge status={r.dept.status} />, sortValue: (r) => r.dept.status },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.dept.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/departments/${r.dept.id}`)}>
                <Eye /> View details
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(r.dept);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setToggling(r.dept)} className={r.dept.status === "active" ? "text-danger focus:text-danger" : ""}>
                    {r.dept.status === "active" ? <PowerOff /> : <Power />}
                    {r.dept.status === "active" ? "Deactivate" : "Activate"}
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
    { header: "Department ID", value: (r: Row) => r.dept.id },
    { header: "Department", value: (r: Row) => r.dept.name, width: 28 },
    { header: "Description", value: (r: Row) => r.dept.description, width: 48 },
    { header: "Head", value: (r: Row) => r.head, width: 22 },
    { header: "Teams", value: (r: Row) => r.teams },
    { header: "Employees", value: (r: Row) => r.employees },
    { header: "Processes", value: (r: Row) => r.processes },
    { header: "Compliance %", value: (r: Row) => r.compliance, numFmt: '0.0"%"' },
    { header: "Status", value: (r: Row) => r.dept.status },
  ];

  const togglingActive = toggling ? db.employees.filter((e) => e.departmentId === toggling.id && e.status === "active").length : 0;
  const rated = rows.filter((r) => r.compliance !== null && r.dept.status === "active");

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Department Management" }]}
        title="Department Management"
        description={`Functional departments of ${db.organization.name}, their leadership and process compliance (${formatRange(a.range)}).`}
        actions={
          <>
            <ExportMenu
              onExcel={() => exportToExcel({ organizationName: db.organization.name, title: "Department Register", subtitle: `Compliance period ${formatRange(a.range)}`, fileName: "Altametrics_Departments", columns: exportCols, rows: filtered, footer: db.settings.reportFooter })}
              onPdf={() =>
                exportToPdf({
                  organizationName: db.organization.name,
                  title: "Department Register",
                  subtitle: `Compliance period ${formatRange(a.range)}`,
                  fileName: "Altametrics_Departments",
                  columns: [
                    { header: "ID", value: (r: Row) => r.dept.id },
                    { header: "Department", value: (r) => r.dept.name },
                    { header: "Head", value: (r) => r.head },
                    { header: "Teams", value: (r) => r.teams, align: "right" },
                    { header: "Employees", value: (r) => r.employees, align: "right" },
                    { header: "Processes", value: (r) => r.processes, align: "right" },
                    { header: "Compliance", value: (r) => formatPercent(r.compliance), align: "right" },
                    { header: "Status", value: (r) => r.dept.status },
                  ],
                  rows: filtered,
                  footer: db.settings.reportFooter,
                })
              }
            />
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                <Plus /> Add department
              </Button>
            ) : null}
          </>
        }
        filters={
          <>
            <SearchInput value={values.q} onChange={(v) => set({ q: v })} placeholder="Search departments…" />
            <FilterSelect label="Status" value={values.status} onChange={(v) => set({ status: v })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            <ResetFiltersButton count={activeCount + (values.q ? 1 : 0)} onClick={clear} />
          </>
        }
      />

      <section className="kpi-strip">
        <KpiCard label="Active departments" value={rows.filter((r) => r.dept.status === "active").length} icon={Building2} tone="info" hint={`${rows.length} total`} />
        <KpiCard label="Employees" value={rows.reduce((s, r) => s + r.activeEmployees, 0)} icon={Users} tone="success" hint="active across departments" href="/employees?status=active" />
        <KpiCard label="Average compliance" value={formatPercent(rated.length ? rated.reduce((s, r) => s + r.compliance!, 0) / rated.length : null)} icon={ShieldCheck} tone="teal" hint="mean of departments" />
        <KpiCard label="Below target" value={rated.filter((r) => r.compliance! < db.settings.thresholds.good).length} icon={Building2} tone="warning" hint={`< ${db.settings.thresholds.good}% compliance`} />
      </section>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.dept.id}
        onRowClick={(r) => router.push(`/departments/${r.dept.id}`)}
        initialSort={{ id: "id", dir: "asc" }}
        empty={<EmptyState icon={<Building2 className="size-5" />} title="No departments match" description="Adjust the search or status filter." />}
      />

      <DepartmentFormDialog open={formOpen} onOpenChange={setFormOpen} department={editing} />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.status === "active" ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.status === "active" ? (
            <div className="space-y-2">
              <p>The department will be hidden from new assignments and dashboards. Employees and compliance history are kept.</p>
              {togglingActive ? <p className="font-medium text-warning">Warning: {togglingActive} active employee(s) still belong to this department. Consider moving them first.</p> : null}
            </div>
          ) : (
            "The department will become available for assignments and reporting again."
          )
        }
        confirmLabel={toggling?.status === "active" ? "Deactivate" : "Activate"}
        destructive={toggling?.status === "active"}
        onConfirm={async () => {
          if (!toggling) return;
          try {
            const next = toggling.status === "active" ? "inactive" : "active";
            await setDepartmentStatus(toggling.id, next);
            toast.success(`Department ${next === "active" ? "activated" : "deactivated"}`, { description: toggling.name });
          } catch (err) {
            toast.error("Status change failed", { description: err instanceof Error ? err.message : String(err) });
          }
        }}
      />
    </div>
  );
}
