"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, ClipboardCheck, FilePlus2, GitCommitHorizontal, History, MapPinned, Milestone, PauseCircle, Send, Users, XCircle } from "lucide-react";
import type { AuditLog, Process } from "@/types";
import { ToneBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/states";
import { SearchInput, FilterSelect } from "@/components/common/filters";
import { ExportMenu } from "@/components/common/export-menu";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDatabase, useToday } from "@/hooks/use-data";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { TONE_CLASSES, type Tone } from "@/lib/constants";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { auditForProcess, buildProcessTimeline, KIND_GROUP, type TimelineEvent, type TimelineGroup, type TimelineKind } from "./timeline-data";

const ICONS: Record<TimelineKind, typeof History> = {
  created: FilePlus2,
  definition: GitCommitHorizontal,
  status: PauseCircle,
  scope: Users,
  assignment: Send,
  meeting: CalendarCheck,
  follow_up: CalendarClock,
  review: ClipboardCheck,
  approval: CheckCircle2,
  milestone: Milestone,
};

const GROUPS: { value: TimelineGroup; label: string }[] = [
  { value: "all", label: "All" },
  { value: "definition", label: "Definition" },
  { value: "assignments", label: "Assignments" },
  { value: "governance", label: "Meetings & reviews" },
  { value: "compliance", label: "Compliance" },
];

export function ProcessTimelineTab({ process }: { process: Process }) {
  const [view, setView] = useState<"journey" | "audit">("journey");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Timeline &amp; audit</h3>
          <p className="text-xs text-muted-foreground">The complete journey of {process.id} — from creation to today and what is scheduled next.</p>
        </div>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "journey" | "audit")} variant="outline" size="sm">
          <ToggleGroupItem value="journey" aria-label="Journey view" className="gap-1.5 px-3 text-xs">
            <MapPinned className="size-3.5" /> Journey
          </ToggleGroupItem>
          <ToggleGroupItem value="audit" aria-label="Audit log view" className="gap-1.5 px-3 text-xs">
            <History className="size-3.5" /> Audit log
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "journey" ? <Journey process={process} /> : <AuditTable process={process} />}
    </div>
  );
}

/* ------------------------------- Journey -------------------------------- */

