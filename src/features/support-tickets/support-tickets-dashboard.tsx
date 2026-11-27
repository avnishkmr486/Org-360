"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Flame, LifeBuoy, RefreshCw, Ticket as TicketIcon, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { ChartCard, AXIS_PROPS, CategoryTick, TooltipCard } from "@/components/charts/chart-card";
import { EmptyState, PageSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGlobalDateRange } from "@/hooks/use-data";
import { formatRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { fetchComments, fetchTickets, isClosed, isHigh, sampleTickets, ticketUrl, type Ticket, type TicketComment, type TicketFeed } from "./vtiger";

const DAY = 864e5;
const ALL = "__all";
const STALE_DAYS = 14;

type Quick = "open" | "all" | "high" | "stale" | "closed";
interface Filters {
  quick: Quick;
  stage: string;
  internalStatus: string;
  severity: string;
  assignee: string;
  category: string;
  search: string;
}
const INITIAL: Filters = { quick: "open", stage: ALL, internalStatus: ALL, severity: ALL, assignee: ALL, category: ALL, search: "" };
const QUICK_LABEL: Record<Quick, string> = { open: "Open", all: "All tickets", high: "High / urgent open", stale: `Open > ${STALE_DAYS} days`, closed: "Closed" };

/** VTiger times look like "2026-11-27 06:29:13". */
const ts = (s: string) => (s ? new Date(s.replace(" ", "T") + (s.includes("T") || s.endsWith("Z") ? "" : "Z")).getTime() : NaN);
const fmt = (s: string) => (s && Number.isFinite(ts(s)) ? new Date(ts(s)).toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function countBy(tickets: Ticket[], key: (t: Ticket) => string) {
  const m = new Map<string, number>();
  for (const t of tickets) {
    const k = key(t) || "Unspecified";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function StageBadge({ stage }: { stage: string }) {
  const s = stage.toLowerCase();
  const tone = s.includes("wait") ? "bg-info-soft text-info" : s.includes("progress") ? "bg-success-soft text-success" : isClosed({ stage }) ? "bg-muted text-muted-foreground" : "bg-warning-soft text-warning";
  return stage ? <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", tone)}>{stage}</span> : <>—</>;
}

function SeverityBadge({ severity }: { severity: string }) {
  if (!severity) return <>—</>;
  return <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", isHigh({ severity }) ? "bg-danger-soft text-danger" : "text-foreground")}>{severity}</span>;
}

function BarPanel({ data, color, label, active, onSelect }: { data: { name: string; value: number }[]; color: string; label: string; active?: string; onSelect?: (name: string) => void }) {
  const rows = data.slice(0, 8);
  return (
    <div style={{ height: Math.max(180, rows.length * 32 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} style={{ cursor: onSelect ? "pointer" : undefined }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="name" width={130} tick={<CategoryTick />} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ payload }) => (payload?.length ? <TooltipCard title={String(payload[0].payload.name)} rows={[{ label, value: String(payload[0].value), color }]} footer={onSelect ? "Click to filter the list" : undefined} /> : null)}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} onClick={(d) => onSelect?.(String((d as { name?: string }).name))}>
            {rows.map((r) => (
              <Cell key={r.name} fill={color} fillOpacity={active && active !== ALL && active !== r.name ? 0.35 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-40 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{`All ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SupportTicketsDashboard() {
  const { range } = useGlobalDateRange();
  const [feed, setFeed] = useState<TicketFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<Filters>(INITIAL);
  const [limit, setLimit] = useState(100);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const set = (patch: Partial<Filters>) => {
    setF((p) => ({ ...p, ...patch }));
    setLimit(100);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFeed(await fetchTickets(range));
      setError(null);
    } catch (e) {
      // Fall back to clearly-labelled sample data so the layout is usable before the proxy is deployed.
      setError(e instanceof Error ? e.message : "Could not reach VTiger");
      setFeed(sampleTickets(range));
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    void load();
  }, [load]);

  const now = feed ? new Date(feed.fetchedAt).getTime() : 0;
  const tickets = useMemo(() => feed?.tickets ?? [], [feed]);
  const age = useCallback((t: Ticket) => (now - ts(t.created)) / DAY, [now]);
  const open = useMemo(() => tickets.filter((t) => !isClosed(t)), [tickets]);

  const stats = useMemo(() => {
    const ages = open.map(age).filter(Number.isFinite);
    return {
      total: tickets.length,
      open: open.length,
      closed: tickets.length - open.length,
      high: open.filter(isHigh).length,
      stale: open.filter((t) => age(t) > STALE_DAYS).length,
      avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
    };
  }, [tickets, open, age]);

  // Tickets in scope of the selected tile, before the dropdown filters (charts and filter options reflect the tile).
  const scoped = useMemo(() => {
    switch (f.quick) {
      case "all":
        return tickets;
      case "closed":
        return tickets.filter(isClosed);
      case "high":
        return open.filter(isHigh);
      case "stale":
        return open.filter((t) => age(t) > STALE_DAYS);
      default:
        return open;
    }
  }, [f.quick, tickets, open, age]);

  const rows = useMemo(() => {
    const q = f.search.trim().toLowerCase();
    return scoped
      .filter(
        (t) =>
          (f.stage === ALL || t.stage === f.stage) &&
          (f.internalStatus === ALL || (t.internalStatus || "Unspecified") === f.internalStatus) &&
          (f.severity === ALL || (t.severity || "Unspecified") === f.severity) &&
          (f.assignee === ALL || (t.assignedTo || "Unspecified") === f.assignee) &&
          (f.category === ALL || (t.internalCategory || "Unspecified") === f.category) &&
          (!q || `${t.ticketNo} ${t.org} ${t.incidentNo} ${t.title} ${t.assignedTo}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => (ts(b.modified) || 0) - (ts(a.modified) || 0));
  }, [scoped, f]);

  const opts = (key: (t: Ticket) => string) => countBy(scoped, key).map((x) => x.name);
  const filtersActive = f.quick !== "open" || f.stage !== ALL || f.internalStatus !== ALL || f.severity !== ALL || f.assignee !== ALL || f.category !== ALL || f.search !== "";
  const toggleBar = (key: "stage" | "severity" | "assignee" | "category") => (name: string) => set({ [key]: f[key] === name ? ALL : name } as Partial<Filters>);

  if (loading && !feed) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support Tickets"
        description={feed?.demo ? "Sample data — VTiger is not connected yet" : `Live from VTiger · tickets created ${formatRange(range)} · updated ${new Date(feed?.fetchedAt ?? Date.now()).toLocaleTimeString()}`}
        breadcrumbs={[{ label: "Support" }, { label: "Support Tickets" }]}
        back={false}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Showing sample data. Couldn&apos;t load VTiger tickets: {error}. Deploy the <b>vtiger-tickets</b> Supabase function and set its secrets (see supabase/functions/vtiger-tickets/README.md).
          </span>
        </div>
      ) : null}
      {feed?.truncated ? <div className="rounded-lg border bg-muted px-3 py-2 text-xs text-muted-foreground">Only the first 3,000 tickets in this range are loaded. Narrow the date range for complete figures.</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total tickets" value={stats.total} icon={TicketIcon} tone="info" hint="Click to list all" onClick={() => set({ ...INITIAL, quick: "all" })} className={cn(f.quick === "all" && "ring-2 ring-ring")} />
        <KpiCard label="Open" value={stats.open} icon={LifeBuoy} tone="warning" hint={`${stats.closed} closed`} onClick={() => set({ ...INITIAL, quick: "open" })} className={cn(f.quick === "open" && "ring-2 ring-ring")} />
        <KpiCard label="High / urgent open" value={stats.high} icon={Flame} tone="danger" onClick={() => set({ ...INITIAL, quick: "high" })} className={cn(f.quick === "high" && "ring-2 ring-ring")} />
        <KpiCard
          label="Avg age (open)"
          value={`${stats.avgAge.toFixed(1)}d`}
          icon={Clock}
          tone="teal"
          hint={`${stats.stale} older than ${STALE_DAYS} days`}
          onClick={() => set({ ...INITIAL, quick: "stale" })}
          className={cn(f.quick === "stale" && "ring-2 ring-ring")}
        />
        <KpiCard
          label="Resolution rate"
          value={`${stats.total ? Math.round((stats.closed / stats.total) * 100) : 0}%`}
          icon={CheckCircle2}
          tone="success"
          hint="Click to list closed"
          onClick={() => set({ ...INITIAL, quick: "closed" })}
          className={cn(f.quick === "closed" && "ring-2 ring-ring")}
        />
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={<TicketIcon />} title="No tickets in this date range" description="Pick a wider range in the top bar." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <ChartCard title="By stage" description="Click a bar to filter">
              <BarPanel data={countBy(scoped, (t) => t.stage)} color="var(--chart-1)" label="Tickets" active={f.stage} onSelect={toggleBar("stage")} />
            </ChartCard>
            <ChartCard title="By severity" description="Click a bar to filter">
              <BarPanel data={countBy(scoped, (t) => t.severity)} color="var(--chart-2)" label="Tickets" active={f.severity} onSelect={toggleBar("severity")} />
            </ChartCard>
            <ChartCard title="By assignee" description="Click a bar to filter">
              <BarPanel data={countBy(scoped, (t) => t.assignedTo)} color="var(--chart-3)" label="Tickets" active={f.assignee} onSelect={toggleBar("assignee")} />
            </ChartCard>
            <ChartCard title="By category" description="Click a bar to filter">
              <BarPanel data={countBy(scoped, (t) => t.internalCategory)} color="var(--chart-4)" label="Tickets" active={f.category} onSelect={toggleBar("category")} />
            </ChartCard>
          </div>

          <ChartCard
            title="Support Ticket Open Items"
            description={`${QUICK_LABEL[f.quick]} · ${rows.length} ticket${rows.length === 1 ? "" : "s"} · most recently modified first · click a ticket to open it`}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search ticket, org, title" className="h-8 w-48 text-xs" aria-label="Search tickets" />
                <FilterSelect label="Stage" value={f.stage} onChange={(v) => set({ stage: v })} options={opts((t) => t.stage)} />
                <FilterSelect label="Internal status" value={f.internalStatus} onChange={(v) => set({ internalStatus: v })} options={opts((t) => t.internalStatus || "Unspecified")} />
                {filtersActive ? (
                  <Button variant="ghost" size="sm" onClick={() => set(INITIAL)}>
                    <X /> Reset
                  </Button>
                ) : null}
              </div>
            }
            bodyClassName="overflow-x-auto"
          >
            <table className="w-full min-w-[1200px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {["Ticket Number", "Organization Name", "Incident Number", "Severity", "Internal Severity", "Title", "Module", "Stage", "Internal Status", "Modified Time", "Elapsed Hours", "Internal Assigned To", "Internal Category", "Created Time"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((t) => (
                  <tr key={t.id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => setSelected(t)}>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <button type="button" className="font-medium text-info underline-offset-2 hover:underline" onClick={() => setSelected(t)}>
                        {t.ticketNo || t.id}
                      </button>
                    </td>
                    <td className="max-w-[180px] px-2 py-1.5">{t.org || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{t.incidentNo || "—"}</td>
                    <td className="px-2 py-1.5"><SeverityBadge severity={t.severity} /></td>
                    <td className="px-2 py-1.5">{t.internalSeverity || "—"}</td>
                    <td className="max-w-[260px] px-2 py-1.5" title={t.title}>{t.title}</td>
                    <td className="px-2 py-1.5">{t.module || "—"}</td>
                    <td className="px-2 py-1.5"><StageBadge stage={t.stage} /></td>
                    <td className="px-2 py-1.5">{t.internalStatus || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{fmt(t.modified)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{t.elapsedHours ?? "—"}</td>
                    <td className="px-2 py-1.5">{t.assignedTo || "—"}</td>
                    <td className="px-2 py-1.5">{t.internalCategory || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{fmt(t.created)}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-2 py-6 text-center text-muted-foreground">
                      No tickets match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {rows.length > limit ? (
              <div className="p-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 200)}>
                  Show more ({rows.length - limit} remaining)
                </Button>
              </div>
            ) : null}
          </ChartCard>
        </>
      )}

      <TicketDetail ticket={selected} baseUrl={feed?.baseUrl} demo={feed?.demo} onClose={() => setSelected(null)} />
    </div>
  );
}

function TicketDetail({ ticket, baseUrl, demo, onClose }: { ticket: Ticket | null; baseUrl?: string; demo?: boolean; onClose: () => void }) {
  const [comments, setComments] = useState<TicketComment[] | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const id = ticket?.id;

  useEffect(() => {
    setComments(null);
    setCommentError(null);
    if (!id || demo) return;
    let live = true;
    fetchComments(id)
      .then((c) => live && setComments(c))
      .catch((e) => live && setCommentError(e instanceof Error ? e.message : "Could not load comments"));
    return () => {
      live = false;
    };
  }, [id, demo]);

  const link = ticket ? ticketUrl(baseUrl, ticket) : null;
  const summary: [string, React.ReactNode][] = ticket
    ? [
        ["Organization", ticket.org || "—"],
        ["Stage", <StageBadge key="s" stage={ticket.stage} />],
        ["Internal status", ticket.internalStatus || "—"],
        ["Severity", <SeverityBadge key="v" severity={ticket.severity} />],
        ["Internal severity", ticket.internalSeverity || "—"],
        ["Module", ticket.module || "—"],
        ["Assigned to", ticket.assignedTo || "—"],
        ["Category", ticket.internalCategory || "—"],
        ["Incident number", ticket.incidentNo || "—"],
        ["Elapsed hours", ticket.elapsedHours ?? "—"],
        ["Created", fmt(ticket.created)],
        ["Modified", fmt(ticket.modified)],
      ]
    : [];

  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {ticket ? (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8">
                {ticket.ticketNo} · {ticket.title}
              </SheetTitle>
              <SheetDescription>{ticket.org || "Support ticket"}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6 text-sm">
              {link ? (
                <Button asChild variant="outline" size="sm">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Open in VTiger
                  </a>
                </Button>
              ) : null}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {summary.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 text-[13px]">{v}</dd>
                  </div>
                ))}
              </dl>

              {ticket.description ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h4>
                  <p className="whitespace-pre-wrap text-[13px]">{ticket.description}</p>
                </section>
              ) : null}

              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</h4>
                {demo ? <p className="text-xs text-muted-foreground">Comments load from VTiger once it is connected.</p> : null}
                {!demo && !comments && !commentError ? <p className="text-xs text-muted-foreground">Loading comments…</p> : null}
                {commentError ? <p className="text-xs text-danger">{commentError}</p> : null}
                {comments?.length === 0 ? <p className="text-xs text-muted-foreground">No comments.</p> : null}
                <ul className="space-y-2">
                  {comments?.map((c) => (
                    <li key={c.id} className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="mb-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{c.author || "—"}</span>
                        <span>{fmt(c.createdTime)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px]">{c.text}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <details className="rounded-lg border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium">All fields ({ticket.all.length})</summary>
                <dl className="divide-y border-t text-xs">
                  {ticket.all.map((x, i) => (
                    <div key={`${x.label}-${i}`} className="grid grid-cols-[40%_1fr] gap-2 px-3 py-1.5">
                      <dt className="text-muted-foreground">{x.label}</dt>
                      <dd className="break-words">{x.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
