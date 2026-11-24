"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, RotateCcw, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useReportFilterCount } from "./filter-panel";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/** Compact select for filter bars. Empty string = "All". */
/** Filter options are always listed A→Z by label (numbers in natural order). */
const byLabel = (options: Option[]): Option[] => [...options].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" }));

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)} disabled={disabled}>
      <SelectTrigger size="sm" className={cn("h-8 min-w-[140px] max-w-[220px] bg-card text-xs", value && "border-primary/40 bg-info-soft/40", className)} aria-label={label}>
        <span className="mr-1 shrink-0 text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel ?? `All`}</SelectItem>
        {byLabel(options).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 bg-card pl-8 pr-7 text-xs" aria-label={placeholder} />
      {value ? (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => onChange("")} aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function ResetFiltersButton({ count, onClick }: { count: number; onClick: () => void }) {
  useReportFilterCount(count);
  if (!count) return null;
  return (
    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onClick}>
      <RotateCcw className="size-3.5" /> Reset {count > 1 ? `${count} filters` : "filter"}
    </Button>
  );
}

/** Searchable single-select (combobox) — for long lists like employees. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  className,
  allowClear = true,
  disabled,
  ariaInvalid,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
  ariaInvalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-invalid={ariaInvalid} disabled={disabled} className={cn("h-9 w-full justify-between font-normal", !selected && "text-muted-foreground", className)}>
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <X className="size-3.5" /> Clear selection
                </CommandItem>
              ) : null}
              {byLabel(options).map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint ? <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable multi-select with chips. */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const set = new Set(values);
  const toggle = (v: string) => onChange(set.has(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="h-9 w-full justify-between font-normal text-muted-foreground">
            <span className="truncate">{values.length ? `${values.length} selected` : placeholder}</span>
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {options.length > 1 ? (
                  <CommandItem value="__all__" onSelect={() => onChange(values.length === options.length ? [] : options.map((o) => o.value))} className="text-xs text-muted-foreground">
                    {values.length === options.length ? "Clear all" : `Select all (${options.length})`}
                  </CommandItem>
                ) : null}
                {byLabel(options).map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ""} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <span className={cn("flex size-4 items-center justify-center rounded-[4px] border", set.has(o.value) && "border-primary bg-primary text-primary-foreground")}>
                      {set.has(o.value) ? <Check className="size-3" /> : null}
                    </span>
                    <span className="truncate">{o.label}</span>
                    {o.hint ? <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {values.length ? (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {values.map((v) => {
            const o = options.find((x) => x.value === v);
            return (
              <span key={v} className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px]">
                {o?.label ?? v}
                <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${o?.label ?? v}`} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
