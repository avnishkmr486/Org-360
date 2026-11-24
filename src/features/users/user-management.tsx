"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, Info, KeyRound, MoreHorizontal, Pencil, Power, ShieldCheck, UserPlus, Minus } from "lucide-react";
import type { AppRole, AppUser } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { FilterSelect, ResetFiltersButton, SearchInput } from "@/components/common/filters";
import { RecordStatusBadge, ToneBadge } from "@/components/common/badges";
import { PersonCell } from "@/components/common/user-avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ExportMenu } from "@/components/common/export-menu";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { switchPersona, useCurrentUser, useDatabase, useLookups, useSignedInUser } from "@/hooks/use-data";
import { resetPassword, updateUser } from "@/lib/repositories";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { navForRole } from "@/lib/navigation";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPdf } from "@/lib/export/pdf";
import { formatDateTime, formatRelative } from "@/lib/utils/dates";
import type { Tone } from "@/lib/constants";
import { UserFormDialog } from "./user-form-dialog";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export const ROLE_TONE: Record<AppRole, Tone> = {
  super_admin: "danger",
  administrator: "warning",
  senior_management: "info",
  department_head: "teal",
  project_manager: "teal",
  team_supervisor: "success",
  employee: "neutral",
};

const PERMISSION_LABELS: Record<Permission, string> = {
  "employees.manage": "Manage employees",
  "employees.import": "Import employees",
  "organization.manage": "Manage departments & teams",
  "processes.manage": "Create & edit processes",
  "assignments.manage": "Assign processes",
  "tasks.review": "Review & approve submissions",
  "tasks.submit": "Submit own tasks",
  "masterdata.manage": "Manage master data",
  "users.manage": "Manage users",
  "settings.manage": "Manage settings",
  "reports.export": "Export reports",
  "audit.view": "View audit logs",
  "database.view": "View database structure",
  "menu.configure": "Configure side menu per role",
  "ecosystem.manage": "Manage products, clients, modules and their links",
  "ecosystem.delete_linked": "Delete ecosystem entries that other entries are linked to",
};

