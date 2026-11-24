"use client";

import { Pencil } from "lucide-react";
import type { Process } from "@/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToneBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { useLookups, useToday } from "@/hooks/use-data";
import { HEALTH_LABEL, HEALTH_TONE, kpiMet, scoreItem } from "@/lib/utils/item-health";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { KpiInput, NoteInput, StatusSelect } from "./item-inline";
import { targetText } from "./kpi-settings";

const BAR = { success: "bg-success", info: "bg-info", warning: "bg-warning", danger: "bg-danger" } as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** Everything about one item: health and score (ETA, KPIs, history), every KPI, its note and its history. */
export function ItemDetailSheet({ process: p, itemId, label, canEdit, onClose, onEdit }: { process: Process; itemId: string | null; label: string; canEdit: (itemId: string) => boolean; onClose: () => void; onEdit: (itemId: string) => void }) {
  const L = useLookups();
  const today = useToday();
  const item = itemId ? (p.items ?? []).find((i) => i.id === itemId) : undefined;
  const kpis = p.kpis ?? [];
  const editable = !!item && canEdit(item.id);
  const s = item ? scoreItem(item, kpis, today) : null;
  const tone = s ? HEALTH_TONE[s.health] : "info";

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {item && s ? (
          <>
            <SheetHeader className="border-b pr-12">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="text-lg">{item.title}</SheetTitle>
                  <SheetDescription>
                    {label}
                    {item.section ? ` · ${item.section}` : ""} · {p.name}
                  </SheetDescription>
                </div>
                {editable ? (
                  <Button variant="outline" size="sm" onClick={() => onEdit(item.id)}>
                    <Pencil /> Edit
                  </Button>
                ) : null}
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              {/* health & score */}
              <Block title="Health & score">
                <div className="card-elevated space-y-4 p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-semibold tabular-nums leading-none">{s.score}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">out of 100</div>
                    </div>
                    <div className="space-y-1">
                      <ToneBadge tone={tone}>{HEALTH_LABEL[s.health]}</ToneBadge>
                      <p className="text-xs text-muted-foreground">Based on the ETA, KPI targets and the item’s history.</p>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {s.factors.map((f) => (
                      <li key={f.key}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium">{f.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {f.points}/{f.max}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={f.label} aria-valuenow={f.points} aria-valuemin={0} aria-valuemax={f.max}>
                          <div className={cn("h-full rounded-full", BAR[f.points / f.max >= 0.75 ? "success" : f.points / f.max >= 0.5 ? "warning" : "danger"])} style={{ width: `${(f.points / f.max) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Block>

              {/* basics */}
              <Block title="Status & schedule">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Status</dt>
                    <dd className="mt-1">
                      <StatusSelect processId={p.id} item={item} editable={editable} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">ETA</dt>
                    <dd className="mt-1">{item.eta ? formatDate(item.eta) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Owner</dt>
                    <dd className="mt-1">{item.ownerId ? <PersonCell name={L.empName(item.ownerId)} size="xs" /> : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Added by</dt>
                    <dd className="mt-1">
                      {item.createdBy} · {formatDate(item.createdAt.slice(0, 10))}
                    </dd>
                  </div>
                  {item.details ? (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Details</dt>
                      <dd className="mt-1 whitespace-pre-wrap">{item.details}</dd>
                    </div>
                  ) : null}
                </dl>
              </Block>

              {/* KPIs */}
              <Block title={`KPIs (${kpis.length})`}>
                {kpis.length ? (
                  <ul className="divide-y rounded-lg border">
                    {kpis.map((k) => {
                      const met = kpiMet(k, item.values[k.id]);
                      return (
                        <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{k.name}</div>
                            <div className="text-xs text-muted-foreground">{k.target ? `Target ${targetText(k)}${k.unit ? ` ${k.unit}` : ""}` : "No target"}</div>
                          </div>
                          {met !== null ? <ToneBadge tone={met ? "success" : "warning"}>{met ? "Met" : "Below target"}</ToneBadge> : null}
                          <div className="w-[150px] shrink-0">
                            <KpiInput processId={p.id} item={item} kpi={k} editable={editable} wide />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No KPIs configured. Use the settings icon on the process screen to add some.</p>
                )}
              </Block>

              <Block title="Note">
                <NoteInput processId={p.id} item={item} editable={editable} rows={4} />
              </Block>

              <Block title="History">
                <ol className="space-y-3 border-l pl-4">
                  {[...(item.history ?? [])].reverse().map((e, i) => (
                    <li key={`${e.at}-${i}`} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-teal" aria-hidden />
                      <div>{e.text}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.by} · {formatDate(e.at.slice(0, 10))}
                      </div>
                    </li>
                  ))}
                  {!(item.history ?? []).length ? <li className="text-sm text-muted-foreground">No changes recorded yet.</li> : null}
                </ol>
              </Block>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
