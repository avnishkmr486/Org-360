"use client";

import Link from "next/link";
import { usePath } from "@/hooks/use-path";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandLockup } from "./brand";
import { useCurrentUser } from "@/hooks/use-data";
import { isActivePath, type NavItem } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { nav } = useCurrentUser();
  const pathname = usePath();
  return (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {nav.map((section) => (
        <div key={section.label} className="space-y-0.5">
          {!collapsed ? <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">{section.label}</div> : <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />}
          {section.items.map((item) => (
            <SidebarItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarItem({ item, collapsed, pathname, onNavigate }: { item: NavItem; collapsed: boolean; pathname: string; onNavigate?: () => void }) {
  const active = isActivePath(pathname, item.href, item.match) || (item.children ?? []).some((c) => isActivePath(pathname, c.href));
  const hasChildren = !collapsed && (item.children?.length ?? 0) > 1;
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
      aria-current={active ? "page" : undefined}
    >
      {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-sidebar-primary" aria-hidden /> : null}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-muted group-hover:text-sidebar-accent-foreground")} />
      {!collapsed ? <span className="truncate">{item.title}</span> : null}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          <div className="font-medium">{item.title}</div>
          {item.children && item.children.length > 1 ? (
            <div className="mt-1 space-y-0.5 opacity-80">
              {item.children.map((c) => (
                <div key={c.href}>{c.title}</div>
              ))}
            </div>
          ) : null}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!hasChildren) return link;

  return (
    <div>
      <div className="relative flex items-center">
        <div className="flex-1">{link}</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-1 flex size-7 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
          aria-label={`${open ? "Collapse" : "Expand"} ${item.title}`}
          aria-expanded={open}
        >
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>
      <div className={cn("grid transition-all duration-200 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-sidebar-border py-1 pl-3">
            {item.children!.map((c) => {
              const childActive = c.href === "/" ? pathname === "/" : pathname === c.href || (pathname.startsWith(c.href + "/") && !item.children!.some((o) => o.href !== c.href && o.href.startsWith(c.href) && pathname.startsWith(o.href)));
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  onClick={onNavigate}
                  className={cn(
                    "block truncate rounded-md px-2.5 py-1.5 text-[12.5px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white",
                    childActive && "bg-sidebar-accent font-medium text-white",
                  )}
                >
                  {c.title}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Collapsed to an icon rail by default. Hovering (or tabbing into) the menu opens it over the page;
 * clicking anywhere outside, choosing a page, or pressing Escape collapses it again.
 */
export function Sidebar() {
  const { user, role } = useCurrentUser();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const collapsed = !expanded;

  useEffect(() => {
    if (!expanded) return;
    const outside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setExpanded(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [expanded]);

  return (
    <aside
      ref={ref}
      onMouseEnter={() => setExpanded(true)}
      onFocus={() => setExpanded(true)}
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width,box-shadow] duration-200 ease-out lg:flex",
        collapsed ? "w-[72px]" : "w-[264px] shadow-2xl",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <Link href="/" aria-label="Organization 360 home">
          <BrandLockup collapsed={collapsed} inverted />
        </Link>
      </div>
      <SidebarNav collapsed={collapsed} onNavigate={() => setExpanded(false)} />
      {!collapsed ? (
        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-lg bg-sidebar-accent px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-sidebar-muted">Viewing as</div>
            <div className="truncate text-xs font-medium text-white">{user.name}</div>
            <div className="truncate text-[11px] text-sidebar-primary">{ROLE_LABELS[role]}</div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
