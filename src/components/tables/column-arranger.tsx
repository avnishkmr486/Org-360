"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Column } from "./data-table";

/**
 * Lets anyone reorder a grid's columns. It is a personal view setting, kept in this browser per grid and never changes
 * the data. `fixedLast` columns (e.g. row actions) always stay at the end.
 */
export function useColumnOrder<T>(storageKey: string, columns: Column<T>[], fixedLast: string[] = []) {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setSaved(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setSaved([]);
    }
  }, [storageKey]);

  const ordered = useMemo(() => {
    const movable = columns.filter((c) => !fixedLast.includes(c.id));
    const rank = (id: string) => {
      const i = saved.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    // Columns the user has placed come first in their order; new ones keep their natural order after them.
    const sorted = [...movable].sort((a, b) => rank(a.id) - rank(b.id) || movable.indexOf(a) - movable.indexOf(b));
    return [...sorted, ...columns.filter((c) => fixedLast.includes(c.id))];
  }, [columns, saved, fixedLast]);

  const persist = (ids: string[]) => {
    setSaved(ids);
    try {
      if (ids.length) window.localStorage.setItem(storageKey, JSON.stringify(ids));
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };
  const move = (id: string, delta: -1 | 1) => {
    const ids = ordered.filter((c) => !fixedLast.includes(c.id)).map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    persist(ids);
  };
  return { ordered, move, reset: () => persist([]), customised: saved.length > 0 };
}

export function ColumnArranger<T>({ columns, labels, move, reset, customised, fixedLast = [] }: { columns: Column<T>[]; labels: Record<string, string>; move: (id: string, d: -1 | 1) => void; reset: () => void; customised: boolean; fixedLast?: string[] }) {
  const list = columns.filter((c) => !fixedLast.includes(c.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Arrange columns" title="Arrange columns">
          <Columns3 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arrange columns</span>
          <Button variant="ghost" size="xs" onClick={reset} disabled={!customised}>
            <RotateCcw /> Reset
          </Button>
        </div>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {list.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1 truncate">{labels[c.id] ?? c.id}</span>
              <Button variant="ghost" size="icon-xs" aria-label={`Move ${labels[c.id] ?? c.id} left`} disabled={i === 0} onClick={() => move(c.id, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label={`Move ${labels[c.id] ?? c.id} right`} disabled={i === list.length - 1} onClick={() => move(c.id, 1)}>
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">Your own view only. Click a column heading to sort.</p>
      </PopoverContent>
    </Popover>
  );
}
