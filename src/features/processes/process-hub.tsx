"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  Copy,
  Eye,
  GitBranchPlus,
  HeartPulse,
  History,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import type { Assignment, AssignmentLevel, Process, ProcessStatus } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { ProcessStatusBadge, RecordStatusBadge, ToneBadge } from "@/components/common/badges";
import { PersonCell, UserAvatar } from "@/components/common/user-avatar";
import { ExportMenu } from "@/components/common/export-menu";
import { KpiCard } from "@/components/common/kpi-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cloneProcess, setAssignmentStatus, setProcessStatus } from "@/lib/repositories";
import { computeAllProcessHealth, HEALTH_META, type HealthResult, type ProcessHealth } from "@/lib/calculations/process-health";
import { inScope } from "@/lib/auth/permissions";
import { ASSIGNMENT_LEVEL_LABELS, FREQUENCY_LABELS, PROCESS_STATUS_META } from "@/lib/constants";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { addDaysISO, formatDate, formatDateTime, formatRelative } from "@/lib/utils/dates";
import { NewAssignmentSheet } from "@/features/assignments/assignment-form";
import { assignmentEmployees, describeAssignmentTarget } from "./helpers";
import { ProcessQuickCreate } from "./process-quick-create";
import { HEALTH_RANK, HealthBadge } from "./health-badge";

interface ProcessRow {
  process: Process;
  health: HealthResult;
  assignments: number;
  employees: number;
}

interface AssignmentRow {
  a: Assignment;
  target: string;
  employees: number;
  processName: string;
}

const KEYS = ["tab", "q", "status", "health", "owner", "department", "process", "level", "astatus", "new"] as const;

/**
 * Process Management — processes and their assignments in one place.
 * Tabs: Processes (health, owners, coverage), Assignments (who gets what, how often) and Assignment History.
 */
