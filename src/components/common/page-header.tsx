"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FilterButton, FilterPanel } from "./filter-panel";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Primary/secondary action buttons (right side). */
  actions?: ReactNode;
  /** Filter row rendered under the title. */
  filters?: ReactNode;
  /** Small element next to the title (e.g. status badge). */
  titleAdornment?: ReactNode;
  /** Back button: shown by default on detail screens; a path sets the fallback, false hides it. */
  back?: boolean | string;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs = [], actions, filters, titleAdornment, back, className }: PageHeaderProps) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const router = useRouter();
  // Detail screens (more than one crumb) get a Back button; the parent crumb is the fallback when there is no history.
  const parent = [...breadcrumbs.slice(0, -1)].reverse().find((c) => c.href)?.href;
  const backTo = back === false ? null : typeof back === "string" ? back : parent ?? null;
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(backTo ?? "/");
  };
  return (
    <div className={cn("page-header mb-3 space-y-1.5", className)}>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <Link href="/" className="inline-flex items-center gap-1 rounded hover:text-foreground">
          <Home className="size-3.5" />
          <span className="sr-only">Home</span>
        </Link>
        {breadcrumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3 opacity-60" />
            {c.href && i < breadcrumbs.length - 1 ? (
              <Link href={c.href} className="hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span className={cn(i === breadcrumbs.length - 1 && "font-medium text-foreground")}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          {backTo !== null ? (
            <Button variant="outline" size="icon-sm" onClick={goBack} aria-label="Go back" title="Back" className="shrink-0">
              <ArrowLeft />
            </Button>
          ) : null}
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
              {titleAdornment}
            </div>
            {description ? (
              <p className="line-clamp-1 max-w-4xl text-xs text-muted-foreground" title={typeof description === "string" ? description : undefined}>
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions || filters ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {filters ? <FilterButton open={open} count={count} onClick={() => setOpen((o) => !o)} /> : null}
            {actions}
          </div>
        ) : null}
      </div>
      {filters ? (
        <FilterPanel open={open} onClose={() => setOpen(false)} onCount={setCount}>
          {filters}
        </FilterPanel>
      ) : null}
    </div>
  );
}
