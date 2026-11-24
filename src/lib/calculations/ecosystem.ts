/** Read-side logic for the business ecosystem: who is linked to what, matrices and management tiles. Pure. */
import type { Database, EcoEntity, EcoRelation, EcoType } from "@/types";

type Eco = Pick<Database, "ecoTypes" | "ecoEntities" | "ecoRelations">;

export interface EcoLink {
  relation: EcoRelation;
  other: EcoEntity;
  /** "out": this entity → other (e.g. Client uses Module). "in": other → this entity. */
  direction: "out" | "in";
}

/** Every link of an entity, in either direction. Links to a missing entity are ignored. */
export function linksOf(db: Eco, id: string): EcoLink[] {
  const byId = new Map(db.ecoEntities.map((e) => [e.id, e]));
  const out: EcoLink[] = [];
  for (const r of db.ecoRelations) {
    if (r.fromId === id) {
      const other = byId.get(r.toId);
      if (other) out.push({ relation: r, other, direction: "out" });
    } else if (r.toId === id) {
      const other = byId.get(r.fromId);
      if (other) out.push({ relation: r, other, direction: "in" });
    }
  }
  return out;
}

/** Links grouped by the other side's type, in type order. Same entity linked twice (different labels) stays one row. */
export function groupLinksByType(db: Eco, id: string): { type: EcoType; items: { other: EcoEntity; links: EcoLink[] }[] }[] {
  const all = linksOf(db, id);
  return db.ecoTypes
    .map((type) => {
      const map = new Map<string, { other: EcoEntity; links: EcoLink[] }>();
      for (const l of all.filter((x) => x.other.typeId === type.id)) {
        const cur = map.get(l.other.id) ?? { other: l.other, links: [] };
        cur.links.push(l);
        map.set(l.other.id, cur);
      }
      return { type, items: [...map.values()].sort((a, b) => a.other.name.localeCompare(b.other.name)) };
    })
    .filter((g) => g.items.length);
}

/** Every link that would go if these entries were deleted, with the entry on the other side (which stays). */
export function referencesTo(db: Eco, ids: string[]): { relation: EcoRelation; entity: EcoEntity; other: EcoEntity | undefined }[] {
  const gone = new Set(ids);
  const byId = new Map(db.ecoEntities.map((e) => [e.id, e]));
  return db.ecoRelations
    .filter((r) => gone.has(r.fromId) || gone.has(r.toId))
    .map((relation) => {
      const mineIsFrom = gone.has(relation.fromId);
      return { relation, entity: byId.get(mineIsFrom ? relation.fromId : relation.toId)!, other: byId.get(mineIsFrom ? relation.toId : relation.fromId) };
    })
    .filter((x) => x.entity);
}

/** Relations between two entities, in either direction. */
export const relationsBetween = (db: Eco, a: string, b: string) => db.ecoRelations.filter((r) => (r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a));

/** Number of distinct entities linked to each entity. */
export function connectionCounts(db: Eco): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  const add = (a: string, b: string) => sets.set(a, (sets.get(a) ?? new Set()).add(b));
  for (const r of db.ecoRelations) {
    add(r.fromId, r.toId);
    add(r.toId, r.fromId);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

export interface TypeStats {
  type: EcoType;
  total: number;
  active: number;
  noOwner: number;
  noContact: number;
  unlinked: number;
}

export function ecosystemStats(db: Eco) {
  const counts = connectionCounts(db);
  const byType: TypeStats[] = db.ecoTypes.map((type) => {
    const list = db.ecoEntities.filter((e) => e.typeId === type.id);
    return {
      type,
      total: list.length,
      active: list.filter((e) => e.status === "active").length,
      noOwner: list.filter((e) => !e.ownerId).length,
      noContact: list.filter((e) => !e.contactName.trim()).length,
      unlinked: list.filter((e) => !counts.get(e.id)).length,
    };
  });
  const noOwner = db.ecoEntities.filter((e) => !e.ownerId);
  const noContact = db.ecoEntities.filter((e) => !e.contactName.trim());
  const unlinked = db.ecoEntities.filter((e) => !counts.get(e.id));
  const topConnected = db.ecoTypes
    .map((type) => ({
      type,
      items: db.ecoEntities
        .filter((e) => e.typeId === type.id)
        .map((e) => ({ entity: e, count: counts.get(e.id) ?? 0 }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count || a.entity.name.localeCompare(b.entity.name))
        .slice(0, 5),
    }))
    .filter((g) => g.items.length);
  return { byType, counts, noOwner, noContact, unlinked, topConnected, entities: db.ecoEntities.length, relations: db.ecoRelations.length };
}

/** Rows × columns grid of "is linked" between two types (either direction). */
export function usageMatrix(db: Eco, rowTypeId: string, colTypeId: string) {
  const rows = db.ecoEntities.filter((e) => e.typeId === rowTypeId).sort((a, b) => a.name.localeCompare(b.name));
  const cols = db.ecoEntities.filter((e) => e.typeId === colTypeId).sort((a, b) => a.name.localeCompare(b.name));
  const pair = new Map<string, EcoRelation[]>();
  for (const r of db.ecoRelations) {
    for (const k of [`${r.fromId}|${r.toId}`, `${r.toId}|${r.fromId}`]) pair.set(k, [...(pair.get(k) ?? []), r]);
  }
  const cell = (row: EcoEntity, col: EcoEntity) => pair.get(`${row.id}|${col.id}`) ?? [];
  return {
    rows,
    cols,
    cell,
    rowTotal: (row: EcoEntity) => cols.filter((c) => cell(row, c).length).length,
    colTotal: (col: EcoEntity) => rows.filter((r) => cell(r, col).length).length,
  };
}

export const RELATION_SUGGESTIONS = ["uses", "licenses", "runs on", "part of", "includes", "integrates with", "depends on", "supports", "managed by", "supplied by"];
