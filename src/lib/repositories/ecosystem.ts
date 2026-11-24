/** Writes for the business ecosystem: entity types, entities and the free-form links between them. */
import type { EcoEntity, EcoStatus, EcoType } from "@/types";
import { can } from "@/lib/auth/permissions";
import { uid } from "@/lib/utils/random";
import { auditEntry, currentActor, getDb, latency, nowIso, RepositoryError, write } from "./core";

function guard() {
  if (!can(currentActor().role, "ecosystem.manage")) throw new RepositoryError("You don't have permission to change the ecosystem.");
}

const clean = (s: string) => s.trim();

/* ---------------------------------- types ---------------------------------- */

export async function saveEcoType(input: { id?: string; name: string; tone: EcoType["tone"] }): Promise<void> {
  await latency(150);
  guard();
  const name = clean(input.name);
  if (!name) throw new RepositoryError("Give the type a name.");
  const db = getDb();
  if (db.ecoTypes.some((t) => t.id !== input.id && t.name.toLowerCase() === name.toLowerCase())) throw new RepositoryError(`A type named "${name}" already exists.`);
  const type: EcoType = { id: input.id ?? uid("ETY"), name, tone: input.tone };
  write((d) => ({
    patch: { ecoTypes: input.id ? d.ecoTypes.map((t) => (t.id === input.id ? type : t)) : [...d.ecoTypes, type] },
    audit: [auditEntry(d, "Ecosystem", input.id ? "Type Updated" : "Type Added", type.id, name, `${input.id ? "Updated" : "Added"} type "${name}".`)],
  }));
}

/** Remove a type. One that entries still use can only go with `cascade`, which a Super Admin may do: its entries and their links go too. */
export async function removeEcoType(id: string, cascade = false): Promise<void> {
  await latency(150);
  guard();
  const db = getDb();
  const t = db.ecoTypes.find((x) => x.id === id);
  if (!t) return;
  const members = db.ecoEntities.filter((e) => e.typeId === id);
  if (members.length && !(cascade && can(currentActor().role, "ecosystem.delete_linked"))) {
    throw new RepositoryError(`${members.length} ${members.length === 1 ? "entry uses" : "entries use"} "${t.name}". Move or delete them first${cascade ? "" : ", or ask a Super Admin to delete the type with its entries"}.`);
  }
  const gone = new Set(members.map((e) => e.id));
  const links = db.ecoRelations.filter((r) => gone.has(r.fromId) || gone.has(r.toId)).length;
  write((d) => ({
    patch: {
      ecoTypes: d.ecoTypes.filter((x) => x.id !== id),
      ecoEntities: d.ecoEntities.filter((e) => !gone.has(e.id)),
      ecoRelations: d.ecoRelations.filter((r) => !gone.has(r.fromId) && !gone.has(r.toId)),
    },
    audit: [auditEntry(d, "Ecosystem", "Type Removed", id, t.name, `Removed type "${t.name}"${members.length ? ` with ${members.length} entr${members.length === 1 ? "y" : "ies"} and ${links} link${links === 1 ? "" : "s"}` : ""}.`)],
  }));
}

/* -------------------------------- entities --------------------------------- */

