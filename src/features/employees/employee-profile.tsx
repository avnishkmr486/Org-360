"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import {
  AlarmClock,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Gauge,
  History,
  Mail,
  Paperclip,
  Pencil,
  Phone,
  ShieldCheck,
  Timer,
  UserRound,
  Users,
} from "lucide-react";
import type { ComplianceTask, TaskStatus } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { EmploymentStatusBadge, TaskStatusBadge, TierBadge, ToneBadge } from "@/components/common/badges";
import { ComplianceBar, ComplianceRing } from "@/components/common/compliance-indicator";
import { UserAvatar } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/common/states";
import { FilterSelect } from "@/components/common/filters";
import { DataTable, type Column } from "@/components/tables/data-table";
import { AXIS_PROPS, ChartCard, ChartLegend, TooltipCard } from "@/components/charts/chart-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { inScope } from "@/lib/auth/permissions";
import { computeStats, getEffectiveStatus, getTier, groupStats } from "@/lib/calculations/compliance";
import { resolveAssignmentEmployees } from "@/lib/services/assignment-engine";
import { ASSIGNMENT_LEVEL_LABELS, FREQUENCY_LABELS, TASK_STATUS_META, TASK_STATUSES } from "@/lib/constants";
import { formatDate, formatDateTime, formatRange, monthBuckets } from "@/lib/utils/dates";
import { formatBytes, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { RoleResponsibilities } from "./role-responsibilities";

export function EmployeeProfile({ id }: { id: string }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const { range } = useGlobalDateRange();
  const { scope, can } = useCurrentUser();
  const [editOpen, setEditOpen] = useState(false);
  const animate = !useReducedMotion();
  const [statusFilter, setStatusFilter] = useState("");

  const employee = db.employees.find((e) => e.id === id);
  const team = employee?.teamId ? L.teams.get(employee.teamId) : undefined;
  const name = employee ? `${employee.firstName} ${employee.lastName}` : "";

  const allTasks = useMemo(() => (employee ? db.tasks.filter((t) => t.employeeId === employee.id) : []), [db.tasks, employee]);
  const rangeTasks = useMemo(() => allTasks.filter((t) => t.dueDate >= range.from && t.dueDate <= range.to), [allTasks, range]);
  const stats = useMemo(() => computeStats(rangeTasks, today), [rangeTasks, today]);
  const lifetime = useMemo(() => computeStats(allTasks, today), [allTasks, today]);

  const pending = useMemo(
    () =>
      allTasks
        .filter((t) => {
          const s = getEffectiveStatus(t, today);
          return s === "overdue" || s === "rejected" || ((s === "not_started" || s === "in_progress" || s === "submitted") && t.dueDate <= addDays(today, 14));
        })
        .sort((a, b) => {
          // Upcoming work first (soonest due), then overdue/rejected (most recent first).
          const ua = a.dueDate >= today ? 0 : 1;
          const ub = b.dueDate >= today ? 0 : 1;
          if (ua !== ub) return ua - ub;
          return ua === 0 ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
        }),
    [allTasks, today],
  );

  const assigned = useMemo(() => {
    if (!employee) return [];
    const byProc = groupStats(rangeTasks, (t) => t.processId, today);
    return db.assignments
      .filter((a) => a.status === "active")
      .filter((a) => resolveAssignmentEmployees(a, L.processes.get(a.processId), db).some((e) => e.id === employee.id))
      .map((a) => ({ assignment: a, process: L.processes.get(a.processId)!, stats: byProc.get(a.processId) ?? null }))
      .filter((x) => x.process);
  }, [db, employee, rangeTasks, today, L.processes]);

  const trend = useMemo(() => {
    if (!employee) return [];
    const teamIds = new Set(db.employees.filter((e) => (employee.teamId ? e.teamId === employee.teamId : e.departmentId === employee.departmentId)).map((e) => e.id));
    const peerTasks = db.tasks.filter((t) => teamIds.has(t.employeeId));
    return monthBuckets(today, 6).map((b) => {
      const mine = allTasks.filter((t) => t.dueDate >= b.range.from && t.dueDate <= b.range.to);
      const peers = peerTasks.filter((t) => t.dueDate >= b.range.from && t.dueDate <= b.range.to);
      const s = computeStats(mine, today);
      return { label: b.label, employee: s.compliance, team: computeStats(peers, today).compliance, onTime: s.onTimeRate, completed: s.completed };
    });
  }, [db, employee, allTasks, today]);

  const documents = useMemo(() => {
    const ev = allTasks.flatMap((t) => t.evidence.map((a) => ({ ...a, source: L.processName(t.processId), href: `/compliance/${encodeURIComponent(t.id)}`, kind: "Evidence" as const })));
    const sops = assigned.filter((x) => x.process.sopAttachment).map((x) => ({ ...x.process.sopAttachment!, source: x.process.name, href: `/processes/${x.process.id}`, kind: "SOP" as const }));
    const seen = new Set<string>();
    return [...sops.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))), ...ev.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))];
  }, [allTasks, assigned, L]);

  const activity = useMemo(() => {
    if (!employee) return [];
    const taskEvents = allTasks.flatMap((t) => t.history.map((h) => ({ id: h.id, at: h.createdAt, who: h.authorName, text: h.text, context: L.processName(t.processId), href: `/compliance/${encodeURIComponent(t.id)}`, kind: h.kind as string })));
    const audits = db.auditLogs
      .filter((a) => a.recordId === employee.id || a.recordLabel === name || a.description.includes(name))
      .map((a) => ({ id: a.id, at: a.timestamp, who: a.userName, text: `${a.action}: ${a.description}`, context: a.module, href: "/audit-logs", kind: "audit" }));
    return [...taskEvents, ...audits].sort((a, b) => b.at.localeCompare(a.at));
  }, [allTasks, db.auditLogs, employee, name, L]);
  const [activityLimit, setActivityLimit] = useState(25);

  if (!employee) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Master Data" }, { label: "Employee Directory", href: "/employees" }, { label: "Not found" }]} title="Employee not found" />
        <EmptyState
          title={`No employee with ID ${id}`}
          description="The employee may have been deleted, or the link is incorrect."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/employees">
                <ArrowLeft /> Back to directory
              </Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (!inScope(employee, scope)) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Master Data" }, { label: "Employee Directory", href: "/employees" }, { label: "Restricted" }]} title="Profile not available" />
        <EmptyState title="Outside your data scope" description="Your current demo role can only view employees within its department, team or own profile." />
      </div>
    );
  }

  const tier = getTier(stats.compliance, db.settings.thresholds);
  const historyRows = [...allTasks].filter((t) => t.dueDate <= addDays(today, 30)).filter((t) => !statusFilter || getEffectiveStatus(t, today) === statusFilter);

  const historyCols: Column<ComplianceTask>[] = [
    { id: "process", header: "Process", cell: (t) => <span className="font-medium">{L.processName(t.processId)}</span>, sortValue: (t) => L.processName(t.processId) },
    { id: "due", header: "Due Date", cell: (t) => <span className="whitespace-nowrap tabular-nums">{formatDate(t.dueDate)}</span>, sortValue: (t) => t.dueDate },
    { id: "submitted", header: "Submitted", cell: (t) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(t.submittedAt)}</span>, sortValue: (t) => t.submittedAt ?? "" },
    { id: "status", header: "Status", cell: (t) => <TaskStatusBadge status={getEffectiveStatus(t, today)} />, sortValue: (t) => getEffectiveStatus(t, today) },
    { id: "reviewer", header: "Reviewed by", cell: (t) => <span className="text-muted-foreground">{t.reviewedBy ?? "—"}</span> },
    {
      id: "open",
      header: <span className="sr-only">Open</span>,
      align: "right",
      cell: (t) => (
        <Button variant="ghost" size="xs" asChild>
          <Link href={`/compliance/${encodeURIComponent(t.id)}`}>Open</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: "Master Data" }, { label: "Employee Directory", href: "/employees" }, { label: name }]}
        title="Employee Profile"
        description={`Profile, process assignments and compliance history · KPIs for ${formatRange(range)}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/employees">
                <ArrowLeft /> Directory
              </Link>
            </Button>
            {can("employees.manage") ? (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit employee
              </Button>
            ) : null}
          </>
        }
      />

      <section className="card-elevated overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-navy via-[#14397a] to-teal dark:from-[#0b2454] dark:via-[#13306a] dark:to-[#0f766e]" />
        <div className="flex flex-col gap-5 px-5 pb-5 md:flex-row md:items-end">
          <UserAvatar name={name} size="xl" className="-mt-8 ring-4 ring-card" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{name}</h2>
              <EmploymentStatusBadge status={employee.status} />
              <TierBadge tier={tier} />
            </div>
            <p className="text-sm text-muted-foreground">
              {employee.designationId ? `${L.designationName(employee.designationId)} · ` : ""}
              {L.bandName(employee.bandId)} · <span className="font-mono text-xs">{employee.id}</span>
            </p>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info icon={Building2} label="Department" value={<Link className="hover:underline" href={`/departments/${employee.departmentId}`}>{L.deptName(employee.departmentId)}</Link>} />
          <Info icon={Users} label="Team" value={team ? <Link className="hover:underline" href={`/teams/${team.id}`}>{team.name}</Link> : "—"} />
          <Info icon={UserRound} label="Reporting manager" value={employee.reportingManagerId ? <Link className="hover:underline" href={`/employees/${employee.reportingManagerId}`}>{L.empName(employee.reportingManagerId)}</Link> : "—"} />
          <Info icon={UserRound} label="Team supervisor" value={team?.supervisorId ? <Link className="hover:underline" href={`/employees/${team.supervisorId}`}>{L.empName(team.supervisorId)}</Link> : "—"} />
          <Info icon={Mail} label="Email" value={employee.email ? <a className="hover:underline" href={`mailto:${employee.email}`}>{employee.email}</a> : "—"} />
          <Info icon={Phone} label="Contact" value={employee.phone || "—"} />
          <Info icon={CalendarDays} label="Date of joining" value={formatDate(employee.dateOfJoining)} />
        </dl>
      </section>

      <RoleResponsibilities employee={employee} />

      <section className="kpi-strip">
        <KpiCard label="Compliance" value={formatPercent(stats.compliance)} icon={ShieldCheck} tone="info" hint={`${stats.completedDue} of ${stats.due} due tasks`} />
        <KpiCard label="Completion rate" value={formatPercent(stats.completionRate)} icon={CheckCircle2} tone="success" hint="of applicable tasks" />
        <KpiCard label="On-time rate" value={formatPercent(stats.onTimeRate)} icon={Timer} tone="teal" hint="completed by due date" />
        <KpiCard label="Pending" value={stats.pending} icon={Clock} tone="warning" hint={`${stats.awaitingReview} awaiting review`} />
        <KpiCard label="Overdue" value={stats.overdue} icon={AlarmClock} tone="danger" hint="not completed by due date" href={`/compliance?employee=${employee.id}&status=overdue`} />
      </section>

      <Tabs defaultValue="overview" className="gap-4">
        <div className="scrollbar-thin overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="processes">Assigned Processes ({assigned.length})</TabsTrigger>
            <TabsTrigger value="history">Compliance History</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Compliance snapshot" description={formatRange(range)}>
            <div className="flex flex-col items-center gap-4 py-2">
              <ComplianceRing value={stats.compliance} size={148} stroke={12} />
              <div className="grid w-full grid-cols-3 gap-2 px-2 text-center text-xs">
                <Mini label="Completed" value={stats.completed} />
                <Mini label="Rejected" value={stats.rejected} />
                <Mini label="Exceptions" value={stats.excluded} />
              </div>
              <p className="px-2 text-center text-[11px] text-muted-foreground">Lifetime compliance: {formatPercent(lifetime.compliance)} across {lifetime.due} due tasks.</p>
            </div>
          </ChartCard>
          <ChartCard className="lg:col-span-2" title="Pending activities" description="Overdue, rejected, and work due in the next 14 days">
            {pending.length ? (
              <ul className="divide-y px-2">
                {pending.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link href={`/compliance/${encodeURIComponent(t.id)}`} className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{L.processName(t.processId)}</div>
                        <div className="text-xs text-muted-foreground">Due {formatDate(t.dueDate)}</div>
                      </div>
                      <TaskStatusBadge status={getEffectiveStatus(t, today)} />
                    </Link>
                  </li>
                ))}
                {pending.length > 8 ? (
                  <li className="px-2 py-2 text-xs">
                    <Link className="text-primary hover:underline" href={`/compliance?employee=${employee.id}`}>
                      View all {pending.length} pending activities →
                    </Link>
                  </li>
                ) : null}
              </ul>
            ) : (
              <EmptyState icon={<CheckCircle2 className="size-5" />} title="Nothing pending" description="All assigned work is completed or not yet due." className="m-2" />
            )}
          </ChartCard>
        </TabsContent>

        <TabsContent value="processes">
          {assigned.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assigned.map(({ assignment, process, stats: ps }) => (
                <Link key={assignment.id} href={`/processes/${process.id}`} className="card-elevated card-hover block space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{process.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {process.id} · {L.categoryName(process.categoryId)}
                      </div>
                    </div>
                    <ToneBadge tone="info">{FREQUENCY_LABELS[assignment.frequency]}</ToneBadge>
                  </div>
                  <ComplianceBar value={ps?.compliance ?? null} size="md" />
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Assigned via {ASSIGNMENT_LEVEL_LABELS[assignment.level]}</span>
                    <span>Owner {L.empName(assignment.ownerId)}</span>
                    {assignment.reviewerId ? <span>Reviewer {L.empName(assignment.reviewerId)}</span> : null}
                    <span>
                      {ps?.overdue ?? 0} overdue · {ps?.pending ?? 0} pending
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No active process assignments" description="This employee is not currently covered by any active assignment." />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_META[s].label }))} />
            <span className="text-xs text-muted-foreground">{historyRows.length} tasks (all periods, through next 30 days)</span>
          </div>
          <DataTable columns={historyCols} rows={historyRows} getRowId={(t) => t.id} initialSort={{ id: "due", dir: "desc" }} dense />
        </TabsContent>

        <TabsContent value="performance" className="space-y-3">
          <ChartCard title="Compliance trend vs team average" description={`Last six months · compared with ${team ? team.name : L.deptName(employee.departmentId)}`}>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" {...AXIS_PROPS} dy={6} />
                  <YAxis {...AXIS_PROPS} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={48} />
                  <ReferenceLine y={db.settings.thresholds.good} stroke="var(--warning)" strokeDasharray="5 4" strokeWidth={1.5} />
                  <Tooltip
                    content={({ active, payload }: TooltipProps<number, string>) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof trend)[number];
                      return (
                        <TooltipCard
                          title={d.label}
                          rows={[
                            { label: name, value: formatPercent(d.employee), color: "var(--chart-1)" },
                            { label: "Team average", value: formatPercent(d.team), color: "var(--chart-2)" },
                            { label: "On-time rate", value: formatPercent(d.onTime) },
                            { label: "Completed tasks", value: String(d.completed) },
                          ]}
                        />
                      );
                    }}
                  />
                  <Line isAnimationActive={animate} type="monotone" dataKey="employee" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
                  <Line isAnimationActive={animate} type="monotone" dataKey="team" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend
              items={[
                { label: name, color: "var(--chart-1)" },
                { label: "Team average", color: "var(--chart-2)" },
                { label: `Target ${db.settings.thresholds.good}%`, color: "var(--warning)", dashed: true },
              ]}
            />
          </ChartCard>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric icon={Gauge} label="Submission quality" value={stats.avgQuality !== null ? `${stats.avgQuality.toFixed(1)} / 5` : "N/A"} hint="Average reviewer rating on approved work" />
            <Metric icon={Timer} label="On-time completion" value={formatPercent(stats.onTimeRate)} hint="Completed on or before the due date" />
            <Metric icon={History} label="Lifetime completed" value={String(lifetime.completed)} hint="Across all recorded periods" />
          </div>
          <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            Process compliance reflects adherence to defined organizational processes only. It is not a complete measure of an employee&apos;s overall performance, which also
            depends on outcomes, quality of work, collaboration and goals assessed through regular performance reviews.
          </p>
        </TabsContent>

        <TabsContent value="documents">
          {documents.length ? (
            <div className="card-elevated divide-y">
              {documents.map((d) => (
                <Link key={`${d.kind}-${d.id}`} href={d.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className={cn("flex size-9 items-center justify-center rounded-lg", d.kind === "SOP" ? "bg-info-soft text-info" : "bg-teal-soft text-teal")}>
                    {d.kind === "SOP" ? <FileText className="size-4" /> : <Paperclip className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{d.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.kind} · {d.source} · {formatBytes(d.size)}
                    </div>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {formatDate(d.uploadedAt)} · {d.uploadedBy}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Paperclip className="size-5" />} title="No documents yet" description="Evidence uploaded with submissions and SOPs of assigned processes appear here." />
          )}
        </TabsContent>

        <TabsContent value="activity">
          {activity.length ? (
            <div className="card-elevated p-4">
              <ol className="relative space-y-4 border-l pl-5">
                {activity.slice(0, activityLimit).map((a) => (
                  <li key={a.id} className="relative">
                    <span className={cn("absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-card", a.kind === "review" ? "bg-teal" : a.kind === "audit" ? "bg-navy" : a.kind === "comment" ? "bg-info" : "bg-success")} />
                    <Link href={a.href} className="block rounded-md hover:bg-muted/40">
                      <div className="text-sm">
                        <span className="font-medium">{a.who}</span> <span className="text-muted-foreground">— {a.text}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.context} · {formatDateTime(a.at)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
              {activity.length > activityLimit ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setActivityLimit((n) => n + 25)}>
                  Show more ({activity.length - activityLimit} remaining)
                </Button>
              ) : null}
            </div>
          ) : (
            <EmptyState icon={<History className="size-5" />} title="No activity recorded" />
          )}
        </TabsContent>
      </Tabs>

      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={employee} />
    </div>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="truncate font-medium">{value}</dd>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint: string }) {
  return (
    <div className="card-elevated flex items-start gap-3 p-4">
      <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
        <Icon className="size-4" />
      </span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}

export type { TaskStatus };
