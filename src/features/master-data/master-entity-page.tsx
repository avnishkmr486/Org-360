"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Database as DatabaseIcon, Eye, ExternalLink, Loader2, MoreHorizontal, Pencil, Plus, Power, Rows3, Trash2 } from "lucide-react";
import type { RecordStatus } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Combobox, FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { RecordStatusBadge } from "@/components/common/badges";
import { CascadeDeleteDialog } from "@/components/common/cascade-delete-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/states";
import { ExportMenu } from "@/components/common/export-menu";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BulkAddDialog } from "./bulk-add-dialog";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import {
  createDepartment,
  createTeam,
  type BulkDeleteKind,
  setDepartmentStatus,
  setMasterStatus,
  setTeamStatus,
  updateDepartment,
  updateTeam,
  upsertMasterRecord,
  type MasterTable,
} from "@/lib/repositories";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { cn } from "@/lib/utils";
import { ENTITIES, getEntity, type EntityConfig, type FieldDef, type MasterRow } from "./entities";

type FormValues = Record<string, string | number | null>;

export function MasterEntityPage({ slug }: { slug: string }) {
  const entity = getEntity(slug);
  if (!entity) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Master Data", href: "/master-data" }, { label: "Not found" }]} title="Master data" />
        <EmptyState icon={<DatabaseIcon className="size-5" />} title={`Unknown master data entity "${slug}"`} description="Choose one of the master data tables below." action={<EntityNav current="" />} />
      </div>
    );
  }
  return <EntityView entity={entity} />;
}

export function EntityNav({ current }: { current: string }) {
  return (
    <nav className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Master data entities">
      {ENTITIES.map((e) => (
        <Link
          key={e.slug}
          href={`/master-data/${e.slug}`}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
            current === e.slug ? "border-primary/40 bg-info-soft/60 text-foreground" : "bg-card text-muted-foreground",
          )}
        >
          <e.icon className="size-3.5" /> {e.title}
        </Link>
      ))}
    </nav>
  );
}

