"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlarmClock, CheckCircle2, ListChecks, Lock, MoreHorizontal, Pencil, Plus, Settings2, ShieldAlert, ShieldCheck, Loader2, Trash2 } from "lucide-react";
import type { Process, TrackedItem, TrackedItemStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/common/filters";
import { cn } from "@/lib/utils";
import { ToneBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { DataTable, type Column } from "@/components/tables/data-table";
import { ColumnArranger, useColumnOrder } from "@/components/tables/column-arranger";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { processAccess } from "@/lib/auth/process-access";
import { removeItem, saveItem } from "@/lib/repositories";
import { HEALTH_LABEL, HEALTH_TONE, scoreItem } from "@/lib/utils/item-health";
import type { Tone } from "@/lib/constants";
import { daysBetween, formatDate } from "@/lib/utils/dates";
import { ITEM_STATUS, KpiInput, NoteInput, StatusSelect, fail } from "./item-inline";
import { ItemDetailSheet } from "./item-detail-sheet";
import { KpiSettingsDialog, targetText } from "./kpi-settings";

/** ETA chip: overdue ones are red unless the work is finished. */
function EtaChip({ eta, finished }: { eta: string | null; finished?: boolean }) {
  const today = useToday();
  if (!eta) return <span className="text-muted-foreground">—</span>;
  const d = daysBetween(today, eta);
  const tone: Tone = finished ? "neutral" : d < 0 ? "danger" : d <= 3 ? "warning" : "neutral";
  return (
    <span className="inline-flex flex-col">
      <span className="whitespace-nowrap text-sm">{formatDate(eta)}</span>
      {!finished && d < 0 ? <ToneBadge tone={tone}>{-d}d late</ToneBadge> : !finished && d <= 3 ? <ToneBadge tone={tone}>{d === 0 ? "today" : `in ${d}d`}</ToneBadge> : null}
    </span>
  );
}

/**
 * Manage & Track: one grid of the things this process manages. Status, KPI values and the note are edited in the row;
 * click a row for its health, score, every KPI and its history. The gear opens KPI configuration.
 */
export function ManageTab({ process: p, onOpenMeetings }: { process: Process; onOpenMeetings: () => void }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const { role, employee, user, can } = useCurrentUser();
  const access = processAccess(db, role, employee?.id ?? null, p);
  const label = p.itemLabel || "Item";
  const kpis = p.kpis ?? [];
  const items = p.items ?? [];
  const people = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemDialog, setItemDialog] = useState<TrackedItem | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<string | null>(null);

  const canEditItem = (i: TrackedItem) => access.manage || (!!employee && (i.ownerId === employee.id || i.createdById === employee.id));
  const scored = new Map(items.map((i) => [i.id, scoreItem(i, kpis, today)]));
  const count = (h: string) => items.filter((i) => scored.get(i.id)?.health === h).length;

  const baseColumns: Column<TrackedItem>[] = [
    {
      id: "title",
      header: label,
      cell: (i) => (
        <div className="min-w-[200px] max-w-[380px]">
          <div className="font-medium">{i.title}</div>
          {i.section ? <div className="text-xs text-muted-foreground">{i.section}</div> : null}
        </div>
      ),
      sortValue: (i) => i.title,
    },
    {
      id: "health",
      header: "Health",
      cell: (i) => {
        const s = scored.get(i.id)!;
        return (
          <div className="flex items-center gap-2">
            <ToneBadge tone={HEALTH_TONE[s.health]}>{HEALTH_LABEL[s.health]}</ToneBadge>
            <span className="text-xs tabular-nums text-muted-foreground">{s.score}</span>
          </div>
        );
      },
      sortValue: (i) => scored.get(i.id)!.score,
    },
    { id: "status", header: "Status", cell: (i) => <StatusSelect processId={p.id} item={i} editable={canEditItem(i)} />, sortValue: (i) => i.status },
    { id: "eta", header: "ETA", cell: (i) => <EtaChip eta={i.eta} finished={i.status === "done"} />, sortValue: (i) => i.eta ?? "9999" },
    { id: "owner", header: "Owner", cell: (i) => (i.ownerId ? <PersonCell name={L.empName(i.ownerId)} size="xs" /> : <span className="text-muted-foreground">—</span>), sortValue: (i) => L.empName(i.ownerId) },
    ...kpis.map<Column<TrackedItem>>((k) => ({
      id: `kpi-${k.id}`,
      header: (
        <span title={k.description || undefined}>
          {k.name}
          {k.target ? <span className="ml-1 font-normal normal-case text-muted-foreground/70">/{targetText(k)}</span> : null}
        </span>
      ),
      cell: (i) => <KpiInput processId={p.id} item={i} kpi={k} editable={canEditItem(i)} />,
      sortValue: (i) => (k.type === "number" || k.type === "percent" ? (i.values[k.id] === undefined ? null : Number(i.values[k.id])) : i.values[k.id]),
    })),
    { id: "note", header: "Note", cell: (i) => <NoteInput processId={p.id} item={i} editable={canEditItem(i)} />, sortValue: (i) => i.note ?? "" },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (i) =>
        canEditItem(i) ? (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${i.title}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setItemDialog(i)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => removeItem(p.id, i.id).then(() => toast.success(`${label} removed`)).catch(fail("Could not remove"))}>
                  <Trash2 /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Lock className="ml-auto size-3.5 text-muted-foreground/50" aria-label="Read only" />
        ),
    },
  ];
  // Anyone can reorder the columns (KPIs included); it is a personal view saved in this browser.
  const { ordered: columns, ...arrange } = useColumnOrder(`org360:cols:${user.id}:${p.id}`, baseColumns, ["actions"]);
  const columnLabels: Record<string, string> = { title: label, health: "Health", status: "Status", eta: "ETA", owner: "Owner", note: "Note", ...Object.fromEntries(kpis.map((k) => [`kpi-${k.id}`, k.name])) };

  const done = count("done");
  const chips: { key: string | null; label: string; value: string | number; icon: typeof CheckCircle2; cls: string }[] = [
    { key: null, label: "All", value: items.length, icon: ListChecks, cls: "text-foreground" },
    { key: "done", label: "Done", value: `${done}/${items.length}`, icon: CheckCircle2, cls: "text-success" },
    { key: "on_track", label: "On track", value: count("on_track"), icon: ShieldCheck, cls: "text-info" },
    { key: "at_risk", label: "At risk", value: count("at_risk"), icon: ShieldAlert, cls: "text-warning" },
    { key: "off_track", label: "Off track", value: count("off_track"), icon: AlarmClock, cls: "text-danger" },
  ];
  const rows = healthFilter ? items.filter((i) => scored.get(i.id)?.health === healthFilter) : items;

  return (
    <div className="data-grid-host gap-2.5">
      {!access.contribute ? (
        <p className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> You can view this process. Only people responsible for or impacted by it can add {label.toLowerCase()}s and fill in KPIs.
        </p>
      ) : null}

      {/* toolbar: health chips double as filters, then meta, then actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Filter ${label.toLowerCase()}s by health`}>
          {chips.map((c) => {
            const active = healthFilter === c.key;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => setHealthFilter(c.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted",
                  active && "border-primary/40 bg-primary/5 ring-1 ring-primary/30",
                )}
              >
                <c.icon className={cn("size-3.5", c.cls)} />
                <span className="text-muted-foreground">{c.label}</span>
                <span className="tabular-nums text-foreground">{c.value}</span>
              </button>
            );
          })}
        </div>
        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground xl:block" title="Edit status, KPIs and notes right in the grid. Click a row for health, score and history.">
          Owner {L.empName(p.ownerId)} · Meeting {p.meetingDate ? formatDate(p.meetingDate, "dd MMM") : "—"} · Follow-up {p.followUpDate ? formatDate(p.followUpDate, "dd MMM") : "—"} ·{" "}
          <button className="text-primary hover:underline" onClick={onOpenMeetings}>
            Notes &amp; agenda
          </button>
        </p>
        <div className="ml-auto flex items-center gap-2">
          <ColumnArranger columns={columns} labels={columnLabels} fixedLast={["actions"]} {...arrange} />
          {access.manage || can("processes.configure_kpis") ? (
            <Button variant="outline" size="icon-sm" aria-label="Configure KPIs" title="Configure KPIs" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
            </Button>
          ) : null}
          {access.contribute ? (
            <Button size="sm" onClick={() => setItemDialog("new")}>
              <Plus /> Add {label.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable
          columns={columns}
          rows={rows}
          getRowId={(i) => i.id}
          pageSize={50}
          initialSort={{ id: "health", dir: "asc" }}
          onRowClick={(i) => setOpenId(i.id)}
          empty={
            <div className="py-6 text-center text-sm text-muted-foreground">
              {healthFilter && items.length ? (
                <>
                  No {label.toLowerCase()}s match this filter.{" "}
                  <button className="text-primary hover:underline" onClick={() => setHealthFilter(null)}>
                    Show all
                  </button>
                </>
              ) : (
                <>
                  No {label.toLowerCase()}s yet.{access.contribute ? ` Add the first one — then update its status and KPIs right here.` : ""}
                  {access.manage && !kpis.length ? " Use the gear to set up your KPIs first." : ""}
                </>
              )}
            </div>
          }
        />

      <KpiSettingsDialog process={p} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ItemDialog process={p} label={label} value={itemDialog} people={people} defaultOwner={employee?.id ?? null} onClose={() => setItemDialog(null)} />
      <ItemDetailSheet
        process={p}
        itemId={openId}
        label={label}
        canEdit={(id) => {
          const i = items.find((x) => x.id === id);
          return !!i && canEditItem(i);
        }}
        onClose={() => setOpenId(null)}
        onEdit={(id) => {
          const i = items.find((x) => x.id === id);
          if (i) setItemDialog(i);
        }}
      />
    </div>
  );
}

/* ---------------------------------- add / edit ---------------------------------- */

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

type Person = { value: string; label: string; hint: string };

function ItemDialog({ process, label, value, people, onClose, defaultOwner }: { process: Process; label: string; value: TrackedItem | "new" | null; people: Person[]; onClose: () => void; defaultOwner: string | null }) {
  return (
    <Dialog open={value !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {value !== null ? <ItemForm key={value === "new" ? "new" : value.id} process={process} label={label} item={value === "new" ? null : value} people={people} defaultOwner={defaultOwner} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({ process: p, label, item, people, defaultOwner, onClose }: { process: Process; label: string; item: TrackedItem | null; people: Person[]; defaultOwner: string | null; onClose: () => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [section, setSection] = useState(item?.section ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [ownerId, setOwnerId] = useState<string | null>(item ? item.ownerId : defaultOwner);
  const [eta, setEta] = useState(item?.eta ?? "");
  const [status, setStatus] = useState<TrackedItemStatus>(item?.status ?? "not_started");
  const [saving, setSaving] = useState(false);
  const sections = [...new Set((p.items ?? []).map((i) => i.section).filter(Boolean))];

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await saveItem(p.id, { id: item?.id, title, section, details, ownerId, eta: eta || null, status, values: item?.values ?? {} });
          toast.success(item ? `${label} updated` : `${label} added`);
          onClose();
        } catch (err) {
          fail(`Could not save the ${label.toLowerCase()}`)(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{item ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}</DialogTitle>
        <DialogDescription>Describe it, say who owns it and when it will be ready. Fill the KPIs and note in the grid afterwards.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Title" className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Name of the ${label.toLowerCase()}`} required autoFocus />
        </F>
        <F label="Section">
          <Input value={section} onChange={(e) => setSection(e.target.value)} list="item-sections" placeholder="Group it belongs to" />
          <datalist id="item-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </F>
        <F label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as TrackedItemStatus)}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ITEM_STATUS) as TrackedItemStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {ITEM_STATUS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Owner">
          <Combobox value={ownerId} onChange={setOwnerId} options={people} placeholder="Who is responsible?" searchPlaceholder="Search employees…" />
        </F>
        <F label="ETA">
          <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </F>
        <F label="Details" className="sm:col-span-2">
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Design detail, links…" />
        </F>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} {item ? "Save changes" : `Add ${label.toLowerCase()}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
