"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  HeartPulse,
  Loader2,
  Paperclip,
  Pencil,
  Power,
  Send,
  ShieldCheck,
  Upload,
  Users,
  CalendarClock,
} from "lucide-react";
import type { Process } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { PriorityBadge, ProcessStatusBadge, RecordStatusBadge, TaskStatusBadge, ToneBadge } from "@/components/common/badges";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/states";
import { PersonCell } from "@/components/common/user-avatar";
import { ChartCard } from "@/components/charts/chart-card";
import { ComplianceTrendChart, GroupComplianceColumns } from "@/components/charts/compliance-charts";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ManageTab } from "./process-workspace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser, useDatabase, useGlobalDateRange, useLookups, useToday } from "@/hooks/use-data";
import { computeStats, filterTasks, getEffectiveStatus, getTier, groupStats } from "@/lib/calculations/compliance";
import { attachSop, cloneProcess, setProcessStatus } from "@/lib/repositories";
import { FREQUENCY_LABELS, ASSIGNMENT_LEVEL_LABELS } from "@/lib/constants";
import { formatBytes, formatPercent } from "@/lib/utils/format";
import { daysBetween, formatDate, formatRange, monthBuckets } from "@/lib/utils/dates";
import { assignmentEmployees, describeAssignmentTarget } from "./helpers";
import { computeAllProcessHealth, HEALTH_META } from "@/lib/calculations/process-health";
import { describeScope, resolveScopeEmployees, SCOPE_LEVEL_LABELS } from "@/lib/services/process-scope";
import { HealthBadge } from "./health-badge";
import { AppliedForTab } from "./process-applied-for";
import { GovernanceTab } from "./process-governance";
import { ProcessTimelineTab } from "./process-timeline";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { Assignment, ComplianceTask } from "@/types";

export function ProcessDetail({ id }: { id: string }) {
  const db = useDatabase();
  const process = db.processes.find((p) => p.id === id);
  if (!process) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Process Management", href: "/processes" }, { label: id }]} title="Process not found" />
        <EmptyState title={`No process with ID ${id}`} description="It may have been removed or the link is incorrect." action={<Button asChild variant="outline" size="sm"><Link href="/processes">Back to Process Dashboard</Link></Button>} />
      </div>
    );
  }
  return <Detail process={process} />;
}

