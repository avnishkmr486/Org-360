"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Lets filter controls inside a closed panel report how many filters are active (shown on the filter icon). */
const FilterCountContext = createContext<((n: number) => void) | null>(null);

export function useReportFilterCount(count: number) {
  const report = useContext(FilterCountContext);
  useEffect(() => {
    report?.(count);
    return () => report?.(0);
  }, [report, count]);
}

export function FilterButton({ open, count, onClick, className }: { open: boolean; count: number; onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant={open || count ? "secondary" : "outline"}
      size="sm"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} filters${count ? ` (${count} active)` : ""}`}
      title="Filters"
      className={cn("relative gap-1.5", count && "border-primary/40 text-primary", className)}
    >
      <SlidersHorizontal />
      <span className="hidden sm:inline">Filters</span>
      {count ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{count}</span> : null}
    </Button>
  );
}

/** The panel the filter icon opens. Kept mounted while hidden so the active-filter count stays accurate. */
export function FilterPanel({ open, onClose, onCount, children }: { open: boolean; onClose: () => void; onCount: (n: number) => void; children: ReactNode }) {
  return (
    <FilterCountContext.Provider value={onCount}>
      <div className={cn("relative flex flex-wrap items-center gap-2 rounded-xl border bg-card/90 p-3 pr-10 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.25)] fade-in", !open && "hidden")} role="region" aria-label="Filters">
        {children}
        <button type="button" onClick={onClose} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close filters">
          <X className="size-4" />
        </button>
      </div>
    </FilterCountContext.Provider>
  );
}

/** Self-contained filter icon + panel for places outside the page header (e.g. inside a tab). */
export function CollapsibleFilters({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton open={open} count={count} onClick={() => setOpen((o) => !o)} />
        {actions}
      </div>
      <FilterPanel open={open} onClose={() => setOpen(false)} onCount={setCount}>
        {children}
      </FilterPanel>
    </div>
  );
}
