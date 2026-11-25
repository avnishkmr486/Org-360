"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Blocks, Building2, Check, CreditCard, Link2, Link2Off, MoreHorizontal, Package, Pencil, Plug, Plus, Settings2, Share2, Trash2 } from "lucide-react";
import type { EcoEntity, EcoRelation } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/tables/data-table";
import { useCustomColumns, withCustomColumns } from "@/components/tables/custom-columns";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { KpiCard } from "@/components/common/kpi-card";
import { PersonCell } from "@/components/common/user-avatar";
import { EmptyState } from "@/components/common/states";
import { CollapsibleFilters } from "@/components/common/filter-panel";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { groupLinksByType, ecosystemStats, relationsBetween, usageMatrix } from "@/lib/calculations/ecosystem";
import { linkEntities, removeRelations } from "@/lib/repositories";
import { cn } from "@/lib/utils";
import { TONE_VAR } from "@/lib/constants";
import { DeleteEntitiesDialog, EntityDialog, LinkDialog, STATUS_META, StatusBadge, TypeBadge, TypesDialog } from "./ecosystem-dialogs";

const KEYS = ["tab", "q", "type", "status", "owner", "rtype", "ctype", "edit", "anchor", "lq"] as const;

const typeIcon = (name: string) =>
  /product/i.test(name) ? Package : /client|customer/i.test(name) ? Building2 : /module/i.test(name) ? Blocks : /integration/i.test(name) ? Plug : /pos/i.test(name) ? CreditCard : Share2;
const fail = (title: string) => (e: unknown) => toast.error(title, { description: e instanceof Error ? e.message : undefined });

