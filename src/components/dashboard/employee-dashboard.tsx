"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, CalendarClock, CheckCircle2, ClipboardList, ListChecks, UserRound, Workflow } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/states";
import { ComplianceRing } from "@/components/common/compliance-indicator";
import { FrequencyText } from "@/features/dashboards/frequency-text";
import { PriorityBadge, TaskStatusBadge } from "@/components/common/badges";
import { Combobox } from "@/components/common/filters";
import { ChartCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { computeStats, getEffectiveStatus, getTier } from "@/lib/calculations/compliance";
import { addDaysISO, daysBetween, formatDate, formatDateTime, formatRange, monthBuckets } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";
import { TaskChecklistRow } from "@/features/dashboards/widgets";
import { TIER_META } from "@/lib/constants";
import type { ComplianceTask } from "@/types";

export function EmployeeDashboard() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { employee: me, user, can } = useCurrentUser();
  const { range } = useGlobalDateRange();
  const { values, set } = useUrlFilters(["employee"] as const);
  const previewId = !me ? values.employee : "";
  const employee = me ?? (previewId ? (L.employees.get(previewId) ?? null) : null);
  const [tab, setTab] = useState("today");

  const myTasks = useMemo(() => (employee ? db.tasks.filter((t) => t.employeeId === employee.id) : []), [db.tasks, employee]);
  const inRange = useMemo(() => myTasks.filter((t) => t.dueDate >= range.from && t.dueDate <= range.to), [myTasks, range]);
  const stats = useMemo(() => computeStats(inRange, today), [inRange, today]);
  const trend = useMemo(
    () =>
      monthBuckets(today, 6).map((b) => {
        const s = computeStats(myTasks.filter((t) => t.dueDate >= b.range.from && t.dueDate <= b.range.to), today);
        return { key: b.key, label: b.label, compliance: s.compliance, completed: s.completed, due: s.due, onTimeRate: s.onTimeRate };
      }),
    [myTasks, today],
  );

  const open = (t: ComplianceTask) => {
    const s = getEffectiveStatus(t, today);
    return s === "not_started" || s === "in_progress" || s === "rejected" || s === "overdue" || s === "submitted";
  };
  const todays = myTasks.filter((t) => t.dueDate === today);
  const pending = myTasks.filter((t) => open(t) && getEffectiveStatus(t, today) !== "overdue" && t.dueDate <= addDaysISO(today, 14)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const overdue = myTasks.filter((t) => getEffectiveStatus(t, today) === "overdue").sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  const upcoming = myTasks.filter((t) => t.dueDate > today && t.dueDate <= addDaysISO(today, 14) && t.status !== "completed" && t.status !== "not_applicable").sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const history = myTasks.filter((t) => t.submittedAt).sort((a, b) => (a.submittedAt! < b.submittedAt! ? 1 : -1));
  const activeAssignments = new Set(db.assignments.filter((a) => a.status === "active").map((a) => a.id));
  const processIds = [...new Set(myTasks.filter((t) => activeAssignments.has(t.assignmentId)).map((t) => t.processId))];
  const myProcesses = processIds.map((id) => L.processes.get(id)!).filter(Boolean);
  const canSubmit = can("tasks.submit");

  if (!employee) {
    const options = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Dashboards", href: "/" }, { label: "My Dashboard" }]} title="My Dashboard" description="The simplified employee experience: assigned processes, tasks and personal compliance." />
        <EmptyState
          icon={<UserRound className="size-5" />}
          title={`${user.name} is not linked to an employee record`}
          description="Platform accounts like Super Admin have no personal tasks. Preview the employee experience for any employee below."
          action={
            <div className="w-72">
              <Combobox value={null} onChange={(v) => v && set({ employee: v })} options={options} placeholder="Preview as employee…" searchPlaceholder="Search employees…" />
            </div>
          }
        />
      </div>
    );
  }

  const name = `${employee.firstName} ${employee.lastName}`;
  const tier = getTier(stats.compliance, db.settings.thresholds);
  const taskList = (list: ComplianceTask[], empty: string) =>
    list.length ? (
      <div className="space-y-2">
        {list.slice(0, 25).map((t) => (
          <TaskChecklistRow key={t.id} task={t} today={today} canSubmit={canSubmit} />
        ))}
      </div>
    ) : (
      <EmptyState icon={<CheckCircle2 className="size-5" />} title={empty} className="py-8" />
    );

  const historyCols: Column<ComplianceTask>[] = [
    { id: "proc", header: "Process", cell: (t) => <span className="font-medium">{L.processName(t.processId)}</span>, sortValue: (t) => L.processName(t.processId) },
    { id: "due", header: "Due", cell: (t) => <span className="whitespace-nowrap">{formatDate(t.dueDate)}</span>, sortValue: (t) => t.dueDate },
    { id: "sub", header: "Submitted", cell: (t) => <span className="whitespace-nowrap text-xs">{formatDateTime(t.submittedAt)}</span>, sortValue: (t) => t.submittedAt },
    { id: "time", header: "Timeliness", cell: (t) => (t.submittedAt!.slice(0, 10) <= t.dueDate ? <span className="text-xs text-success">On time</span> : <span className="text-xs text-warning">{daysBetween(t.dueDate, t.submittedAt!.slice(0, 10))}d late</span>) },
    { id: "status", header: "Status", cell: (t) => <TaskStatusBadge status={getEffectiveStatus(t, today)} />, sortValue: (t) => t.status },
    { id: "rev", header: "Reviewer note", cell: (t) => <span className="line-clamp-1 text-xs text-muted-foreground">{t.remarks || "—"}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Dashboards", href: "/" }, { label: "My Dashboard" }]}
        title={me ? `Welcome back, ${employee.firstName}` : `Previewing: ${name}`}
        description={[L.bandName(employee.bandId), employee.teamId ? L.teamName(employee.teamId) : null, L.deptName(employee.departmentId), formatRange(range)].filter(Boolean).join(" · ")}
        actions={
          !me ? (
            <div className="w-64">
              <Combobox value={employee.id} onChange={(v) => set({ employee: v })} options={db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }))} allowClear={false} />
            </div>
          ) : (
            <Link href={`/compliance`} className="text-sm font-medium text-primary hover:underline">
              Open my task tracker →
            </Link>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="card-elevated flex flex-col items-center justify-center gap-2 p-5 text-center">
          <ComplianceRing value={stats.compliance} size={136} label="my compliance" />
          <div className="text-xs text-muted-foreground">
            Rated <span className="font-medium" style={{ color: TIER_META[tier].color }}>{TIER_META[tier].label}</span> · {stats.completedDue}/{stats.due} due tasks completed
          </div>
        </div>
        <div className="kpi-strip lg:col-span-3">
          <KpiCard label="Today's Tasks" value={todays.length} icon={CalendarClock} tone="info" hint={`${todays.filter((t) => t.status === "completed").length} done`} />
          <KpiCard label="Pending" value={pending.length} icon={ClipboardList} tone="warning" hint="due within 14 days" />
          <KpiCard label="Overdue" value={overdue.length} icon={AlarmClock} tone="danger" hint="needs action" />
          <KpiCard label="Completed" value={stats.completed} icon={CheckCircle2} tone="success" hint="in period" />
          <KpiCard label="On-time Rate" value={formatPercent(stats.onTimeRate)} icon={ListChecks} tone="teal" hint="of completed" />
          <KpiCard label="Assigned Processes" value={myProcesses.length} icon={Workflow} tone="neutral" hint="active" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card-elevated p-4 lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">My Tasks</h3>
                <p className="text-xs text-muted-foreground">Expand a task to tick off checklist steps, attach evidence and submit.</p>
              </div>
              <TabsList>
                <TabsTrigger value="today">Today ({todays.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
                <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="today">{taskList(todays, "Nothing due today.")}</TabsContent>
            <TabsContent value="pending">{taskList(pending, "No pending tasks.")}</TabsContent>
            <TabsContent value="overdue">{taskList(overdue, "No overdue tasks — well done!")}</TabsContent>
          </Tabs>
        </section>
        <div className="space-y-4">
          <ChartCard title="Upcoming Deadlines" description="Next 14 days">
            {upcoming.length ? (
              <ul className="divide-y">
                {upcoming.slice(0, 7).map((t) => (
                  <li key={t.id}>
                    <Link href={`/compliance/${encodeURIComponent(t.id)}`} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/50">
                      <div className="flex w-11 shrink-0 flex-col items-center rounded-md border bg-background py-0.5">
                        <span className="text-[10px] uppercase text-muted-foreground">{formatDate(t.dueDate, "MMM")}</span>
                        <span className="text-sm font-semibold tabular-nums">{formatDate(t.dueDate, "dd")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{L.processName(t.processId)}</div>
                        <div className="text-xs text-muted-foreground">in {daysBetween(today, t.dueDate)} day(s)</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No upcoming deadlines.</p>
            )}
          </ChartCard>
          <ChartCard title="My Assigned Processes">
            <ul className="space-y-1">
              {myProcesses.map((p) => (
                <li key={p.id}>
                  <button onClick={() => router.push(`/processes/${p.id}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        <FrequencyText frequency={p.frequency} /> · {p.steps.length} steps
                      </span>
                    </span>
                    <PriorityBadge priority={p.priority} />
                  </button>
                </li>
              ))}
              {!myProcesses.length ? <li className="py-4 text-center text-sm text-muted-foreground">No processes assigned.</li> : null}
            </ul>
          </ChartCard>
        </div>
      </div>

      <ChartCard title="My Compliance Trend" description="Monthly personal compliance · last 6 months">
        <ComplianceTrendChart data={trend} threshold={db.settings.thresholds.good} height={220} showParticipation={false} />
      </ChartCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold">My Submission History</h3>
        <DataTable columns={historyCols} rows={history} getRowId={(t) => t.id} onRowClick={(t) => router.push(`/compliance/${encodeURIComponent(t.id)}`)} initialSort={{ id: "sub", dir: "desc" }} dense empty={<EmptyState title="No submissions yet" />} />
      </div>
    </div>
  );
}