function Journey({ process }: { process: Process }) {
  const db = useDatabase();
  const today = useToday();
  const [group, setGroup] = useState<TimelineGroup>("all");
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => buildProcessTimeline(db, process.id, today), [db, process.id, today]);
  const events = all.filter((e) => group === "all" || KIND_GROUP[e.kind] === group);
  const upcoming = events.filter((e) => e.upcoming).sort((a, b) => (a.at < b.at ? -1 : 1));
  const history = events.filter((e) => !e.upcoming);

  // Group history by month for readability.
  const byMonth = new Map<string, TimelineEvent[]>();
  for (const e of history) {
    const key = e.at.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const n = g.value === "all" ? all.length : all.filter((e) => KIND_GROUP[e.kind] === g.value).length;
          return (
            <button
              key={g.value}
              onClick={() => setGroup(g.value)}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors", group === g.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              {g.label} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {events.length === 0 ? <EmptyState icon={<History className="size-5" />} title="No events in this category yet" /> : null}

      {upcoming.length ? (
        <section className="card-elevated p-5">
          <h4 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="size-3.5" /> Coming up
          </h4>
          <Rail events={upcoming} />
        </section>
      ) : null}

      {[...byMonth.entries()].slice(0, showAll ? undefined : 3).map(([month, evs]) => (
        <section key={month} className="card-elevated p-5">
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatDate(`${month}-01`, "MMMM yyyy")}</h4>
          <Rail events={evs} />
        </section>
      ))}
      {byMonth.size > 3 ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer months" : `Show ${byMonth.size - 3} earlier month${byMonth.size - 3 === 1 ? "" : "s"} (back to process creation)`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Rail({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-5 border-l pl-7">
      {events.map((e) => {
        const Icon = e.kind === "approval" && e.tone === "danger" ? XCircle : ICONS[e.kind];
        return (
          <li key={e.id} className="relative">
            <span className={cn("absolute -left-[39px] flex size-8 items-center justify-center rounded-full border-2 border-card", TONE_CLASSES[e.tone as Tone], e.upcoming && "border-dashed")} aria-hidden>
              <Icon className="size-4" />
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold">{e.title}</span>
              {e.upcoming ? <ToneBadge tone="info">Scheduled</ToneBadge> : null}
              {e.overdue ? <ToneBadge tone="danger">Overdue</ToneBadge> : null}
              <span className="text-xs text-muted-foreground" title={formatDateTime(e.at)}>
                {e.at.includes("T12:00:00.000Z") ? formatDate(e.at.slice(0, 10)) : formatDateTime(e.at)}
                {!e.upcoming && Date.now() - new Date(e.at).getTime() < 30 * 86400000 ? ` · ${formatRelative(e.at)}` : ""}
              </span>
            </div>
            {e.actor ? <div className="text-xs text-muted-foreground">by {e.actor}</div> : null}
            {e.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{e.description}</p> : null}
            {e.changes?.length ? (
              <div className="mt-2 overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <tbody>
                    {e.changes.map((c) => (
                      <tr key={c.field} className="border-b last:border-0">
                        <td className="w-40 bg-muted/40 px-2.5 py-1.5 font-medium">{c.label}</td>
                        <td className="px-2.5 py-1.5">
                          <span className="text-muted-foreground line-through decoration-muted-foreground/40">{c.from}</span>
                          <ArrowRight className="mx-1.5 inline size-3 text-muted-foreground" />
                          <span className="font-medium">{c.to}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {e.href ? (
              <Link href={e.href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Open record <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------- Audit log ------------------------------- */

function AuditTable({ process }: { process: Process }) {
  const db = useDatabase();
  const [q, setQ] = useState("");
  const [module, setModule] = useState("");
  const rowsAll = useMemo(() => auditForProcess(db, process.id), [db, process.id]);
  const modules = [...new Set(rowsAll.map((r) => r.module))];
  const rows = rowsAll.filter((r) => (!module || r.module === module) && (!q || `${r.userName} ${r.action} ${r.description} ${r.recordLabel}`.toLowerCase().includes(q.toLowerCase())));

  const columns: Column<AuditLog>[] = [
    { id: "ts", header: "Date & time", cell: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.timestamp)}</span>, sortValue: (r) => r.timestamp },
    {
      id: "user",
      header: "User",
      cell: (r) => (
        <div>
          <div className="text-sm font-medium">{r.userName}</div>
          <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[r.userRole]}</div>
        </div>
      ),
      sortValue: (r) => r.userName,
    },
    { id: "module", header: "Module", cell: (r) => <ToneBadge tone="neutral">{r.module}</ToneBadge>, sortValue: (r) => r.module },
    { id: "action", header: "Action", cell: (r) => <ToneBadge tone="info">{r.action}</ToneBadge>, sortValue: (r) => r.action },
    { id: "record", header: "Record", cell: (r) => <span className="font-mono text-xs">{r.recordId}</span>, sortValue: (r) => r.recordId },
    { id: "desc", header: "Description", cell: (r) => <span className="line-clamp-2 min-w-[260px] text-sm text-muted-foreground">{r.description}</span> },
  ];

  const exportCols = [
    { header: "Date & time", value: (r: AuditLog) => formatDateTime(r.timestamp), width: 22 },
    { header: "User", value: (r: AuditLog) => r.userName, width: 22 },
    { header: "Role", value: (r: AuditLog) => ROLE_LABELS[r.userRole], width: 18 },
    { header: "Module", value: (r: AuditLog) => r.module },
    { header: "Action", value: (r: AuditLog) => r.action },
    { header: "Record", value: (r: AuditLog) => r.recordId },
    { header: "Description", value: (r: AuditLog) => r.description, width: 60 },
  ];
  const meta = { organizationName: db.organization.name, title: `Audit Log — ${process.id} ${process.name}`, fileName: `Audit_${process.id}`, rows, footer: db.settings.reportFooter };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search audit entries…" />
        <FilterSelect label="Module" value={module} onChange={setModule} options={modules.map((m) => ({ value: m, label: m }))} />
        <div className="ml-auto">
          <ExportMenu onExcel={() => exportToExcel({ ...meta, columns: exportCols })} onPdf={() => exportToPdf({ ...meta, columns: exportCols, orientation: "landscape" })} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} initialSort={{ id: "ts", dir: "desc" }} dense empty={<EmptyState icon={<History className="size-5" />} title="No audit entries" description="Changes to this process, its assignments and its submissions are recorded here." action={<Button variant="outline" size="sm" onClick={() => { setQ(""); setModule(""); }}>Clear filters</Button>} />} />
    </div>
  );
}
