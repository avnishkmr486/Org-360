import {
  BarChart3,
  Bell,
  Building2,
  Database as DatabaseIcon,
  HardDrive,
  LayoutDashboard,
  LifeBuoy,
  Network,
  ScrollText,
  Settings,
  Share2,
  ShieldCheck,
  TrendingUp,
  UserCog,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/types";
import { can } from "@/lib/auth/permissions";

export interface NavChild {
  title: string;
  href: string;
  roles?: AppRole[];
}

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles: AppRole[];
  children?: NavChild[];
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const EVERYONE: AppRole[] = ["super_admin", "senior_management", "department_head", "project_manager", "team_supervisor", "employee", "administrator"];
const MANAGERS: AppRole[] = ["super_admin", "senior_management", "department_head", "project_manager", "team_supervisor", "administrator"];
const LEADERSHIP: AppRole[] = ["super_admin", "senior_management", "department_head", "administrator"];
const ADMINS: AppRole[] = ["super_admin", "administrator"];
const SUPER_ONLY: AppRole[] = ["super_admin"];

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Executive Dashboard",
        href: "/",
        icon: LayoutDashboard,
        roles: EVERYONE,
        match: ["/dashboards"],
        children: [
          { title: "Executive Overview", href: "/", roles: ["super_admin", "senior_management", "administrator"] },
          { title: "Department Dashboard", href: "/dashboards/department", roles: LEADERSHIP },
          { title: "Team Dashboard", href: "/dashboards/team", roles: MANAGERS },
          { title: "My Dashboard", href: "/dashboards/my", roles: EVERYONE },
        ],
      },
    ],
  },
  {
    label: "Process & Compliance",
    items: [
      {
        title: "Process Management",
        href: "/processes",
        icon: Workflow,
        roles: EVERYONE,
        children: [
          { title: "Processes & Assignments", href: "/processes" },
        ],
      },
      {
        title: "Compliance Tracking",
        href: "/compliance",
        icon: ShieldCheck,
        roles: EVERYONE,
        children: [
          { title: "Task Tracker", href: "/compliance" },
          { title: "Review Queue", href: "/compliance/approvals", roles: ["super_admin", "senior_management", "department_head", "project_manager", "team_supervisor"] },
        ],
      },
      { title: "Employee Performance", href: "/performance", icon: TrendingUp, roles: EVERYONE },
      { title: "Reports & Analytics", href: "/reports", icon: BarChart3, roles: MANAGERS },
    ],
  },
  {
    label: "Organization",
    items: [
      { title: "Organization Management", href: "/organization", icon: Network, roles: LEADERSHIP },
      { title: "Department Management", href: "/departments", icon: Building2, roles: LEADERSHIP },
      { title: "Team Management", href: "/teams", icon: UsersRound, roles: MANAGERS },
    ],
  },
  {
    label: "Business",
    items: [{ title: "Ecosystem", href: "/ecosystem", icon: Share2, roles: MANAGERS }],
  },
  {
    label: "Support",
    items: [{ title: "Support Tickets", href: "/support-tickets", icon: LifeBuoy, roles: MANAGERS }],
  },
  {
    label: "Administration",
    items: [
      { title: "Notifications", href: "/notifications", icon: Bell, roles: EVERYONE },
      { title: "User Management", href: "/users", icon: UserCog, roles: ADMINS },
      {
        title: "Master Data",
        href: "/master-data",
        icon: DatabaseIcon,
        // Employee records live here for everyone who manages people; the reference-data
        // sections below are Super Admin only (also enforced for /master-data in canAccessPath).
        roles: MANAGERS,
        match: ["/employees"],
        children: [
          { title: "Employee Directory", href: "/employees" },
          { title: "Import Employees", href: "/employees/import", roles: ADMINS },
          { title: "Departments", href: "/master-data/departments", roles: SUPER_ONLY },
          { title: "Teams", href: "/master-data/teams", roles: SUPER_ONLY },
          { title: "Employee Bands", href: "/master-data/bands", roles: SUPER_ONLY },
          { title: "Designations", href: "/master-data/designations", roles: SUPER_ONLY },
          { title: "Process Categories", href: "/master-data/categories", roles: SUPER_ONLY },
          { title: "Process Frequencies", href: "/master-data/frequencies", roles: SUPER_ONLY },
        ],
      },
      { title: "Database Structure", href: "/database", icon: HardDrive, roles: SUPER_ONLY },
      { title: "Audit Logs", href: "/audit-logs", icon: ScrollText, roles: ["super_admin", "senior_management", "administrator"] },
      { title: "Settings", href: "/settings", icon: Settings, roles: ["super_admin", "senior_management", "administrator"] },
    ],
  },
];

