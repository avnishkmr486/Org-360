"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  AlertTriangle,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Clock,
  GitBranchPlus,
  Hourglass,
  MailOpen,
  Mail,
  TrendingDown,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AppNotification, NotificationType } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { FilterSelect, SearchInput } from "@/components/common/filters";
import { ToneBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser, useDatabase } from "@/hooks/use-data";
import { markAllNotificationsRead, markNotificationRead, notificationsFor } from "@/lib/repositories";
import { NOTIFICATION_TYPE_META, TONE_CLASSES } from "@/lib/constants";
import { formatDateTime, formatRelative, todayISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  process_assigned: GitBranchPlus,
  due_soon: Clock,
  overdue: AlarmClock,
  submission_completed: CheckCircle2,
  submission_rejected: XCircle,
  approval_pending: Hourglass,
  below_threshold: TrendingDown,
};

const TYPES = Object.keys(NOTIFICATION_TYPE_META) as NotificationType[];

export function NotificationCenter() {
  const db = useDatabase();
  const { role, employee } = useCurrentUser();
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "unread" | "read">("all");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [busyAll, setBusyAll] = useState(false);

  const mine = useMemo(() => notificationsFor(db, role, employee?.id ?? null), [db, role, employee]);
  const unread = mine.filter((n) => !n.read);

  const filtered = mine.filter((n) => {
    if (tab === "unread" && n.read) return false;
    if (tab === "read" && !n.read) return false;
    if (type && n.type !== type) return false;
    if (q && !`${n.title} ${n.message}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const today = todayISO();
  const groups: { label: string; items: AppNotification[] }[] = [
    { label: "Today", items: filtered.filter((n) => n.createdAt.slice(0, 10) === today) },
    { label: "Earlier", items: filtered.filter((n) => n.createdAt.slice(0, 10) !== today) },
  ].filter((g) => g.items.length);

  const countByType = TYPES.map((t) => ({ type: t, total: mine.filter((n) => n.type === t).length, unread: unread.filter((n) => n.type === t).length }));

  const markAll = async () => {
    setBusyAll(true);
    try {
      await markAllNotificationsRead(unread.map((n) => n.id));
      toast.success(`Marked ${unread.length} notification${unread.length === 1 ? "" : "s"} as read`);
    } catch (e) {
      toast.error("Could not update notifications", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusyAll(false);
    }
  };

  const toggleRead = async (n: AppNotification) => {
    try {
      await markNotificationRead(n.id, !n.read);
    } catch (e) {
      toast.error("Could not update notification", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const open = async (n: AppNotification) => {
    if (!n.read) await markNotificationRead(n.id, true).catch(() => undefined);
    router.push(n.link);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Notifications" }]}
        title="Notifications"
        description="Assignments, due dates, overdue work, submissions, approvals and threshold alerts relevant to your role."
        actions={
          <Button size="sm" onClick={markAll} disabled={!unread.length || busyAll}>
            <CheckCheck /> Mark all as read
          </Button>
        }
        filters={
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs">
                  All ({mine.length})
                </TabsTrigger>
                <TabsTrigger value="unread" className="text-xs">
                  Unread ({unread.length})
                </TabsTrigger>
                <TabsTrigger value="read" className="text-xs">
                  Read ({mine.length - unread.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <FilterSelect label="Type" value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: NOTIFICATION_TYPE_META[t].label }))} />
            <SearchInput value={q} onChange={setQ} placeholder="Search notifications…" />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {groups.length === 0 ? (
            <EmptyState icon={<BellRing className="size-5" />} title={mine.length ? "No notifications match your filters" : "You're all caught up"} description={mine.length ? "Try a different tab, type or search term." : "New assignments, approvals and alerts will appear here."} />
          ) : (
            groups.map((g) => (
              <section key={g.label} className="space-y-2">
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label} · {g.items.length}
                </h2>
                <ul className="card-elevated divide-y overflow-hidden">
                  {g.items.map((n) => {
                    const Icon = TYPE_ICONS[n.type];
                    const meta = NOTIFICATION_TYPE_META[n.type];
                    return (
                      <li key={n.id} className={cn("group flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40", !n.read && "bg-info-soft/30")}>
                        <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border", TONE_CLASSES[meta.tone])}>
                          <Icon className="size-4" />
                        </span>
                        <button className="min-w-0 flex-1 text-left" onClick={() => open(n)}>
                          <div className="flex flex-wrap items-center gap-2">
                            {!n.read ? <span className="size-2 rounded-full bg-info" aria-label="Unread" /> : null}
                            <span className={cn("text-sm", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                            <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground" title={formatDateTime(n.createdAt)}>
                            {formatRelative(n.createdAt)} · {formatDateTime(n.createdAt)}
                          </p>
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" onClick={() => toggleRead(n)} aria-label={n.read ? "Mark as unread" : "Mark as read"}>
                              {n.read ? <Mail /> : <MailOpen />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{n.read ? "Mark as unread" : "Mark as read"}</TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <aside className="card-elevated h-fit p-4">
          <h3 className="text-sm font-semibold">By notification type</h3>
          <p className="mb-3 text-xs text-muted-foreground">Click a type to filter</p>
          <ul className="space-y-1">
            {countByType.map((c) => {
              const Icon = TYPE_ICONS[c.type];
              const active = type === c.type;
              return (
                <li key={c.type}>
                  <button
                    onClick={() => setType(active ? "" : c.type)}
                    className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60", active && "bg-accent font-medium")}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-left">{NOTIFICATION_TYPE_META[c.type].label}</span>
                    {c.unread ? <span className="rounded-full bg-info px-1.5 text-[10px] font-semibold leading-4 text-white">{c.unread}</span> : null}
                    <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{c.total}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Delivery preferences (in-app / email) are configured in Settings → Notification Preferences.
          </div>
        </aside>
      </div>
    </div>
  );
}
