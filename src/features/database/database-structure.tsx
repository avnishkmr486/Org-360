"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Database as DatabaseIcon, HardDrive, KeyRound, Link2, Lock, Rows3, Search, Table2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/states";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser, useDatabase } from "@/hooks/use-data";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { allRelations, inferColumns, TABLES, tableRows, type ColumnInfo, type TableMeta, type TableName } from "./schema";

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export function DatabaseStructure() {
  const { can } = useCurrentUser();
  const db = useDatabase();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<TableName>("employees");

  const stats = useMemo(
    () =>
      TABLES.map((meta) => {
        const rows = tableRows(db, meta);
        return { meta, rows, columns: inferColumns(rows, meta), bytes: JSON.stringify(db[meta.name]).length };
      }),
    [db],
  );

  if (!can("database.view")) {
    return (
      <EmptyState icon={<Lock className="size-5" />} title="Super Admin only" description="The database structure is only visible to Super Admins." />
    );
  }

  const totalRows = stats.reduce((n, s) => n + s.rows.length, 0);
  const totalCols = stats.reduce((n, s) => n + s.columns.length, 0);
  const totalBytes = stats.reduce((n, s) => n + s.bytes, 0);
  const relations = allRelations();
  const visible = stats.filter((s) => s.meta.name.toLowerCase().includes(q.trim().toLowerCase()));
  const current = stats.find((s) => s.meta.name === selected) ?? stats[0];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Database Structure" }]}
        title="Database Structure"
        description="Every table, its columns and relationships, and the live data behind it. Read-only — visible to Super Admins only."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Tables" value={TABLES.length} icon={Table2} tone="info" hint={`${relations.length} relationships`} />
        <KpiCard label="Columns" value={totalCols} icon={Rows3} tone="teal" />
        <KpiCard label="Total rows" value={totalRows.toLocaleString()} icon={DatabaseIcon} tone="success" />
        <KpiCard label="Data size" value={formatBytes(totalBytes)} icon={HardDrive} tone="neutral" hint="Stored in this browser (demo store)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2 lg:sticky lg:top-20 lg:h-fit">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tables…" className="pl-9" aria-label="Search tables" />
          </div>
          <nav className="scrollbar-thin flex max-h-[60vh] flex-col gap-1 overflow-y-auto" aria-label="Tables">
            {visible.map((s) => (
              <button
                key={s.meta.name}
                onClick={() => setSelected(s.meta.name)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  current.meta.name === s.meta.name ? "bg-card font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground",
                )}
              >
                <Table2 className="size-4 shrink-0" />
                <span className="truncate font-mono text-xs">{s.meta.name}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{s.rows.length}</span>
              </button>
            ))}
            {visible.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No tables match.</p> : null}
          </nav>
        </aside>

        <TableDetail key={current.meta.name} meta={current.meta} rows={current.rows} columns={current.columns} onOpen={setSelected} />
      </div>

      <section className="card-elevated">
        <header className="border-b px-6 py-4">
          <h2 className="text-base font-semibold">All relationships</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Foreign keys between tables. “many” means the column holds a list of ids (a join table once moved to Postgres).</p>
        </header>
        <ul className="grid gap-x-8 gap-y-1 px-6 py-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {relations.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5 py-0.5 font-mono text-xs">
              <button className="hover:underline" onClick={() => setSelected(r.from)}>
                {r.from}.{r.column}
              </button>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              <button className="font-semibold hover:underline" onClick={() => setSelected(r.to)}>
                {r.to}
              </button>
              {r.many ? <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">many</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TableDetail({ meta, rows, columns, onOpen }: { meta: TableMeta; rows: Record<string, unknown>[]; columns: ColumnInfo[]; onOpen: (t: TableName) => void }) {
  const [dq, setDq] = useState("");
  const incoming = allRelations().filter((r) => r.to === meta.name);
  const outgoing = columns.filter((c) => c.fk);

  const structureCols: Column<ColumnInfo>[] = [
    {
      id: "name",
      header: "Column",
      sortValue: (c) => c.name,
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
          {c.isPk ? <KeyRound className="size-3 text-warning" aria-label="Primary key" /> : c.fk ? <Link2 className="size-3 text-info" aria-label="Foreign key" /> : <span className="size-3" />}
          {c.name}
        </span>
      ),
    },
    { id: "type", header: "App type", cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.type}</span> },
    { id: "pg", header: "Postgres type", cell: (c) => <span className="font-mono text-xs">{c.pgType}</span> },
    { id: "null", header: "Nullable", cell: (c) => <span className="text-xs">{c.nullable ? "yes" : "no"}</span> },
    {
      id: "key",
      header: "Key",
      cell: (c) =>
        c.isPk ? (
          <span className="text-xs font-medium">Primary key</span>
        ) : c.fk ? (
          <button className="font-mono text-xs text-primary hover:underline" onClick={() => onOpen(c.fk!)}>
            → {c.fk}.id{c.fkMany ? " (many)" : ""}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  const q = dq.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => Object.values(r).some((v) => cellText(v).toLowerCase().includes(q))) : rows;
  // Wide tables stay readable: show the first columns, everything is still in the Structure tab.
  const dataCols = columns.slice(0, 8);
  const dataColumns: Column<Record<string, unknown>>[] = dataCols.map((c) => ({
    id: c.name,
    header: c.name,
    sortValue: (r) => {
      const v = r[c.name];
      return typeof v === "number" ? v : cellText(v);
    },
    cell: (r) => <span className="block max-w-[260px] truncate font-mono text-xs">{cellText(r[c.name])}</span>,
  }));

  return (
    <section className="card-elevated min-w-0">
      <header className="border-b px-6 py-4">
        <h2 className="flex items-center gap-2 font-mono text-base font-semibold">
          <Table2 className="size-4" /> {meta.name}
          {meta.singleton ? <span className="rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">single row</span> : null}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {meta.description} · {rows.length} {rows.length === 1 ? "row" : "rows"} · {columns.length} columns
        </p>
      </header>
      <div className="px-6 py-5">
        <Tabs defaultValue="structure">
          <TabsList>
            <TabsTrigger value="structure">Structure</TabsTrigger>
            <TabsTrigger value="data">Data ({rows.length})</TabsTrigger>
            <TabsTrigger value="relations">Relationships ({outgoing.length + incoming.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="structure" className="mt-4">
            <DataTable columns={structureCols} rows={columns} getRowId={(c) => c.name} pageSize={50} dense empty={<EmptyState title="No columns" description="This table has no rows to infer columns from." />} />
          </TabsContent>

          <TabsContent value="data" className="mt-4 space-y-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={dq} onChange={(e) => setDq(e.target.value)} placeholder="Search rows…" className="pl-9" aria-label="Search rows" />
            </div>
            <DataTable columns={dataColumns} rows={filtered} getRowId={(r) => String(r.id ?? JSON.stringify(r).slice(0, 40))} pageSize={10} dense empty={<EmptyState title="No rows" description={q ? "Nothing matches your search." : "This table is empty."} />} />
            {columns.length > dataCols.length ? <p className="text-xs text-muted-foreground">Showing the first {dataCols.length} of {columns.length} columns.</p> : null}
          </TabsContent>

          <TabsContent value="relations" className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">References ({outgoing.length})</h3>
              <ul className="mt-2 space-y-1.5">
                {outgoing.map((c) => (
                  <li key={c.name} className="flex items-center gap-1.5 font-mono text-xs">
                    {c.name} <ArrowRight className="size-3 text-muted-foreground" />
                    <button className="font-semibold text-primary hover:underline" onClick={() => onOpen(c.fk!)}>
                      {c.fk}
                    </button>
                    {c.fkMany ? <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">many</span> : null}
                  </li>
                ))}
                {outgoing.length === 0 ? <li className="text-xs text-muted-foreground">Does not reference other tables.</li> : null}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Referenced by ({incoming.length})</h3>
              <ul className="mt-2 space-y-1.5">
                {incoming.map((r, i) => (
                  <li key={i} className="flex items-center gap-1.5 font-mono text-xs">
                    <button className="font-semibold text-primary hover:underline" onClick={() => onOpen(r.from)}>
                      {r.from}
                    </button>
                    .{r.column}
                    {r.many ? <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">many</span> : null}
                  </li>
                ))}
                {incoming.length === 0 ? <li className="text-xs text-muted-foreground">No other table references this one.</li> : null}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
