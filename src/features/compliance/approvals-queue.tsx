"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, Clock, Hourglass, Paperclip, XCircle } from "lucide-react";
import type { ComplianceTask } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/states";
import { PersonCell } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { filterTasks } from "@/lib/calculations/compliance";
import { daysBetween, formatDate, formatDateTime } from "@/lib/utils/dates";
import { ReviewDialog, type ReviewDecision } from "./review-dialog";

const KEYS = ["q", "department", "process"] as const;

export function ApprovalsQueue() {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { scope, can, employee: me } = useCurrentUser();
  const { values: v, set, clear, activeCount } = useUrlFilters(KEYS);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<{ ids: string[]; decision: ReviewDecision; subject?: string } | null>(null);

  const queue = useMemo(
    () =>
      filterTasks(db, { departmentId: v.department || null, processId: v.process || null }, scope, { ignoreRange: true })
        .filter((t) => t.status === "submitted" && t.employeeId !== me?.id)
        .sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? -1 : 1)),
    [db, v.department, v.process, scope, me],
  );
  const rows = useMemo(() => {
    const q = v.q.trim().toLowerCase();
    return q ? queue.filter((t) => `${L.empName(t.employeeId)} ${L.processName(t.processId)}`.toLowerCase().includes(q)) : queue;
  }, [queue, v.q, L]);

  if (!can("tasks.review")) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Compliance Tracking", href: "/compliance" }, { label: "Review Queue" }]} title="Review Queue" />
        <EmptyState title="Reviewing is not part of your role" description="Switch to a supervisor, manager or department head persona to approve submissions." />
      </div>
    );
  }

  const waitDays = (t: ComplianceTask) => (t.submittedAt ? daysBetween(t.submittedAt.slice(0, 10), today) : 0);
  const oldest = queue.reduce((m, t) => Math.max(m, waitDays(t)), 0);
  const late = queue.filter((t) => t.submittedAt && t.submittedAt.slice(0, 10) > t.dueDate).length;

  const columns: Column<ComplianceTask>[] = [
    { id: "emp", header: "Employee", cell: (t) => <PersonCell name={L.empName(t.employeeId)} sub={L.teamName(L.employees.get(t.employeeId)?.teamId)} size="xs" />, sortValue: (t) => L.empName(t.employeeId) },
    { id: "proc", header: "Process", cell: (t) => <span className="font-medium">{L.processName(t.processId)}</span>, sortValue: (t) => L.processName(t.processId) },
    { id: "due", header: "Due", cell: (t) => formatDate(t.dueDate), sortValue: (t) => t.dueDate },
    {
      id: "sub",
      header: "Submitted",
      cell: (t) => (
        <div className="text-xs">
          <div>{formatDateTime(t.submittedAt)}</div>
          {t.submittedAt && t.submittedAt.slice(0, 10) > t.dueDate ? <div className="text-warning">late submission</div> : <div className="text-success">on time</div>}
        </div>
      ),
      sortValue: (t) => t.submittedAt,
    },
    { id: "wait", header: "Waiting", align: "right", cell: (t) => <span className={waitDays(t) > 2 ? "font-medium text-danger" : ""}>{waitDays(t)}d</span>, sortValue: (t) => waitDays(t) },
    { id: "ev", header: "Evidence", align: "center", cell: (t) => (t.evidence.length ? <span className="inline-flex items-center gap-1 text-xs"><Paperclip className="size-3.5" />{t.evidence.length}</span> : <span className="text-xs text-muted-foreground">—</span>) },
    {
      id: "actions",
      header: <span className="sr-only">Review</span>,
      align: "right",
      cell: (t) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" variant="outline" className="text-danger" onClick={() => setReview({ ids: [t.id], decision: "reject", subject: `${L.processName(t.processId)} — ${L.empName(t.employeeId)}` })}>
            <XCircle /> Reject
          </Button>
          <Button size="xs" onClick={() => setReview({ ids: [t.id], decision: "approve", subject: `${L.processName(t.processId)} — ${L.empName(t.employeeId)}` })}>
            <CheckCircle2 /> Approve
          </Button>
        </div>
      ),
    },
  ];

  const departments = db.departments.filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id));

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Compliance Tracking", href: "/compliance" }, { label: "Review Queue" }]}
        title="Review Queue"
        description="Submissions awaiting your approval. Approved tasks count as completed; rejected tasks go back to the employee with your remarks."
        actions={
          <Button size="sm" variant="outline" onClick={() => router.push("/compliance?status=submitted")}>
            Open in Task Tracker
          </Button>
        }
        filters={
          <>
            <SearchInput value={v.q} onChange={(x) => set({ q: x })} placeholder="Search employee or process…" />
            {departments.length > 1 ? <FilterSelect label="Department" value={v.department} onChange={(x) => set({ department: x })} options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            <FilterSelect label="Process" value={v.process} onChange={(x) => set({ process: x })} options={db.processes.filter((p) => p.requiresApproval).map((p) => ({ value: p.id, label: p.name }))} />
            <ResetFiltersButton count={activeCount} onClick={clear} />
          </>
        }
      />
      <div className="kpi-strip">
        <KpiCard label="Awaiting review" value={queue.length} icon={Hourglass} tone="teal" hint="in your scope" />
        <KpiCard label="Oldest waiting" value={`${oldest}d`} icon={Clock} tone={oldest > 2 ? "danger" : "neutral"} hint="since submission" />
        <KpiCard label="Late submissions" value={late} icon={BadgeCheck} tone="warning" hint="submitted after due date" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(t) => t.id}
        selectable
        selectedIds={selected}
        onSelectedIdsChange={setSelected}
        onRowClick={(t) => router.push(`/compliance/${encodeURIComponent(t.id)}`)}
        initialSort={{ id: "wait", dir: "desc" }}
        bulkActions={(ids) => (
          <>
            <Button size="xs" variant="destructive" onClick={() => setReview({ ids, decision: "reject" })}>
              <XCircle /> Reject selected
            </Button>
            <Button size="xs" onClick={() => setReview({ ids, decision: "approve" })}>
              <CheckCircle2 /> Approve selected
            </Button>
          </>
        )}
        empty={<EmptyState icon={<CheckCircle2 className="size-5" />} title="Queue is clear" description="No submissions are waiting for your review." />}
      />
      <ReviewDialog open={review !== null} onOpenChange={(o) => !o && setReview(null)} taskIds={review?.ids ?? []} decision={review?.decision ?? "approve"} subject={review?.subject} onDone={() => setSelected([])} />
    </div>
  );
}