function EntityView({ entity }: { entity: EntityConfig }) {
  const db = useDatabase();
  const lk = useLookups();
  const { can } = useCurrentUser();
  const manage = can("masterdata.manage");
  const bulkKind = entity.table === "frequencies" ? null : (entity.table as BulkDeleteKind);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<MasterRow | null>(null);
  const [toggling, setToggling] = useState<MasterRow | null>(null);

  useEffect(() => setSelectedIds([]), [entity.slug]);
  const all = useMemo(() => entity.rows(db), [entity, db]);
  const rows = all.filter((r) => {
    if (status && r.status !== status) return false;
    if (q && !entity.fields.map((f) => display(f, r[f.key])).concat(r.id).join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function display(f: FieldDef, v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (f.type === "employee") return lk.empName(String(v));
    if (f.type === "department") return lk.deptName(String(v));
    return String(v);
  }

  const columns: Column<MasterRow>[] = [
    { id: "id", header: "ID", sortValue: (r) => r.id, cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span> },
    ...entity.fields
      .filter((f) => f.column)
      .map<Column<MasterRow>>((f) => ({
        id: f.key,
        header: f.label,
        sortValue: (r) => (f.type === "number" ? Number(r[f.key]) : display(f, r[f.key])),
        cell: (r) =>
          f.key === "name" ? (
            <button className="text-left font-medium hover:underline" onClick={() => setViewing(r)}>
              {display(f, r[f.key])}
            </button>
          ) : (
            <span className={cn("text-sm", f.type === "textarea" && "line-clamp-1 max-w-[360px] text-muted-foreground")}>{display(f, r[f.key])}</span>
          ),
      })),
    {
      id: "usage",
      header: "In use",
      align: "right",
      sortValue: (r) => entity.usage(db, r).count,
      cell: (r) => {
        const u = entity.usage(db, r);
        return (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{u.count}</span> {u.label}
          </span>
        );
      },
    },
    { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <RecordStatusBadge status={r.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setViewing(r)}>
              <Eye /> View
            </DropdownMenuItem>
            {manage ? (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                >
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setToggling(r)} className={r.status === "active" ? "text-destructive" : undefined}>
                  <Power /> {r.status === "active" ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const exportCols = [
    { header: "ID", value: (r: MasterRow) => r.id },
    ...entity.fields.map((f) => ({ header: f.label, value: (r: MasterRow) => display(f, r[f.key]) })),
    { header: "In use", value: (r: MasterRow) => `${entity.usage(db, r).count} ${entity.usage(db, r).label}` },
    { header: "Status", value: (r: MasterRow) => r.status },
  ];

  const toggleStatus = async (r: MasterRow) => {
    const next: RecordStatus = r.status === "active" ? "inactive" : "active";
    try {
      if (entity.table === "departments") await setDepartmentStatus(r.id, next);
      else if (entity.table === "teams") await setTeamStatus(r.id, next);
      else await setMasterStatus(entity.table as MasterTable, r.id, next);
      toast.success(`${entity.singular} ${next === "active" ? "activated" : "deactivated"}`, { description: r.name });
    } catch (e) {
      toast.error("Could not update status", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const activeCount = all.filter((r) => r.status === "active").length;

  return (
    <div className="grid-page">
      <PageHeader
        breadcrumbs={[{ label: "Master Data", href: "/master-data" }, { label: entity.title }]}
        title={entity.title}
        description={entity.description}
        actions={
          <>
            <ExportMenu
              onExcel={() => exportToExcel({ organizationName: db.organization.name, title: `Master Data — ${entity.title}`, fileName: `Altametrics_${entity.slug}`, columns: exportCols, rows, footer: db.settings.reportFooter })}
              onPdf={() => exportToPdf({ organizationName: db.organization.name, title: `Master Data — ${entity.title}`, fileName: `Altametrics_${entity.slug}`, columns: exportCols, rows, footer: db.settings.reportFooter })}
            />
            {manage && entity.canAdd ? (
              <Button size="sm" variant="outline" onClick={() => setBulkAddOpen(true)}>
                <Rows3 /> Add multiple
              </Button>
            ) : null}
            {manage && entity.canAdd ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus /> Add {entity.singular.toLowerCase()}
              </Button>
            ) : null}
          </>
        }
        filters={
          <>
            <SearchInput value={q} onChange={setQ} placeholder={`Search ${entity.title.toLowerCase()}…`} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            <span className="text-xs text-muted-foreground">
              {activeCount} active · {all.length - activeCount} inactive
            </span>
            <ResetFiltersButton
              count={(q ? 1 : 0) + (status ? 1 : 0)}
              onClick={() => {
                setQ("");
                setStatus("");
              }}
            />
          </>
        }
      />
      <EntityNav current={entity.slug} />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        selectable={manage && !!bulkKind}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        bulkActions={(ids) => (
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleting(ids)}>
            <Trash2 /> Delete selected
          </Button>
        )}
        initialSort={{ id: "id", dir: "asc" }} empty={<EmptyState title={`No ${entity.title.toLowerCase()} found`} description="Adjust your search or status filter." />} />

      {manage && entity.canAdd ? <BulkAddDialog key={entity.slug} entity={entity} open={bulkAddOpen} onOpenChange={setBulkAddOpen} /> : null}

      {bulkKind ? <CascadeDeleteDialog kind={bulkKind} ids={bulkDeleting} onOpenChange={(o) => !o && setBulkDeleting(null)} onDone={() => setSelectedIds([])} /> : null}

      <EntityFormDialog entity={entity} open={formOpen} onOpenChange={setFormOpen} record={editing} />

      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {viewing ? (
            <>
              <SheetHeader>
                <SheetTitle>{viewing.name}</SheetTitle>
                <SheetDescription>
                  {entity.singular} · <span className="font-mono">{viewing.id}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <RecordStatusBadge status={viewing.status} />
                <dl className="grid gap-3">
                  {entity.fields.map((f) => (
                    <div key={f.key} className="rounded-lg border bg-muted/30 px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                      <dd className="mt-0.5 text-sm">{display(f, viewing[f.key])}</dd>
                    </div>
                  ))}
                </dl>
                {(() => {
                  const u = entity.usage(db, viewing);
                  return (
                    <div>
                      <h4 className="text-sm font-semibold">
                        In use · {u.count} {u.label}
                      </h4>
                      {u.items.length ? (
                        <ul className="mt-2 divide-y rounded-lg border">
                          {u.items.map((i) => (
                            <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span className="truncate">{i.name}</span>
                              {i.href ? (
                                <Link href={i.href} className="text-xs text-primary hover:underline">
                                  Open
                                </Link>
                              ) : null}
                            </li>
                          ))}
                          {u.count > u.items.length ? <li className="px-3 py-2 text-xs text-muted-foreground">+{u.count - u.items.length} more</li> : null}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Not referenced by any record — safe to deactivate.</p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  {manage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(viewing);
                        setViewing(null);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </Button>
                  ) : null}
                  {entity.manageHref ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={entity.manageHref(viewing.id)}>
                        <ExternalLink /> Open in management module
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={`${toggling?.status === "active" ? "Deactivate" : "Activate"} ${toggling?.name ?? ""}?`}
        description={
          toggling?.status === "active" ? (
            <>
              Deactivated {entity.title.toLowerCase()} stay on existing records and history but can no longer be selected for new records.
              {toggling && entity.usage(db, toggling).count ? (
                <span className="mt-2 block font-medium text-warning">
                  Currently in use by {entity.usage(db, toggling).count} {entity.usage(db, toggling).label}.
                </span>
              ) : null}
            </>
          ) : (
            "The record will be available for selection again."
          )
        }
        confirmLabel={toggling?.status === "active" ? "Deactivate" : "Activate"}
        destructive={toggling?.status === "active"}
        onConfirm={async () => {
          if (toggling) await toggleStatus(toggling);
        }}
      />
    </div>
  );
}

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "number") shape[f.key] = z.coerce.number({ invalid_type_error: `${f.label} must be a number` }).int(`${f.label} must be a whole number`).min(1, `${f.label} must be at least 1`).max(99);
    else if (f.type === "employee" || f.type === "department") shape[f.key] = f.required ? z.string({ required_error: `${f.label} is required`, invalid_type_error: `${f.label} is required` }).min(1, `${f.label} is required`) : z.string().nullable();
    else {
      let s = z.string().trim();
      if (f.required) s = s.min(1, `${f.label} is required`);
      if (f.max) s = s.max(f.max, `${f.label} must be at most ${f.max} characters`);
      shape[f.key] = s;
    }
  }
  shape.status = z.enum(["active", "inactive"]);
  return z.object(shape);
}

function EntityFormDialog({ entity, open, onOpenChange, record }: { entity: EntityConfig; open: boolean; onOpenChange: (o: boolean) => void; record: MasterRow | null }) {
  const db = useDatabase();
  const [saving, setSaving] = useState(false);
  const schema = useMemo(() => buildSchema(entity.fields), [entity]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) as unknown as Resolver<FormValues> });
  const { register, handleSubmit, control, reset, formState } = form;

  useEffect(() => {
    if (!open) return;
    const v: FormValues = { status: (record?.status as string) ?? "active" };
    for (const f of entity.fields) {
      const cur = record?.[f.key];
      v[f.key] = cur === undefined || cur === null ? (f.type === "employee" || f.type === "department" ? null : f.type === "number" ? "" : "") : (cur as string | number);
    }
    reset(v);
  }, [open, record, entity, reset]);

  const onSubmit = async (v: FormValues) => {
    setSaving(true);
    try {
      const status = v.status as RecordStatus;
      if (entity.table === "departments") {
        const payload = { name: String(v.name), code: String(v.code).toUpperCase(), description: String(v.description ?? ""), headId: (v.headId as string | null) || null, status };
        if (record) await updateDepartment(record.id, payload);
        else await createDepartment(payload);
      } else if (entity.table === "teams") {
        const payload = {
          name: String(v.name),
          description: String(v.description ?? ""),
          departmentId: String(v.departmentId),
          supervisorId: (v.supervisorId as string | null) || null,
          projectManagerId: (v.projectManagerId as string | null) || null,
          status,
        };
        if (record) await updateTeam(record.id, payload);
        else await createTeam(payload);
      } else {
        const payload: Record<string, unknown> = { ...v, status };
        if (record) payload.id = record.id;
        await upsertMasterRecord(entity.table as MasterTable, payload as never);
      }
      toast.success(`${entity.singular} ${record ? "updated" : "created"}`, { description: String(v.name) });
      onOpenChange(false);
    } catch (e) {
      toast.error(`Could not save ${entity.singular.toLowerCase()}`, { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const employees = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));
  const departments = db.departments.filter((d) => d.status === "active" || d.id === record?.departmentId);
  const err = (k: string) => formState.errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {record ? "Edit" : "Add"} {entity.singular.toLowerCase()}
          </DialogTitle>
          <DialogDescription>{record ? `Update ${record.name} (${record.id}).` : entity.description}</DialogDescription>
        </DialogHeader>
        <form id="master-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          {entity.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`f-${f.key}`}>
                {f.label}
                {f.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              {f.type === "textarea" ? (
                <Textarea id={`f-${f.key}`} rows={3} {...register(f.key)} />
              ) : f.type === "employee" ? (
                <Controller control={control} name={f.key} render={({ field }) => <Combobox value={(field.value as string | null) ?? null} onChange={field.onChange} options={employees} placeholder="Select employee…" searchPlaceholder="Search employees…" />} />
              ) : f.type === "department" ? (
                <Controller
                  control={control}
                  name={f.key}
                  render={({ field }) => (
                    <Select value={(field.value as string) ?? undefined} onValueChange={field.onChange}>
                      <SelectTrigger id={`f-${f.key}`} className="w-full" aria-invalid={!!err(f.key)}>
                        <SelectValue placeholder="Select department…" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Input id={`f-${f.key}`} type={f.type === "number" ? "number" : "text"} placeholder={f.placeholder} {...register(f.key)} aria-invalid={!!err(f.key)} />
              )}
              {err(f.key) ? <p className="text-xs text-destructive">{err(f.key)}</p> : null}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={(field.value as string) ?? "active"} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="master-form" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {record ? "Save changes" : `Create ${entity.singular.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
