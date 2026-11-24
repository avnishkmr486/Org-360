"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  FileUp,
  Loader2,
  Link2,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { Attachment, Frequency, Priority, Process, ProcessStatus, RiskLevel } from "@/types";
import { PageHeader } from "@/components/common/page-header";
import { Combobox, MultiSelect } from "@/components/common/filters";
import { PriorityBadge, ProcessStatusBadge, ToneBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ProcessScopeEditor } from "./process-scope-editor";
import { useCurrentUser, useDatabase, useLookups, useToday } from "@/hooks/use-data";
import { createProcess, nextProcessId, syncScopeAssignments, updateProcess, type ProcessInput } from "@/lib/repositories";
import { describeScope, emptyScope, normalizeScope, resolveScopeEmployees, validateScope } from "@/lib/services/process-scope";
import { FREQUENCY_LABELS, PRIORITY_META, PROCESS_STATUS_META } from "@/lib/constants";
import { formatBytes } from "@/lib/utils/format";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

const stepSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, "Step name is required").max(100),
  description: z.string().trim().max(500),
  instructions: z.string().trim().max(2000),
  mandatory: z.boolean(),
  expectedMinutes: z.number({ invalid_type_error: "Enter minutes" }).int().min(1, "At least 1 minute").max(1440, "Max 1440 minutes"),
  evidenceRequired: z.boolean(),
  approvalRequired: z.boolean(),
});

const scopeSchema = z.object({
  level: z.enum(["department", "team", "employee"]),
  departmentIds: z.array(z.string()),
  teamIds: z.array(z.string()),
  employeeIds: z.array(z.string()),
});

const referenceSchema = z.object({ id: z.string(), title: z.string(), url: z.string() });

const schema = z
  .object({
    name: z.string().trim().min(3, "Process name must be at least 3 characters").max(120),
    categoryId: z.string().min(1, "Select a category"),
    description: z.string().trim().min(10, "Describe the process (min 10 characters)").max(1000),
    objective: z.string().trim().min(5, "State the objective").max(500),
    departmentId: z.string(),
    priority: z.enum(["low", "medium", "high", "critical"]),
    status: z.enum(["draft", "active", "under_review", "inactive"]),
    riskLevel: z.enum(["low", "medium", "high"]),
    tags: z.array(z.string()),
    scope: scopeSchema,
    escalationContactId: z.string().nullable(),
    stakeholderIds: z.array(z.string()),
    applicableTeamIds: z.array(z.string()),
    applicableBandIds: z.array(z.string()),
    ownerId: z.string().min(1, "Select a process owner"),
    responsibleId: z.string().nullable(),
    reviewerId: z.string().nullable(),
    frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annually", "event_based", "custom"]),
    customIntervalDays: z.number().nullable(),
    effectiveDate: z.string().min(1, "Start date is required"),
    expiryDate: z.string(),
    slaDays: z.number().nullable(),
    successMetric: z.string().trim().max(300),
    meetingDate: z.string(),
    meetingAgenda: z.string().trim().max(1000),
    meetingAttendeeIds: z.array(z.string()),
    meetingNotes: z.string().trim().max(2000),
    followUpDate: z.string(),
    followUpAction: z.string().trim().max(1000),
    followUpOwnerId: z.string().nullable(),
    nextReviewDate: z.string(),
    lastReviewedOn: z.string(),
    references: z.array(referenceSchema),
    remarks: z.string().trim().max(2000),
    complianceThreshold: z.number({ invalid_type_error: "Enter a percentage" }).min(1, "Min 1%").max(100, "Max 100%"),
    isMandatory: z.boolean(),
    requiresApproval: z.boolean(),
    sop: z.object({ id: z.string(), name: z.string(), size: z.number(), mimeType: z.string(), uploadedAt: z.string(), uploadedBy: z.string() }).nullable(),
    steps: z.array(stepSchema).min(1, "Add at least one step"),
    changeSummary: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "custom" && (!v.customIntervalDays || v.customIntervalDays < 1 || v.customIntervalDays > 365)) {
      ctx.addIssue({ code: "custom", path: ["customIntervalDays"], message: "Enter an interval between 1 and 365 days" });
    }
    if (v.expiryDate && v.expiryDate <= v.effectiveDate) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "End date must be after the start date" });
    }
    if (v.slaDays !== null && (!Number.isFinite(v.slaDays) || v.slaDays < 1 || v.slaDays > 365)) {
      ctx.addIssue({ code: "custom", path: ["slaDays"], message: "Enter 1–365 days" });
    }
    if (v.meetingDate && v.followUpDate && v.followUpDate < v.meetingDate) {
      ctx.addIssue({ code: "custom", path: ["followUpDate"], message: "Follow-up can't be before the meeting date" });
    }
    v.references.forEach((r, i) => {
      if (!r.title.trim() && !r.url.trim()) return;
      if (!r.title.trim()) ctx.addIssue({ code: "custom", path: ["references", i, "title"], message: "Enter a title" });
      if (!/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(r.url.trim())) ctx.addIssue({ code: "custom", path: ["references", i, "url"], message: "Enter a valid http(s) link" });
    });
    if (v.requiresApproval && !v.reviewerId) {
      ctx.addIssue({ code: "custom", path: ["requiresApproval"], message: "Approval needs a reviewer — pick one in step 2 or turn approval off" });
    }
  });

