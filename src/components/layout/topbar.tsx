"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bell,
  Building,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Laptop,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  RefreshCcw,
  Search,
  Settings,
  Sun,
  User,
  UserRoundCog,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { UserAvatar } from "@/components/common/user-avatar";
import { ToneBadge } from "@/components/common/badges";
import { BrandLockup } from "./brand";
import { SidebarNav } from "./sidebar";
import { switchPersona, useCurrentUser, useDatabase, useGlobalDateRange, useSignedInUser } from "@/hooks/use-data";
import { ChangePasswordDialog } from "@/features/auth/change-password-dialog";
import { signOut } from "@/lib/repositories";
import { inScope, ROLE_LABELS } from "@/lib/auth/permissions";
import { DEMO_PERSONA_USER_IDS } from "@/lib/mock-data/users";
import { markAllNotificationsRead, markNotificationRead, notificationsFor, resetDemoData } from "@/lib/repositories";
import { DATE_PRESET_LABELS, formatRange, formatRelative, type DatePreset } from "@/lib/utils/dates";
import { NOTIFICATION_TYPE_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Topbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <BrandLockup inverted />
          </SheetHeader>
          <div className="flex h-[calc(100%-4rem)] flex-col">
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <OrgSelector />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        <DateRangePicker />
        <RoleSwitcher />
        <NotificationsBell />
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}

