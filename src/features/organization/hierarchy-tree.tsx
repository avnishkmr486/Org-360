"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building, Building2, ChevronRight, ChevronsDownUp, ChevronsUpDown, Crown, UserRound, UsersRound } from "lucide-react";
import type { Department, Employee, Team } from "@/types";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/filters";
import { ComplianceBar } from "@/components/common/compliance-indicator";
import { ToneBadge } from "@/components/common/badges";
import { UserAvatar } from "@/components/common/user-avatar";
import { useDatabase, useLookups } from "@/hooks/use-data";
import { cn } from "@/lib/utils";
import type { OrgAnalytics } from "./use-org-analytics";

interface Props {
  departments: Department[];
  teams: Team[];
  employees: Employee[];
  analytics: OrgAnalytics;
}

/** Organization → Department → Team → Employee, expandable. */
export function HierarchyTree({ departments, teams, employees, analytics }: Props) {
  const db = useDatabase();
  const { bandName } = useLookups();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["ORG", ...departments.slice(0, 2).map((d) => d.id)]));
  const q = query.trim().toLowerCase();

  const matches = (e: Employee) => !q || `${e.firstName} ${e.lastName} ${e.id} ${bandName(e.bandId)}`.toLowerCase().includes(q);

  // When searching, auto-expand every branch that contains a match.
  const searchOpen = useMemo(() => {
    if (!q) return null;
    const s = new Set<string>(["ORG"]);
    for (const e of employees) {
      if (!matches(e)) continue;
      s.add(e.departmentId);
      if (e.teamId) s.add(e.teamId);
      else s.add(`${e.departmentId}:lead`);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, employees]);

  const isOpen = (id: string) => (searchOpen ? searchOpen.has(id) : open.has(id));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const expandAll = () => setOpen(new Set(["ORG", ...departments.map((d) => d.id), ...teams.map((t) => t.id), ...departments.map((d) => `${d.id}:lead`)]));
  const collapseAll = () => setOpen(new Set(["ORG"]));

  const empRow = (e: Employee, tag?: { label: string; tone: "teal" | "info" | "warning" }) => (
    <Link key={e.id} href={`/employees/${e.id}`} className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <UserAvatar name={`${e.firstName} ${e.lastName}`} size="xs" />
      <div className="min-w-0 flex-1">
        <span className={cn("truncate text-sm", q && matches(e) && "font-semibold text-primary")}>
          {e.firstName} {e.lastName}
        </span>
        <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{bandName(e.bandId)}</span>
      </div>
      {tag ? <ToneBadge tone={tag.tone}>{tag.label}</ToneBadge> : null}
      {e.status !== "active" ? <ToneBadge tone="neutral">{e.status === "on_leave" ? "On leave" : "Inactive"}</ToneBadge> : null}
      <ComplianceBar value={analytics.empStats(e.id).compliance} className="hidden w-36 md:flex" />
    </Link>
  );

  const Node = ({ id, icon, title, sub, compliance, href, children, level }: { id: string; icon: React.ReactNode; title: string; sub?: string; compliance?: number | null; href?: string; children: React.ReactNode; level: number }) => (
    <div>
      <div className={cn("flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50", level === 0 && "bg-muted/40")}>
        <button onClick={() => toggle(id)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={`${isOpen(id) ? "Collapse" : "Expand"} ${title}`} aria-expanded={isOpen(id)}>
          <ChevronRight className={cn("size-4 transition-transform", isOpen(id) && "rotate-90")} />
        </button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="truncate text-sm font-semibold hover:text-primary hover:underline">
              {title}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold">{title}</span>
          )}
          {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
        </div>
        {compliance !== undefined ? <ComplianceBar value={compliance} className="hidden w-40 sm:flex" /> : null}
      </div>
      {isOpen(id) ? <div className="ml-5 border-l pl-3">{children}</div> : null}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Find a person in the hierarchy…" />
        <Button variant="outline" size="sm" onClick={expandAll} disabled={Boolean(q)}>
          <ChevronsUpDown /> Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll} disabled={Boolean(q)}>
          <ChevronsDownUp /> Collapse all
        </Button>
      </div>
      <div className="card-elevated p-3">
        <Node id="ORG" level={0} icon={<Building className="size-4" />} title={db.organization.name} sub={`${departments.length} departments · ${teams.length} teams · ${employees.filter((e) => e.status === "active").length} active employees`} compliance={analytics.org.compliance}>
          {departments.map((d) => {
            const head = d.headId ? db.employees.find((e) => e.id === d.headId) : undefined;
            const dTeams = teams.filter((t) => t.departmentId === d.id);
            const leads = employees.filter((e) => e.departmentId === d.id && !e.teamId && (!q || matches(e)));
            return (
              <Node key={d.id} id={d.id} level={1} icon={<Building2 className="size-4" />} title={d.name} href={`/departments/${d.id}`} sub={`Head: ${head ? `${head.firstName} ${head.lastName}` : "Unassigned"} · ${dTeams.length} team${dTeams.length === 1 ? "" : "s"}${d.status === "inactive" ? " · inactive" : ""}`} compliance={analytics.deptStats(d.id).compliance}>
                {leads.length ? (
                  <Node id={`${d.id}:lead`} level={2} icon={<Crown className="size-4" />} title="Department leadership" sub={`${leads.length} not assigned to a team`}>
                    {leads.map((e) => empRow(e, e.id === d.headId ? { label: "Dept Head", tone: "warning" } : undefined))}
                  </Node>
                ) : null}
                {dTeams.map((t) => {
                  const sup = t.supervisorId ? db.employees.find((e) => e.id === t.supervisorId) : undefined;
                  const members = employees.filter((e) => e.teamId === t.id && (!q || matches(e)));
                  return (
                    <Node key={t.id} id={t.id} level={2} icon={<UsersRound className="size-4" />} title={t.name} href={`/teams/${t.id}`} sub={`Supervisor: ${sup ? `${sup.firstName} ${sup.lastName}` : "Unassigned"} · ${employees.filter((e) => e.teamId === t.id).length} members`} compliance={analytics.teamStats(t.id).compliance}>
                      {members.length ? (
                        members.map((e) =>
                          empRow(e, e.id === t.supervisorId ? { label: "Supervisor", tone: "teal" } : e.id === t.projectManagerId ? { label: "Project Manager", tone: "info" } : undefined),
                        )
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                          <UserRound className="size-3.5" /> {q ? "No matching members" : "No members yet"}
                        </div>
                      )}
                    </Node>
                  );
                })}
                {!dTeams.length && !leads.length ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No teams or members.</div> : null}
              </Node>
            );
          })}
        </Node>
      </div>
    </div>
  );
}
