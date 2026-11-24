"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, BadgeCheck, CalendarRange, CheckCircle2, ClipboardList, Hourglass, ShieldCheck, X, XCircle } from "lucide-react";
import type { ComplianceTask, DateRange, TaskStatus } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { TaskStatusBadge } from "@/components/common/badges";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { KpiCard } from "@/components/common/kpi-card";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/states";
import { PersonCell } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { computeStats, filterTasks, getEffectiveStatus, groupStats } from "@/lib/calculations/compliance";
import { inScope } from "@/lib/auth/permissions";
import { TASK_STATUS_META, TASK_STATUSES } from "@/lib/constants";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatPercent } from "@/lib/utils/format";
import { formatDate, formatRange } from "@/lib/utils/dates";
import { ReviewDialog, type ReviewDecision } from "./review-dialog";

const KEYS = ["q", "department", "team", "employee", "band", "process", "category", "status", "from", "to"] as const;

interface Row {
  task: ComplianceTask;
  status: TaskStatus;
  employeeName: string;
  departmentName: string;
  teamName: string;
  processName: string;
  reviewer: string;
  empCompliance: number | null;
}

export function ComplianceTracker() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { range: globalRange } = useGlobalDateRange();
  const { scope, can, role } = useCurrentUser();
  const { values: v, set, clear, activeCount } = useUrlFilters(KEYS);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewDecision | null>(null);
  const canReview = can("tasks.review");

  const urlRange = v.from && v.to && v.from <= v.to;
  const range: DateRange = useMemo(() => (urlRange ? { from: v.from, to: v.to } : globalRange), [urlRange, v.from, v.to, globalRange]);

  const baseFilter = useMemo(
    () => ({ range, departmentId: v.department || null, teamId: v.team || null, employeeId: v.employee || null, bandId: v.band || null, processId: v.process || null, processCategoryId: v.category || null }),
    [range, v.department, v.team, v.employee, v.band, v.process, v.category],
  );

  const scoped = useMemo(() => filterTasks(db, baseFilter, scope), [db, baseFilter, scope]);
  const empCompliance = useMemo(() => groupStats(filterTasks(db, { range }, scope), (t) => t.employeeId, today), [db, range, scope, today]);
  const asgReviewer = useMemo(() => new Map(db.assignments.map((a) => [a.id, a.reviewerId])), [db.assignments]);

  const rowsAll = useMemo<Row[]>(
    () =>
      scoped.map((task) => {
        const e = L.employees.get(task.employeeId);
        return {
          task,
          status: getEffectiveStatus(task, today),
          employeeName: L.empName(task.employeeId),
          departmentName: L.deptName(e?.departmentId),
          teamName: L.teamName(e?.teamId),
          processName: L.processName(task.processId),
          reviewer: task.reviewedBy ?? L.empName(asgReviewer.get(task.assignmentId) ?? L.processes.get(task.processId)?.reviewerId ?? null),
          empCompliance: empCompliance.get(task.employeeId)?.compliance ?? null,
        };
      }),
    [scoped, L, today, asgReviewer, empCompliance],
  );

  const rows = useMemo(() => {
    const q = v.q.trim().toLowerCase();
    return rowsAll.filter((r) => {
      if (v.status && r.status !== v.status) return false;
      if (q && !`${r.employeeName} ${r.processName} ${r.task.employeeId} ${r.teamName} ${r.departmentName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rowsAll, v.status, v.q]);

  const stats = useMemo(() => computeStats(scoped, today), [scoped, today]);
  const submittedSelected = selected.filter((id) => rowsAll.find((r) => r.task.id === id)?.status === "submitted");

  const departments = db.departments.filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id));
  const teams = db.teams.filter((t) => (!v.department || t.departmentId === v.department) && (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)));
  const employees = db.employees.filter((e) => inScope(e, scope) && (!v.department || e.departmentId === v.department) && (!v.team || e.teamId === v.team));
  const isEmployee = role === "employee";

  const columns: Column<Row>[] = [
    ...(!isEmployee
      ? [
          { id: "employee", header: "Employee", cell: (r: Row) => <PersonCell name={r.employeeName} sub={r.task.employeeId} size="xs" />, sortValue: (r: Row) => r.employeeName },
          { id: "department", header: "Department", cell: (r: Row) => <span className="text-xs">{r.departmentName}</span>, sortValue: (r: Row) => r.departmentName },
          { id: "team", header: "Team", cell: (r: Row) => <span className="text-xs">{r.teamName}</span>, sortValue: (r: Row) => r.teamName },
        ]
      : []),
    { id: "process", header: "Process", cell: (r) => <span className="line-clamp-2 min-w-[160px] text-[13px] font-medium leading-snug">{r.processName}</span>, sortValue: (r) => r.processName },
    { id: "due", header: "Due Date", cell: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.task.dueDate)}</span>, sortValue: (r) => r.task.dueDate },
    { id: "submitted", header: "Submission Date", cell: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.task.submittedAt)}</span>, sortValue: (r) => r.task.submittedAt },
    { id: "status", header: "Status", cell: (r) => <TaskStatusBadge status={r.status} />, sortValue: (r) => TASK_STATUS_META[r.status].label },
    { id: "compliance", header: isEmployee ? "My Compliance" : "Employee Compliance", cell: (r) => <ComplianceBar value={r.empCompliance} className="min-w-[110px]" />, sortValue: (r) => r.empCompliance ?? -1 },
    { id: "reviewer", header: "Reviewer", cell: (r) => <span className="whitespace-nowrap text-xs">{r.reviewer}</span>, sortValue: (r) => r.reviewer },
  ];

  const exportCols = [
    { header: "Employee", value: (r: Row) => r.employeeName, width: 22 },
    { header: "Employee ID", value: (r: Row) => r.task.employeeId },
    { header: "Department", value: (r: Row) => r.departmentName, width: 22 },
    { header: "Team", value: (r: Row) => r.teamName, width: 24 },
    { header: "Process", value: (r: Row) => r.processName, width: 34 },
    { header: "Due Date", value: (r: Row) => r.task.dueDate },
    { header: "Submitted", value: (r: Row) => r.task.submittedAt?.slice(0, 10) ?? "" },
    { header: "Status", value: (r: Row) => TASK_STATUS_META[r.status].label },
    { header: "Employee Compliance %", value: (r: Row) => (r.empCompliance === null ? "N/A" : r.empCompliance) },
    { header: "Reviewer", value: (r: Row) => r.reviewer, width: 20 },
  ];
  const summary = [
    { label: "Compliance", value: formatPercent(stats.compliance) },
    { label: "Assigned", value: stats.totalAssigned },
    { label: "Completed", value: stats.completed },
    { label: "Overdue", value: stats.overdue },
  ];
  const filterDesc = [`Period: ${formatRange(range)}`, ...(v.status ? [`Status: ${TASK_STATUS_META[v.status as TaskStatus]?.label}`] : [])];

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Compliance Tracking", href: "/compliance" }, { label: "Task Tracker" }]}
        title={isEmployee ? "My Compliance Tasks" : "Compliance Tracking"}
        description={isEmployee ? "Every process occurrence assigned to you — open a task to complete its checklist and submit." : "Track every assigned process occurrence, its submission and review status across the organization."}
        actions={
          <>
            <ExportMenu
              onExcel={() => exportToExcel({ organizationName: db.organization.name, title: "Compliance Tracking Report", subtitle: formatRange(range), filters: filterDesc, fileName: `Altametrics_Compliance_Tasks_${range.to}`, summary, columns: exportCols, rows, footer: db.settings.reportFooter })}
              onPdf={() =>
                exportToPdf({
                  organizationName: db.organization.name,
                  title: "Compliance Tracking Report",
                  subtitle: formatRange(range),
                  filters: filterDesc,
                  fileName: `Altametrics_Compliance_Tasks_${range.to}`,
                  summary,
                  columns: exportCols.filter((c) => c.header !== "Employee ID").map((c) => ({ header: c.header, value: c.header.includes("%") ? (r: Row) => formatPercent(r.empCompliance) : c.value })),
                  rows,
                  footer: db.settings.reportFooter,
                })
              }
            />
            {canReview ? (
              <Button size="sm" onClick={() => router.push("/compliance/approvals")}>
                <BadgeCheck /> Review queue
              </Button>
            ) : null}
          </>
        }
        filters={
          <>
            {urlRange ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-info-soft/50 px-2.5 text-xs">
                <CalendarRange className="size-3.5 text-primary" />
                <span className="font-medium">{formatRange(range)}</span>
                <button onClick={() => set({ from: null, to: null })} aria-label="Clear date drill-down" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground">
                <CalendarRange className="size-3.5" /> {formatRange(range)}
              </span>
            )}
            <SearchInput value={v.q} onChange={(x) => set({ q: x })} placeholder={isEmployee ? "Search processes…" : "Search employee, process…"} />
            {!isEmployee && departments.length > 1 ? <FilterSelect label="Department" value={v.department} onChange={(x) => set({ department: x, team: null, employee: null })} options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            {!isEmployee && teams.length > 1 ? <FilterSelect label="Team" value={v.team} onChange={(x) => set({ team: x, employee: null })} options={teams.map((t) => ({ value: t.id, label: t.name }))} /> : null}
            {!isEmployee ? <FilterSelect label="Employee" value={v.employee} onChange={(x) => set({ employee: x })} options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))} /> : null}
            <FilterSelect label="Process" value={v.process} onChange={(x) => set({ process: x })} options={db.processes.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect label="Category" value={v.category} onChange={(x) => set({ category: x })} options={db.processCategories.map((c) => ({ value: c.id, label: c.name }))} />
            <FilterSelect label="Status" value={v.status} onChange={(x) => set({ status: x })} options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_META[s].label }))} />
            {v.band ? <FilterSelect label="Band" value={v.band} onChange={(x) => set({ band: x })} options={db.bands.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))} /> : null}
            <ResetFiltersButton count={activeCount} onClick={clear} />
          </>
        }
      />

      <section className="kpi-strip" aria-label="Compliance overview">
        <StatusKpi label="Total Assigned" value={stats.totalAssigned} icon={ClipboardList} tone="info" hint="all statuses" active={!v.status} onClick={() => set({ status: null })} />
        <StatusKpi label="Completed" value={stats.completed} icon={CheckCircle2} tone="success" active={v.status === "completed"} onClick={() => set({ status: v.status === "completed" ? null : "completed" })} />
        <KpiCard label="Pending" value={stats.pending} icon={Hourglass} tone="neutral" hint={`${stats.awaitingReview} awaiting review`} />
        <StatusKpi label="Overdue" value={stats.overdue} icon={AlarmClock} tone="danger" active={v.status === "overdue"} onClick={() => set({ status: v.status === "overdue" ? null : "overdue" })} />
        <StatusKpi label="Rejected" value={stats.rejected} icon={XCircle} tone="warning" active={v.status === "rejected"} onClick={() => set({ status: v.status === "rejected" ? null : "rejected" })} />
        <KpiCard label="Approved" value={stats.approved} icon={BadgeCheck} tone="teal" hint="via reviewer approval" />
        <KpiCard label="Overall Compliance" value={formatPercent(stats.compliance)} icon={ShieldCheck} tone="info" hint={`${stats.completedDue}/${stats.due} due`} />
      </section>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.task.id}
        onRowClick={(r) => router.push(`/compliance/${encodeURIComponent(r.task.id)}`)}
        initialSort={{ id: "due", dir: "desc" }}
        dense
        selectable={canReview}
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
        bulkActions={() => (
          <>
            <span className="text-xs text-muted-foreground">{submittedSelected.length} awaiting review</span>
            <Button size="xs" disabled={!submittedSelected.length} onClick={() => setReview("approve")}>
              <CheckCircle2 /> Approve
            </Button>
            <Button size="xs" variant="destructive" disabled={!submittedSelected.length} onClick={() => setReview("reject")}>
              <XCircle /> Reject
            </Button>
          </>
        )}
        empty={<EmptyState icon={<ClipboardList className="size-5" />} title="No tasks match these filters" description="Widen the date range from the top bar or clear filters." action={activeCount ? <Button size="sm" variant="outline" onClick={clear}>Clear filters</Button> : undefined} />}
      />

      <ReviewDialog open={review !== null} onOpenChange={(o) => !o && setReview(null)} taskIds={submittedSelected} decision={review ?? "approve"} onDone={() => setSelected([])} />
    </div>
  );
}

function StatusKpi({ active, onClick, ...props }: React.ComponentProps<typeof KpiCard> & { active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`h-full rounded-[0.9rem] text-left ${active ? "ring-2 ring-primary" : ""}`} aria-pressed={active} title="Filter by this status">
      <KpiCard {...props} className="kpi-tile-clickable h-full" />
    </button>
  );
}