function OrgSelector() {
  const { organization } = useDatabase();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="hidden h-9 gap-2 px-2 md:inline-flex">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Building className="size-3.5" />
          </span>
          <span className="max-w-[160px] truncate text-sm font-medium">{organization.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
        <DropdownMenuItem>
          <Building className="text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{organization.name}</div>
            <div className="truncate text-xs text-muted-foreground">{organization.industry}</div>
          </div>
          <Check className="text-primary" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/organization")}>
          <Building2 /> Organization overview
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings /> Organization profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const db = useDatabase();
  const { nav, scope } = useCurrentUser();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pages = useMemo(() => nav.flatMap((s) => s.items.flatMap((i) => [{ title: i.title, href: i.href }, ...(i.children ?? []).filter((c) => c.href !== i.href).map((c) => ({ title: `${i.title} › ${c.title}`, href: c.href }))])), [nav]);
  const employees = db.employees.filter((e) => inScope(e, scope));
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-[380px] items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/30 hover:text-foreground"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="hidden truncate sm:inline">Search employees, processes, teams…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Global search" description="Search across Organization 360">
        <CommandInput placeholder="Type to search employees, departments, teams, processes, pages…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem key={p.href + p.title} value={`page ${p.title}`} onSelect={() => go(p.href)}>
                <FileText /> {p.title}
              </CommandItem>
            ))}
          </CommandGroup>
          {employees.length ? (
            <CommandGroup heading="Employees">
              {employees.map((e) => (
                <CommandItem key={e.id} value={`employee ${e.firstName} ${e.lastName} ${e.id} ${e.email}`} onSelect={() => go(`/employees/${e.id}`)}>
                  <User /> {e.firstName} {e.lastName}
                  <span className="ml-auto text-xs text-muted-foreground">{e.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Departments">
            {db.departments
              .filter((d) => !scope.departmentIds || scope.departmentIds.includes(d.id))
              .map((d) => (
                <CommandItem key={d.id} value={`department ${d.name} ${d.code}`} onSelect={() => go(`/departments/${d.id}`)}>
                  <Building2 /> {d.name}
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandGroup heading="Teams">
            {db.teams
              .filter((t) => (!scope.teamIds || scope.teamIds.includes(t.id)) && (!scope.departmentIds || scope.departmentIds.includes(t.departmentId)))
              .map((t) => (
                <CommandItem key={t.id} value={`team ${t.name}`} onSelect={() => go(`/teams/${t.id}`)}>
                  <UsersRound /> {t.name}
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandGroup heading="Processes">
            {db.processes.map((p) => (
              <CommandItem key={p.id} value={`process ${p.name} ${p.id}`} onSelect={() => go(`/processes/${p.id}`)}>
                <Workflow /> {p.name}
                <span className="ml-auto text-xs text-muted-foreground">{p.id}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

const PRESETS: DatePreset[] = ["last_7", "last_30", "this_month", "last_month", "last_90", "this_quarter", "last_6m", "ytd"];

function DateRangePicker() {
  const { preset, range, setPreset } = useGlobalDateRange();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => {
    if (open) {
      setFrom(range.from);
      setTo(range.to);
    }
  }, [open, range]);
  const invalid = !from || !to || from > to;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 bg-card" aria-label="Select date range">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="hidden text-xs xl:inline">{DATE_PRESET_LABELS[preset]}</span>
          <span className="hidden text-xs text-muted-foreground 2xl:inline">· {formatRange(range)}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Reporting period</div>
        <div className="p-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setPreset(p);
                setOpen(false);
              }}
              className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm hover:bg-accent", preset === p && "font-semibold")}
            >
              {DATE_PRESET_LABELS[p]}
              {preset === p ? <Check className="size-4 text-primary" /> : null}
            </button>
          ))}
        </div>
        <div className="space-y-2 border-t p-3">
          <div className="text-xs font-medium text-muted-foreground">Custom range</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-[11px]">
                From
              </Label>
              <Input id="range-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-[11px]">
                To
              </Label>
              <Input id="range-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={invalid}
            onClick={() => {
              setPreset("custom", { from, to });
              setOpen(false);
            }}
          >
            Apply custom range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RoleSwitcher() {
  const db = useDatabase();
  const { user } = useCurrentUser();
  const signedIn = useSignedInUser();
  const router = useRouter();
  // "View as" is a Super Admin tool; everyone else only ever sees their own role.
  if (signedIn?.role !== "super_admin") return null;
  const personas = DEMO_PERSONA_USER_IDS.map((id) => db.users.find((u) => u.id === id)).filter(Boolean) as typeof db.users;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 border-teal/30 bg-teal-soft/60 text-teal hover:bg-teal-soft" aria-label="Switch demo role">
          <UserRoundCog className="size-4" />
          <span className="hidden text-xs font-medium md:inline">{ROLE_LABELS[user.role]}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <div className="text-xs font-semibold">View as another user</div>
          <div className="text-[11px] font-normal text-muted-foreground">Frontend simulation only — not real security.</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {personas.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => {
              switchPersona(p.id);
              toast.success(`Now viewing as ${ROLE_LABELS[p.role]}`, { description: p.name });
              router.push("/");
            }}
            className="gap-2.5"
          >
            <UserAvatar name={p.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{ROLE_LABELS[p.role]}</div>
              <div className="truncate text-xs text-muted-foreground">{p.name}</div>
            </div>
            {user.id === p.id ? <Check className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsBell() {
  const db = useDatabase();
  const { role, employee } = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = notificationsFor(db, role, employee?.id ?? null);
  const unread = items.filter((n) => !n.read);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread.length} unread`}>
          <Bell />
          {unread.length ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-xs text-muted-foreground">{unread.length} unread</div>
          </div>
          <Button variant="ghost" size="xs" disabled={!unread.length} onClick={() => markAllNotificationsRead(unread.map((n) => n.id))}>
            Mark all as read
          </Button>
        </div>
        <div className="scrollbar-thin max-h-[380px] overflow-y-auto">
          {items.slice(0, 8).map((n) => (
            <button
              key={n.id}
              onClick={() => {
                markNotificationRead(n.id);
                setOpen(false);
                router.push(n.link);
              }}
              className={cn("flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/50", !n.read && "bg-info-soft/30")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-info")} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                <ToneBadge tone={NOTIFICATION_TYPE_META[n.type].tone}>{NOTIFICATION_TYPE_META[n.type].label}</ToneBadge>
              </div>
            </button>
          ))}
          {!items.length ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div> : null}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Laptop],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon /> {label}
            {theme === value ? <Check className="ml-auto text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  const { user, role, employee, can } = useCurrentUser();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const signedIn = useSignedInUser();
  return (
    <>
      {signedIn ? <ChangePasswordDialog userId={signedIn.id} open={changingPw} onOpenChange={setChangingPw} /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="User menu">
            <UserAvatar name={user.name} size="md" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
            <div className="mt-1 text-[11px] font-medium text-teal">{ROLE_LABELS[role]}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {employee ? (
            <DropdownMenuItem onSelect={() => router.push(role === "employee" ? "/dashboards/my" : `/employees/${employee.id}`)}>
              <User /> My profile
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => router.push("/dashboards/my")}>
            <Users /> My dashboard
          </DropdownMenuItem>
          {can("settings.manage") ? (
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              <Settings /> Settings
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChangingPw(true)}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          {signedIn?.role === "super_admin" ? (
            <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
              <RefreshCcw /> Reset demo data
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              signOut();
              toast.info("Signed out");
              router.replace("/login");
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="All changes made in this browser (employees, processes, submissions, approvals, settings) will be discarded and the original sample data restored."
        confirmLabel="Reset data"
        destructive
        onConfirm={async () => {
          await resetDemoData();
          toast.success("Demo data restored");
        }}
      />
    </>
  );
}