type FormValues = z.infer<typeof schema>;

const WIZARD_STEPS: { title: string; description: string; fields: FieldPath<FormValues>[] }[] = [
  { title: "Basics", description: "Name, category & purpose", fields: ["name", "categoryId", "description", "objective", "departmentId", "priority", "status", "riskLevel", "tags"] },
  { title: "Applied for & ownership", description: "Where it applies & who owns it", fields: ["applicableBandIds", "ownerId", "responsibleId", "reviewerId", "escalationContactId", "stakeholderIds"] },
  {
    title: "Schedule & governance",
    description: "Dates, meeting & follow-up",
    fields: ["frequency", "customIntervalDays", "effectiveDate", "expiryDate", "complianceThreshold", "slaDays", "successMetric", "isMandatory", "requiresApproval", "meetingDate", "meetingAgenda", "meetingAttendeeIds", "meetingNotes", "followUpDate", "followUpAction", "followUpOwnerId", "nextReviewDate", "lastReviewedOn", "references", "remarks", "sop"],
  },
  { title: "Process steps", description: "Checklist employees follow", fields: ["steps"] },
  { title: "Review & publish", description: "Confirm and save", fields: ["changeSummary"] },
];

let stepCounter = 0;
const newStepId = () => `STP-${Date.now().toString(36).toUpperCase()}${(stepCounter++).toString(36).toUpperCase()}`;

function emptyStep(): FormValues["steps"][number] {
  return { id: newStepId(), name: "", description: "", instructions: "", mandatory: true, expectedMinutes: 15, evidenceRequired: false, approvalRequired: false };
}

export function ProcessWizard({ processId }: { processId?: string }) {
  const db = useDatabase();
  const existing = processId ? db.processes.find((p) => p.id === processId) : undefined;
  const { can } = useCurrentUser();

  if (processId && !existing) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Process Management", href: "/processes" }, { label: "Edit" }]} title="Process not found" />
        <EmptyState title={`No process with ID ${processId}`} description="It may have been removed or the link is incorrect." action={<Button asChild variant="outline" size="sm"><Link href="/processes">Back to Process Master</Link></Button>} />
      </div>
    );
  }
  if (!can("processes.manage")) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Process Management", href: "/processes" }, { label: processId ? "Edit" : "Create" }]} title={processId ? "Edit Process" : "Create Process"} />
        <EmptyState title="You don't have permission to define processes" description="Switch to Super Admin, Senior Management, Department Head or Administrator using the role switcher." />
      </div>
    );
  }
  return <WizardForm existing={existing} key={existing?.id ?? "new"} />;
}