export interface EntityInput {
  id?: string;
  typeId: string;
  name: string;
  description: string;
  status: EcoStatus;
  ownerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

export async function saveEntity(input: EntityInput): Promise<string> {
  await latency(200);
  guard();
  const db = getDb();
  const name = clean(input.name);
  if (!name) throw new RepositoryError("Give it a name.");
  if (!db.ecoTypes.some((t) => t.id === input.typeId)) throw new RepositoryError("Choose a type.");
  if (db.ecoEntities.some((e) => e.id !== input.id && e.typeId === input.typeId && e.name.toLowerCase() === name.toLowerCase())) throw new RepositoryError(`"${name}" already exists for this type.`);
  const email = clean(input.contactEmail);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new RepositoryError("The contact email doesn't look right.");
  const ts = nowIso();
  const fields = { typeId: input.typeId, name, description: clean(input.description), status: input.status, ownerId: input.ownerId, contactName: clean(input.contactName), contactEmail: email, contactPhone: clean(input.contactPhone), notes: clean(input.notes) };
  const id = input.id ?? uid("ECO");
  write((d) => {
    const prev = d.ecoEntities.find((e) => e.id === input.id);
    if (input.id && !prev) throw new RepositoryError("That record no longer exists.");
    const next: EcoEntity = prev ? { ...prev, ...fields, updatedAt: ts } : { id, ...fields, createdAt: ts, updatedAt: ts };
    return {
      patch: { ecoEntities: prev ? d.ecoEntities.map((e) => (e.id === id ? next : e)) : [...d.ecoEntities, next] },
      audit: [auditEntry(d, "Ecosystem", prev ? "Updated" : "Created", id, name, `${prev ? "Updated" : "Added"} ${d.ecoTypes.find((t) => t.id === fields.typeId)?.name ?? "entry"} "${name}".`)],
    };
  });
  return id;
}

/** Deletes entities and every link they take part in. Returns how many links went with them. */
export async function removeEntities(ids: string[]): Promise<{ entities: number; links: number }> {
  await latency(200);
  guard();
  const gone = new Set(ids);
  const db = getDb();
  const entities = db.ecoEntities.filter((e) => gone.has(e.id));
  if (!entities.length) return { entities: 0, links: 0 };
  const links = db.ecoRelations.filter((r) => gone.has(r.fromId) || gone.has(r.toId)).length;
  // Entries other entries refer to can only be deleted by a Super Admin; everyone else removes the links first.
  if (links && !can(currentActor().role, "ecosystem.delete_linked")) {
    throw new RepositoryError(`${links === 1 ? "A link refers" : `${links} links refer`} to ${entities.length === 1 ? `"${entities[0].name}"` : "these entries"}. Remove the links first, or ask a Super Admin to delete it.`);
  }
  write((d) => ({
    patch: { ecoEntities: d.ecoEntities.filter((e) => !gone.has(e.id)), ecoRelations: d.ecoRelations.filter((r) => !gone.has(r.fromId) && !gone.has(r.toId)) },
    audit: [auditEntry(d, "Ecosystem", entities.length > 1 ? "Bulk Deleted" : "Deleted", entities[0].id, entities.length > 1 ? `${entities.length} entries` : entities[0].name, `Deleted ${entities.map((e) => e.name).join(", ")} and ${links} link${links === 1 ? "" : "s"}.`)],
  }));
  return { entities: entities.length, links };
}

/* -------------------------------- relations -------------------------------- */

/** Link `fromId` to each of `toIds` with `label`. Existing identical links are left alone. Returns how many were added. */
export async function linkEntities(fromId: string, toIds: string[], label: string, note = ""): Promise<number> {
  await latency(200);
  guard();
  const text = clean(label);
  if (!text) throw new RepositoryError("Say how they are related, e.g. “uses”.");
  const db = getDb();
  if (!db.ecoEntities.some((e) => e.id === fromId)) throw new RepositoryError("Choose what to link from.");
  const targets = [...new Set(toIds)].filter((id) => id !== fromId && db.ecoEntities.some((e) => e.id === id));
  if (!targets.length) throw new RepositoryError("Choose at least one other entry to link to.");
  const fresh = targets.filter((to) => !db.ecoRelations.some((r) => r.fromId === fromId && r.toId === to && r.label.toLowerCase() === text.toLowerCase()));
  if (!fresh.length) return 0;
  const ts = nowIso();
  write((d) => ({
    patch: { ecoRelations: [...d.ecoRelations, ...fresh.map((to) => ({ id: uid("REL"), fromId, toId: to, label: text, note: clean(note), createdAt: ts }))] },
    audit: [auditEntry(d, "Ecosystem", "Linked", fromId, d.ecoEntities.find((e) => e.id === fromId)?.name ?? fromId, `${d.ecoEntities.find((e) => e.id === fromId)?.name} ${text} ${fresh.map((id) => d.ecoEntities.find((e) => e.id === id)?.name).join(", ")}.`)],
  }));
  return fresh.length;
}

export async function updateRelation(id: string, patch: { label: string; note: string }): Promise<void> {
  await latency(150);
  guard();
  const label = clean(patch.label);
  if (!label) throw new RepositoryError("Say how they are related, e.g. “uses”.");
  write((d) => {
    if (!d.ecoRelations.some((r) => r.id === id)) throw new RepositoryError("That link no longer exists.");
    return { patch: { ecoRelations: d.ecoRelations.map((r) => (r.id === id ? { ...r, label, note: clean(patch.note) } : r)) }, audit: [auditEntry(d, "Ecosystem", "Link Updated", id, label, `Link relabelled "${label}".`)] };
  });
}

export async function removeRelations(ids: string[]): Promise<number> {
  await latency(150);
  guard();
  const gone = new Set(ids);
  const db = getDb();
  const n = db.ecoRelations.filter((r) => gone.has(r.id)).length;
  if (!n) return 0;
  const name = (id: string) => db.ecoEntities.find((e) => e.id === id)?.name ?? id;
  const first = db.ecoRelations.find((r) => gone.has(r.id))!;
  write((d) => ({
    patch: { ecoRelations: d.ecoRelations.filter((r) => !gone.has(r.id)) },
    audit: [auditEntry(d, "Ecosystem", "Unlinked", first.id, `${name(first.fromId)} → ${name(first.toId)}`, n === 1 ? `Removed "${first.label}" link between ${name(first.fromId)} and ${name(first.toId)}.` : `Removed ${n} links.`)],
  }));
  return n;
}