export function EcosystemPage() {
  const db = useDatabase();
  const L = useLookups();
  const router = useRouter();
  const { can } = useCurrentUser();
  const canManage = can("ecosystem.manage");
  const { values: v, set } = useUrlFilters(KEYS);
  const tab = v.tab || "overview";
  const stats = useMemo(() => ecosystemStats(db), [db]);
  const typeById = useMemo(() => new Map(db.ecoTypes.map((t) => [t.id, t])), [db.ecoTypes]);

  const [entityDialog, setEntityDialog] = useState<{ entity: EcoEntity | null; typeId?: string | null } | null>(null);
  const [linkFrom, setLinkFrom] = useState<{ id: string | null } | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);

  const typeFilter = (typeId: string | null) => set({ tab: "directory", type: typeId, q: null, status: null, owner: null });

  /* ------------------------------- directory ------------------------------- */
  const owners = [...new Set(db.ecoEntities.map((e) => e.ownerId).filter((x): x is string => !!x))];
  const q = v.q.trim().toLowerCase();
  const rows = db.ecoEntities.filter(
    (e) =>
      (!v.type || e.typeId === v.type) &&
      (!v.status || e.status === v.status) &&
      (!v.owner || e.ownerId === v.owner) &&
      (!q || `${e.name} ${e.description} ${e.contactName} ${e.contactEmail} ${L.empName(e.ownerId)}`.toLowerCase().includes(q)),
  );

  const custom = useCustomColumns<EcoEntity>("ecosystem", (e) => e.id);
  const columns: Column<EcoEntity>[] = [
    {
      id: "name",
      header: "Name",
      cell: (e) => (
        <div className="min-w-[180px] max-w-[300px]">
          <div className="font-medium">{e.name}</div>
          {e.description ? <div className="line-clamp-1 text-xs text-muted-foreground">{e.description}</div> : null}
        </div>
      ),
      sortValue: (e) => e.name,
    },
    { id: "type", header: "Type", cell: (e) => <TypeBadge type={typeById.get(e.typeId)} />, sortValue: (e) => typeById.get(e.typeId)?.name ?? "" },
    { id: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} />, sortValue: (e) => e.status },
    { id: "owner", header: "Owner", cell: (e) => (e.ownerId ? <PersonCell name={L.empName(e.ownerId)} size="xs" /> : <span className="text-warning">No owner</span>), sortValue: (e) => L.empName(e.ownerId) },
    {
      id: "contact",
      header: "Primary contact",
      cell: (e) =>
        e.contactName ? (
          <div className="text-sm">
            <div>{e.contactName}</div>
            {e.contactEmail ? <div className="text-xs text-muted-foreground">{e.contactEmail}</div> : null}
          </div>
        ) : (
          <span className="text-warning">None</span>
        ),
      sortValue: (e) => e.contactName,
    },
    {
      id: "links",
      header: "Connected to",
      cell: (e) => {
        const groups = groupLinksByType(db, e.id);
        return groups.length ? (
          <div className="flex max-w-[320px] flex-wrap gap-1">
            {groups.map((g) => (
              <span key={g.type.id} className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px]">
                {g.items.length} {g.type.name}
                {g.items.length === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">Not linked</span>
        );
      },
      sortValue: (e) => stats.counts.get(e.id) ?? 0,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (e) => (
        <div onClick={(ev) => ev.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => router.push(`/ecosystem/${e.id}`)}>
                <Share2 /> Open
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem onSelect={() => setEntityDialog({ entity: e })}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setLinkFrom({ id: e.id })}>
                    <Link2 /> Link to…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleting([e.id])}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  /* ------------------------------ relationships ----------------------------- */
  const entityById = useMemo(() => new Map(db.ecoEntities.map((e) => [e.id, e])), [db.ecoEntities]);
  const relRows = db.ecoRelations.filter((r) => {
    if (!q) return true;
    const a = entityById.get(r.fromId)?.name ?? "";
    const b = entityById.get(r.toId)?.name ?? "";
    return `${a} ${r.label} ${b} ${r.note}`.toLowerCase().includes(q);
  });
  const entityCell = (id: string) => {
    const e = entityById.get(id);
    return e ? (
      <Link href={`/ecosystem/${e.id}`} onClick={(ev) => ev.stopPropagation()} className="flex items-center gap-2 hover:underline">
        <span className="font-medium">{e.name}</span>
        <TypeBadge type={typeById.get(e.typeId)} />
      </Link>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  };
  const relColumns: Column<EcoRelation>[] = [
    { id: "from", header: "From", cell: (r) => entityCell(r.fromId), sortValue: (r) => entityById.get(r.fromId)?.name ?? "" },
    { id: "label", header: "Relationship", cell: (r) => <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{r.label}</span>, sortValue: (r) => r.label },
    { id: "to", header: "To", cell: (r) => entityCell(r.toId), sortValue: (r) => entityById.get(r.toId)?.name ?? "" },
    { id: "note", header: "Note", cell: (r) => <span className="text-sm text-muted-foreground">{r.note || "—"}</span> },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) =>
        canManage ? (
          <Button variant="ghost" size="icon-sm" aria-label="Remove link" onClick={() => removeRelations([r.id]).then(() => toast.success("Link removed")).catch(fail("Could not remove"))}>
            <Link2Off />
          </Button>
        ) : null,
    },
  ];

  /* -------------------------------- overview -------------------------------- */
  const anchorId = (v.anchor && typeById.has(v.anchor) ? v.anchor : db.ecoTypes.find((t) => /client/i.test(t.name))?.id) ?? db.ecoTypes[0]?.id ?? null;
  const anchor = anchorId ? typeById.get(anchorId) : undefined;
  const otherTypes = db.ecoTypes.filter((t) => t.id !== anchorId);
  const anchorEntities = db.ecoEntities.filter((e) => e.typeId === anchorId);
  const linked = useMemo(() => new Map(db.ecoEntities.map((e) => [e.id, groupLinksByType(db, e.id)])), [db]);
  const usesOf = (e: EcoEntity, typeId: string) => linked.get(e.id)?.find((g) => g.type.id === typeId)?.items.map((x) => x.other) ?? [];
  const shownTypes = otherTypes.filter((t) => anchorEntities.some((e) => usesOf(e, t.id).length));
  const lq = v.lq.trim().toLowerCase();
  const landRows = anchorEntities
    .filter((e) => !lq || [e.name, e.contactName, L.empName(e.ownerId), ...shownTypes.flatMap((t) => usesOf(e, t.id).map((o) => o.name))].join(" ").toLowerCase().includes(lq))
    .sort((a, b) => a.name.localeCompare(b.name));
  const landColumns: Column<EcoEntity>[] = [
    {
      id: "name",
      header: anchor?.name ?? "Name",
      cell: (e) => (
        <div className="min-w-[160px] max-w-[240px]">
          <div className="font-medium">{e.name}</div>
          {e.status !== "active" ? <StatusBadge status={e.status} /> : null}
        </div>
      ),
      sortValue: (e) => e.name,
    },
    ...shownTypes.map<Column<EcoEntity>>((t) => ({
      id: `t-${t.id}`,
      header: `${t.name}s`,
      cell: (e) => {
        const list = usesOf(e, t.id);
        return list.length ? (
          <div className="flex min-w-[120px] max-w-[300px] flex-wrap gap-1">
            {list.map((o) => (
              <Link
                key={o.id}
                href={`/ecosystem/${o.id}`}
                onClick={(ev) => ev.stopPropagation()}
                className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium hover:underline"
                style={{ borderColor: `color-mix(in srgb, ${TONE_VAR[t.tone]} 35%, transparent)`, background: `color-mix(in srgb, ${TONE_VAR[t.tone]} 8%, transparent)` }}
              >
                {o.name}
              </Link>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        );
      },
      sortValue: (e) => usesOf(e, t.id).length,
    })),
    { id: "owner", header: "Owner", cell: (e) => (e.ownerId ? <PersonCell name={L.empName(e.ownerId)} size="xs" /> : <span className="text-xs text-warning">No owner</span>), sortValue: (e) => L.empName(e.ownerId) },
    {
      id: "contact",
      header: "Primary contact",
      cell: (e) =>
        e.contactName ? (
          <div className="text-xs">
            <div className="font-medium">{e.contactName}</div>
            {e.contactEmail ? <div className="text-muted-foreground">{e.contactEmail}</div> : null}
          </div>
        ) : (
          <span className="text-xs text-warning">None</span>
        ),
      sortValue: (e) => e.contactName,
    },
  ];
  const adoption = otherTypes
    .map((type) => {
      const m = anchorId ? usageMatrix(db, anchorId, type.id) : null;
      const items = (m?.cols ?? []).map((entity) => ({ entity, used: m!.colTotal(entity) })).sort((a, b) => b.used - a.used || a.entity.name.localeCompare(b.entity.name));
      return { type, base: m?.rows.length ?? 0, items };
    })
    .filter((g) => g.items.length && g.items.some((x) => x.used));
  const attention = db.ecoEntities
    .map((entity) => ({
      entity,
      issues: [!entity.ownerId && "No owner", !entity.contactName.trim() && "No contact", !stats.counts.get(entity.id) && "Not linked"].filter((x): x is string => !!x),
    }))
    .filter((x) => x.issues.length)
    .sort((a, b) => b.issues.length - a.issues.length || a.entity.name.localeCompare(b.entity.name));

  return (
    <div className="grid-page">
      <PageHeader
        title="Ecosystem"
        breadcrumbs={[{ label: "Business" }, { label: "Ecosystem" }]}
        description="Products, clients, modules, integrations and POS systems — and how they connect. See who uses what, and who owns it."
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="icon" aria-label="Manage types" title="Manage types" onClick={() => setTypesOpen(true)}>
                <Settings2 />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLinkFrom({ id: null })}>
                <Link2 /> Link entries
              </Button>
              <Button size="sm" onClick={() => setEntityDialog({ entity: null, typeId: v.type || null })}>
                <Plus /> Add
              </Button>
            </>
          ) : null
        }
      />

      <div className="kpi-strip">
        {stats.byType.map((t) => (
          <KpiCard
            key={t.type.id}
            label={`${t.type.name}s`}
            value={t.total}
            icon={typeIcon(t.type.name)}
            tone={t.type.tone}
            hint={`${t.active} active${t.unlinked ? ` · ${t.unlinked} unlinked` : ""}`}
            onClick={() => typeFilter(t.type.id)}
          />
        ))}
        <KpiCard
          label="Needs attention"
          value={attention.length}
          icon={AlertTriangle}
          tone={attention.length ? "danger" : "success"}
          hint={attention.length ? `${stats.noOwner.length} no owner · ${stats.noContact.length} no contact · ${stats.unlinked.length} unlinked` : "every entry is complete"}
          onClick={() => set({ tab: null })}
        />
      </div>

      <Tabs value={tab} onValueChange={(t) => set({ tab: t === "overview" ? null : t })} className="data-grid-host">
        <TabsList className="shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="directory">Directory ({db.ecoEntities.length})</TabsTrigger>
          <TabsTrigger value="matrix">Who uses what</TabsTrigger>
          <TabsTrigger value="relationships">Relationships ({db.ecoRelations.length})</TabsTrigger>
        </TabsList>

        {/* ------------------------------ overview ------------------------------ */}
        <TabsContent value="overview" className="data-grid-host">
          <div className="split-pane flex flex-col gap-3 lg:flex-row">
            {/* landscape: every entry of the anchor type and what it is linked to, by type */}
            <div className="data-grid-host min-w-0 flex-1 gap-2 lg:min-h-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Landscape by</span>
                <Select value={anchorId ?? ""} onValueChange={(x) => set({ anchor: x })}>
                  <SelectTrigger size="sm" className="h-8 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {db.ecoTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">who uses what at a glance · click a name to open it</span>
                <div className="ml-auto w-full sm:w-64">
                  <SearchInput value={v.lq} onChange={(x) => set({ lq: x })} placeholder={`Search ${anchor?.name.toLowerCase() ?? "entrie"}s or what they use…`} />
                </div>
              </div>
              <DataTable
                columns={landColumns}
                rows={landRows}
                getRowId={(e) => e.id}
                pageSize={50}
                onRowClick={(e) => router.push(`/ecosystem/${e.id}`)}
                empty={<EmptyState icon={<Share2 className="size-5" />} title="Nothing to show" description="No entries of this type match." />}
              />
            </div>

            {/* side panel: adoption and gaps */}
            <aside className="scrollbar-thin shrink-0 space-y-3 lg:min-h-0 lg:w-[340px] lg:overflow-y-auto lg:pr-1">
              {adoption.map((g) => (
                <section key={g.type.id} className="card-elevated p-3">
                  <h3 className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <TypeBadge type={g.type} /> adoption
                    </span>
                    <span className="font-normal text-muted-foreground">
                      of {g.base} {anchor?.name.toLowerCase()}s
                    </span>
                  </h3>
                  <ul className="space-y-1.5">
                    {g.items.map(({ entity, used }) => (
                      <li key={entity.id}>
                        <Link href={`/ecosystem/${entity.id}`} className="block rounded hover:bg-muted/40">
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate font-medium">{entity.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{used}</span>
                          </div>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${g.base ? (used / g.base) * 100 : 0}%`, background: TONE_VAR[g.type.tone] }} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <section className="card-elevated p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <AlertTriangle className="size-3.5 text-warning" /> Needs attention ({attention.length})
                </h3>
                {attention.length ? (
                  <ul className="divide-y">
                    {attention.map(({ entity, issues }) => (
                      <li key={entity.id} className="py-1.5">
                        <Link href={`/ecosystem/${entity.id}`} className="flex items-center justify-between gap-2 text-xs hover:underline">
                          <span className="truncate font-medium">{entity.name}</span>
                          <TypeBadge type={typeById.get(entity.typeId)} />
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {issues.map((i) => (
                            <span key={i} className="rounded bg-warning-soft px-1.5 py-px text-[10px] font-medium text-warning">
                              {i}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <Check className="size-3.5" /> Every entry has an owner, a contact and a link.
                  </p>
                )}
              </section>
            </aside>
          </div>
        </TabsContent>

        {/* ------------------------------ directory ------------------------------ */}
        <TabsContent value="directory" className="data-grid-host gap-2.5">
          <CollapsibleFilters>
            <SearchInput value={v.q} onChange={(x) => set({ q: x })} placeholder="Search name, contact, owner…" />
            <FilterSelect label="Type" value={v.type} onChange={(x) => set({ type: x })} options={db.ecoTypes.map((t) => ({ value: t.id, label: t.name }))} />
            <FilterSelect label="Status" value={v.status} onChange={(x) => set({ status: x })} options={(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => ({ value: s, label: STATUS_META[s].label }))} />
            <FilterSelect label="Owner" value={v.owner} onChange={(x) => set({ owner: x })} options={owners.map((id) => ({ value: id, label: L.empName(id) }))} />
            <ResetFiltersButton count={[v.q, v.type, v.status, v.owner].filter(Boolean).length} onClick={() => set({ q: null, type: null, status: null, owner: null })} />
          </CollapsibleFilters>
          <DataTable
            columns={withCustomColumns(columns, custom)}
            rows={rows}
            getRowId={(e) => e.id}
            pageSize={50}
            onRowClick={(e) => router.push(`/ecosystem/${e.id}`)}
            empty={<EmptyState icon={<Share2 className="size-5" />} title="Nothing here yet" description="Add products, clients, modules, integrations or POS systems." action={canManage ? <Button size="sm" onClick={() => setEntityDialog({ entity: null })}><Plus /> Add</Button> : undefined} />}
          />
        </TabsContent>

        {/* -------------------------------- matrix -------------------------------- */}
        <TabsContent value="matrix" className="pane-scroll">
          <MatrixTab rtype={v.rtype} ctype={v.ctype} edit={v.edit === "1" && canManage} canManage={canManage} set={set} />
        </TabsContent>

        {/* ----------------------------- relationships ----------------------------- */}
        <TabsContent value="relationships" className="data-grid-host gap-2.5">
          <CollapsibleFilters
            actions={
              canManage ? (
                <Button size="sm" className="ml-auto" onClick={() => setLinkFrom({ id: null })}>
                  <Link2 /> Link entries
                </Button>
              ) : null
            }
          >
            <SearchInput value={v.q} onChange={(x) => set({ q: x })} placeholder="Search links…" />
            <ResetFiltersButton count={v.q ? 1 : 0} onClick={() => set({ q: null })} />
          </CollapsibleFilters>
          <DataTable columns={relColumns} rows={relRows} getRowId={(r) => r.id} pageSize={50} empty={<EmptyState icon={<Link2 className="size-5" />} title="No links yet" description="Link a client to the modules, integrations and POS systems it uses." />} />
        </TabsContent>
      </Tabs>

      <EntityDialog open={entityDialog !== null} onOpenChange={(o) => !o && setEntityDialog(null)} entity={entityDialog?.entity} defaultTypeId={entityDialog?.typeId} onSaved={(id) => !entityDialog?.entity && router.push(`/ecosystem/${id}`)} />
      <LinkDialog open={linkFrom !== null} onOpenChange={(o) => !o && setLinkFrom(null)} fromId={linkFrom?.id} />
      <TypesDialog open={typesOpen} onOpenChange={setTypesOpen} />
      <DeleteEntitiesDialog ids={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  );
}

/* ----------------------------------- matrix ----------------------------------- */

function MatrixTab({ rtype, ctype, edit, canManage, set }: { rtype: string; ctype: string; edit: boolean; canManage: boolean; set: (p: Partial<Record<(typeof KEYS)[number], string | null>>) => void }) {
  const db = useDatabase();
  const router = useRouter();
  const byName = (n: string) => db.ecoTypes.find((t) => t.name.toLowerCase() === n)?.id;
  const rowType = db.ecoTypes.some((t) => t.id === rtype) ? rtype : (byName("client") ?? db.ecoTypes[0]?.id ?? "");
  const colType = db.ecoTypes.some((t) => t.id === ctype) ? ctype : (byName("module") ?? db.ecoTypes.find((t) => t.id !== rowType)?.id ?? "");
  const m = useMemo(() => usageMatrix(db, rowType, colType), [db, rowType, colType]);
  const rowName = db.ecoTypes.find((t) => t.id === rowType)?.name ?? "";
  const colName = db.ecoTypes.find((t) => t.id === colType)?.name ?? "";

  const toggle = (row: EcoEntity, col: EcoEntity) => {
    const existing = relationsBetween(db, row.id, col.id);
    if (existing.length) removeRelations(existing.map((r) => r.id)).then(() => toast.success("Link removed", { description: `${row.name} – ${col.name}` })).catch(fail("Could not remove"));
    else linkEntities(row.id, [col.id], "linked to").then(() => toast.success("Linked", { description: `${row.name} – ${col.name}` })).catch(fail("Could not link"));
  };

  const typeSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-8 w-[160px] bg-card text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {db.ecoTypes.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {typeSelect(rowType, (x) => set({ rtype: x }), "Rows")}
        {typeSelect(colType, (x) => set({ ctype: x }), "Columns")}
        {canManage ? (
          <label className="ml-auto flex items-center gap-2 text-xs">
            <Switch checked={edit} onCheckedChange={(on) => set({ edit: on ? "1" : null })} aria-label="Edit links" /> Edit links by clicking cells
          </label>
        ) : null}
      </div>
      {!m.rows.length || !m.cols.length ? (
        <EmptyState title="Nothing to compare" description={`Add some ${!m.rows.length ? rowName : colName} entries first.`} />
      ) : (
        <div className="card-elevated max-h-[65vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                  {rowName} ↓ / {colName} →
                </th>
                {m.cols.map((c) => (
                  <th key={c.id} className="sticky top-0 z-10 border-b bg-card px-2 py-2 text-center align-bottom">
                    <button className="max-w-[110px] text-xs font-medium hover:underline" onClick={() => router.push(`/ecosystem/${c.id}`)} title={c.name}>
                      <span className="line-clamp-2">{c.name}</span>
                    </button>
                    <div className="mt-1 text-[11px] font-normal text-muted-foreground">{m.colTotal(c)}</div>
                  </th>
                ))}
                <th className="sticky top-0 z-10 border-b bg-card px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <th className="sticky left-0 z-10 whitespace-nowrap border-b bg-card px-3 py-2 text-left font-medium">
                    <button className="hover:underline" onClick={() => router.push(`/ecosystem/${r.id}`)}>
                      {r.name}
                    </button>
                  </th>
                  {m.cols.map((c) => {
                    const rels = m.cell(r, c);
                    const on = rels.length > 0;
                    return (
                      <td key={c.id} className="border-b px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!edit}
                          onClick={() => toggle(r, c)}
                          title={on ? `${r.name} ${[...new Set(rels.map((x) => x.label))].join(" / ")} ${c.name}` : edit ? `Link ${r.name} and ${c.name}` : undefined}
                          aria-label={`${r.name} and ${c.name}: ${on ? "linked" : "not linked"}`}
                          className={cn("mx-auto flex size-7 items-center justify-center rounded-md", on ? "bg-teal-soft text-teal" : edit ? "text-muted-foreground/30 hover:bg-muted" : "text-transparent", edit && "cursor-pointer")}
                        >
                          {on ? <Check className="size-4" /> : edit ? <Plus className="size-3.5" /> : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b px-3 py-2 text-center font-medium tabular-nums">{m.rowTotal(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">A tick means the two are linked (in either direction). Click a name to see who owns it and who the primary contact is.</p>
    </div>
  );
}
