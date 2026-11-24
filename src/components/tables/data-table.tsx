"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/states";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  initialSort?: { id: string; dir: "asc" | "desc" };
  empty?: ReactNode;
  /** Rendered above the table when rows are selected. */
  bulkActions?: (ids: string[]) => ReactNode;
  className?: string;
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  selectable,
  selectedIds = [],
  onSelectedIdsChange,
  onRowClick,
  pageSize: initialPageSize = 20,
  initialSort,
  empty,
  bulkActions,
  className,
  dense,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" })) * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const selected = new Set(selectedIds);
  const pageIds = pageRows.map(getRowId);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  const toggleAllPage = () => {
    if (!onSelectedIdsChange) return;
    if (allPageSelected) onSelectedIdsChange(selectedIds.filter((id) => !pageIds.includes(id)));
    else onSelectedIdsChange([...new Set([...selectedIds, ...pageIds])]);
  };
  const toggle = (id: string) => {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const onSort = (id: string) => {
    setSort((s) => (!s || s.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null));
  };

  return (
    <div className={cn("card-elevated data-grid flex flex-col overflow-hidden", className)}>
      {selectable && selectedIds.length > 0 && bulkActions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-info-soft/60 px-4 py-2 text-sm">
          <span className="font-medium text-foreground">
            {selectedIds.length} selected
            <button className="ml-3 text-xs font-normal text-muted-foreground underline-offset-2 hover:underline" onClick={() => onSelectedIdsChange?.([])}>
              Clear selection
            </button>
          </span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(selectedIds)}</div>
        </div>
      ) : null}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {selectable ? (
                <th className="sticky top-0 z-[1] w-10 bg-muted px-4 py-2.5">
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAllPage}
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const active = sort?.id === c.id;
                const SortIcon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.id}
                    className={cn(
                      "sticky top-0 z-[1] whitespace-nowrap bg-muted px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.headerClassName,
                    )}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.sortValue ? (
                      <button className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")} onClick={() => onSort(c.id)}>
                        {c.header}
                        <SortIcon className={cn("size-3", !active && "opacity-40")} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const id = getRowId(row);
              const isSel = selected.has(id);
              return (
                <tr
                  key={id}
                  className={cn("group border-b last:border-0 transition-colors hover:bg-muted/40", isSel && "bg-info-soft/40", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable ? (
                    <td className="px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Select row ${id}`} checked={isSel} onCheckedChange={() => toggle(id)} />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(dense ? "px-4 py-2" : "px-4 py-3", "align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="p-6">{empty ?? <EmptyState title="No records found" description="Try adjusting your search or filters." />}</div> : null}
      </div>
      {rows.length > 0 ? (
        <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex-row">
          <span>
            Showing <span className="font-medium text-foreground">{page * pageSize + 1}</span>–
            <span className="font-medium text-foreground">{Math.min(sorted.length, (page + 1) * pageSize)}</span> of{" "}
            <span className="font-medium text-foreground">{sorted.length}</span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger size="sm" className="h-7 w-[68px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([10, 20, 50, 100, initialPageSize])].sort((a, b) => a - b).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-xs" onClick={() => setPage(0)} disabled={page === 0} aria-label="First page">
                <ChevronsLeft />
              </Button>
              <Button variant="outline" size="icon-xs" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-xs" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
                <ChevronRight />
              </Button>
              <Button variant="outline" size="icon-xs" onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1} aria-label="Last page">
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
