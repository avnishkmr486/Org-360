"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import {
  PanelLeft,
  AlertTriangle,
  Bell,
  Building,
  CalendarCog,
  Check,
  Database as DatabaseIcon,
  LayoutDashboard,
  Gauge,
  ImageIcon,
  Laptop,
  Loader2,
  Lock,
  Moon,
  Palette,
  RefreshCcw,
  Sun,
  SunMoon,
  Upload,
  Workflow,
} from "lucide-react";
import type { AppSettings, Frequency, NotificationType } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser, useDatabase } from "@/hooks/use-data";
import { resetDemoData, updateOrganization, updateSettings } from "@/lib/repositories";
import { FREQUENCY_LABELS, NOTIFICATION_TYPE_META, TIER_META } from "@/lib/constants";
import { DataManagementPanel } from "./data-management-section";
import { MenuConfigPanel } from "./menu-config-section";
import { KpiMasterPanel } from "./kpi-master-section";
import { DashboardKpisPanel } from "./dashboard-kpis-section";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const DEFAULT_LOGO = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/altametrics-icon.svg`;
const MAX_LOGO_BYTES = 200 * 1024;

const SECTIONS = [
  { id: "profile", label: "Organization Profile", icon: Building },
  { id: "logo", label: "Organization Logo", icon: ImageIcon },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "thresholds", label: "Compliance Thresholds", icon: Gauge },
  { id: "process", label: "Process Configuration", icon: Workflow },
  { id: "regional", label: "Date & Time Zone", icon: CalendarCog },
  { id: "theme", label: "Theme", icon: SunMoon },
  { id: "notifications", label: "Notification Preferences", icon: Bell },
  { id: "menu", label: "Menu Configuration", icon: PanelLeft },
  { id: "dashkpis", label: "Dashboard KPIs", icon: LayoutDashboard },
  { id: "kpis", label: "KPI Master", icon: Gauge },
  { id: "data", label: "Data Management", icon: DatabaseIcon },
  { id: "danger", label: "Demo Data", icon: RefreshCcw },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const fail = (title: string) => (e: unknown) => toast.error(title, { description: e instanceof Error ? e.message : undefined });

export function SettingsPage() {
  const { can } = useCurrentUser();
  const readOnly = !can("settings.manage");
  const sections = SECTIONS.filter((s) => (s.id !== "menu" || can("menu.configure")) && ((s.id !== "kpis" && s.id !== "dashkpis") || can("processes.configure_kpis")));
  const [section, setSection] = useState<SectionId>("profile");

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Settings" }]}
        title="Settings"
        description="Organization profile, branding, compliance rules, process defaults, regional formats, theme and notification preferences."
      />
      {readOnly ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm">
          <Lock className="size-4 text-warning" />
          You can view settings but only Super Admins and Administrators can change organization-wide configuration. Theme choice still applies to your own view.
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:h-fit lg:flex-col lg:overflow-visible" aria-label="Settings sections">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                section === s.id ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground",
              )}
            >
              <s.icon className="size-4" /> {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === "profile" ? <ProfileSection readOnly={readOnly} /> : null}
          {section === "logo" ? <LogoSection readOnly={readOnly} /> : null}
          {section === "branding" ? <BrandingSection readOnly={readOnly} /> : null}
          {section === "thresholds" ? <ThresholdsSection readOnly={readOnly} /> : null}
          {section === "process" ? <ProcessSection readOnly={readOnly} /> : null}
          {section === "regional" ? <RegionalSection readOnly={readOnly} /> : null}
          {section === "theme" ? <ThemeSection readOnly={readOnly} /> : null}
          {section === "notifications" ? <NotificationSection readOnly={readOnly} /> : null}
          {section === "menu" && can("menu.configure") ? <MenuConfigPanel /> : null}
          {section === "dashkpis" && can("processes.configure_kpis") ? <DashboardKpisPanel /> : null}
          {section === "kpis" && can("processes.configure_kpis") ? <KpiMasterPanel /> : null}
          {section === "data" ? <DataManagementPanel readOnly={readOnly} /> : null}
          {section === "danger" ? <DangerSection readOnly={readOnly} /> : null}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card-elevated fade-in">
      <header className="border-b px-6 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="px-6 py-5">{children}</div>
      {footer ? <footer className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">{footer}</footer> : null}
    </section>
  );
}

function SaveButton({ saving, disabled, form }: { saving: boolean; disabled?: boolean; form?: string }) {
  return (
    <Button type="submit" form={form} size="sm" disabled={saving || disabled}>
      {saving ? <Loader2 className="animate-spin" /> : <Check />} Save changes
    </Button>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}

/* ------------------------------ Profile ------------------------------ */

const profileSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required"),
  shortName: z.string().trim().min(2, "Short name is required").max(30),
  industry: z.string().trim().min(2, "Industry is required"),
  description: z.string().trim().max(600, "Keep the description under 600 characters"),
  website: z.string().trim().url("Enter a valid URL (https://…)"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().min(6, "Enter a valid phone number"),
  address: z.string().trim().min(2, "Address is required"),
});

function ProfileSection({ readOnly }: { readOnly: boolean }) {
  const { organization } = useDatabase();
  const [saving, setSaving] = useState(false);
  const form = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: organization });
  const { register, handleSubmit, formState, reset } = form;
  useEffect(() => reset(organization), [organization, reset]);
  const e = formState.errors;

  const onSubmit = async (v: z.infer<typeof profileSchema>) => {
    setSaving(true);
    try {
      await updateOrganization(v);
      toast.success("Organization profile saved");
    } catch (err) {
      fail("Could not save profile")(err);
    } finally {
      setSaving(false);
    }
  };

  const fields: [keyof z.infer<typeof profileSchema>, string][] = [
    ["name", "Organization name"],
    ["shortName", "Short name"],
    ["industry", "Industry"],
    ["website", "Website"],
    ["email", "Contact email"],
    ["phone", "Phone"],
    ["address", "Address"],
  ];

  return (
    <Panel title="Organization Profile" description="Used in dashboard headers, reports and Excel/PDF exports." footer={!readOnly ? <SaveButton saving={saving} form="profile-form" disabled={!formState.isDirty} /> : null}>
      <form id="profile-form" onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          {fields.map(([k, label]) => (
            <div key={k} className={cn("space-y-1.5", k === "address" && "sm:col-span-2")}>
              <Label htmlFor={`org-${k}`}>{label}</Label>
              <Input id={`org-${k}`} {...register(k)} aria-invalid={!!e[k]} />
              <FieldError msg={e[k]?.message} />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="org-description">Description</Label>
            <Textarea id="org-description" rows={4} {...register("description")} aria-invalid={!!e.description} />
            <FieldError msg={e.description?.message} />
          </div>
        </fieldset>
      </form>
    </Panel>
  );
}

/* -------------------------------- Logo ------------------------------- */

function LogoSection({ readOnly }: { readOnly: boolean }) {
  const { organization } = useDatabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) {
      setError("Unsupported file type. Use PNG, JPG, SVG or WebP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`File is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_LOGO_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Could not read the file."));
        r.readAsDataURL(file);
      });
      await updateOrganization({ logoUrl: dataUrl });
      toast.success("Logo updated", { description: file.name });
    } catch (err) {
      fail("Could not update logo")(err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const isDefault = organization.logoUrl === DEFAULT_LOGO;
  return (
    <Panel title="Organization Logo" description="Shown in the sidebar, browser tab and report headers. The current mark is a replaceable asset.">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex gap-4">
          <div className="flex size-28 items-center justify-center rounded-2xl border bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={organization.logoUrl} alt="Current organization logo" className="max-h-20 max-w-20 object-contain" />
          </div>
          <div className="flex size-28 items-center justify-center rounded-2xl bg-sidebar shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={organization.logoUrl} alt="" className="size-12 rounded-lg bg-white object-contain p-1.5" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-sm">
            <div className="font-medium">{isDefault ? "Default brand mark" : "Custom uploaded logo"}</div>
            <div className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP · up to {formatBytes(MAX_LOGO_BYTES)} · square works best</div>
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(ev) => onFile(ev.target.files?.[0])} aria-label="Upload logo file" />
              <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload new logo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isDefault || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await updateOrganization({ logoUrl: DEFAULT_LOGO });
                    toast.success("Logo reset to default");
                  } catch (err) {
                    fail("Could not reset logo")(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCcw /> Reset to default
              </Button>
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------ Branding ----------------------------- */

const ACCENTS: { id: AppSettings["brandAccent"]; label: string; color: string }[] = [
  { id: "teal", label: "Teal", color: "#0d9488" },
  { id: "blue", label: "Professional Blue", color: "#2563eb" },
  { id: "navy", label: "Deep Navy", color: "#0b2454" },
];

function BrandingSection({ readOnly }: { readOnly: boolean }) {
  const db = useDatabase();
  const [accent, setAccent] = useState(db.settings.brandAccent);
  const [footer, setFooter] = useState(db.settings.reportFooter);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAccent(db.settings.brandAccent);
    setFooter(db.settings.reportFooter);
  }, [db.settings.brandAccent, db.settings.reportFooter]);
  const dirty = accent !== db.settings.brandAccent || footer !== db.settings.reportFooter;
  const accentColor = ACCENTS.find((a) => a.id === accent)!.color;

  const save = async () => {
    if (footer.trim().length > 160) {
      toast.error("Report footer must be under 160 characters");
      return;
    }
    setSaving(true);
    try {
      await updateSettings({ brandAccent: accent, reportFooter: footer.trim() }, "Branding settings updated.");
      toast.success("Branding saved");
    } catch (err) {
      fail("Could not save branding")(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="Branding Settings"
      description="Report accent and footer used in branded Excel and PDF exports."
      footer={
        !readOnly ? (
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save changes
          </Button>
        ) : null
      }
    >
      <fieldset disabled={readOnly} className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Report accent</Label>
            <div className="grid grid-cols-3 gap-2">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" onClick={() => setAccent(a.id)} className={cn("flex flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors hover:bg-muted", accent === a.id && "border-primary ring-2 ring-primary/30")}>
                  <span className="size-6 rounded-full" style={{ background: a.color }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-footer">Report footer</Label>
            <Textarea id="report-footer" rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={200} />
            <p className={cn("text-xs", footer.length > 160 ? "text-destructive" : "text-muted-foreground")}>{footer.length}/160 characters</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="overflow-hidden rounded-lg border bg-white text-slate-800 shadow-sm">
            <div className="flex items-center justify-between bg-[#0b2454] px-4 py-3 text-white">
              <div>
                <div className="text-sm font-semibold">{db.organization.name}</div>
                <div className="text-[10px] opacity-80">Organization 360 · Process. Performance. Accountability.</div>
              </div>
              <div className="text-[10px] opacity-80">{format(new Date(), "dd MMM yyyy")}</div>
            </div>
            <div className="h-1" style={{ background: accentColor }} />
            <div className="space-y-2 p-4">
              <div className="text-sm font-semibold text-[#0b2454]">Department Compliance Report</div>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded text-[10px]">
                {["Department", "Compliance", "Overdue"].map((h) => (
                  <div key={h} className="px-2 py-1 font-semibold text-white" style={{ background: accentColor }}>
                    {h}
                  </div>
                ))}
                {["Engineering", "84.0%", "55", "Quality Assurance", "97.1%", "1"].map((c, i) => (
                  <div key={i} className={cn("px-2 py-1", i >= 3 && "bg-slate-50")}>
                    {c}
                  </div>
                ))}
              </div>
              <div className="pt-2 text-[9px] italic text-slate-400">{footer || "—"}</div>
            </div>
          </div>
        </div>
      </fieldset>
    </Panel>
  );
}

/* ----------------------------- Thresholds ---------------------------- */

const thresholdSchema = z
  .object({
    excellent: z.coerce.number().min(1, "Must be 1–100").max(100, "Must be 1–100"),
    good: z.coerce.number().min(1, "Must be 1–100").max(100, "Must be 1–100"),
    needsImprovement: z.coerce.number().min(1, "Must be 1–100").max(100, "Must be 1–100"),
  })
  .refine((v) => v.excellent > v.good, { path: ["good"], message: "Good must be lower than Excellent" })
  .refine((v) => v.good > v.needsImprovement, { path: ["needsImprovement"], message: "Needs Improvement must be lower than Good" });
type ThresholdValues = z.infer<typeof thresholdSchema>;

function ThresholdsSection({ readOnly }: { readOnly: boolean }) {
  const { settings } = useDatabase();
  const [saving, setSaving] = useState(false);
  const form = useForm<ThresholdValues>({ resolver: zodResolver(thresholdSchema) as never, defaultValues: settings.thresholds });
  const { register, handleSubmit, watch, formState, reset } = form;
  useEffect(() => reset(settings.thresholds), [settings.thresholds, reset]);
  const v = watch();
  const ex = Number(v.excellent) || 0;
  const gd = Number(v.good) || 0;
  const ni = Number(v.needsImprovement) || 0;
  const valid = ex > gd && gd > ni && ni > 0 && ex <= 100;

  const onSubmit = async (vals: ThresholdValues) => {
    setSaving(true);
    try {
      await updateSettings({ thresholds: vals }, `Compliance thresholds set to ${vals.excellent}/${vals.good}/${vals.needsImprovement}.`);
      toast.success("Thresholds saved", { description: "All dashboards and reports now use the new ratings." });
    } catch (err) {
      fail("Could not save thresholds")(err);
    } finally {
      setSaving(false);
    }
  };

  const bands = [
    { tier: "critical" as const, from: 0, to: ni },
    { tier: "needs_improvement" as const, from: ni, to: gd },
    { tier: "good" as const, from: gd, to: ex },
    { tier: "excellent" as const, from: ex, to: 100 },
  ];

  return (
    <Panel
      title="Compliance Thresholds"
      description="Ratings applied to every compliance percentage. The Good threshold is also the compliant-employee cut-off."
      footer={
        !readOnly ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => reset({ excellent: 95, good: 85, needsImprovement: 70 })}>
              Restore defaults (95 / 85 / 70)
            </Button>
            <SaveButton saving={saving} form="thr-form" disabled={!formState.isDirty} />
          </>
        ) : null
      }
    >
      <form id="thr-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["excellent", "Excellent at or above"],
              ["good", "Good at or above"],
              ["needsImprovement", "Needs Improvement at or above"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`thr-${k}`}>{label}</Label>
              <div className="relative">
                <Input id={`thr-${k}`} type="number" step="0.5" min={1} max={100} {...register(k)} className="pr-8" aria-invalid={!!formState.errors[k]} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <FieldError msg={formState.errors[k]?.message} />
            </div>
          ))}
        </fieldset>
        <div className="space-y-2">
          <Label>Live preview</Label>
          {valid ? (
            <>
              <div className="flex h-8 overflow-hidden rounded-lg border">
                {bands.map((b) => (
                  <div key={b.tier} className="flex items-center justify-center text-[10px] font-medium text-white" style={{ width: `${Math.max(0, b.to - b.from)}%`, background: TIER_META[b.tier].color }} title={TIER_META[b.tier].label}>
                    {b.to - b.from >= 8 ? TIER_META[b.tier].label : ""}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {[...bands].reverse().map((b) => (
                  <div key={b.tier} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: TIER_META[b.tier].color }} />
                    <span className="font-medium">{TIER_META[b.tier].label}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">{b.tier === "excellent" ? `≥ ${b.from}%` : b.tier === "critical" ? `< ${b.to}%` : `${b.from}–${b.to}%`}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5" /> Thresholds must satisfy 100 ≥ Excellent &gt; Good &gt; Needs Improvement &gt; 0.
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}

/* -------------------------- Process configuration -------------------- */

const processSchema = z.object({
  defaultThreshold: z.coerce.number().min(1, "1–100").max(100, "1–100"),
  defaultFrequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annually", "event_based", "custom"]),
  evidenceRequiredByDefault: z.boolean(),
  approvalRequiredByDefault: z.boolean(),
  dueSoonDays: z.coerce.number().int("Whole days only").min(1, "1–30").max(30, "1–30"),
  allowLateSubmission: z.boolean(),
});
type ProcessValues = z.infer<typeof processSchema>;

function ProcessSection({ readOnly }: { readOnly: boolean }) {
  const { settings } = useDatabase();
  const [saving, setSaving] = useState(false);
  const form = useForm<ProcessValues>({ resolver: zodResolver(processSchema) as never, defaultValues: settings.processConfig });
  const { register, handleSubmit, control, formState, reset } = form;
  useEffect(() => reset(settings.processConfig), [settings.processConfig, reset]);

  const onSubmit = async (v: ProcessValues) => {
    setSaving(true);
    try {
      await updateSettings({ processConfig: v }, "Process configuration updated.");
      toast.success("Process configuration saved");
    } catch (err) {
      fail("Could not save process configuration")(err);
    } finally {
      setSaving(false);
    }
  };

  const toggles: [keyof ProcessValues, string, string][] = [
    ["evidenceRequiredByDefault", "Evidence required by default", "New process steps require an evidence upload unless changed."],
    ["approvalRequiredByDefault", "Approval required by default", "New processes require reviewer approval before completion counts."],
    ["allowLateSubmission", "Allow late submission", "Employees can still submit overdue tasks (they count as completed late)."],
  ];

  return (
    <Panel title="Process Configuration" description="Defaults applied when creating new processes and assignments." footer={!readOnly ? <SaveButton saving={saving} form="proc-form" disabled={!formState.isDirty} /> : null}>
      <form id="proc-form" onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc-thr">Default compliance threshold (%)</Label>
              <Input id="pc-thr" type="number" {...register("defaultThreshold")} aria-invalid={!!formState.errors.defaultThreshold} />
              <FieldError msg={formState.errors.defaultThreshold?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Default frequency</Label>
              <Controller
                control={control}
                name="defaultFrequency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-due">&ldquo;Due soon&rdquo; alert window (days)</Label>
              <Input id="pc-due" type="number" {...register("dueSoonDays")} aria-invalid={!!formState.errors.dueSoonDays} />
              <FieldError msg={formState.errors.dueSoonDays?.message} />
            </div>
          </div>
          <div className="divide-y rounded-lg border">
            {toggles.map(([k, label, hint]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">{hint}</div>
                </div>
                <Controller control={control} name={k} render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={readOnly} aria-label={label} />} />
              </div>
            ))}
          </div>
        </fieldset>
      </form>
    </Panel>
  );
}

/* ----------------------------- Regional ------------------------------ */

const DATE_FORMATS: AppSettings["dateFormat"][] = ["dd MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"];
const TIME_ZONES = ["Asia/Kolkata", "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Dubai", "Asia/Singapore"];

function RegionalSection({ readOnly }: { readOnly: boolean }) {
  const { settings } = useDatabase();
  const [fmt, setFmt] = useState(settings.dateFormat);
  const [tz, setTz] = useState(settings.timeZone);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setFmt(settings.dateFormat);
    setTz(settings.timeZone);
  }, [settings.dateFormat, settings.timeZone]);
  const now = new Date();
  let tzTime = "";
  try {
    tzTime = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", timeZoneName: "short" }).format(now);
  } catch {
    tzTime = "—";
  }
  const dirty = fmt !== settings.dateFormat || tz !== settings.timeZone;
  return (
    <Panel
      title="Date Format & Time Zone"
      description="Regional display preferences for dates in tables, reports and exports."
      footer={
        !readOnly ? (
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateSettings({ dateFormat: fmt, timeZone: tz }, `Date format ${fmt}, time zone ${tz}.`);
                toast.success("Regional settings saved");
              } catch (err) {
                fail("Could not save regional settings")(err);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save changes
          </Button>
        ) : null
      }
    >
      <fieldset disabled={readOnly} className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Date format</Label>
          <div className="space-y-1.5">
            {DATE_FORMATS.map((f) => (
              <button key={f} type="button" onClick={() => setFmt(f)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted", fmt === f && "border-primary bg-info-soft/40")}>
                <span className="font-mono text-xs text-muted-foreground">{f}</span>
                <span className="font-medium tabular-nums">{format(now, f)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Time zone</Label>
          <Select value={tz} onValueChange={setTz} disabled={readOnly}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_ZONES.map((z) => (
                <SelectItem key={z} value={z}>
                  {z.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            Current time there: <span className="font-medium">{tzTime}</span>
          </div>
          <p className="text-xs text-muted-foreground">US restaurant-chain customers typically operate in America/* zones; the India delivery center uses Asia/Kolkata.</p>
        </div>
      </fieldset>
    </Panel>
  );
}

/* ------------------------------- Theme ------------------------------- */

function ThemeSection({ readOnly }: { readOnly: boolean }) {
  const { theme, setTheme } = useTheme();
  const { settings } = useDatabase();
  const options = [
    { id: "light", label: "Light", icon: Sun, preview: "bg-[#f4f6fa]", card: "bg-white" },
    { id: "dark", label: "Dark", icon: Moon, preview: "bg-[#0a0f1c]", card: "bg-[#111827]" },
    { id: "system", label: "System", icon: Laptop, preview: "bg-gradient-to-r from-[#f4f6fa] from-50% to-[#0a0f1c] to-50%", card: "bg-white/80" },
  ] as const;
  return (
    <Panel title="Theme Settings" description="Choose how Organization 360 looks for you. Administrators can also set the organization default.">
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={async () => {
              setTheme(o.id);
              if (!readOnly && settings.theme !== o.id) {
                await updateSettings({ theme: o.id }, `Default theme set to ${o.id}.`).catch(fail("Could not save default theme"));
              }
              toast.success(`${o.label} theme applied`);
            }}
            className={cn("overflow-hidden rounded-xl border text-left transition-all hover:shadow-md", theme === o.id && "border-primary ring-2 ring-primary/30")}
          >
            <div className={cn("flex h-24 items-end gap-2 p-3", o.preview)}>
              <div className="h-14 w-6 rounded bg-[#0b1f47]" />
              <div className={cn("h-10 flex-1 rounded shadow-sm", o.card)} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium">
              <o.icon className="size-4" /> {o.label}
              {theme === o.id ? <Check className="ml-auto size-4 text-primary" /> : null}
            </div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Organization default: {settings.theme}</p>
    </Panel>
  );
}

/* ---------------------- Notification preferences -------------------- */

function NotificationSection({ readOnly }: { readOnly: boolean }) {
  const { settings } = useDatabase();
  const [prefs, setPrefs] = useState(settings.notificationPreferences);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPrefs(settings.notificationPreferences), [settings.notificationPreferences]);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(settings.notificationPreferences);
  const types = Object.keys(NOTIFICATION_TYPE_META) as NotificationType[];
  const set = (t: NotificationType, ch: "inApp" | "email", v: boolean) => setPrefs((p) => ({ ...p, [t]: { ...p[t], [ch]: v } }));
  return (
    <Panel
      title="Notification Preferences"
      description="Delivery channels per notification type. Email delivery is simulated in this phase."
      footer={
        !readOnly ? (
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateSettings({ notificationPreferences: prefs }, "Notification preferences updated.");
                toast.success("Notification preferences saved");
              } catch (err) {
                fail("Could not save preferences")(err);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save changes
          </Button>
        ) : null
      }
    >
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Notification type</th>
              <th className="w-28 px-4 py-2.5 text-center font-semibold">In-app</th>
              <th className="w-28 px-4 py-2.5 text-center font-semibold">Email</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{NOTIFICATION_TYPE_META[t].label}</td>
                <td className="px-4 py-3 text-center">
                  <Switch checked={prefs[t].inApp} onCheckedChange={(v) => set(t, "inApp", v)} disabled={readOnly} aria-label={`${NOTIFICATION_TYPE_META[t].label} in-app`} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Switch checked={prefs[t].email} onCheckedChange={(v) => set(t, "email", v)} disabled={readOnly} aria-label={`${NOTIFICATION_TYPE_META[t].label} email`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------------------------- Danger zone ---------------------------- */

function DangerSection({ readOnly }: { readOnly: boolean }) {
  return (
    <section className="rounded-xl border border-danger/30 bg-card">
      <header className="border-b border-danger/20 px-6 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-danger">
          <AlertTriangle className="size-4" /> Demo data
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">This build stores changes in your browser. Resetting restores the original Altametrics sample dataset.</p>
      </header>
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="font-medium">Reset all demo data</div>
          <div className="text-xs text-muted-foreground">Discards created employees, processes, assignments, submissions, approvals, users and settings changes.</div>
        </div>
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="sm" disabled={readOnly}>
              <RefreshCcw /> Reset demo data
            </Button>
          }
          title="Reset demo data?"
          description="All changes made in this browser will be discarded and the original sample data restored. This cannot be undone."
          confirmLabel="Reset data"
          destructive
          onConfirm={async () => {
            try {
              await resetDemoData();
              toast.success("Demo data restored");
            } catch (err) {
              fail("Could not reset data")(err);
            }
          }}
        />
      </div>
    </section>
  );
}
