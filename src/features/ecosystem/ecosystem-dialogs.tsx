"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type { EcoEntity, EcoStatus, EcoType } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, MultiSelect } from "@/components/common/filters";
import { ToneBadge } from "@/components/common/badges";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useCurrentUser, useDatabase } from "@/hooks/use-data";
import { linkEntities, removeEcoType, removeEntities, saveEcoType, saveEntity } from "@/lib/repositories";
import { RELATION_SUGGESTIONS, referencesTo } from "@/lib/calculations/ecosystem";

const fail = (title: string) => (e: unknown) => toast.error(title, { description: e instanceof Error ? e.message : undefined });

export const STATUS_META: Record<EcoStatus, { label: string; tone: "success" | "info" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  planned: { label: "Planned", tone: "info" },
  inactive: { label: "Inactive", tone: "neutral" },
};
export const TONES: EcoType["tone"][] = ["info", "teal", "success", "warning", "danger", "neutral"];

export function TypeBadge({ type }: { type?: EcoType }) {
  return type ? <ToneBadge tone={type.tone}>{type.name}</ToneBadge> : <span className="text-muted-foreground">—</span>;
}
export function StatusBadge({ status }: { status: EcoStatus }) {
  return <ToneBadge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</ToneBadge>;
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------- add / edit entity ------------------------------- */

export function EntityDialog({ open, onOpenChange, entity, defaultTypeId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; entity?: EcoEntity | null; defaultTypeId?: string | null; onSaved?: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">{open ? <EntityForm entity={entity ?? null} defaultTypeId={defaultTypeId ?? null} onClose={() => onOpenChange(false)} onSaved={onSaved} /> : null}</DialogContent>
    </Dialog>
  );
}

function EntityForm({ entity, defaultTypeId, onClose, onSaved }: { entity: EcoEntity | null; defaultTypeId: string | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const db = useDatabase();
  const [typeId, setTypeId] = useState<string | null>(entity?.typeId ?? defaultTypeId ?? db.ecoTypes[0]?.id ?? null);
  const [name, setName] = useState(entity?.name ?? "");
  const [status, setStatus] = useState<EcoStatus>(entity?.status ?? "active");
  const [ownerId, setOwnerId] = useState<string | null>(entity?.ownerId ?? null);
  const [contactName, setContactName] = useState(entity?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(entity?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(entity?.contactPhone ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [notes, setNotes] = useState(entity?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const typeName = db.ecoTypes.find((t) => t.id === typeId)?.name ?? "entry";
  const people = db.employees.filter((e) => e.status !== "inactive" || e.id === entity?.ownerId).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!typeId) return toast.error("Choose a type.");
        setSaving(true);
        try {
          const id = await saveEntity({ id: entity?.id, typeId, name, description, status, ownerId, contactName, contactEmail, contactPhone, notes });
          toast.success(entity ? "Saved" : `${typeName} added`, { description: name });
          onClose();
          onSaved?.(id);
        } catch (err) {
          fail("Could not save")(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{entity ? `Edit ${entity.name}` : "Add to the ecosystem"}</DialogTitle>
        <DialogDescription>A product, client, module, integration, POS system or anything else you track. Link it to others afterwards.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Type">
          <Combobox value={typeId} onChange={setTypeId} options={db.ecoTypes.map((t) => ({ value: t.id, label: t.name }))} placeholder="Select type" allowClear={false} />
        </F>
        <F label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as EcoStatus)}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_META) as EcoStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Name" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name of the ${typeName.toLowerCase()}`} required autoFocus />
        </F>
        <F label="Owner (our side)" className="sm:col-span-2">
          <Combobox value={ownerId} onChange={setOwnerId} options={people} placeholder="Who owns this?" searchPlaceholder="Search employees…" />
        </F>
        <F label="Primary contact">
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" />
        </F>
        <F label="Contact phone">
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone" />
        </F>
        <F label="Contact email" className="sm:col-span-2">
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@company.com" />
        </F>
        <F label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </F>
        <F label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contract dates, versions, anything worth remembering" />
        </F>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} {entity ? "Save changes" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------------ link ------------------------------------ */

/** Create links from one entry to many others, with a label you choose (or type). */
export function LinkDialog({ open, onOpenChange, fromId }: { open: boolean; onOpenChange: (o: boolean) => void; fromId?: string | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">{open ? <LinkForm fromId={fromId ?? null} onClose={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function LinkForm({ fromId: initial, onClose }: { fromId: string | null; onClose: () => void }) {
  const db = useDatabase();
  const [fromId, setFromId] = useState<string | null>(initial);
  const [label, setLabel] = useState("uses");
  const [toIds, setToIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const typeOf = (e: EcoEntity) => db.ecoTypes.find((t) => t.id === e.typeId)?.name ?? "";
  const options = useMemo(() => db.ecoEntities.map((e) => ({ value: e.id, label: e.name, hint: typeOf(e) })), [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const from = db.ecoEntities.find((e) => e.id === fromId);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!fromId) return toast.error("Choose what to link from.");
        setSaving(true);
        try {
          const n = await linkEntities(fromId, toIds, label, note);
          toast.success(n ? `${n} link${n === 1 ? "" : "s"} added` : "Already linked", { description: n ? `${from?.name} ${label.trim()} …` : undefined });
          onClose();
        } catch (err) {
          fail("Could not link")(err);
        } finally {
          setSaving(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Link entries</DialogTitle>
        <DialogDescription>Any entry can be linked to any other. Read it left to right: “Client uses Module”, “Integration integrates with POS System”.</DialogDescription>
      </DialogHeader>
      <F label="From">
        <Combobox value={fromId} onChange={setFromId} options={options} placeholder="Pick the first entry" searchPlaceholder="Search all entries…" allowClear={false} />
      </F>
      <F label="Relationship">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} list="eco-labels" placeholder="uses, runs on, part of…" required />
        <datalist id="eco-labels">
          {RELATION_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="flex flex-wrap gap-1 pt-1">
          {RELATION_SUGGESTIONS.slice(0, 6).map((s) => (
            <button key={s} type="button" onClick={() => setLabel(s)} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
              {s}
            </button>
          ))}
        </div>
      </F>
      <F label="To (pick as many as you like)">
        <MultiSelect values={toIds} onChange={setToIds} options={options.filter((o) => o.value !== fromId)} placeholder="Choose entries" searchPlaceholder="Search all entries…" />
      </F>
      <F label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. since Jan 2026, 12 sites" />
      </F>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Add links
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ----------------------------------- types ------------------------------------ */

export function TypesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDatabase();
  const { can } = useCurrentUser();
  const [name, setName] = useState("");
  const [tone, setTone] = useState<EcoType["tone"]>("info");
  const [editing, setEditing] = useState<EcoType | null>(null);
  const [cascading, setCascading] = useState<EcoType | null>(null);
  const memberCount = (typeId: string) => db.ecoEntities.filter((e) => e.typeId === typeId).length;
  const cascadeLinks = (typeId: string) => {
    const ids = new Set(db.ecoEntities.filter((e) => e.typeId === typeId).map((e) => e.id));
    return db.ecoRelations.filter((r) => ids.has(r.fromId) || ids.has(r.toId)).length;
  };
  const reset = () => {
    setEditing(null);
    setName("");
    setTone("info");
  };
  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Types</DialogTitle>
          <DialogDescription>The kinds of things you track. Add your own — Vendor, Partner, Region, anything.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {db.ecoTypes.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <TypeBadge type={t} />
              <span className="flex-1 text-xs text-muted-foreground">{db.ecoEntities.filter((e) => e.typeId === t.id).length} entries</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${t.name}`}
                onClick={() => {
                  setEditing(t);
                  setName(t.name);
                  setTone(t.tone);
                }}
              >
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => (memberCount(t.id) && can("ecosystem.delete_linked") ? setCascading(t) : removeEcoType(t.id).then(() => toast.success("Type removed")).catch(fail("Could not remove")))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveEcoType({ id: editing?.id, name, tone })
              .then(() => {
                toast.success(editing ? "Type updated" : "Type added");
                reset();
              })
              .catch(fail("Could not save"));
          }}
        >
          <div className="text-xs font-medium">{editing ? `Edit “${editing.name}”` : "New type"}</div>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vendor" aria-label="Type name" required />
            <Select value={tone} onValueChange={(v) => setTone(v as EcoType["tone"])}>
              <SelectTrigger className="w-[110px]" aria-label="Colour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            {editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              <Plus /> {editing ? "Save" : "Add type"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
      <ConfirmDialog
        open={cascading !== null}
        onOpenChange={(o) => !o && setCascading(null)}
        title={`Delete type “${cascading?.name ?? ""}”?`}
        description={cascading ? `${memberCount(cascading.id)} entr${memberCount(cascading.id) === 1 ? "y" : "ies"} of this type and ${cascadeLinks(cascading.id)} link${cascadeLinks(cascading.id) === 1 ? "" : "s"} to them will be deleted too. This can’t be undone.` : ""}
        confirmLabel="Delete type and entries"
        destructive
        onConfirm={async () => {
          await removeEcoType(cascading!.id, true).then(() => toast.success("Type removed")).catch(fail("Could not remove"));
        }}
      />
    </>
  );
}

/* ---------------------------------- delete ----------------------------------- */

export function DeleteEntitiesDialog({ ids, onOpenChange, onDone }: { ids: string[] | null; onOpenChange: (o: boolean) => void; onDone?: () => void }) {
  const db = useDatabase();
  const { can } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const set = new Set(ids ?? []);
  const refs = ids ? referencesTo(db, ids) : [];
  const names = ids ? db.ecoEntities.filter((e) => set.has(e.id)).map((e) => e.name) : [];
  const typeById = new Map(db.ecoTypes.map((t) => [t.id, t]));
  const mayDeleteLinked = can("ecosystem.delete_linked");
  const blocked = refs.length > 0 && !mayDeleteLinked;
  const title = names.length === 1 ? names[0] : `${names.length} entries`;

  const confirm = async () => {
    if (!ids) return;
    setBusy(true);
    try {
      const r = await removeEntities(ids);
      toast.success(`${r.entities} deleted`, { description: r.links ? `${r.links} link${r.links === 1 ? "" : "s"} removed` : undefined });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      fail("Could not delete")(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={ids !== null} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{blocked ? `Can’t delete ${title}` : `Delete ${title}?`}</DialogTitle>
          <DialogDescription>
            {!refs.length
              ? "It isn’t linked to anything. This can’t be undone."
              : blocked
                ? `${refs.length} link${refs.length === 1 ? " refers" : "s refer"} to ${names.length === 1 ? "it" : "these entries"}. Remove the links first, or ask a Super Admin to delete ${names.length === 1 ? "it" : "them"}.`
                : `${refs.length} link${refs.length === 1 ? "" : "s"} refer${refs.length === 1 ? "s" : ""} to ${names.length === 1 ? "it" : "these entries"}. Deleting removes ${refs.length === 1 ? "that link" : "all of them"}; the entries on the other side stay. This can’t be undone.`}
          </DialogDescription>
        </DialogHeader>

        {refs.length ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <ul className="divide-y text-sm">
              {refs.map(({ relation, entity, other }) => {
                const mineIsFrom = set.has(relation.fromId);
                return (
                  <li key={relation.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                    {names.length > 1 ? <span className="font-medium">{entity.name}</span> : null}
                    <span className="text-xs text-muted-foreground">{mineIsFrom ? relation.label : `is ${relation.label} by`}</span>
                    <span className="font-medium">{other?.name ?? "—"}</span>
                    {other ? <TypeBadge type={typeById.get(other.typeId)} /> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {blocked ? "Close" : "Cancel"}
          </Button>
          {!blocked ? (
            <Button variant="destructive" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {refs.length ? `Delete and remove ${refs.length} link${refs.length === 1 ? "" : "s"}` : "Delete"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
