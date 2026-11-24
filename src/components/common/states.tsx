import type { ReactNode } from "react";
import { AlertOctagon, Inbox, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon ?? <Inbox className="size-5" />}</div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 px-6 py-12 text-center">
      <AlertOctagon className="size-6 text-danger" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="max-w-md text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function RestrictedState({ role }: { role: string }) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-card px-8 py-12 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Lock className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">Not available for {role}</h2>
      <p className="text-sm text-muted-foreground">This module isn&apos;t part of the {role} experience. Switch persona from the role switcher in the top bar to explore it.</p>
    </div>
  );
}

export function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
