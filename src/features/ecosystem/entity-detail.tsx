"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Link2, Link2Off, Mail, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import { KpiCard } from "@/components/common/kpi-card";
import { PersonCell } from "@/components/common/user-avatar";
import { useCurrentUser, useDatabase, useLookups } from "@/hooks/use-data";
import { groupLinksByType } from "@/lib/calculations/ecosystem";
import { removeRelations } from "@/lib/repositories";
import { DeleteEntitiesDialog, EntityDialog, LinkDialog, StatusBadge, TypeBadge } from "./ecosystem-dialogs";

/** One entry: owner, primary contact, and everything it is connected to — who uses it, what it uses. */
export function EntityDetail({ id }: { id: string }) {
  const db = useDatabase();
  const L = useLookups();
  const router = useRouter();
  const { can } = useCurrentUser();
  const canManage = can("ecosystem.manage");
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);

  const entity = db.ecoEntities.find((e) => e.id === id);
  if (!entity) {
    return (
      <div className="space-y-6">
        <PageHeader title="Not found" breadcrumbs={[{ label: "Business" }, { label: "Ecosystem", href: "/ecosystem" }, { label: id }]} />
        <EmptyState title="This entry doesn’t exist" description="It may have been deleted." action={<Button asChild size="sm"><Link href="/ecosystem">Back to ecosystem</Link></Button>} />
      </div>
    );
  }

  const type = db.ecoTypes.find((t) => t.id === entity.typeId);
  const groups = groupLinksByType(db, id);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const typeName = type?.name ?? "Entry";
  const ownerEmail = db.employees.find((e) => e.id === entity.ownerId)?.email;

  return (
    <div className="space-y-4">
      <PageHeader
        title={entity.name}
        titleAdornment={
          <>
            <TypeBadge type={type} />
            <StatusBadge status={entity.status} />
          </>
        }
        breadcrumbs={[{ label: "Business" }, { label: "Ecosystem", href: "/ecosystem" }, { label: entity.name }]}
        description={entity.description || undefined}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/ecosystem?tab=directory">
                <ArrowLeft /> Directory
              </Link>
            </Button>
            {canManage ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" onClick={() => setLinking(true)}>
                  <Link2 /> Link to…
                </Button>
                <Button variant="outline" size="icon" aria-label="Delete" onClick={() => setDeleting([entity.id])}>
                  <Trash2 />
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card-elevated space-y-2 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</div>
          {entity.ownerId ? (
            <>
              <PersonCell name={L.empName(entity.ownerId)} />
              {ownerEmail ? (
                <a href={`mailto:${ownerEmail}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Mail className="size-3.5" /> {ownerEmail}
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-warning">No owner yet.</p>
          )}
        </div>
        <div className="card-elevated space-y-2 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary contact</div>
          {entity.contactName ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserRound className="size-4 text-muted-foreground" /> {entity.contactName}
              </div>
              {entity.contactEmail ? (
                <a href={`mailto:${entity.contactEmail}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Mail className="size-3.5" /> {entity.contactEmail}
                </a>
              ) : null}
              {entity.contactPhone ? (
                <a href={`tel:${entity.contactPhone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Phone className="size-3.5" /> {entity.contactPhone}
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-warning">No primary contact yet.</p>
          )}
        </div>
        <KpiCard label="Connected to" value={total} icon={Link2} tone="teal" hint={groups.length ? groups.map((g) => `${g.items.length} ${g.type.name}${g.items.length === 1 ? "" : "s"}`).join(" · ") : "nothing yet"} />
      </div>

      {entity.notes ? (
        <div className="card-elevated p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</div>
          <p className="whitespace-pre-wrap text-sm">{entity.notes}</p>
        </div>
      ) : null}

      {groups.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <section key={g.type.id} className="card-elevated overflow-hidden">
              <h3 className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-sm font-semibold">
                <TypeBadge type={g.type} /> <span className="text-muted-foreground">{g.items.length}</span>
              </h3>
              <ul className="divide-y">
                {g.items.map(({ other, links }) => {
                  const ownerName = other.ownerId ? L.empName(other.ownerId) : null;
                  return (
                    <li key={other.id} className="space-y-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/ecosystem/${other.id}`} className="font-medium hover:underline">
                            {other.name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {links.map((l) => (
                              <span key={l.relation.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]" title={l.relation.note || undefined}>
                                {l.direction === "out" ? (
                                  <>
                                    {typeName} {l.relation.label} <ArrowRight className="size-3" />
                                  </>
                                ) : (
                                  <>
                                    <ArrowLeft className="size-3" /> {g.type.name} {l.relation.label}
                                  </>
                                )}
                                {canManage ? (
                                  <button aria-label={`Remove link ${l.relation.label}`} className="ml-0.5 text-muted-foreground hover:text-danger" onClick={() => removeRelations([l.relation.id]).then(() => toast.success("Link removed")).catch((e) => toast.error("Could not remove", { description: e instanceof Error ? e.message : undefined }))}>
                                    <Link2Off className="size-3" />
                                  </button>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        </div>
                        <StatusBadge status={other.status} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Owner: {ownerName ?? <span className="text-warning">none</span>}</span>
                        <span>
                          Contact: {other.contactName ? other.contactName : <span className="text-warning">none</span>}
                          {other.contactEmail ? ` · ${other.contactEmail}` : ""}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Link2 className="size-5" />} title={`${entity.name} isn’t linked to anything yet`} description={`Link it to the clients, modules, integrations or POS systems it works with.`} action={canManage ? <Button size="sm" onClick={() => setLinking(true)}><Plus /> Link to…</Button> : undefined} />
      )}

      <EntityDialog open={editing} onOpenChange={setEditing} entity={entity} />
      <LinkDialog open={linking} onOpenChange={setLinking} fromId={entity.id} />
      <DeleteEntitiesDialog ids={deleting} onOpenChange={(o) => !o && setDeleting(null)} onDone={() => router.replace("/ecosystem?tab=directory")} />
    </div>
  );
}