export function ProcessHub() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { can, role, employee, scope, unrestricted } = useCurrentUser();
  const { values: v, set, clear } = useUrlFilters(KEYS);
  const [confirmProcess, setConfirmProcess] = useState<Process | null>(null);
  const [confirmAssignment, setConfirmAssignment] = useState<Assignment | null>(null);
  const [creating, setCreating] = useState(false);

  const isEmployee = role === "employee";
  const canManage = can("processes.manage");
  const canAssign = can("assignments.manage");
  const tab = isEmployee || !["assignments", "history"].includes(v.tab) ? "processes" : v.tab;

  /* ------------------------------- assignments ------------------------------ */
  const assignmentsAll = useMemo<AssignmentRow[]>(
    () =>
      isEmployee
        ? []
        : db.assignments
            .map((a) => {
              const emps = assignmentEmployees(db, a);
              const visible = unrestricted ? emps : emps.filter((e) => inScope(e, scope));
              return { a, target: describeAssignmentTarget(db, a), employees: visible.length, processName: L.processName(a.processId) };
            })
            .filter((r) => unrestricted || r.employees > 0)
            .sort((x, y) => (x.a.createdAt < y.a.createdAt ? 1 : -1)),
    [db, L, scope, unrestricted, isEmployee],
  );

  // Employees reached by each process through its active assignments.
  const coverage = useMemo(() => {
    const byProcess = new Map<string, { assignments: number; employees: Set<string> }>();
    for (const r of assignmentsAll) {
      if (r.a.status !== "active") continue;
      const c = byProcess.get(r.a.processId) ?? { assignments: 0, employees: new Set<string>() };
      c.assignments++;
      for (const e of assignmentEmployees(db, r.a)) if (unrestricted || inScope(e, scope)) c.employees.add(e.id);
      byProcess.set(r.a.processId, c);
    }
    return byProcess;
  }, [assignmentsAll, db, scope, unrestricted]);

  /* -------------------------------- processes ------------------------------- */
  const processesAll = useMemo<ProcessRow[]>(() => {
    const health = computeAllProcessHealth(db.processes, db.tasks, today);
    const visible = isEmployee ? new Set(db.tasks.filter((t) => t.employeeId === employee?.id).map((t) => t.processId)) : null;
    return db.processes
      .filter((p) => !visible || visible.has(p.id))
      .map((p) => ({ process: p, health: health.get(p.id)!, assignments: coverage.get(p.id)?.assignments ?? 0, employees: coverage.get(p.id)?.employees.size ?? 0 }));
  }, [db.processes, db.tasks, today, isEmployee, employee, coverage]);

  const q = v.q.trim().toLowerCase();
  const processes = useMemo(
    () =>
      processesAll.filter(({ process: p, health }) => {
        if (q && !`${p.id} ${p.name} ${p.description} ${p.tags.join(" ")} ${L.empName(p.ownerId)}`.toLowerCase().includes(q)) return false;
        if (v.status && p.status !== v.status) return false;
        if (v.health && health.health !== v.health) return false;
        if (v.owner && p.ownerId !== v.owner) return false;
        if (v.department && !p.scope.departmentIds.includes(v.department) && p.departmentId !== v.department) return false;
        return true;
      }),
    [processesAll, q, v.status, v.health, v.owner, v.department, L],
  );
  const assignments = useMemo(
    () =>
      assignmentsAll.filter((r) => {
        if (q && !`${r.a.id} ${r.processName} ${r.target} ${r.a.createdBy}`.toLowerCase().includes(q)) return false;
        if (v.process && r.a.processId !== v.process) return false;
        if (v.level && r.a.level !== v.level) return false;
        if (v.astatus && r.a.status !== v.astatus) return false;
        return true;
      }),
    [assignmentsAll, q, v.process, v.level, v.astatus],
  );
  const history = useMemo(() => db.auditLogs.filter((l) => l.module === "Assignments").sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [db.auditLogs]);

  const count = (h: ProcessHealth) => processesAll.filter((r) => r.health.health === h).length;
  const followUpsDue = processesAll.filter(({ process: p }) => p.status === "active" && p.followUpDate !== null && p.followUpDate <= addDaysISO(today, 7)).length;
  const activeAssignments = assignmentsAll.filter((r) => r.a.status === "active").length;
  const covered = useMemo(() => {
    const s = new Set<string>();
    coverage.forEach((c) => c.employees.forEach((e) => s.add(e)));
    return s.size;
  }, [coverage]);
  const owners = [...new Set(processesAll.map((r) => r.process.ownerId))];

  const filterCount =
    tab === "processes" ? [v.status, v.health, v.owner, v.department].filter(Boolean).length + (v.q ? 1 : 0) : tab === "assignments" ? [v.process, v.level, v.astatus].filter(Boolean).length + (v.q ? 1 : 0) : 0;

  const onClone = async (p: Process) => {
    try {
      const c = await cloneProcess(p.id);
      toast.success("Process cloned", { description: `${c.id} · ${c.name} created as draft.` });
      router.push(`/processes/${c.id}/edit`);
    } catch (e) {
      toast.error("Clone failed", { description: e instanceof Error ? e.message : undefined });
    }
  };

  /* ---------------------------------- columns --------------------------------- */
  const processColumns: Column<ProcessRow>[] = [
    {
      id: "name",
      header: "Process",
      cell: (r) => (
        <div className="min-w-[240px] max-w-[380px]">
          <div className="font-medium text-foreground">{r.process.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{r.process.id}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{L.categoryName(r.process.categoryId)}</span>
          </div>
        </div>
      ),
      sortValue: (r) => r.process.name,
    },
    { id: "owner", header: "Owner", cell: (r) => <PersonCell name={L.empName(r.process.ownerId)} sub={L.deptName(L.employees.get(r.process.ownerId)?.departmentId)} size="xs" />, sortValue: (r) => L.empName(r.process.ownerId) },
    { id: "freq", header: "Frequency", cell: (r) => <span className="whitespace-nowrap text-sm">{FREQUENCY_LABELS[r.process.frequency]}</span>, sortValue: (r) => r.process.frequency },
    {
      id: "assignments",
      header: "Assignments",
      align: "right",
      cell: (r) =>
        r.assignments > 0 ? (
          <button className="tabular-nums text-primary hover:underline" onClick={(e) => { e.stopPropagation(); set({ tab: "assignments", process: r.process.id }); }}>
            {r.assignments}
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortValue: (r) => r.assignments,
    },
    { id: "employees", header: "Employees", align: "right", cell: (r) => <span className="tabular-nums">{r.employees || "—"}</span>, sortValue: (r) => r.employees },
    { id: "start", header: "Start Date", cell: (r) => <span className="whitespace-nowrap text-sm">{formatDate(r.process.effectiveDate)}</span>, sortValue: (r) => r.process.effectiveDate },
    { id: "health", header: "Health", cell: (r) => <HealthBadge result={r.health} />, sortValue: (r) => HEALTH_RANK[r.health.health] * 1000 + (r.health.compliance ?? 100) },
    { id: "status", header: "Status", cell: (r) => <ProcessStatusBadge status={r.process.status} />, sortValue: (r) => r.process.status },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.process.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => router.push(`/processes/${r.process.id}`)}>
                <Eye /> Open details
              </DropdownMenuItem>
              {!isEmployee ? (
                <DropdownMenuItem onSelect={() => set({ tab: "assignments", process: r.process.id })}>
                  <GitBranchPlus /> View assignments
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => router.push(`/compliance?process=${r.process.id}`)}>
                <ListChecks /> View tasks
              </DropdownMenuItem>
              {canAssign && r.process.status !== "inactive" ? (
                <DropdownMenuItem onSelect={() => set({ new: "1", process: r.process.id })}>
                  <Send /> Assign
                </DropdownMenuItem>
              ) : null}
              {canManage ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push(`/processes/${r.process.id}/edit`)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onClone(r.process)}>
                    <Copy /> Clone
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirmProcess(r.process)} className={r.process.status !== "inactive" ? "text-danger focus:text-danger" : ""}>
                    <Power /> {r.process.status === "inactive" ? "Activate" : "Deactivate"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const assignmentColumns: Column<AssignmentRow>[] = [
    { id: "id", header: "ID", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.a.id}</span>, sortValue: (r) => r.a.id },
    {
      id: "process",
      header: "Process",
      cell: (r) => (
        <Link href={`/processes/${r.a.processId}`} className="font-medium hover:text-primary hover:underline">
          {r.processName}
        </Link>
      ),
      sortValue: (r) => r.processName,
    },
    { id: "level", header: "Level", cell: (r) => <ToneBadge tone="info">{ASSIGNMENT_LEVEL_LABELS[r.a.level]}</ToneBadge>, sortValue: (r) => r.a.level },
    { id: "target", header: "Assigned to", cell: (r) => <span className="text-sm">{r.target}</span>, sortValue: (r) => r.target },
    { id: "emps", header: "Employees", align: "right", cell: (r) => <span className="tabular-nums">{r.employees}</span>, sortValue: (r) => r.employees },
    { id: "freq", header: "Frequency", cell: (r) => FREQUENCY_LABELS[r.a.frequency], sortValue: (r) => r.a.frequency },
    { id: "period", header: "Start – End", cell: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.a.startDate)} – {r.a.endDate ? formatDate(r.a.endDate) : "Ongoing"}</span>, sortValue: (r) => r.a.startDate },
    { id: "owner", header: "Owner", cell: (r) => <span className="text-sm">{L.empName(r.a.ownerId)}</span>, sortValue: (r) => L.empName(r.a.ownerId) },
    { id: "reviewer", header: "Reviewer", cell: (r) => <span className="text-sm">{L.empName(r.a.reviewerId)}</span>, sortValue: (r) => L.empName(r.a.reviewerId) },
    { id: "status", header: "Status", cell: (r) => <RecordStatusBadge status={r.a.status} />, sortValue: (r) => r.a.status },
    {
      id: "created",
      header: "Created",
      cell: (r) => (
        <div className="text-xs">
          <div>{r.a.createdBy}</div>
          <div className="text-muted-foreground">{formatDate(r.a.createdAt)}</div>
        </div>
      ),
      sortValue: (r) => r.a.createdAt,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.a.id}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={`/processes/${r.a.processId}?tab=assignments`}>
                <Eye /> View process
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/compliance?process=${r.a.processId}`}>
                <Workflow /> View tasks
              </Link>
            </DropdownMenuItem>
            {canAssign ? (
              <DropdownMenuItem onSelect={() => setConfirmAssignment(r.a)} className={r.a.status === "active" ? "text-danger focus:text-danger" : ""}>
                <Power /> {r.a.status === "active" ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  /* ---------------------------------- exports --------------------------------- */
  const org = db.organization.name;
  const processExport = [
    { header: "Process ID", value: (r: ProcessRow) => r.process.id },
    { header: "Process Name", value: (r: ProcessRow) => r.process.name, width: 38 },
    { header: "Category", value: (r: ProcessRow) => L.categoryName(r.process.categoryId), width: 22 },
    { header: "Owner", value: (r: ProcessRow) => L.empName(r.process.ownerId), width: 22 },
    { header: "Frequency", value: (r: ProcessRow) => FREQUENCY_LABELS[r.process.frequency] },
    { header: "Active Assignments", value: (r: ProcessRow) => r.assignments },
    { header: "Employees Covered", value: (r: ProcessRow) => r.employees },
    { header: "Start Date", value: (r: ProcessRow) => r.process.effectiveDate, width: 14 },
    { header: "Health", value: (r: ProcessRow) => HEALTH_META[r.health.health].label },
    { header: "Compliance % (90d)", value: (r: ProcessRow) => (r.health.compliance === null ? "N/A" : r.health.compliance) },
    { header: "Status", value: (r: ProcessRow) => PROCESS_STATUS_META[r.process.status].label },
  ];
  const assignmentExport = [
    { header: "Assignment ID", value: (r: AssignmentRow) => r.a.id },
    { header: "Process", value: (r: AssignmentRow) => r.processName, width: 34 },
    { header: "Level", value: (r: AssignmentRow) => ASSIGNMENT_LEVEL_LABELS[r.a.level] },
    { header: "Assigned to", value: (r: AssignmentRow) => r.target, width: 30 },
    { header: "Employees", value: (r: AssignmentRow) => r.employees },
    { header: "Frequency", value: (r: AssignmentRow) => FREQUENCY_LABELS[r.a.frequency] },
    { header: "Start", value: (r: AssignmentRow) => r.a.startDate },
    { header: "End", value: (r: AssignmentRow) => r.a.endDate ?? "Ongoing" },
    { header: "Owner", value: (r: AssignmentRow) => L.empName(r.a.ownerId), width: 20 },
    { header: "Reviewer", value: (r: AssignmentRow) => L.empName(r.a.reviewerId), width: 20 },
    { header: "Status", value: (r: AssignmentRow) => r.a.status },
  ];
  const exportMenu =
    tab === "processes" ? (
      <ExportMenu
        onExcel={() => exportToExcel({ organizationName: org, title: "Process Management", subtitle: "Processes with health, owners and coverage", fileName: "Altametrics_Processes", columns: processExport, rows: processes, footer: db.settings.reportFooter })}
        onPdf={() => exportToPdf({ organizationName: org, title: "Process Management", subtitle: "Processes with health, owners and coverage", fileName: "Altametrics_Processes", columns: processExport.map((c) => ({ header: c.header, value: c.value })), rows: processes, footer: db.settings.reportFooter, orientation: "landscape" })}
      />
    ) : tab === "assignments" ? (
      <ExportMenu
        onExcel={() => exportToExcel({ organizationName: org, title: "Process Assignments", fileName: "Altametrics_Process_Assignments", columns: assignmentExport, rows: assignments, footer: db.settings.reportFooter })}
        onPdf={() => exportToPdf({ organizationName: org, title: "Process Assignments", fileName: "Altametrics_Process_Assignments", columns: assignmentExport, rows: assignments, footer: db.settings.reportFooter })}
      />
    ) : null;

  const kpi = (h: ProcessHealth) => () => set({ tab: "processes", health: v.health === h ? null : h });

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Process Management" }]}
        title="Process Management"
        description={
          isEmployee
            ? "Processes assigned to you. Open one to see its steps, owners and timeline."
            : "Create and manage processes, assign them to departments, teams, bands or people, and track health, coverage and history — all in one place."
        }
        actions={
          <>
            {exportMenu}
            {canManage ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> Create Process
              </Button>
            ) : null}
          </>
        }
        filters={
          tab === "history" ? undefined : tab === "processes" ? (
            <>
              <SearchInput value={v.q} onChange={(x) => set({ q: x })} placeholder="Search name, ID, owner, tag…" />
              <FilterSelect label="Status" value={v.status} onChange={(x) => set({ status: x })} options={(Object.keys(PROCESS_STATUS_META) as ProcessStatus[]).map((s) => ({ value: s, label: PROCESS_STATUS_META[s].label }))} />
              <FilterSelect label="Health" value={v.health} onChange={(x) => set({ health: x })} options={(Object.keys(HEALTH_META) as ProcessHealth[]).map((h) => ({ value: h, label: HEALTH_META[h].label }))} />
              <FilterSelect label="Owner" value={v.owner} onChange={(x) => set({ owner: x })} options={owners.map((id) => ({ value: id, label: L.empName(id) }))} />
              <FilterSelect label="Applied to" value={v.department} onChange={(x) => set({ department: x })} options={db.departments.map((d) => ({ value: d.id, label: d.name }))} />
              <ResetFiltersButton count={filterCount} onClick={() => set({ q: null, status: null, health: null, owner: null, department: null })} />
            </>
          ) : (
            <>
              <SearchInput value={v.q} onChange={(x) => set({ q: x })} placeholder="Search assignments…" />
              <FilterSelect label="Process" value={v.process} onChange={(x) => set({ process: x })} options={db.processes.map((p) => ({ value: p.id, label: p.name }))} />
              <FilterSelect label="Level" value={v.level} onChange={(x) => set({ level: x })} options={(Object.keys(ASSIGNMENT_LEVEL_LABELS) as AssignmentLevel[]).map((l) => ({ value: l, label: ASSIGNMENT_LEVEL_LABELS[l] }))} />
              <FilterSelect label="Status" value={v.astatus} onChange={(x) => set({ astatus: x })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
              <ResetFiltersButton count={filterCount} onClick={() => set({ q: null, process: null, level: null, astatus: null })} />
            </>
          )
        }
      />

      <div className="kpi-strip">
        <KpiCard label="Processes" value={processesAll.length} icon={Layers} tone="info" hint={`${processesAll.filter((r) => r.process.status === "active").length} active`} onClick={() => clear()} />
        <KpiCard label="Healthy" value={count("healthy")} icon={ShieldCheck} tone="success" hint="meeting target" onClick={kpi("healthy")} />
        <KpiCard label="At Risk" value={count("at_risk")} icon={HeartPulse} tone="warning" hint="slightly below target" onClick={kpi("at_risk")} />
        <KpiCard label="Critical" value={count("critical")} icon={ShieldAlert} tone="danger" hint="needs intervention" onClick={kpi("critical")} />
        {!isEmployee ? (
          <>
            <KpiCard label="Active assignments" value={activeAssignments} icon={GitBranchPlus} tone="teal" hint={`of ${assignmentsAll.length} total`} onClick={() => set({ tab: "assignments", astatus: "active" })} />
            <KpiCard label="Employees covered" value={covered} icon={Users} tone="neutral" hint="by active assignments" />
          </>
        ) : null}
        <KpiCard label="Follow-ups due" value={followUpsDue} icon={AlarmClock} tone="warning" hint="overdue or within 7 days" />
      </div>

      <Tabs value={tab} onValueChange={(t) => set({ tab: t === "processes" ? null : t })} className="data-grid-host">
        {!isEmployee ? (
          <TabsList>
            <TabsTrigger value="processes">
              <Workflow className="size-3.5" /> Processes ({processesAll.length})
            </TabsTrigger>
            <TabsTrigger value="assignments">
              <GitBranchPlus className="size-3.5" /> Assignments ({assignmentsAll.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-3.5" /> Assignment History
            </TabsTrigger>
          </TabsList>
        ) : null}
        <TabsContent value="processes" className="data-grid-host mt-4 data-[state=inactive]:hidden">
          <DataTable
            columns={processColumns}
            rows={processes}
            getRowId={(r) => r.process.id}
            onRowClick={(r) => router.push(`/processes/${r.process.id}`)}
            initialSort={{ id: "health", dir: "asc" }}
            empty={
              <EmptyState
                icon={<Workflow className="size-5" />}
                title="No processes match"
                description="Try a different search or clear filters."
                action={filterCount ? <Button variant="outline" size="sm" onClick={() => set({ q: null, status: null, health: null, owner: null, department: null })}>Clear filters</Button> : undefined}
              />
            }
          />
        </TabsContent>
        <TabsContent value="assignments" className="data-grid-host mt-4 data-[state=inactive]:hidden">
          <DataTable
            columns={assignmentColumns}
            rows={assignments}
            getRowId={(r) => r.a.id}
            empty={<EmptyState icon={<GitBranchPlus className="size-5" />} title="No assignments match" description="Adjust filters, or create a new assignment." action={canAssign ? <Button size="sm" onClick={() => set({ new: "1" })}><Plus /> New Assignment</Button> : undefined} />}
          />
        </TabsContent>
        <TabsContent value="history" className="data-grid-host mt-4 data-[state=inactive]:hidden">
          <section className="card-elevated min-h-0 flex-1 overflow-y-auto p-5">
            {history.length ? (
              <ol className="relative space-y-5 border-l pl-6">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[37px] top-0">
                      <UserAvatar name={h.userName} size="sm" className="ring-2 ring-card" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{h.userName}</span>
                      <ToneBadge tone={h.action === "Deactivated" ? "warning" : "info"}>{h.action}</ToneBadge>
                      <span className="font-medium">{h.recordLabel}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{h.recordId}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{h.description}</p>
                    <p className="text-xs text-muted-foreground" title={formatDateTime(h.timestamp)}>
                      {formatRelative(h.timestamp)} · {formatDateTime(h.timestamp)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No assignment activity yet" />
            )}
          </section>
        </TabsContent>
      </Tabs>

      <ProcessQuickCreate open={creating && canManage} onOpenChange={setCreating} />
      <NewAssignmentSheet open={v.new === "1" && canAssign} onOpenChange={(o) => set({ new: o ? "1" : null, process: o ? v.process : null })} initialProcessId={v.process || undefined} />

      <ConfirmDialog
        open={confirmProcess !== null}
        onOpenChange={(o) => !o && setConfirmProcess(null)}
        title={confirmProcess?.status === "inactive" ? "Activate process?" : "Deactivate process?"}
        description={
          confirmProcess?.status === "inactive"
            ? `${confirmProcess?.name} will become active and can be assigned again.`
            : `${confirmProcess?.name} will be marked inactive. Existing tasks and history are kept; it can no longer be assigned.`
        }
        confirmLabel={confirmProcess?.status === "inactive" ? "Activate" : "Deactivate"}
        destructive={confirmProcess?.status !== "inactive"}
        onConfirm={async () => {
          if (!confirmProcess) return;
          try {
            await setProcessStatus(confirmProcess.id, confirmProcess.status === "inactive" ? "active" : "inactive");
            toast.success(confirmProcess.status === "inactive" ? "Process activated" : "Process deactivated", { description: confirmProcess.name });
          } catch (e) {
            toast.error("Update failed", { description: e instanceof Error ? e.message : undefined });
          }
        }}
      />
      <ConfirmDialog
        open={confirmAssignment !== null}
        onOpenChange={(o) => !o && setConfirmAssignment(null)}
        title={confirmAssignment?.status === "active" ? "Deactivate assignment?" : "Activate assignment?"}
        description={confirmAssignment?.status === "active" ? "Future, not-yet-started tasks from this assignment will be marked Not Applicable. Completed history is kept." : "The assignment becomes active again. Tasks previously marked Not Applicable are not restored."}
        confirmLabel={confirmAssignment?.status === "active" ? "Deactivate" : "Activate"}
        destructive={confirmAssignment?.status === "active"}
        onConfirm={async () => {
          if (!confirmAssignment) return;
          try {
            await setAssignmentStatus(confirmAssignment.id, confirmAssignment.status === "active" ? "inactive" : "active");
            toast.success(confirmAssignment.status === "active" ? "Assignment deactivated" : "Assignment activated", { description: confirmAssignment.id });
          } catch (e) {
            toast.error("Update failed", { description: e instanceof Error ? e.message : undefined });
          }
        }}
      />
    </div>
  );
}