export function UserManagement() {
  const db = useDatabase();
  const lk = useLookups();
  const router = useRouter();
  const { can, user: me } = useCurrentUser();
  const signedIn = useSignedInUser();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toggling, setToggling] = useState<AppUser | null>(null);
  const manage = can("users.manage");

  const rows = useMemo(
    () =>
      db.users.filter((u) => {
        if (role && u.role !== role) return false;
        if (status && u.status !== status) return false;
        if (q && !`${u.name} ${u.email} ${u.id} ${lk.empName(u.employeeId)}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [db.users, role, status, q, lk],
  );

  const columns: Column<AppUser>[] = [
    { id: "name", header: "User", sortValue: (u) => u.name, cell: (u) => <PersonCell name={u.name} sub={u.email} /> },
    { id: "role", header: "Role", sortValue: (u) => ROLE_LABELS[u.role], cell: (u) => <ToneBadge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</ToneBadge> },
    {
      id: "employee",
      header: "Linked employee",
      sortValue: (u) => lk.empName(u.employeeId),
      cell: (u) =>
        u.employeeId ? (
          <div className="text-sm">
            <div>{lk.empName(u.employeeId)}</div>
            <div className="text-xs text-muted-foreground">
              {u.employeeId} · {lk.deptName(lk.employees.get(u.employeeId)?.departmentId)}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Not linked (organization-wide)</span>
        ),
    },
    { id: "status", header: "Status", sortValue: (u) => u.status, cell: (u) => <RecordStatusBadge status={u.status} /> },
    { id: "active", header: "Last active", sortValue: (u) => u.lastActiveAt, cell: (u) => <span className="text-xs text-muted-foreground" title={formatDateTime(u.lastActiveAt)}>{formatRelative(u.lastActiveAt)}</span> },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`} onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {signedIn?.role === "super_admin" ? (
            <DropdownMenuItem
              disabled={u.status === "inactive"}
              onSelect={() => {
                switchPersona(u.id);
                toast.success(`Now viewing as ${u.name}`, { description: ROLE_LABELS[u.role] });
                router.push("/");
              }}
            >
              <Eye /> View as this user
            </DropdownMenuItem>
            ) : null}
            {manage ? (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(u);
                    setFormOpen(true);
                  }}
                >
                  <Pencil /> Edit user
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    try {
                      await resetPassword(u.id);
                      toast.success("Password reset", { description: `${u.name} now signs in with the default password.` });
                    } catch (e) {
                      toast.error("Could not reset the password", { description: e instanceof Error ? e.message : undefined });
                    }
                  }}
                >
                  <KeyRound /> Reset password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={u.id === me.id} onSelect={() => setToggling(u)} className={u.status === "active" ? "text-destructive" : undefined}>
                  <Power /> {u.status === "active" ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const exportCols = [
    { header: "User ID", value: (u: AppUser) => u.id },
    { header: "Name", value: (u: AppUser) => u.name },
    { header: "Email", value: (u: AppUser) => u.email },
    { header: "Role", value: (u: AppUser) => ROLE_LABELS[u.role] },
    { header: "Linked employee", value: (u: AppUser) => (u.employeeId ? `${lk.empName(u.employeeId)} (${u.employeeId})` : "—") },
    { header: "Status", value: (u: AppUser) => u.status },
    { header: "Last active", value: (u: AppUser) => formatDateTime(u.lastActiveAt) },
  ];

  const activeFilters = [role, status].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "User Management" }]}
        title="User Management"
        description="Application users, their access roles and the employee record that scopes their data."
        actions={
          <>
            <ExportMenu
              onExcel={() => exportToExcel({ organizationName: db.organization.name, title: "Application Users", fileName: "Altametrics_Users", columns: exportCols, rows, footer: db.settings.reportFooter })}
              onPdf={() => exportToPdf({ organizationName: db.organization.name, title: "Application Users", fileName: "Altametrics_Users", columns: exportCols, rows, footer: db.settings.reportFooter })}
            />
            {manage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <UserPlus /> Add user
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-soft/50 px-4 py-3 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <span>
          Roles in this phase are a <strong>frontend simulation</strong> driven by the demo role switcher. They change navigation, dashboards, visible data and available actions, but are not a security boundary. Real authentication and row-level security arrive with the Supabase integration.
        </span>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users ({db.users.length})</TabsTrigger>
          <TabsTrigger value="permissions">Roles & permissions</TabsTrigger>
          <TabsTrigger value="navigation">Navigation by role</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, email, employee…" />
            <FilterSelect label="Role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            <ResetFiltersButton
              count={activeFilters}
              onClick={() => {
                setRole("");
                setStatus("");
              }}
            />
          </div>
          <DataTable columns={columns} rows={rows} getRowId={(u) => u.id} initialSort={{ id: "name", dir: "asc" }} />
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <ShieldCheck className="size-4 text-teal" />
              <h3 className="text-sm font-semibold">Roles &amp; permissions matrix</h3>
            </div>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Permission</th>
                    {ROLES.map((r) => (
                      <th key={r} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {ROLE_LABELS[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(PERMISSION_LABELS) as Permission[]).map((p) => (
                    <tr key={p} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{PERMISSION_LABELS[p]}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{p}</div>
                      </td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-3 py-2.5 text-center">
                          {ROLE_PERMISSIONS[r].includes(p) ? (
                            <span className="inline-flex size-6 items-center justify-center rounded-full bg-success-soft text-success" aria-label="Allowed">
                              <Check className="size-3.5" />
                            </span>
                          ) : (
                            <Minus className="mx-auto size-3.5 text-muted-foreground/50" aria-label="Not allowed" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r} className="card-elevated p-4">
                <ToneBadge tone={ROLE_TONE[r]}>{ROLE_LABELS[r]}</ToneBadge>
                <p className="mt-2 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
                <p className="mt-2 text-xs">
                  <span className="font-semibold tabular-nums">{db.users.filter((u) => u.role === r).length}</span> user(s) · <span className="font-semibold tabular-nums">{ROLE_PERMISSIONS[r].length}</span> permissions
                </p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="navigation" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ROLES.map((r) => {
              const nav = navForRole(r, db.settings.menuHidden?.[r]);
              return (
                <div key={r} className="card-elevated p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <ToneBadge tone={ROLE_TONE[r]}>{ROLE_LABELS[r]}</ToneBadge>
                    <span className="text-xs text-muted-foreground">{nav.reduce((s, x) => s + x.items.length, 0)} modules</span>
                  </div>
                  <div className="space-y-2">
                    {nav.map((s) => (
                      <div key={s.label}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.items.map((i) => (
                            <span key={i.href} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px]">
                              <i.icon className="size-3" /> {i.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.status === "active" ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={toggling?.status === "active" ? "The user will no longer be able to sign in. Their audit history is kept." : "The user will regain access with their current role."}
        confirmLabel={toggling?.status === "active" ? "Deactivate" : "Activate"}
        destructive={toggling?.status === "active"}
        onConfirm={async () => {
          if (!toggling) return;
          try {
            await updateUser(toggling.id, { status: toggling.status === "active" ? "inactive" : "active" });
            toast.success(`User ${toggling.status === "active" ? "deactivated" : "activated"}`, { description: toggling.name });
          } catch (e) {
            toast.error("Could not update user", { description: e instanceof Error ? e.message : undefined });
          }
        }}
      />
    </div>
  );
}