function WizardForm({ existing }: { existing?: Process }) {
  const db = useDatabase();
  const L = useLookups();
  const today = useToday();
  const router = useRouter();
  const { user } = useCurrentUser();
  const cfg = db.settings.processConfig;
  const stepParam = Number(useSearchParams().get("step"));
  const initialStep = Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= WIZARD_STEPS.length ? stepParam - 1 : 0;
  const [active, setActive] = useState(initialStep);
  const [maxVisited, setMaxVisited] = useState(existing ? WIZARD_STEPS.length - 1 : initialStep);
  const [saving, setSaving] = useState<null | "draft" | "publish">(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const newId = useMemo(() => (existing ? existing.id : nextProcessId()), [existing]);

  const defaults: FormValues = useMemo(
    () =>
      existing
        ? {
            name: existing.name,
            categoryId: existing.categoryId,
            description: existing.description,
            objective: existing.objective,
            departmentId: existing.departmentId ?? "",
            priority: existing.priority,
            status: existing.status,
            riskLevel: existing.riskLevel,
            tags: existing.tags,
            scope: existing.scope,
            escalationContactId: existing.escalationContactId,
            stakeholderIds: existing.stakeholderIds,
            applicableTeamIds: existing.applicableTeamIds,
            applicableBandIds: existing.applicableBandIds,
            ownerId: existing.ownerId,
            responsibleId: existing.responsibleId,
            reviewerId: existing.reviewerId,
            frequency: existing.frequency,
            customIntervalDays: existing.customIntervalDays,
            effectiveDate: existing.effectiveDate,
            expiryDate: existing.expiryDate ?? "",
            slaDays: existing.slaDays,
            successMetric: existing.successMetric,
            meetingDate: existing.meetingDate ?? "",
            meetingAgenda: existing.meetingAgenda,
            meetingAttendeeIds: existing.meetingAttendeeIds,
            meetingNotes: existing.meetingNotes,
            followUpDate: existing.followUpDate ?? "",
            followUpAction: existing.followUpAction,
            followUpOwnerId: existing.followUpOwnerId,
            nextReviewDate: existing.nextReviewDate ?? "",
            lastReviewedOn: existing.lastReviewedOn ?? "",
            references: existing.references,
            remarks: existing.remarks,
            complianceThreshold: existing.complianceThreshold,
            isMandatory: existing.isMandatory,
            requiresApproval: existing.requiresApproval,
            sop: existing.sopAttachment,
            steps: existing.steps.map((s) => ({ ...s })),
            changeSummary: "",
          }
        : {
            name: "",
            categoryId: "",
            description: "",
            objective: "",
            departmentId: "",
            priority: "medium",
            status: "active",
            riskLevel: "medium",
            tags: [],
            scope: emptyScope(),
            escalationContactId: null,
            stakeholderIds: [],
            applicableTeamIds: [],
            applicableBandIds: [],
            ownerId: user.employeeId ?? "",
            responsibleId: null,
            reviewerId: null,
            frequency: cfg.defaultFrequency,
            customIntervalDays: 14,
            effectiveDate: today,
            expiryDate: "",
            slaDays: null,
            successMetric: "",
            meetingDate: "",
            meetingAgenda: "",
            meetingAttendeeIds: [],
            meetingNotes: "",
            followUpDate: "",
            followUpAction: "",
            followUpOwnerId: null,
            nextReviewDate: "",
            lastReviewedOn: "",
            references: [],
            remarks: "",
            complianceThreshold: cfg.defaultThreshold,
            isMandatory: true,
            requiresApproval: cfg.approvalRequiredByDefault,
            sop: null,
            steps: [{ ...emptyStep(), evidenceRequired: cfg.evidenceRequiredByDefault }],
            changeSummary: "",
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: "onTouched" });
  const { register, control, watch, setValue, formState, trigger, handleSubmit, getValues } = form;
  const { errors } = formState;
  const steps = useFieldArray({ control, name: "steps" });
  const refs = useFieldArray({ control, name: "references" });
  const values = watch();

  const coveredCount = useMemo(() => resolveScopeEmployees(values.scope, db, values).length, [values, db]);

  const employeeOptions = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: L.deptName(e.departmentId) }));

  /** Scope must be valid unless the process is a draft. */
  const scopeProblem = (draft: boolean): string | null => {
    const v = getValues();
    if (draft || v.status === "draft") return null;
    return validateScope(v.scope, db);
  };

  const goTo = async (target: number) => {
    if (target <= active) return setActive(target);
    for (let i = active; i < target; i++) {
      let ok = await trigger(WIZARD_STEPS[i].fields);
      if (i === 1) {
        const problem = scopeProblem(false);
        setScopeError(problem);
        if (problem) ok = false;
      }
      if (!ok) {
        setActive(i);
        toast.error("Please fix the highlighted fields", { description: `Step ${i + 1}: ${WIZARD_STEPS[i].title}` });
        return;
      }
    }
    setActive(target);
    setMaxVisited((m) => Math.max(m, target));
  };

  const firstErrorStep = (errs: Record<string, unknown>) => WIZARD_STEPS.findIndex((s) => s.fields.some((f) => errs[f.split(".")[0]]));

  const save = async (mode: "draft" | "publish") => {
    const problem = scopeProblem(mode === "draft");
    if (problem) {
      setScopeError(problem);
      setActive(1);
      toast.error("Define who this process applies to", { description: problem });
      return;
    }
    await handleSubmit(
      async (v) => {
        setSaving(mode);
        const scope = normalizeScope(v.scope, db);
        const input: ProcessInput = {
          scope,
          riskLevel: v.riskLevel as RiskLevel,
          tags: v.tags,
          escalationContactId: v.escalationContactId,
          stakeholderIds: v.stakeholderIds,
          slaDays: v.slaDays,
          successMetric: v.successMetric,
          meetingDate: v.meetingDate || null,
          meetingAgenda: v.meetingAgenda,
          meetingAttendeeIds: v.meetingAttendeeIds,
          meetingNotes: v.meetingNotes,
          followUpDate: v.followUpDate || null,
          followUpAction: v.followUpAction,
          followUpOwnerId: v.followUpOwnerId,
          nextReviewDate: v.nextReviewDate || null,
          lastReviewedOn: v.lastReviewedOn || null,
          references: v.references.filter((r) => r.title.trim() || r.url.trim()).map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim() })),
          remarks: v.remarks,
          name: v.name,
          categoryId: v.categoryId,
          description: v.description,
          objective: v.objective,
          departmentId: v.departmentId || null,
          // Team-level scope drives the team filter; other levels don't need it.
          applicableTeamIds: scope.level === "team" ? scope.teamIds : [],
          applicableBandIds: v.applicableBandIds,
          ownerId: v.ownerId,
          responsibleId: v.responsibleId,
          reviewerId: v.reviewerId,
          frequency: v.frequency,
          customIntervalDays: v.frequency === "custom" ? v.customIntervalDays : null,
          effectiveDate: v.effectiveDate,
          expiryDate: v.expiryDate || null,
          priority: v.priority,
          complianceThreshold: v.complianceThreshold,
          status: mode === "draft" ? "draft" : v.status,
          isMandatory: v.isMandatory,
          requiresApproval: v.requiresApproval,
          sopAttachment: v.sop as Attachment | null,
          steps: v.steps.map((s) => ({ ...s, description: s.description, instructions: s.instructions || s.description })),
        };
        try {
          if (existing) {
            const p = await updateProcess(existing.id, input, v.changeSummary.trim() || undefined);
            let extra = "";
            if (p.status === "active" && !validateScope(p.scope, db)) {
              try {
                const sync = await syncScopeAssignments(p.id);
                if (sync.created || sync.deactivated) extra = ` · ${sync.created} assignment(s) created, ${sync.deactivated} deactivated`;
                if (sync.warnings.length) toast.warning("Some assignments could not be created", { description: sync.warnings.join(" · ") });
              } catch (e) {
                toast.warning("Saved, but assignments were not synced", { description: e instanceof Error ? e.message : undefined });
              }
            }
            toast.success(`Process updated to v${p.version}${extra}`, { description: p.name });
            router.push(`/processes/${p.id}`);
          } else {
            const p = await createProcess(input);
            const covered = p.status === "active" ? resolveScopeEmployees(p.scope, db, p).length : 0;
            toast.success(mode === "draft" ? "Draft saved" : "Process published", {
              description: `${p.id} · ${p.name}${covered ? ` · ${covered} employee${covered === 1 ? "" : "s"} covered` : ""}`,
            });
            router.push(`/processes/${p.id}`);
          }
        } catch (e) {
          toast.error("Could not save process", { description: e instanceof Error ? e.message : undefined });
        } finally {
          setSaving(null);
        }
      },
      (errs) => {
        const idx = firstErrorStep(errs as Record<string, unknown>);
        if (idx >= 0) setActive(idx);
        toast.error("Some required information is missing", { description: idx >= 0 ? `See step ${idx + 1}: ${WIZARD_STEPS[idx].title}` : undefined });
      },
    )();
  };

  const title = existing ? `Edit ${existing.name}` : "Create Process";

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: "Process Management", href: "/processes" }, ...(existing ? [{ label: existing.id, href: `/processes/${existing.id}` }, { label: "Edit" }] : [{ label: "Create Process" }])]}
        title={title}
        description={existing ? `Editing creates version ${existing.version + 1}. Open tasks keep their history.` : "Define a standard process in five guided steps — it becomes assignable as soon as it's active."}
        titleAdornment={
          existing ? (
            <>
              <ToneBadge tone="neutral">{existing.id}</ToneBadge>
              <ToneBadge tone="info">v{existing.version}</ToneBadge>
            </>
          ) : (
            <ToneBadge tone="neutral">{newId} · auto-generated</ToneBadge>
          )
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={existing ? `/processes/${existing.id}` : "/processes"}>Cancel</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={saving !== null}>
              {saving === "draft" ? <Loader2 className="animate-spin" /> : <Save />} Save as draft
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Stepper */}
        <nav aria-label="Wizard steps" className="card-elevated h-fit p-3 lg:sticky lg:top-20">
          <ol className="flex gap-1 overflow-x-auto lg:flex-col">
            {WIZARD_STEPS.map((s, i) => {
              const done = i < active || (i <= maxVisited && i !== active);
              const hasError = s.fields.some((f) => (errors as Record<string, unknown>)[f.split(".")[0]]);
              return (
                <li key={s.title} className="min-w-[160px] lg:min-w-0">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60", i === active && "bg-info-soft/60")}
                    aria-current={i === active ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        i === active && "border-primary bg-primary text-primary-foreground",
                        done && i !== active && !hasError && "border-success bg-success text-white",
                        hasError && "border-danger bg-danger-soft text-danger",
                      )}
                    >
                      {done && i !== active && !hasError ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{s.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="card-elevated fade-in p-5 sm:p-6" key={active}>
          <div className="mb-5 border-b pb-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step {active + 1} of {WIZARD_STEPS.length}
            </div>
            <h2 className="text-lg font-semibold">{WIZARD_STEPS[active].title}</h2>
          </div>

          {active === 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Process name" required error={errors.name?.message} className="md:col-span-2">
                <Input {...register("name")} placeholder="e.g. Weekly Release Health Review" aria-invalid={!!errors.name} />
              </Field>
              <Field label="Process category" required error={errors.categoryId?.message}>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-invalid={!!errors.categoryId}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {db.processCategories.filter((c) => c.status === "active").map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Owning department" hint="Leave as organization-wide for company processes">
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <Select value={field.value || "org"} onValueChange={(x) => field.onChange(x === "org" ? "" : x)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="org">Organization-wide</SelectItem>
                        {db.departments.filter((d) => d.status === "active").map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Description" required error={errors.description?.message} className="md:col-span-2">
                <Textarea {...register("description")} rows={3} placeholder="What is this process and when does it apply?" aria-invalid={!!errors.description} />
              </Field>
              <Field label="Objective" required error={errors.objective?.message} className="md:col-span-2">
                <Textarea {...register("objective")} rows={2} placeholder="The measurable outcome this process protects" aria-invalid={!!errors.objective} />
              </Field>
              <Field label="Priority">
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(x) => field.onChange(x as Priority)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_META[p].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Status on publish" hint="Active processes can be assigned immediately">
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(x) => field.onChange(x as ProcessStatus)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["active", "under_review", "draft", ...(existing ? (["inactive"] as const) : [])] as ProcessStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {PROCESS_STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Process ID" hint={existing ? `Version ${existing.version}` : "Auto-generated on save"}>
                <Input value={newId} readOnly disabled className="font-mono" aria-label="Process ID" />
              </Field>
              <Field label="Risk level" hint="Business risk if this process is not followed">
                <Controller
                  control={control}
                  name="riskLevel"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(x) => field.onChange(x as RiskLevel)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["low", "medium", "high"] as RiskLevel[]).map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Tags" hint="Press Enter or comma to add" className="md:col-span-2">
                <Controller control={control} name="tags" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} />} />
              </Field>
            </div>
          ) : null}

          {active === 1 ? (
            <div className="space-y-7">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">Process applied for</h3>
                  <p className="text-xs text-muted-foreground">Choose the level, add departments, then bring in teams and employees from the employee data.</p>
                </div>
                <Controller
                  control={control}
                  name="scope"
                  render={({ field }) => (
                    <ProcessScopeEditor
                      value={field.value}
                      onChange={(sc) => {
                        field.onChange(sc);
                        setScopeError(null);
                      }}
                      processFilters={{ applicableBandIds: values.applicableBandIds }}
                    />
                  )}
                />
                {scopeError ? <p className="text-sm text-danger">{scopeError}</p> : values.status === "draft" ? <p className="text-xs text-muted-foreground">Drafts can be saved without a scope; it is required before the process is active.</p> : null}
                <Collapsible className="rounded-lg border">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium">
                    Advanced: narrow by band
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-4 border-t p-3 md:grid-cols-2">
                      <Field label="Applicable bands" hint="Empty = all bands">
                        <Controller control={control} name="applicableBandIds" render={({ field }) => <MultiSelect values={field.value} onChange={field.onChange} options={db.bands.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))} placeholder="All bands" />} />
                      </Field>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              <section className="space-y-4 border-t pt-5">
                <h3 className="text-sm font-semibold">Ownership & escalation</h3>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Process owner" required error={errors.ownerId?.message} hint="Accountable for adherence">
                    <Controller control={control} name="ownerId" render={({ field }) => <Combobox value={field.value || null} onChange={(x) => field.onChange(x ?? "")} options={employeeOptions} placeholder="Select owner" ariaInvalid={!!errors.ownerId} />} />
                  </Field>
                  <Field label="Responsible person" hint="Day-to-day coordinator (optional)">
                    <Controller control={control} name="responsibleId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={employeeOptions} placeholder="Select person" />} />
                  </Field>
                  <Field label="Reviewer" hint={values.requiresApproval ? "Required — approval is enabled" : "Approves submissions when approval is required"} error={errors.reviewerId?.message}>
                    <Controller control={control} name="reviewerId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={employeeOptions} placeholder="Select reviewer" />} />
                  </Field>
                  <Field label="Escalation contact" hint="Who is told when adherence drops (optional)">
                    <Controller control={control} name="escalationContactId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={employeeOptions} placeholder="Select contact" />} />
                  </Field>
                  <Field label="Stakeholders" className="md:col-span-2">
                    <Controller control={control} name="stakeholderIds" render={({ field }) => <MultiSelect values={field.value} onChange={field.onChange} options={employeeOptions} placeholder="Add stakeholders" searchPlaceholder="Search employees…" />} />
                  </Field>
                </div>
              </section>
            </div>
          ) : null}

          {active === 2 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Frequency" required>
                <Controller
                  control={control}
                  name="frequency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(x) => field.onChange(x as Frequency)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {db.frequencies.filter((f) => f.status === "active").map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} <span className="text-muted-foreground">— {f.description}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              {values.frequency === "custom" ? (
                <Field label="Repeat every (days)" required error={errors.customIntervalDays?.message}>
                  <Input type="number" min={1} max={365} {...register("customIntervalDays", { setValueAs: (x) => (x === "" ? null : Number(x)) })} aria-invalid={!!errors.customIntervalDays} />
                </Field>
              ) : (
                <div className="hidden md:block" />
              )}
              <Field label="Start date" required error={errors.effectiveDate?.message}>
                <Input type="date" {...register("effectiveDate")} />
              </Field>
              <Field label="End date" hint="Optional" error={errors.expiryDate?.message}>
                <Input type="date" {...register("expiryDate")} aria-invalid={!!errors.expiryDate} />
              </Field>
              <Field label="Compliance threshold (%)" required error={errors.complianceThreshold?.message} hint={`Organization 'Good' threshold is ${db.settings.thresholds.good}%`}>
                <Input type="number" min={1} max={100} {...register("complianceThreshold", { valueAsNumber: true })} aria-invalid={!!errors.complianceThreshold} />
              </Field>
              <Field label="SLA (days)" hint="Target days to complete one occurrence" error={errors.slaDays?.message}>
                <Input type="number" min={1} max={365} {...register("slaDays", { setValueAs: (x) => (x === "" || x === null ? null : Number(x)) })} aria-invalid={!!errors.slaDays} />
              </Field>
              <Field label="Success metric" hint="How success is measured" className="md:col-span-2">
                <Input {...register("successMetric")} placeholder="e.g. ≥ 95% of occurrences completed on time" />
              </Field>
              <ToggleRow
                label="Mandatory process"
                description="Mandatory processes generate required tasks that count toward compliance."
                checked={values.isMandatory}
                onChange={(c) => setValue("isMandatory", c, { shouldDirty: true })}
              />
              <ToggleRow
                label="Requires approval"
                description="Completion only counts once a reviewer approves the submission."
                checked={values.requiresApproval}
                onChange={(c) => setValue("requiresApproval", c, { shouldDirty: true, shouldValidate: true })}
                error={errors.requiresApproval?.message}
              />
              <div className="space-y-4 rounded-xl border bg-muted/20 p-4 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="size-4 text-muted-foreground" /> Meeting & follow-up
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Meeting date" hint="Kick-off or review meeting">
                    <Input type="date" {...register("meetingDate")} />
                  </Field>
                  <Field label="Attendees">
                    <Controller control={control} name="meetingAttendeeIds" render={({ field }) => <MultiSelect values={field.value} onChange={field.onChange} options={employeeOptions} placeholder="Select attendees" searchPlaceholder="Search employees…" />} />
                  </Field>
                  <Field label="Meeting agenda" className="md:col-span-2">
                    <Textarea rows={2} {...register("meetingAgenda")} placeholder="What will be discussed" />
                  </Field>
                  <Field label="Meeting notes" className="md:col-span-2">
                    <Textarea rows={2} {...register("meetingNotes")} placeholder="Decisions and discussion points" />
                  </Field>
                  <Field label="Follow-up date" error={errors.followUpDate?.message}>
                    <Input type="date" {...register("followUpDate")} aria-invalid={!!errors.followUpDate} />
                  </Field>
                  <Field label="Follow-up owner">
                    <Controller control={control} name="followUpOwnerId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={employeeOptions} placeholder="Select owner" />} />
                  </Field>
                  <Field label="Follow-up action" className="md:col-span-2">
                    <Textarea rows={2} {...register("followUpAction")} placeholder="What must happen after the meeting" />
                  </Field>
                  <Field label="Next review date">
                    <Input type="date" {...register("nextReviewDate")} />
                  </Field>
                  <Field label="Last reviewed on">
                    <Input type="date" {...register("lastReviewedOn")} />
                  </Field>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Link2 className="size-4 text-muted-foreground" /> Reference links
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => refs.append({ id: `REF-${Date.now().toString(36).toUpperCase()}`, title: "", url: "" })}>
                    <Plus /> Add link
                  </Button>
                </div>
                {refs.fields.length === 0 ? <p className="text-xs text-muted-foreground">Optional: link wiki pages, runbooks or dashboards.</p> : null}
                {refs.fields.map((f, i) => (
                  <div key={f.id} className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                    <div>
                      <Input {...register(`references.${i}.title`)} placeholder="Title" aria-label="Link title" aria-invalid={!!errors.references?.[i]?.title} />
                      {errors.references?.[i]?.title?.message ? <p className="mt-1 text-xs text-danger">{errors.references[i]?.title?.message}</p> : null}
                    </div>
                    <div>
                      <Input {...register(`references.${i}.url`)} placeholder="https://…" aria-label="Link URL" aria-invalid={!!errors.references?.[i]?.url} />
                      {errors.references?.[i]?.url?.message ? <p className="mt-1 text-xs text-danger">{errors.references[i]?.url?.message}</p> : null}
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-danger hover:text-danger" onClick={() => refs.remove(i)} aria-label="Remove link">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <Field label="Remarks" className="md:col-span-2" hint="Internal notes about this process">
                <Textarea rows={2} {...register("remarks")} />
              </Field>
              <Field label="SOP attachment" className="md:col-span-2" hint="PDF, DOCX or similar — up to 10 MB (metadata stored in this demo)">
                {values.sop ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{values.sop.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(values.sop.size)} · uploaded {formatDate(values.sop.uploadedAt)} by {values.sop.uploadedBy}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setValue("sop", null, { shouldDirty: true })} aria-label="Remove SOP">
                      <X />
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/30">
                    <FileUp className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to upload SOP document</span>
                    <span className="text-xs text-muted-foreground">Standard operating procedure for this process</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 10 * 1024 * 1024) {
                          toast.error("File too large", { description: "SOP documents must be 10 MB or smaller." });
                          return;
                        }
                        setValue("sop", { id: `SOP-${Date.now().toString(36).toUpperCase()}`, name: f.name, size: f.size, mimeType: f.type || "application/octet-stream", uploadedAt: new Date().toISOString(), uploadedBy: user.name }, { shouldDirty: true });
                        toast.success("SOP attached", { description: f.name });
                      }}
                    />
                  </label>
                )}
              </Field>
            </div>
          ) : null}

          {active === 3 ? (
            <div className="space-y-4">
              {errors.steps?.root?.message || errors.steps?.message ? <p className="text-sm text-danger">{errors.steps?.root?.message ?? errors.steps?.message}</p> : null}
              {steps.fields.map((f, i) => {
                const se = errors.steps?.[i];
                return (
                  <div key={f.id} className="rounded-xl border bg-background/60 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                      <span className="flex-1 truncate text-sm font-semibold">{values.steps?.[i]?.name || `Step ${i + 1}`}</span>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => steps.move(i, i - 1)} aria-label="Move step up">
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={i === steps.fields.length - 1} onClick={() => steps.move(i, i + 1)} aria-label="Move step down">
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={steps.fields.length === 1} onClick={() => steps.remove(i)} aria-label="Remove step" className="text-danger hover:text-danger">
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Step name" required error={se?.name?.message}>
                        <Input {...register(`steps.${i}.name`)} placeholder="e.g. Upload test report" aria-invalid={!!se?.name} />
                      </Field>
                      <Field label="Description" error={se?.description?.message}>
                        <Textarea rows={2} {...register(`steps.${i}.description`)} placeholder="What must be done" />
                      </Field>
                      <Field label="Instructions" error={se?.instructions?.message}>
                        <Textarea rows={2} {...register(`steps.${i}.instructions`)} placeholder="How to do it, links, acceptance criteria" />
                      </Field>
                      <Field label="Expected completion time (minutes)" required error={se?.expectedMinutes?.message}>
                        <Input type="number" min={1} {...register(`steps.${i}.expectedMinutes`, { valueAsNumber: true })} aria-invalid={!!se?.expectedMinutes} />
                      </Field>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:col-span-2">
                        <MiniToggle label="Mandatory" checked={values.steps?.[i]?.mandatory ?? true} onChange={(c) => setValue(`steps.${i}.mandatory`, c, { shouldDirty: true })} />
                        <MiniToggle label="Evidence required" checked={values.steps?.[i]?.evidenceRequired ?? false} onChange={(c) => setValue(`steps.${i}.evidenceRequired`, c, { shouldDirty: true })} />
                        <MiniToggle label="Approval required" checked={values.steps?.[i]?.approvalRequired ?? false} onChange={(c) => setValue(`steps.${i}.approvalRequired`, c, { shouldDirty: true })} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => steps.append({ ...emptyStep(), evidenceRequired: cfg.evidenceRequiredByDefault })}>
                <Plus /> Add step
              </Button>
              <p className="text-xs text-muted-foreground">
                Total expected effort: <span className="font-medium text-foreground">{(values.steps ?? []).reduce((s, x) => s + (Number(x.expectedMinutes) || 0), 0)} minutes</span> per occurrence.
              </p>
            </div>
          ) : null}

          {active === 4 ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{values.name || "Untitled process"}</h3>
                <ProcessStatusBadge status={values.status} />
                <PriorityBadge priority={values.priority} />
              </div>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Summary label="Category" value={L.categoryName(values.categoryId)} />
                <Summary label="Department" value={values.departmentId ? L.deptName(values.departmentId) : "Organization-wide"} />
                <Summary label="Frequency" value={`${FREQUENCY_LABELS[values.frequency]}${values.frequency === "custom" ? ` (every ${values.customIntervalDays} days)` : ""}`} />
                <Summary label="Process owner" value={L.empName(values.ownerId)} />
                <Summary label="Responsible person" value={L.empName(values.responsibleId)} />
                <Summary label="Reviewer" value={L.empName(values.reviewerId)} />
                <Summary label="Effective" value={`${formatDate(values.effectiveDate)}${values.expiryDate ? ` → ${formatDate(values.expiryDate)}` : " · no expiry"}`} />
                <Summary label="Compliance threshold" value={`${values.complianceThreshold}%`} />
                <Summary label="Rules" value={`${values.isMandatory ? "Mandatory" : "Optional"} · ${values.requiresApproval ? "Approval required" : "No approval"}`} />
                <Summary label="Applied for" value={describeScope(values.scope, db)} />
                <Summary label="Employees covered" value={String(coveredCount)} />
                <Summary label="Risk level" value={values.riskLevel} />
                <Summary label="SLA" value={values.slaDays ? `${values.slaDays} days` : "—"} />
                <Summary label="Success metric" value={values.successMetric} />
                <Summary label="Meeting" value={values.meetingDate ? `${formatDate(values.meetingDate)} · ${values.meetingAttendeeIds.length} attendee(s)` : "Not scheduled"} />
                <Summary label="Follow-up" value={values.followUpDate ? `${formatDate(values.followUpDate)}${values.followUpOwnerId ? ` · ${L.empName(values.followUpOwnerId)}` : ""}` : "None"} />
                <Summary label="Next review" value={values.nextReviewDate ? formatDate(values.nextReviewDate) : "—"} />
                <Summary label="Escalation contact" value={L.empName(values.escalationContactId)} />
                <Summary label="Tags" value={values.tags.join(", ")} />
                <Summary label="Reference links" value={String(values.references.filter((r) => r.url.trim()).length)} />
                <Summary label="Applicable bands" value={values.applicableBandIds.length ? values.applicableBandIds.map(L.bandCode).join(", ") : "All"} />
                <Summary label="SOP" value={values.sop?.name ?? "None attached"} />
              </dl>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="size-4 text-muted-foreground" /> {values.steps.length} steps
                </div>
                <ol className="space-y-1.5">
                  {values.steps.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="font-medium tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="font-medium">{s.name || "—"}</span>
                      <span className="text-xs text-muted-foreground">{s.expectedMinutes} min</span>
                      <span className="ml-auto flex flex-wrap gap-1">
                        <ToneBadge tone={s.mandatory ? "info" : "neutral"}>{s.mandatory ? "Mandatory" : "Optional"}</ToneBadge>
                        {s.evidenceRequired ? <ToneBadge tone="teal">Evidence</ToneBadge> : null}
                        {s.approvalRequired ? <ToneBadge tone="warning">Approval</ToneBadge> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {values.status === "active" ? (
                <div className="rounded-lg border border-info/30 bg-info-soft/50 p-3 text-sm">
                  Publishing as <span className="font-medium">Active</span> will {existing ? "sync assignments so" : "immediately create assignments for"} the{" "}
                  <span className="font-semibold">{coveredCount}</span> covered employee{coveredCount === 1 ? "" : "s"} — they will start receiving tasks.
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">No assignments are created while the process is {values.status.replace("_", " ")}.</div>
              )}
              {existing ? (
                <Field label="Change note (optional)" error={errors.changeSummary?.message} hint={`A field-by-field change list is recorded automatically in v${existing.version + 1}; add a note if you want to explain why.`}>
                  <Textarea rows={2} {...register("changeSummary")} placeholder="e.g. Moved to Team level after the reorganisation" aria-invalid={!!errors.changeSummary} />
                </Field>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0}>
              <ArrowLeft /> Back
            </Button>
            {active < WIZARD_STEPS.length - 1 ? (
              <Button type="button" onClick={() => goTo(active + 1)}>
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button type="button" onClick={() => save("publish")} disabled={saving !== null}>
                {saving === "publish" ? <Loader2 className="animate-spin" /> : <Send />}
                {existing ? "Save changes" : values.status === "active" ? "Publish process" : "Save process"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, hint, className, children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, error }: { label: string; description: string; checked: boolean; onChange: (c: boolean) => void; error?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-lg border p-3", error && "border-danger/50")}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
        {error ? <div className="mt-1 text-xs text-danger">{error}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function MiniToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}


function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
    setText("");
    if (!t || value.includes(t) || value.length >= 12) return;
    onChange([...value, t]);
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
        placeholder={value.length ? "" : "e.g. release, quality-gate"}
        aria-label="Add tag"
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
