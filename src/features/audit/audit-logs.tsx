"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ScrollText } from "lucide-react";
import type { AuditLog, AuditModule } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { ToneBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/states";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUser, useDatabase, useGlobalDateRange } from "@/hooks/use-data";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatDateTime, formatRange, formatRelative } from "@/lib/utils/dates";
import type { Tone } from "@/lib/constants";

const ACTION_TONE = (action: string): Tone => {
  const a = action.toLowerCase();
  if (a.includes("reject") || a.includes("delet") || a.includes("deactiv")) return "danger";
  if (a.includes("approv") || a.includes("creat") || a.includes("activ")) return "success";
  if (a.includes("assign") || a.includes("import")) return "teal";
  if (a.includes("submit")) return "info";
  return "neutral";
};

/** Best-effort deep link to the affected record. */
function recordHref(l: AuditLog): string | null {
  const id = l.recordId;
  if (l.module === "Employees" && id !== "BULK") return `/employees/${encodeURIComponent(id)}`;
  if (id.startsWith("DEP-")) return `/departments/${id}`;
  if (id.startsWith("TEAM-")) return `/teams/${id}`;
  if (id.startsWith("PRC-")) return `/processes/${id}`;
  if (id.startsWith("ASG-")) return "/processes?tab=assignments";
  if (id.startsWith("USR-")) return "/users";
  if (id === "SETTINGS" || id.startsWith("ORG-")) return "/settings";
  if (l.module === "Master Data") return "/master-data";
  if (l.module === "Import") return "/employees/import";
  return null;
}

export function AuditLogs() {
  const db = useDatabase();
  const { can } = useCurrentUser();
  const global = useGlobalDateRange();
  const [q, setQ] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [useGlobal, setUseGlobal] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const logs = db.auditLogs;
  const modules = useMemo(() => [...new Set(logs.map((l) => l.module))].sort() as AuditModule[], [logs]);
  const actions = useMemo(() => [...new Set(logs.map((l) => l.action))].filter(Boolean).sort(), [logs]);
  const users = useMemo(() => [...new Set(logs.map((l) => l.userName))].sort(), [logs]);

  const range = useGlobal ? global.range : { from: from || "0000-01-01", to: to || "9999-12-31" };
  const rows = useMemo(
    () =>
      logs.filter((l) => {
        const d = l.timestamp.slice(0, 10);
        if (d < range.from || d > range.to) return false;
        if (module && l.module !== module) return false;
        if (action && l.action !== action) return false;
        if (user && l.userName !== user) return false;
        if (q && !`${l.description} ${l.recordId} ${l.recordLabel} ${l.userName} ${l.action}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [logs, range.from, range.to, module, action, user, q],
  );

  const columns: Column<AuditLog>[] = [
    {
      id: "ts",
      header: "Date & time",
      sortValue: (l) => l.timestamp,
      cell: (l) => (
        <div className="whitespace-nowrap">
          <div className="text-sm tabular-nums">{formatDateTime(l.timestamp)}</div>
          <div className="text-[11px] text-muted-foreground">{formatRelative(l.timestamp)}</div>
        </div>
      ),
    },
    { id: "user", header: "User", sortValue: (l) => l.userName, cell: (l) => <PersonCell name={l.userName} sub={ROLE_LABELS[l.userRole]} size="xs" /> },
    { id: "module", header: "Module", sortValue: (l) => l.module, cell: (l) => <span className="text-sm">{l.module}</span> },
    { id: "action", header: "Action", sortValue: (l) => l.action, cell: (l) => <ToneBadge tone={ACTION_TONE(l.action)}>{l.action}</ToneBadge> },
    {
      id: "record",
      header: "Record",
      sortValue: (l) => l.recordLabel,
      cell: (l) => (
        <div className="max-w-[220px]">
          <div className="truncate text-sm font-medium">{l.recordLabel || "—"}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{l.recordId}</div>
        </div>
      ),
    },
    { id: "desc", header: "Description", cell: (l) => <span className="line-clamp-2 max-w-[380px] text-sm text-muted-foreground">{l.description}</span> },
  ];

  const exportCols = [
    { header: "Date & time", value: (l: AuditLog) => formatDateTime(l.timestamp), width: 22 },
    { header: "User", value: (l: AuditLog) => l.userName, width: 22 },
    { header: "Role", value: (l: AuditLog) => ROLE_LABELS[l.userRole] },
    { header: "Module", value: (l: AuditLog) => l.module },
    { header: "Action", value: (l: AuditLog) => l.action },
    { header: "Record ID", value: (l: AuditLog) => l.recordId },
    { header: "Record", value: (l: AuditLog) => l.recordLabel, width: 30 },
    { header: "Description", value: (l: AuditLog) => l.description, width: 60 },
  ];
  const periodLabel = useGlobal ? formatRange(global.range) : from || to ? `${from || "start"} – ${to || "today"}` : "All time";
  const activeCount = [module, action, user, from, to].filter(Boolean).length + (useGlobal ? 1 : 0);

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Audit Logs" }]}
        title="Audit Logs"
        description="Immutable trail of who changed what, and when — employees, organization, processes, assignments, compliance, users and settings."
        actions={
          can("reports.export") || can("audit.view") ? (
            <ExportMenu
              onExcel={() => exportToExcel({ organizationName: db.organization.name, title: "Audit Log", subtitle: `Period: ${periodLabel}`, fileName: "Altametrics_Audit_Log", columns: exportCols, rows, footer: db.settings.reportFooter })}
              onPdf={() =>
                exportToPdf({ organizationName: db.organization.name, title: "Audit Log", subtitle: `Period: ${periodLabel}`, fileName: "Altametrics_Audit_Log", columns: exportCols.filter((c) => c.header !== "Role"), rows, footer: db.settings.reportFooter, orientation: "landscape" })
              }
            />
          ) : null
        }
        filters={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search description, record, user…" />
            <FilterSelect label="Module" value={module} onChange={setModule} options={modules.map((m) => ({ value: m, label: m }))} />
            <FilterSelect label="Action" value={action} onChange={setAction} options={actions.map((a) => ({ value: a, label: a }))} />
            <FilterSelect label="User" value={user} onChange={setUser} options={users.map((u) => ({ value: u, label: u }))} />
            <Button variant={useGlobal ? "secondary" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setUseGlobal((g) => !g)} title="Use the reporting period from the top bar">
              <CalendarDays className="size-3.5" /> {useGlobal ? `Period: ${formatRange(global.range)}` : "Use global period"}
            </Button>
            {!useGlobal ? (
              <div className="flex items-center gap-1">
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] bg-card text-xs" aria-label="From date" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] bg-card text-xs" aria-label="To date" />
              </div>
            ) : null}
            <ResetFiltersButton
              count={activeCount}
              onClick={() => {
                setModule("");
                setAction("");
                setUser("");
                setFrom("");
                setTo("");
                setUseGlobal(false);
              }}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Events in view", value: rows.length },
          { label: "Distinct users", value: new Set(rows.map((r) => r.userName)).size },
          { label: "Compliance events", value: rows.filter((r) => r.module === "Compliance").length },
          { label: "Configuration changes", value: rows.filter((r) => ["Settings", "Master Data", "Users", "Processes"].includes(r.module)).length },
        ].map((s) => (
          <div key={s.label} className="card-elevated p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(l) => l.id}
        onRowClick={setSelected}
        pageSize={20}
        initialSort={{ id: "ts", dir: "desc" }}
        empty={<EmptyState icon={<ScrollText className="size-5" />} title="No audit events match" description="Adjust the filters or date range." />}
      />

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selected.module} · {selected.action}
                </SheetTitle>
                <SheetDescription>{formatDateTime(selected.timestamp)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <PersonCell name={selected.userName} sub={ROLE_LABELS[selected.userRole]} size="md" />
                <dl className="grid gap-3">
                  {[
                    ["Event ID", selected.id],
                    ["Module", selected.module],
                    ["Action", selected.action],
                    ["Record ID", selected.recordId],
                    ["Record", selected.recordLabel || "—"],
                    ["Description", selected.description],
                    ["Timestamp (UTC)", selected.timestamp],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border bg-muted/30 px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 break-words text-sm">{v}</dd>
                    </div>
                  ))}
                </dl>
                {recordHref(selected) ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={recordHref(selected)!}>Open related record</Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