function Detail({ process: p }: { process: Process }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { range } = useGlobalDateRange();
  const { can, scope } = useCurrentUser();
  const { values, set } = useUrlFilters(["tab"] as const);
  const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canManage = can("processes.manage");
  const threshold = db.settings.thresholds;

  const tasks = useMemo(() => filterTasks(db, { range, processId: p.id }, scope), [db, range, p.id, scope]);
  const allTasks = useMemo(() => filterTasks(db, { range, processId: p.id }, scope, { ignoreRange: true }), [db, range, p.id, scope]);
  const stats = useMemo(() => computeStats(tasks, today), [tasks, today]);
  const trend = useMemo(
    () =>
      monthBuckets(range.to > today ? today : range.to, 6).map((b) => {
        const s = computeStats(allTasks.filter((t) => t.dueDate >= b.range.from && t.dueDate <= b.range.to), today);
        return { key: b.key, label: b.label, compliance: s.compliance, onTimeRate: s.onTimeRate, completed: s.completed, due: s.due };
      }),
    [allTasks, range.to, today],
  );
  const byDept = useMemo(() => {
    const g = groupStats(tasks, (t) => L.employees.get(t.employeeId)?.departmentId, today);
    return [...g.entries()].map(([id, s]) => ({ id, name: L.deptName(id), compliance: s.compliance, tier: getTier(s.compliance, threshold), due: s.due, overdue: s.overdue }));
  }, [tasks, L, today, threshold]);
  const overdue = useMemo(() => tasks.filter((t) => getEffectiveStatus(t, today) === "overdue").sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [tasks, today]);
  const assignments = db.assignments.filter((a) => a.processId === p.id);
  const health = useMemo(() => computeAllProcessHealth([p], db.tasks.filter((t) => t.processId === p.id), today).get(p.id)!, [p, db.tasks, today]);
  const scopeCount = useMemo(() => resolveScopeEmployees(p.scope, db, p).length, [p, db]);
  const followUpIn = p.followUpDate ? daysBetween(today, p.followUpDate) : null;

  const onClone = async () => {
    try {
      const c = await cloneProcess(p.id);
      toast.success("Process cloned", { description: `${c.id} created as draft.` });
      router.push(`/processes/${c.id}/edit`);
    } catch (e) {
      toast.error("Clone failed", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const onSop = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) return toast.error("File too large", { description: "Max 10 MB." });
    setUploading(true);
    try {
      await attachSop(p.id, { name: f.name, size: f.size, type: f.type });
      toast.success("SOP uploaded", { description: `${f.name} · version bumped` });
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const asgCols: Column<Assignment>[] = [
    { id: "id", header: "Assignment", cell: (a) => <span className="font-mono text-xs">{a.id}</span>, sortValue: (a) => a.id },
    { id: "level", header: "Level", cell: (a) => <ToneBadge tone="info">{ASSIGNMENT_LEVEL_LABELS[a.level]}</ToneBadge>, sortValue: (a) => a.level },
    { id: "target", header: "Target", cell: (a) => <span className="text-sm">{describeAssignmentTarget(db, a)}</span> },
    { id: "emp", header: "Employees", align: "right", cell: (a) => <span className="tabular-nums">{assignmentEmployees(db, a).length}</span> },
    { id: "freq", header: "Frequency", cell: (a) => FREQUENCY_LABELS[a.frequency] },
    { id: "start", header: "Start", cell: (a) => formatDate(a.startDate), sortValue: (a) => a.startDate },
    { id: "reviewer", header: "Reviewer", cell: (a) => L.empName(a.reviewerId) },
    { id: "status", header: "Status", cell: (a) => <RecordStatusBadge status={a.status} /> },
  ];

  const overdueCols: Column<ComplianceTask>[] = [
    { id: "emp", header: "Employee", cell: (t) => <PersonCell name={L.empName(t.employeeId)} sub={L.teamName(L.employees.get(t.employeeId)?.teamId)} size="xs" />, sortValue: (t) => L.empName(t.employeeId) },
    { id: "dept", header: "Department", cell: (t) => L.deptName(L.employees.get(t.employeeId)?.departmentId), sortValue: (t) => L.deptName(L.employees.get(t.employeeId)?.departmentId) },
    { id: "due", header: "Due date", cell: (t) => formatDate(t.dueDate), sortValue: (t) => t.dueDate },
    { id: "status", header: "Status", cell: (t) => <TaskStatusBadge status={getEffectiveStatus(t, today)} /> },
  ];

  const tab = values.tab || "manage";

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Process Management", href: "/processes" }, { label: p.id }]}
        title={p.name}
        titleAdornment={
          <div className="flex flex-wrap items-center gap-1.5">
            <ToneBadge tone="neutral" className="font-mono">{p.id}</ToneBadge>
            <ProcessStatusBadge status={p.status} />
            <HealthBadge result={health} />
            <PriorityBadge priority={p.priority} />
            <ToneBadge tone="info">v{p.version}</ToneBadge>
          </div>
        }
        description={p.description}
        actions={
          <>
            {canManage ? (
              <>
                <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md" onChange={(e) => e.target.files?.[0] && onSop(e.target.files[0])} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload SOP
                </Button>
                <Button variant="outline" size="sm" onClick={onClone}>
                  <Copy /> Clone
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
                  <Power /> {p.status === "inactive" ? "Activate" : "Deactivate"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/processes/${p.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              </>
            ) : null}
            {can("assignments.manage") && p.status !== "inactive" ? (
              <Button size="sm" asChild>
                <Link href={`/processes?tab=assignments&new=1&process=${p.id}`}>
                  <Send /> Assign process
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="kpi-strip">
        <KpiCard
          label="Health"
          value={<span className={health.health === "healthy" ? "text-success" : health.health === "at_risk" ? "text-warning" : health.health === "critical" ? "text-danger" : "text-muted-foreground"}>{HEALTH_META[health.health].label}</span>}
          icon={HeartPulse}
          tone={HEALTH_META[health.health].tone}
          hint={health.compliance === null ? "last 90 days" : `${health.compliance.toFixed(1)}% vs ${p.complianceThreshold}% target`}
        />
        <KpiCard label="Compliance" value={formatPercent(stats.compliance)} icon={ShieldCheck} tone="info" hint={formatRange(range)} href={`/compliance?process=${p.id}`} />
        <KpiCard label="Applied to" value={scopeCount} icon={Users} tone="teal" hint={`employees · ${SCOPE_LEVEL_LABELS[p.scope.level].toLowerCase()}`} />
        <KpiCard label="Overdue tasks" value={stats.overdue} icon={AlarmClock} tone="danger" hint={formatRange(range)} href={`/compliance?process=${p.id}&status=overdue`} />
        <KpiCard
          label="Next follow-up"
          value={p.followUpDate ? formatDate(p.followUpDate, "dd MMM") : "—"}
          icon={CalendarClock}
          tone={followUpIn !== null && followUpIn < 0 ? "danger" : "warning"}
          hint={followUpIn === null ? "not scheduled" : followUpIn < 0 ? `overdue by ${-followUpIn}d` : followUpIn === 0 ? "today" : `in ${followUpIn} days`}
        />
      </div>

      <Tabs value={tab} onValueChange={(t) => set({ tab: t === "manage" ? null : t })} className="data-grid-host">
        <TabsList className="shrink-0 flex-wrap">
          <TabsTrigger value="manage">Manage &amp; Track</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="applied">Applied For</TabsTrigger>
          <TabsTrigger value="governance">Meetings, Notes &amp; Follow-up</TabsTrigger>
          <TabsTrigger value="steps">Steps ({p.steps.length})</TabsTrigger>
          <TabsTrigger value="assignments">Assignments ({assignments.length})</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="timeline">Timeline &amp; Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="data-grid-host">
          <ManageTab process={p} onOpenMeetings={() => set({ tab: "governance" })} />
        </TabsContent>

        <TabsContent value="overview" className="pane-scroll">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section className="card-elevated p-5">
                <h3 className="mb-4 text-sm font-semibold">Process definition</h3>
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <Item label="Process ID" value={<span className="font-mono">{p.id} <span className="font-sans text-xs font-normal text-muted-foreground">· auto-generated</span></span>} />
                  <Item label="Version" value={`v${p.version} · updated ${formatDate(p.updatedAt)}`} />
                  <Item label="Category" value={L.categoryName(p.categoryId)} />
                  <Item label="Owning department" value={p.departmentId ? <Link className="hover:underline" href={`/departments/${p.departmentId}`}>{L.deptName(p.departmentId)}</Link> : "Organization-wide"} />
                  <Item label="Frequency" value={`${FREQUENCY_LABELS[p.frequency]}${p.frequency === "custom" && p.customIntervalDays ? ` · every ${p.customIntervalDays} days` : ""}`} />
                  <Item label="Start date" value={formatDate(p.effectiveDate)} />
                  <Item label="End date" value={p.expiryDate ? formatDate(p.expiryDate) : "No end date"} />
                  <Item label="Compliance threshold" value={`${p.complianceThreshold}%`} />
                  <Item label="Risk level" value={<ToneBadge tone={p.riskLevel === "high" ? "danger" : p.riskLevel === "medium" ? "warning" : "success"}>{p.riskLevel[0].toUpperCase() + p.riskLevel.slice(1)}</ToneBadge>} />
                  <Item label="SLA per occurrence" value={p.slaDays === null ? "Not defined" : `${p.slaDays} day${p.slaDays === 1 ? "" : "s"}`} />
                  <Item label="Rules" value={`${p.isMandatory ? "Mandatory" : "Optional"} · ${p.requiresApproval ? "Approval required" : "No approval"}`} />
                  <Item label="Success metric" value={p.successMetric || "—"} />
                  <Item label="Objective" value={p.objective} className="sm:col-span-2" />
                  <Item label="Description" value={p.description} className="sm:col-span-2" />
                </dl>
                <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2">
                  <Chips label="Applicable teams (filter)" items={p.applicableTeamIds.map(L.teamName)} />
                  <Chips label="Applicable bands (filter)" items={p.applicableBandIds.map((b) => `${L.bandCode(b)} · ${L.bandName(b)}`)} />
                </div>
                {p.tags.length ? (
                  <div className="mt-4 border-t pt-4">
                    <div className="mb-1.5 text-xs text-muted-foreground">Tags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.tags.map((t) => (
                        <span key={t} className="rounded-full border bg-muted px-2 py-0.5 text-[11px]">#{t}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="card-elevated p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Process applied for</h3>
                  <Button variant="ghost" size="sm" onClick={() => set({ tab: "applied" })}>
                    {canManage ? "Change" : "View coverage"}
                  </Button>
                </div>
                <p className="text-sm">{describeScope(p.scope, db, 5)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{scopeCount} active employees covered.</p>
              </section>
            </div>

            <div className="space-y-4">
              <section className="card-elevated p-5">
                <h3 className="mb-3 text-sm font-semibold">Accountability</h3>
                <div className="space-y-3">
                  <Role label="Process owner" id={p.ownerId} />
                  <Role label="Responsible person" id={p.responsibleId} />
                  <Role label="Reviewer" id={p.reviewerId} />
                  <Role label="Escalation contact" id={p.escalationContactId} />
                </div>
                {p.stakeholderIds.length ? (
                  <div className="mt-4 border-t pt-3">
                    <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Stakeholders</div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.stakeholderIds.map((id) => (
                        <Link key={id} href={`/employees/${id}`} className="rounded-full border bg-muted px-2 py-0.5 text-[11px] hover:bg-accent">
                          {L.empName(id)}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
              <section className="card-elevated p-5">
                <h3 className="mb-3 text-sm font-semibold">SOP &amp; references</h3>
                {p.sopAttachment ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <FileText className="size-5 text-danger" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.sopAttachment.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(p.sopAttachment.size)} · {formatDate(p.sopAttachment.uploadedAt)} · {p.sopAttachment.uploadedBy}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No SOP attached.{canManage ? " Use Upload SOP to add one." : ""}</p>
                )}
                {p.references.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {p.references.map((r) => (
                      <li key={r.id}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <ExternalLink className="size-3.5" /> {r.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              {p.remarks ? (
                <section className="card-elevated p-5">
                  <h3 className="mb-2 text-sm font-semibold">Remarks</h3>
                  <p className="text-sm text-muted-foreground">{p.remarks}</p>
                </section>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="applied" className="pane-scroll">
          <AppliedForTab process={p} />
        </TabsContent>

        <TabsContent value="governance" className="pane-scroll">
          <GovernanceTab process={p} />
        </TabsContent>

        <TabsContent value="steps" className="pane-scroll">
          <ol className="space-y-3">
            {p.steps.map((s, i) => (
              <li key={s.id} className="card-elevated flex gap-4 p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <ToneBadge tone={s.mandatory ? "info" : "neutral"}>{s.mandatory ? "Mandatory" : "Optional"}</ToneBadge>
                    {s.evidenceRequired ? (
                      <ToneBadge tone="teal" icon={<Paperclip className="size-3" />}>
                        Evidence required
                      </ToneBadge>
                    ) : null}
                    {s.approvalRequired ? (
                      <ToneBadge tone="warning" icon={<ClipboardCheck className="size-3" />}>
                        Approval required
                      </ToneBadge>
                    ) : null}
                  </div>
                  {s.description ? <p className="text-sm text-muted-foreground">{s.description}</p> : null}
                  {s.instructions && s.instructions !== s.description ? <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">{s.instructions}</p> : null}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" /> {s.expectedMinutes} min
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="assignments" className="pane-scroll">
          <DataTable
            columns={asgCols}
            rows={assignments}
            getRowId={(a) => a.id}
            onRowClick={() => router.push(`/processes?tab=assignments&process=${p.id}`)}
            empty={
              <EmptyState
                title="Not assigned yet"
                description="Assign this process to an organization, department, team, band or individual employees."
                action={can("assignments.manage") && p.status !== "inactive" ? <Button size="sm" asChild><Link href={`/processes?tab=assignments&new=1&process=${p.id}`}><Send /> Assign process</Link></Button> : undefined}
              />
            }
          />
        </TabsContent>

        <TabsContent value="compliance" className="pane-scroll space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Monthly compliance trend" description={`${p.name} · last 6 months`}>
              <ComplianceTrendChart data={trend} threshold={p.complianceThreshold} showParticipation={false} />
            </ChartCard>
            <ChartCard title="Department-wise compliance" description={formatRange(range)}>
              {byDept.length ? <GroupComplianceColumns data={byDept} threshold={p.complianceThreshold} onSelect={(d) => router.push(`/compliance?process=${p.id}&department=${d.id}`)} /> : <EmptyState title="No tasks in this period" />}
            </ChartCard>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Overdue employees ({overdue.length})</h3>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/compliance?process=${p.id}&status=overdue`}>Open in tracker</Link>
              </Button>
            </div>
            <DataTable columns={overdueCols} rows={overdue} getRowId={(t) => t.id} onRowClick={(t) => router.push(`/compliance/${encodeURIComponent(t.id)}`)} dense empty={<EmptyState icon={<CheckCircle2 className="size-5" />} title="No overdue tasks" description="Everyone is on track for this process in the selected period." />} />
          </div>
          <div className="card-elevated p-4">
            <div className="mb-2 text-sm font-semibold">Status breakdown</div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Assigned", stats.totalAssigned],
                ["Completed", stats.completed],
                ["Pending", stats.pending],
                ["Awaiting review", stats.awaitingReview],
                ["Rejected", stats.rejected],
                ["Excluded", stats.excluded],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-lg bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <ComplianceBar value={stats.compliance} className="mt-3" size="md" />
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="pane-scroll">
          <ProcessTimelineTab process={p} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={p.status === "inactive" ? "Activate process?" : "Deactivate process?"}
        description={p.status === "inactive" ? "The process becomes active and assignable again." : "The process will be marked inactive. History and existing tasks are preserved; it can no longer be assigned."}
        confirmLabel={p.status === "inactive" ? "Activate" : "Deactivate"}
        destructive={p.status !== "inactive"}
        onConfirm={async () => {
          try {
            await setProcessStatus(p.id, p.status === "inactive" ? "active" : "inactive");
            toast.success(p.status === "inactive" ? "Process activated" : "Process deactivated");
          } catch (e) {
            toast.error("Update failed", { description: e instanceof Error ? e.message : undefined });
          }
        }}
      />
    </div>
  );
}

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.length ? items.map((i) => <span key={i} className="rounded-md border bg-muted px-1.5 py-0.5 text-[11px]">{i}</span>) : <span className="text-xs font-medium">All</span>}
      </div>
    </div>
  );
}

function Role({ label, id }: { label: string; id: string | null }) {
  const L = useLookups();
  const e = id ? L.employees.get(id) : undefined;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {e ? (
        <Link href={`/employees/${e.id}`} className="block rounded-md hover:bg-muted/50">
          <PersonCell name={`${e.firstName} ${e.lastName}`} sub={L.deptName(e.departmentId)} />
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">Not assigned</span>
      )}
    </div>
  );
}
