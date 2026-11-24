"use client";

import { useDatabase } from "@/hooks/use-data";
import { cn } from "@/lib/utils";

/**
 * Brand mark. Uses the organization logo from Settings (defaults to the
 * Altametrics icon asset in /public/brand) — replaceable without code changes.
 */
export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  const { organization } = useDatabase();
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={organization.logoUrl} alt={`${organization.shortName} logo`} width={size * 0.66} height={size * 0.66} className="object-contain" />
    </span>
  );
}

export function BrandLockup({ collapsed, inverted }: { collapsed?: boolean; inverted?: boolean }) {
  const { organization } = useDatabase();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark size={34} />
      {!collapsed ? (
        <div className="min-w-0 leading-tight">
          <div className={cn("truncate text-[15px] font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}>
            {organization.appName}
          </div>
          <div className={cn("truncate text-[11px]", inverted ? "text-sidebar-muted" : "text-muted-foreground")}>{organization.name}</div>
        </div>
      ) : null}
    </div>
  );
}