const EXECUTIVE_ROLES: AppRole[] = ["super_admin", "senior_management", "administrator"];

/** Key used to hide a menu entry: the item's href, or "parent>child" for a sub-item (hrefs repeat across parents). */
export const navKey = (item: Pick<NavItem, "href">, child?: Pick<NavChild, "href">) => (child ? `${item.href}>${child.href}` : item.href);

/** Menu entries that must stay visible so a Super Admin can never lock themselves out of configuring the menu. */
export const isMenuLocked = (role: AppRole, key: string) => role === "super_admin" && (key === "/settings");

/**
 * Side menu for a role: what the role may open, minus anything a Super Admin has
 * hidden for it in Settings → Menu Configuration (`hidden` = that role's hidden keys).
 * Hiding only changes the menu; it never grants access to anything.
 */
export function navForRole(role: AppRole, hidden: readonly string[] = []): NavSection[] {
  const off = new Set(hidden);
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items
      .filter((i) => i.roles.includes(role) && (!off.has(navKey(i)) || isMenuLocked(role, navKey(i))))
      .map((i) => ({
        ...i,
        // Non-executive roles land on their own dashboard, so don't label it "Executive".
        title: i.href === "/" && !EXECUTIVE_ROLES.includes(role) ? "Dashboards" : i.title,
        children: i.children?.filter((c) => (!c.roles || c.roles.includes(role)) && !off.has(navKey(i, c))),
      }))
      // Master Data's overview is Super Admin only; everyone else enters at their first section.
      .map((i) => (i.href === "/master-data" && role !== "super_admin" && i.children?.length ? { ...i, href: i.children[0].href } : i)),
  })).filter((s) => s.items.length);
}

/** Is a route accessible to a role? Used to guard direct URL access in the demo. */
export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/dashboards/my")) return true;
  // Creating and editing processes has no menu entry of its own any more; keep it permission-gated.
  if (pathname === "/processes/new" || /^\/processes\/[^/]+\/edit$/.test(pathname)) return can(role, "processes.manage");
  // Reference data (departments, teams, bands, categories, frequencies) is Super Admin only.
  if (pathname === "/master-data" || pathname.startsWith("/master-data/")) return role === "super_admin";
  // The most specific (longest) matching route decides, so "/processes/import" is
  // governed by its own entry and not by its parent "/processes".
  const matches = (href: string) => href !== "/" && (pathname === href || pathname.startsWith(href + "/"));
  let best: { len: number; allowed: boolean } | null = null;
  const consider = (href: string, allowed: boolean) => {
    if (matches(href) && (!best || href.length > best.len)) best = { len: href.length, allowed };
  };
  for (const s of NAV_SECTIONS) {
    for (const item of s.items) {
      const itemAllowed = item.roles.includes(role);
      for (const p of [item.href, ...(item.match ?? [])]) consider(p, itemAllowed);
      for (const child of item.children ?? []) consider(child.href, itemAllowed && (!child.roles || child.roles.includes(role)));
    }
  }
  return best ? (best as { allowed: boolean }).allowed : true;
}

export function isActivePath(pathname: string, href: string, match: string[] = []): boolean {
  if (href === "/") return pathname === "/" || match.some((m) => pathname.startsWith(m));
  return pathname === href || pathname.startsWith(href + "/") || match.some((m) => pathname.startsWith(m));
}
