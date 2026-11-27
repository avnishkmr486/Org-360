"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Flame, LifeBuoy, RefreshCw, Ticket as TicketIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { ChartCard, AXIS_PROPS, CategoryTick, TooltipCard } from "@/components/charts/chart-card";
import { EmptyState, PageSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchTickets, isClosed, sampleTickets, type Ticket, type TicketFeed } from "./vtiger";

const DAY = 864e5;
const ALL = "__all";
const HIGH = ["high", "urgent", "critical"];

function countBy(tickets: Ticket[], key: (t: Ticket) => string) {
  const m = new Map<string, number>();
  for (const t of tickets) {
    const k = key(t) || "Unspecified";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Tickets created per week (and how many of those are closed), last 12 weeks. */
function weeklyTrend(tickets: Ticket[], now: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const start = now - (11 - i) * 7 * DAY;
    const end = start + 7 * DAY;
    const inWeek = tickets.filter((t) => {
      const c = new Date(t.createdTime).getTime();
      return c >= start && c < end;
    });
    return {
      name: new Date(start).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      Created: inWeek.length,
      Closed: inWeek.filter(isClosed).length,
    };
  });
}

function BarPanel({ data, color, label }: { data: { name: string; value: number }[]; color: string; label: string }) {
  const rows = data.slice(0, 8);
  return (
    <div style={{ height: Math.max(180, rows.length * 32 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="name" width={130} tick={<CategoryTick />} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ payload }) => (payload?.length ? <TooltipCard title={String(payload[0].payload.name)} rows={[{ label, value: String(payload[0].value), color }]} /> : null)}
          />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SupportTicketsDashboard() {
  const [feed, setFeed] = useState<TicketFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFeed(await fetchTickets());
      setError(null);
    } catch (e) {
      // Fall back to clearly-labelled sample data so the layout is usable before the proxy is deployed.
      setError(e instanceof Error ? e.message : "Could not reach VTiger");
      setFeed(sampleTickets());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const now = feed ? new Date(feed.fetchedAt).getTime() : 0;
  const tickets = useMemo(() => feed?.tickets ?? [], [feed]);
  const open = useMemo(() => tickets.filter((t) => !isClosed(t)), [tickets]);

  const stats = useMemo(() => {
    const ages = open.map((t) => (now - new Date(t.createdTime).getTime()) / DAY);
    return {
      total: tickets.length,
      open: open.length,
      closed: tickets.length - open.length,
      highOpen: open.filter((t) => HIGH.includes(t.priority.toLowerCase())).length,
      avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
      stale: ages.filter((a) => a > 14).length,
    };
  }, [tickets, open, now]);

  const openStatuses = useMemo(() => countBy(open, (t) => t.status).map((s) => s.name), [open]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return open
      .filter((t) => (status === ALL || t.status === status) && (!q || `${t.ticketNo} ${t.title} ${t.assignee}`.toLowerCase().includes(q)))
      .sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime())
      .slice(0, 100);
  }, [open, status, search]);

  if (loading && !feed) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support Tickets"
        description={feed?.demo ? "Sample data — VTiger is not connected yet" : `Live from VTiger · updated ${new Date(feed?.fetchedAt ?? Date.now()).toLocaleString()}`}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total tickets" value={stats.total} icon={TicketIcon} tone="info" />
        <KpiCard label="Open" value={stats.open} icon={LifeBuoy} tone="warning" hint={`${stats.closed} closed`} />
        <KpiCard label="High / urgent open" value={stats.highOpen} icon={Flame} tone="danger" />
        <KpiCard label="Avg age (open)" value={`${stats.avgAge.toFixed(1)}d`} icon={Clock} tone="teal" hint={`${stats.stale} older than 14 days`} />
        <KpiCard label="Resolution rate" value={`${stats.total ? Math.round((stats.closed / stats.total) * 100) : 0}%`} icon={CheckCircle2} tone="success" />
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={<TicketIcon />} title="No tickets found" description="VTiger returned no HelpDesk tickets for this user." />
      ) : (
        <>
          <ChartCard title="Tickets per week" description="Created vs. closed, by creation week (last 12 weeks)">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend(tickets, now)} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" {...AXIS_PROPS} />
                  <YAxis allowDecimals={false} {...AXIS_PROPS} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={({ payload, label }) =>
                      payload?.length ? <TooltipCard title={`Week of ${label}`} rows={payload.map((p) => ({ label: String(p.name), value: String(p.value), color: p.color }))} /> : null
                    }
                  />
                  <Bar dataKey="Created" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Closed" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <ChartCard title="By status">
              <BarPanel data={countBy(tickets, (t) => t.status)} color="var(--chart-1)" label="Tickets" />
            </ChartCard>
            <ChartCard title="Open by priority">
              <BarPanel data={countBy(open, (t) => t.priority)} color="var(--chart-2)" label="Open" />
            </ChartCard>
            <ChartCard title="Open by assignee">
              <BarPanel data={countBy(open, (t) => t.assignee)} color="var(--chart-3)" label="Open" />
            </ChartCard>
            <ChartCard title="Open by category">
              <BarPanel data={countBy(open, (t) => t.category)} color="var(--chart-4)" label="Open" />
            </ChartCard>
          </div>

          <ChartCard
            title="Open tickets"
            description={`Oldest first · showing ${rows.length} of ${open.length}`}
            actions={
              <div className="flex items-center gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticket, title, assignee" className="h-8 w-56 text-xs" aria-label="Search tickets" />
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {openStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
            bodyClassName="overflow-x-auto"
          >
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {["Ticket", "Title", "Status", "Priority", "Assignee", "Age"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const age = Math.floor((now - new Date(t.createdTime).getTime()) / DAY);
                  return (
                    <tr key={t.id} className="border-t">
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium">{t.ticketNo}</td>
                      <td className="max-w-[360px] truncate px-2 py-1.5" title={t.title}>
                        {t.title}
                      </td>
                      <td className="px-2 py-1.5">{t.status}</td>
                      <td className={`px-2 py-1.5 ${HIGH.includes(t.priority.toLowerCase()) ? "font-semibold text-danger" : ""}`}>{t.priority}</td>
                      <td className="px-2 py-1.5">{t.assignee || "—"}</td>
                      <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${age > 14 ? "text-danger" : ""}`}>{age}d</td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                      No open tickets match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ChartCard>
        </>
      )}
    </div>
  );
}
