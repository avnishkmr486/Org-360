"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
  Loader2,
  Pencil,
  RefreshCcw,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Upload,
  Workflow,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/states";
import { ToneBadge } from "@/components/common/badges";
import { Combobox } from "@/components/common/filters";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser, useDatabase, useToday } from "@/hooks/use-data";
import { ACCEPT_ATTRIBUTE, ImportParseError, readImportFile, type RawWorkbook } from "@/lib/import/sheet-parser";
import { importProcesses, processImportHistory, type ProcessImportSummary } from "@/lib/repositories/process-import";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  autoMap,
  FIELD_GROUPS,
  missingRequired,
  PROCESS_FIELDS,
  STEP_FIELDS,
  type Confidence,
  type ConfidenceMap,
  type FieldDef,
  type Mapping,
  type ProcessFieldKey,
  type StepFieldKey,
} from "./fields";
import { buildProcessRecords, prepareImport, type ImportRecord, type PrepareOptions, type PreparedImport } from "./parse";
import { defaultImportDefaults, summarize, validateRecords, type ImportDefaults, type RecordState, type ValidatedRecord, type ValidationContext } from "./validate";
import { downloadProcessErrorReport, downloadProcessTemplate } from "./workbooks";

const STEPS = [
  { n: 1, title: "Upload file", detail: "Any layout · XLSX / CSV" },
  { n: 2, title: "Map & defaults", detail: "Sheets, columns, blanks" },
  { n: 3, title: "Validate & correct", detail: "Errors · duplicates" },
  { n: 4, title: "Review & import", detail: "Create · update · skip" },
  { n: 5, title: "Summary", detail: "Results & reports" },
];

const STATE_META: Record<RecordState, { label: string; tone: "success" | "info" | "danger" | "warning" }> = {
  valid: { label: "New", tone: "success" },
  update: { label: "Existing", tone: "info" },
  invalid: { label: "Invalid", tone: "danger" },
  duplicate: { label: "Duplicate", tone: "warning" },
};

const CONF_META: Record<Confidence, { label: string; tone: "success" | "info" | "warning" }> = {
  exact: { label: "Exact", tone: "success" },
  alias: { label: "Matched", tone: "success" },
  fuzzy: { label: "Similar", tone: "info" },
  content: { label: "By content", tone: "warning" },
};

const NOT_MAPPED = "__none__";
const EMPTY = "__empty__";

const FREQUENCIES = ["Daily", "Weekly", "Monthly", "Quarterly", "Annually", "Event Based", "Custom"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const RISKS = ["Low", "Medium", "High"];
const STATUSES = ["Draft", "Active", "Under Review", "Inactive"];
const LEVELS = ["Department", "Team", "Employee"];
const YES_NO = ["Yes", "No"];
const TEXTAREA_FIELDS: ProcessFieldKey[] = ["description", "objective", "meetingAgenda", "followUpAction", "remarks", "steps"];

export function ProcessImportWizard() {
  const db = useDatabase();
  const today = useToday();
  const { can, employee } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<RawWorkbook | null>(null);
  const [opts, setOpts] = useState<PrepareOptions>({});
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [mapping, setMapping] = useState<Mapping<ProcessFieldKey> | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceMap<ProcessFieldKey> | null>(null);
  const [stepsMapping, setStepsMapping] = useState<Mapping<StepFieldKey> | null>(null);
  const [stepsConfidence, setStepsConfidence] = useState<ConfidenceMap<StepFieldKey> | null>(null);
  const [defaults, setDefaults] = useState<ImportDefaults>(() => ({ ...defaultImportDefaults(db.settings, today), ownerId: employee?.id ?? "" }));
  const [matchById, setMatchById] = useState(false);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [optIn, setOptIn] = useState<Set<number>>(new Set());
  const [view, setView] = useState<RecordState | "all">("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "parse" | "import" | "template" | "report">(null);
  const [result, setResult] = useState<ProcessImportSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const idMapped = mapping?.id !== null && mapping?.id !== undefined;
  const ctx: ValidationContext = useMemo(() => ({ db, defaults, today, matchById: matchById && idMapped }), [db, defaults, today, matchById, idMapped]);
  const validated = useMemo(() => validateRecords(records, ctx), [records, ctx]);
  const counts = summarize(validated);
  const plan = useMemo(
    () => ({
      create: validated.filter((r) => r.state === "valid"),
      update: validated.filter((r) => r.state === "update" && optIn.has(r.rowNumber)),
      skipped: validated.filter((r) => r.state === "update" && !optIn.has(r.rowNumber)),
      failed: validated.filter((r) => r.state === "invalid" || r.state === "duplicate"),
    }),
    [validated, optIn],
  );
  const history = useMemo(() => processImportHistory(db.auditLogs), [db.auditLogs]);

  if (!can("processes.manage")) {
    return (
      <div>
        <PageHeader breadcrumbs={[{ label: "Process Management", href: "/processes" }, { label: "Import Processes" }]} title="Import Processes" />
        <EmptyState icon={<ShieldAlert className="size-5" />} title="Import is restricted" description="Only roles that can manage processes may import them. Switch persona from the role switcher in the top bar." />
      </div>
    );
  }

  const run = async <T,>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) => {
    setBusy(kind);
    try {
      return await fn();
    } finally {
      setBusy(null);
    }
  };

  /** (Re)prepare tables from the workbook and auto-map columns. */
  const load = (wb: RawWorkbook, nextOpts: PrepareOptions) => {
    const p = prepareImport(wb, nextOpts);
    const m = autoMap(PROCESS_FIELDS, p.main.headers, p.main.rows);
    setWorkbook(wb);
    setOpts(nextOpts);
    setPrepared(p);
    setMapping(m.mapping);
    setConfidence(m.confidence);
    if (p.steps) {
      const sm = autoMap(STEP_FIELDS, p.steps.headers, p.steps.rows);
      setStepsMapping(sm.mapping);
      setStepsConfidence(sm.confidence);
    } else {
      setStepsMapping(null);
      setStepsConfidence(null);
    }
    return p;
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await run("parse", async () => {
      try {
        const wb = await readImportFile(file);
        const p = load(wb, {});
        if (!p.main.rows.length) throw new ImportParseError("No data rows were found under the detected header row. Pick a different sheet or header row.");
        setFileName(file.name);
        setRecords([]);
        setOptIn(new Set());
        setResult(null);
        setMatchById(false);
        setStep(2);
        toast.success(`Read ${p.main.rows.length} process row${p.main.rows.length === 1 ? "" : "s"} from ${file.name}`, {
          description: wb.sheets.length > 1 ? `${wb.sheets.length} sheets found${p.stepsSheet !== null ? " · steps sheet detected" : ""}` : undefined,
        });
      } catch (err) {
        toast.error("Could not read file", { description: err instanceof Error ? err.message : String(err) });
      }
    });
  };

  const reset = () => {
    setStep(1);
    setWorkbook(null);
    setPrepared(null);
    setMapping(null);
    setRecords([]);
    setOptIn(new Set());
    setResult(null);
    setFileName("");
    setView("all");
    setOpts({});
    if (inputRef.current) inputRef.current.value = "";
  };

  const template = () =>
    run("template", async () => {
      try {
        await downloadProcessTemplate(db);
        toast.success("Template downloaded");
      } catch (err) {
        toast.error("Template download failed", { description: err instanceof Error ? err.message : String(err) });
      }
    });

  const errorReport = (list: ValidatedRecord[]) =>
    run("report", async () => {
      try {
        await downloadProcessErrorReport(list, db.organization.name, fileName);
        toast.success("Error report downloaded");
      } catch (err) {
        toast.error("Report failed", { description: err instanceof Error ? err.message : String(err) });
      }
    });

  const toValidate = () => {
    if (!prepared || !mapping) return;
    const stepsOk = stepsMapping !== null && stepsMapping.processName !== null && stepsMapping.name !== null;
    const built = buildProcessRecords(prepared.main, mapping, stepsOk ? prepared.steps : null, stepsOk ? stepsMapping : null);
    setRecords(built.records);
    setOrphanCount(built.orphanSteps.length);
    setOptIn(new Set());
    setView("all");
    setStep(3);
  };

  const doImport = () =>
    run("import", async () => {
      try {
        const rows = [
          ...plan.create.map((r) => ({ rowNumber: r.rowNumber, action: "create" as const, input: r.input! })),
          ...plan.update.map((r) => ({ rowNumber: r.rowNumber, action: "update" as const, existingId: r.existing!.id, patch: r.patch! })),
        ];
        const summary = await importProcesses(rows, { fileName, skipped: plan.skipped.length, failed: plan.failed.length });
        setResult(summary);
        setStep(5);
        toast.success("Import complete", { description: `${summary.created} created · ${summary.updated} updated${summary.failed ? ` · ${summary.failed} failed` : ""}` });
      } catch (err) {
        toast.error("Import failed", { description: err instanceof Error ? err.message : String(err) });
      }
    });

  const missing = mapping ? missingRequired(PROCESS_FIELDS, mapping) : [];
  const visible = validated.filter((r) => view === "all" || r.state === view);
  const problemRows = validated.filter((r) => r.state === "invalid" || r.state === "duplicate");
  const updateCandidates = validated.filter((r) => r.state === "update");
  const allOptedIn = updateCandidates.length > 0 && updateCandidates.every((r) => optIn.has(r.rowNumber));
  const catName = (id: string) => db.processCategories.find((c) => c.id === id)?.name ?? id;
  const deptName = (id: string | null) => (id ? (db.departments.find((d) => d.id === id)?.name ?? id) : "Organization-wide");
  const empName = (id: string) => {
    const e = db.employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : id;
  };

  const columns: Column<ValidatedRecord>[] = [
    { id: "row", header: "Row", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.rowNumber}</span>, sortValue: (r) => r.rowNumber },
    { id: "state", header: "Result", cell: (r) => <ToneBadge tone={STATE_META[r.state].tone}>{STATE_META[r.state].label}</ToneBadge>, sortValue: (r) => r.state },
    {
      id: "name",
      header: "Process",
      cell: (r) => (
        <div className="max-w-[240px]">
          <Cell value={r.values.name} error={r.errors.name} strong />
          {r.existing ? <span className="block text-[11px] text-info">Matches {r.existing.id}</span> : null}
        </div>
      ),
      sortValue: (r) => r.values.name,
    },
    { id: "cat", header: "Category / Dept", cell: (r) => <Cell value={r.input ? `${catName(r.input.categoryId)} · ${deptName(r.input.departmentId)}` : [r.values.category, r.values.department].filter(Boolean).join(" · ")} error={r.errors.category ?? r.errors.department} /> },
    { id: "scope", header: "Applied for", cell: (r) => <Cell value={r.scopeSummary || [r.values.appliedAt, r.values.appliedDepartments, r.values.appliedTeams, r.values.appliedEmployees].filter(Boolean).join(" · ")} error={r.errors.appliedAt ?? r.errors.appliedDepartments ?? r.errors.appliedTeams ?? r.errors.appliedEmployees} /> },
    { id: "owner", header: "Owner", cell: (r) => <Cell value={r.input ? empName(r.input.ownerId) : r.values.owner} error={r.errors.owner} /> },
    {
      id: "sched",
      header: "Frequency · Start",
      cell: (r) => <Cell value={r.input ? `${r.input.frequency.replace("_", " ")} · ${r.input.effectiveDate}` : [r.values.frequency, r.values.startDate].filter(Boolean).join(" · ")} error={r.errors.frequency ?? r.errors.startDate ?? r.errors.customInterval} />,
    },
    { id: "steps", header: "Steps", align: "right", cell: (r) => <span className={cn("tabular-nums", r.errors.steps && "text-danger")}>{r.stepCount || "—"}</span>, sortValue: (r) => r.stepCount },
    {
      id: "issues",
      header: "Issues / notes",
      cell: (r) => {
        const errs = Object.entries(r.errors);
        if (errs.length) {
          return (
            <ul className="max-w-[320px] space-y-0.5 text-xs text-danger">
              {errs.slice(0, 3).map(([k, e]) => (
                <li key={k}>• {e}</li>
              ))}
              {errs.length > 3 ? <li>+{errs.length - 3} more</li> : null}
            </ul>
          );
        }
        return (
          <div className="max-w-[300px] space-y-0.5 text-xs">
            {r.state === "update" ? <span className="block text-info">Will update only the columns in your file</span> : <span className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" /> Ready</span>}
            {r.defaultsApplied.length ? <span className="block text-muted-foreground" title={r.defaultsApplied.join(", ")}>Defaults: {r.defaultsApplied.slice(0, 3).join(", ")}{r.defaultsApplied.length > 3 ? ` +${r.defaultsApplied.length - 3}` : ""}</span> : null}
            {r.infos.slice(0, 1).map((i) => (
              <span key={i} className="block text-muted-foreground">{i}</span>
            ))}
          </div>
        );
      },
    },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {r.state === "update" ? (
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
              <Checkbox
                checked={optIn.has(r.rowNumber)}
                onCheckedChange={(c) =>
                  setOptIn((s) => {
                    const next = new Set(s);
                    if (c) next.add(r.rowNumber);
                    else next.delete(r.rowNumber);
                    return next;
                  })
                }
              />
              Update
            </label>
          ) : null}
          <Button variant={r.state === "invalid" || r.state === "duplicate" ? "outline" : "ghost"} size="xs" onClick={() => setEditing(r.rowNumber)}>
            <Pencil /> {r.state === "invalid" || r.state === "duplicate" ? "Fix" : "Edit"}
          </Button>
        </div>
      ),
    },
  ];

  const sheetNames = workbook?.sheets.map((s) => s.name) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: "Process Management", href: "/processes" }, { label: "Import Processes" }]}
        title="Import Processes"
        description="Upload processes from Excel or CSV in whatever layout you already have. Process IDs are generated automatically, existing processes are only updated when you opt in, and processes missing from the file are never deleted."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={template} disabled={busy === "template"}>
              {busy === "template" ? <Loader2 className="animate-spin" /> : <Download />} Download template
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/processes">
                <ArrowLeft /> Back to processes
              </Link>
            </Button>
          </>
        }
      />

      <Stepper step={step} />

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card-elevated space-y-3 p-5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-teal-soft text-teal">
              <FileSpreadsheet className="size-5" />
            </div>
            <h3 className="text-sm font-semibold">Start from the standard template (optional)</h3>
            <p className="text-xs text-muted-foreground">Processes sheet with every field, an optional Steps sheet, a Reference sheet with valid categories, departments, teams and people, plus instructions.</p>
            <Button size="sm" onClick={template} disabled={busy === "template"}>
              {busy === "template" ? <Loader2 className="animate-spin" /> : <Download />} Download template (.xlsx)
            </Button>
            <ul className="space-y-1 border-t pt-3 text-[11px] text-muted-foreground">
              <li>• Only <strong className="text-foreground">Process Name</strong> is strictly required — blanks take your chosen defaults</li>
              <li>• Applied at Department / Team / Employee level, looked up from employee data</li>
              <li>• Steps inline (one per line) or on a separate Steps sheet</li>
            </ul>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div
              className={cn("card-elevated flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors", dragOver ? "border-primary bg-info-soft/40" : "border-border")}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFile(e.dataTransfer.files?.[0]);
              }}
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-info-soft text-info">{busy === "parse" ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}</div>
              <div>
                <p className="text-sm font-semibold">Upload your process file</p>
                <p className="text-xs text-muted-foreground">Drag & drop an .xlsx, .csv, .tsv or .txt file here, or browse. Up to 10 MB.</p>
              </div>
              <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button onClick={() => inputRef.current?.click()} disabled={busy === "parse"}>
                {busy === "parse" ? <Loader2 className="animate-spin" /> : <Upload />} Browse files
              </Button>
            </div>
            <div className="card-elevated flex items-start gap-3 p-4 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-teal" />
              <div className="space-y-1">
                <p className="font-medium">Any layout works</p>
                <p className="text-xs text-muted-foreground">
                  Columns can be in any order and under your own names (e.g. “Procedure Title”, “Dept”, “How Often”). Title rows above the headers are skipped, the right sheet is picked automatically, and a Steps sheet is detected and linked by process name. You review every mapping before anything is imported.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 && workbook && prepared && mapping && confidence ? (
        <div className="space-y-4">
          <div className="card-elevated space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Sheets & header row</h3>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{fileName}</span> · {workbook.sheets.length} sheet{workbook.sheets.length === 1 ? "" : "s"} · {prepared.main.rows.length} process row{prepared.main.rows.length === 1 ? "" : "s"}
                  {prepared.steps ? ` · ${prepared.steps.rows.length} step rows` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const m = autoMap(PROCESS_FIELDS, prepared.main.headers, prepared.main.rows);
                  setMapping(m.mapping);
                  setConfidence(m.confidence);
                }}
              >
                <RefreshCcw /> Auto-map again
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Processes sheet{prepared.auto.processSheet ? <span className="ml-1 font-normal text-muted-foreground">(auto-detected)</span> : null}</Label>
                <Select value={String(prepared.processSheet)} onValueChange={(v) => load(workbook, { ...opts, processSheet: Number(v), mainHeaderRow: undefined })}>
                  <SelectTrigger size="sm" className="w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sheetNames.map((n, i) => (
                      <SelectItem key={`${n}-${i}`} value={String(i)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Header row</Label>
                <Input
                  type="number"
                  min={1}
                  max={workbook.sheets[prepared.processSheet].matrix.length}
                  className="h-8 text-xs"
                  value={prepared.mainHeaderRow + 1}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(workbook.sheets[prepared.processSheet].matrix.length, Number(e.target.value) || 1));
                    load(workbook, { ...opts, mainHeaderRow: v - 1 });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Steps sheet (optional){prepared.stepsSheet !== null && prepared.auto.stepsSheet ? <span className="ml-1 font-normal text-muted-foreground">(auto-detected)</span> : null}</Label>
                <Select value={prepared.stepsSheet === null ? NOT_MAPPED : String(prepared.stepsSheet)} onValueChange={(v) => load(workbook, { ...opts, stepsSheet: v === NOT_MAPPED ? -1 : Number(v), stepsHeaderRow: undefined })}>
                  <SelectTrigger size="sm" className="w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOT_MAPPED}>— No steps sheet —</SelectItem>
                    {sheetNames.map((n, i) => (i === prepared.processSheet ? null : <SelectItem key={`${n}-${i}`} value={String(i)}>{n}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {prepared.steps && prepared.stepsSheet !== null ? (
                <div className="space-y-1">
                  <Label className="text-xs">Steps header row</Label>
                  <Input
                    type="number"
                    min={1}
                    max={workbook.sheets[prepared.stepsSheet].matrix.length}
                    className="h-8 text-xs"
                    value={prepared.stepsHeaderRow + 1}
                    onChange={(e) => load(workbook, { ...opts, stepsHeaderRow: Math.max(1, Number(e.target.value) || 1) - 1 })}
                  />
                </div>
              ) : null}
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" /> Changing a sheet or header row re-reads the columns and re-runs auto-mapping.
            </p>
          </div>

          <div className="card-elevated p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">Map file columns to process fields</h3>
              <p className="text-xs text-muted-foreground">
                Matched by header name, similar names and, for unlabeled columns, by what the values look like. Only <strong className="text-foreground">Process Name</strong> is required — anything unmapped uses the defaults below.
              </p>
            </div>
            {FIELD_GROUPS.filter((g) => PROCESS_FIELDS.some((f) => f.group === g)).map((g) => (
              <section key={g} className="mb-4 last:mb-0">
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {PROCESS_FIELDS.filter((f) => f.group === g).map((f) => (
                    <MappingCell
                      key={f.key}
                      field={f}
                      headers={prepared.main.headers}
                      rows={prepared.main.rows}
                      col={mapping[f.key]}
                      conf={confidence[f.key]}
                      onChange={(col) => {
                        setMapping({ ...mapping, [f.key]: col });
                        setConfidence({ ...confidence, [f.key]: null });
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {prepared.steps && stepsMapping && stepsConfidence ? (
            <div className="card-elevated p-5">
              <div className="mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-4 text-teal" /> Steps sheet “{workbook.sheets[prepared.stepsSheet!].name}”</h3>
                <p className="text-xs text-muted-foreground">Step rows are linked to processes by <strong className="text-foreground">Process Name</strong> and ordered by Step No.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {STEP_FIELDS.map((f) => (
                  <MappingCell
                    key={f.key}
                    field={f}
                    headers={prepared.steps!.headers}
                    rows={prepared.steps!.rows}
                    col={stepsMapping[f.key]}
                    conf={stepsConfidence[f.key]}
                    onChange={(col) => {
                      setStepsMapping({ ...stepsMapping, [f.key]: col });
                      setStepsConfidence({ ...stepsConfidence, [f.key]: null });
                    }}
                  />
                ))}
              </div>
              {stepsMapping.processName === null || stepsMapping.name === null ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" /> Map Process Name and Step Name to use this sheet — otherwise it is ignored.</p>
              ) : null}
            </div>
          ) : null}

          <DefaultsPanel defaults={defaults} onChange={setDefaults} />

          {idMapped ? (
            <div className="card-elevated flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-info p-4 text-sm">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  Your file has a <strong>{prepared.main.headers[mapping.id!]}</strong> column. Process IDs are auto-generated, so by default it is <strong>ignored</strong>. Turn this on to match existing processes by that ID (updates still need your opt-in).
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium">
                <Switch checked={matchById} onCheckedChange={setMatchById} /> Match by Process ID
              </label>
            </div>
          ) : null}

          <div className="card-elevated overflow-hidden">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Preview (first 8 rows as uploaded)</div>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                    {prepared.main.headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prepared.main.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      {r.map((v, j) => (
                        <td key={j} className="max-w-[220px] truncate whitespace-nowrap px-3 py-1.5" title={v}>{v || <span className="text-muted-foreground">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {missing.length ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 px-4 py-3 text-sm text-danger">
              <XCircle className="mt-0.5 size-4 shrink-0" /> Map the Process Name column to continue.
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              <ArrowLeft /> Choose another file
            </Button>
            <Button disabled={missing.length > 0 || !prepared.main.rows.length} onClick={toValidate}>
              Validate data <ArrowRight />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <FilterTile active={view === "all"} onClick={() => setView("all")} label="All rows" value={counts.total} icon={Workflow} tone="neutral" />
            <FilterTile active={view === "valid"} onClick={() => setView("valid")} label="New & valid" value={counts.valid} icon={CheckCircle2} tone="success" />
            <FilterTile active={view === "update"} onClick={() => setView("update")} label="Existing processes" value={counts.update} icon={RefreshCcw} tone="info" />
            <FilterTile active={view === "invalid"} onClick={() => setView("invalid")} label="Invalid" value={counts.invalid} icon={XCircle} tone="danger" />
            <FilterTile active={view === "duplicate"} onClick={() => setView("duplicate")} label="Duplicate names" value={counts.duplicate} icon={Copy} tone="warning" />
          </div>

          {orphanCount ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft/50 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {orphanCount} step row{orphanCount === 1 ? "" : "s"} on the Steps sheet did not match any process name and will not be imported.
            </div>
          ) : null}

          {updateCandidates.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info-soft/50 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  {updateCandidates.length} row(s) match existing processes. They are <strong>skipped by default</strong> — opt in per row, or update all. Only the columns present in your file are changed; everything else stays as it is.
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium">
                <Switch checked={allOptedIn} onCheckedChange={(c) => setOptIn(c ? new Set(updateCandidates.map((r) => r.rowNumber)) : new Set())} />
                Update all existing processes
              </label>
            </div>
          ) : null}

          <DataTable columns={columns} rows={visible} getRowId={(r) => String(r.rowNumber)} pageSize={20} dense empty={<EmptyState title="No rows in this view" />} />

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft /> Back to mapping
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => errorReport(problemRows)} disabled={!problemRows.length || busy === "report"}>
                {busy === "report" ? <Loader2 className="animate-spin" /> : <Download />} Download error report
              </Button>
              <Button onClick={() => setStep(4)} disabled={!counts.valid && !counts.update}>
                Review import <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Will be created" value={plan.create.length} icon={Workflow} tone="success" hint="new, auto-numbered" />
            <KpiCard label="Will be updated" value={plan.update.length} icon={RefreshCcw} tone="info" hint="explicitly opted in" />
            <KpiCard label="Will be skipped" value={plan.skipped.length} icon={SkipForward} tone="neutral" hint="existing, not opted in" />
            <KpiCard label="Will fail" value={plan.failed.length} icon={XCircle} tone="danger" hint="invalid or duplicate" />
          </div>
          <div className="card-elevated space-y-2 p-5 text-sm">
            <h3 className="font-semibold">Before you import</h3>
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Process IDs (PRC-nnn) are generated automatically for every new process.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> No existing process is changed without your opt-in, and only the columns in your file are updated.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Processes that are not in this file are left untouched — nothing is deleted.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> The import is recorded in the Audit Log and in the import history below.</li>
              {defaults.status === "active" && plan.create.some((r) => r.input?.status === "active") ? (
                <li className="flex gap-2 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Processes imported as <strong>Active</strong> start generating tasks for the employees they apply to straight away.</li>
              ) : null}
              {plan.failed.length ? (
                <li className="flex gap-2 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {plan.failed.length} row(s) with errors will not be imported. Go back to fix them, or download the error report.</li>
              ) : null}
            </ul>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft /> Back to validation
            </Button>
            <Button onClick={doImport} disabled={busy === "import" || plan.create.length + plan.update.length === 0}>
              {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />} Import {plan.create.length + plan.update.length} process{plan.create.length + plan.update.length === 1 ? "" : "es"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 5 && result ? (
        <div className="space-y-4">
          <div className="card-elevated flex items-center gap-3 border-l-4 border-l-success p-5">
            <CheckCircle2 className="size-6 text-success" />
            <div>
              <div className="font-semibold">Import completed — {fileName}</div>
              <div className="text-sm text-muted-foreground">Recorded as {result.id} in the import history and audit log.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label="Total records" value={result.total} icon={Workflow} tone="neutral" />
            <KpiCard label="Created" value={result.created} icon={CheckCircle2} tone="success" />
            <KpiCard label="Updated" value={result.updated} icon={RefreshCcw} tone="info" />
            <KpiCard label="Skipped" value={result.skipped} icon={SkipForward} tone="warning" />
            <KpiCard label="Failed" value={result.failed} icon={XCircle} tone="danger" />
          </div>
          {result.createdIds.length || result.updatedIds.length ? (
            <div className="card-elevated space-y-3 p-5">
              {result.createdIds.length ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Created processes</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.createdIds.map((id) => (
                      <Link key={id} href={`/processes/${id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium hover:border-primary/40 hover:bg-muted/50">
                        <span className="font-mono text-muted-foreground">{id}</span> {db.processes.find((p) => p.id === id)?.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
              {result.updatedIds.length ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Updated processes</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.updatedIds.map((id) => (
                      <Link key={id} href={`/processes/${id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium hover:border-primary/40 hover:bg-muted/50">
                        <span className="font-mono text-muted-foreground">{id}</span> {db.processes.find((p) => p.id === id)?.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {result.errors.length || result.warnings.length ? (
            <div className="card-elevated space-y-1 border-l-4 border-l-warning p-4 text-xs">
              {result.errors.map((e) => (
                <p key={`${e.rowNumber}-${e.message}`} className="text-danger">• Row {e.rowNumber}: {e.message}</p>
              ))}
              {result.warnings.map((w) => (
                <p key={w} className="text-warning">• {w}</p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => errorReport(validated.filter((r) => r.state !== "valid" && !(r.state === "update" && optIn.has(r.rowNumber))))} disabled={busy === "report" || result.failed + result.skipped === 0}>
              {busy === "report" ? <Loader2 className="animate-spin" /> : <Download />} Download error report
            </Button>
            <Button variant="outline" onClick={template}>
              <FileSpreadsheet /> Download template
            </Button>
            <Button variant="outline" onClick={reset}>
              <Upload /> Import another file
            </Button>
            <Button asChild>
              <Link href="/processes">
                <Workflow /> Go to processes
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Import history</h3>
        <DataTable
          rows={history}
          getRowId={(r) => r.id}
          pageSize={5}
          dense
          initialSort={{ id: "at", dir: "desc" }}
          empty={<EmptyState title="No process imports yet" description="Imports you run here are recorded with who ran them and what was created." />}
          columns={[
            { id: "at", header: "Imported", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.importedAt)}</span>, sortValue: (r) => r.importedAt },
            { id: "file", header: "File", cell: (r) => <span className="font-medium">{r.fileName}</span>, sortValue: (r) => r.fileName },
            { id: "by", header: "Imported by", cell: (r) => r.importedBy, sortValue: (r) => r.importedBy },
            { id: "total", header: "Total", align: "right", cell: (r) => r.total, sortValue: (r) => r.total },
            { id: "created", header: "Created", align: "right", cell: (r) => <span className="text-success">{r.created}</span>, sortValue: (r) => r.created },
            { id: "updated", header: "Updated", align: "right", cell: (r) => <span className="text-info">{r.updated}</span>, sortValue: (r) => r.updated },
            { id: "skipped", header: "Skipped", align: "right", cell: (r) => r.skipped, sortValue: (r) => r.skipped },
            { id: "failed", header: "Failed", align: "right", cell: (r) => <span className={r.failed ? "text-danger" : ""}>{r.failed}</span>, sortValue: (r) => r.failed },
            {
              id: "ids",
              header: "New process IDs",
              cell: (r) =>
                r.createdIds.length ? (
                  <span className="flex max-w-[260px] flex-wrap gap-1">
                    {r.createdIds.slice(0, 4).map((id) => (
                      <Link key={id} href={`/processes/${id}`} className="font-mono text-xs text-primary hover:underline">{id}</Link>
                    ))}
                    {r.createdIds.length > 4 ? <span className="text-xs text-muted-foreground">+{r.createdIds.length - 4}</span> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
          ]}
        />
      </section>

      <FixRowDialog
        record={editing === null ? null : (validated.find((r) => r.rowNumber === editing) ?? null)}
        ctx={ctx}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          setRecords((rs) => rs.map((r) => (r.rowNumber === editing ? { ...r, values } : r)));
          setEditing(null);
          toast.success(`Row ${editing} updated and re-validated`);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

function MappingCell<K extends string>({ field, headers, rows, col, conf, onChange }: { field: FieldDef<K>; headers: string[]; rows: string[][]; col: number | null; conf: Confidence | null; onChange: (col: number | null) => void }) {
  const missingReq = field.required && col === null;
  const sample = col !== null ? rows.find((r) => r[col])?.[col] : undefined;
  return (
    <div className={cn("rounded-lg border p-3", missingReq && "border-danger/50 bg-danger-soft/30", col !== null && "bg-card")}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label className="text-xs font-medium">
          {field.header}
          {field.required ? <span className="text-danger">*</span> : <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
        </Label>
        {col !== null && conf ? <ToneBadge tone={CONF_META[conf].tone}>{CONF_META[conf].label}</ToneBadge> : col !== null ? <Check className="size-3.5 text-success" /> : null}
      </div>
      <Select value={col === null ? NOT_MAPPED : String(col)} onValueChange={(v) => onChange(v === NOT_MAPPED ? null : Number(v))}>
        <SelectTrigger size="sm" className="w-full text-xs" aria-label={`Column for ${field.header}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_MAPPED}>— Not mapped —</SelectItem>
          {headers.map((h, i) => (
            <SelectItem key={`${h}-${i}`} value={String(i)}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={sample}>{missingReq ? "Required column is not mapped" : sample ? `e.g. ${sample}` : field.description}</p>
    </div>
  );
}

function DefaultsPanel({ defaults, onChange }: { defaults: ImportDefaults; onChange: (d: ImportDefaults) => void }) {
  const db = useDatabase();
  const set = <K extends keyof ImportDefaults>(k: K, v: ImportDefaults[K]) => onChange({ ...defaults, [k]: v });
  const options = db.employees.filter((e) => e.status !== "inactive").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.id }));
  return (
    <div className="card-elevated p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Defaults for blank cells</h3>
        <p className="text-xs text-muted-foreground">Used only where your file has no value (or no column) for a field. Values in the file always win. For updates, blank cells never overwrite existing data.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={defaults.categoryId || EMPTY} onValueChange={(v) => set("categoryId", v === EMPTY ? "" : v)}>
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY}>— None (required in file) —</SelectItem>
              {db.processCategories.filter((c) => c.status === "active").map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Owning department</Label>
          <Select value={defaults.departmentId ?? EMPTY} onValueChange={(v) => set("departmentId", v === EMPTY ? null : v)}>
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY}>Organization-wide</SelectItem>
              {db.departments.filter((d) => d.status === "active").map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Process owner</Label>
          <Combobox value={defaults.ownerId || null} onChange={(v) => set("ownerId", v ?? "")} options={options} placeholder="None (required in file)" searchPlaceholder="Search employees…" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={defaults.status} onValueChange={(v) => set("status", v as ImportDefaults["status"])}>
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft (nothing is assigned)</SelectItem>
              <SelectItem value="active">Active (starts generating tasks)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Frequency</Label>
          <Select value={defaults.frequency} onValueChange={(v) => set("frequency", v as ImportDefaults["frequency"])}>
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f.toLowerCase().replace(" ", "_")}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select value={defaults.priority} onValueChange={(v) => set("priority", v as ImportDefaults["priority"])}>
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p.toLowerCase()}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Risk level</Label>
          <Select value={defaults.riskLevel} onValueChange={(v) => set("riskLevel", v as ImportDefaults["riskLevel"])}>
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RISKS.map((p) => (
                <SelectItem key={p} value={p.toLowerCase()}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Compliance threshold %</Label>
          <Input type="number" min={0} max={100} className="h-8 text-xs" value={defaults.threshold} onChange={(e) => set("threshold", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Start date</Label>
          <Input type="date" className="h-8 text-xs" value={defaults.startDate} onChange={(e) => e.target.value && set("startDate", e.target.value)} />
        </div>
        <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
          Mandatory
          <Switch checked={defaults.mandatory} onCheckedChange={(c) => set("mandatory", c)} />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
          Approval required
          <Switch checked={defaults.approval} onCheckedChange={(c) => set("approval", c)} />
        </label>
      </div>
    </div>
  );
}

function Cell({ value, error, mono, strong }: { value: string; error?: string; mono?: boolean; strong?: boolean }) {
  return (
    <span className={cn("block max-w-[220px] truncate", mono && "font-mono text-xs", strong && "font-medium", error && "rounded bg-danger-soft px-1.5 py-0.5 text-danger")} title={error ?? value}>
      {value || <span className="italic opacity-70">empty</span>}
    </span>
  );
}

function FilterTile({ active, onClick, label, value, icon: Icon, tone }: { active: boolean; onClick: () => void; label: string; value: number; icon: typeof Workflow; tone: "success" | "info" | "danger" | "warning" | "neutral" }) {
  const toneCls = { success: "text-success bg-success-soft", info: "text-info bg-info-soft", danger: "text-danger bg-danger-soft", warning: "text-warning bg-warning-soft", neutral: "text-muted-foreground bg-muted" }[tone];
  return (
    <button onClick={onClick} className={cn("card-elevated flex items-center gap-3 p-3 text-left transition-all hover:border-primary/30", active && "ring-2 ring-primary/40")} aria-pressed={active}>
      <span className={cn("flex size-9 items-center justify-center rounded-lg", toneCls)}>
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="card-elevated grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
      {STEPS.map((s) => {
        const done = step > s.n;
        const current = step === s.n;
        return (
          <li key={s.n} className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5", current && "bg-info-soft/60")}>
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", done && "border-success bg-success text-white", current && "border-primary bg-primary text-primary-foreground", !done && !current && "text-muted-foreground")}>
              {done ? <Check className="size-3.5" /> : s.n}
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate text-xs font-semibold", !current && !done && "text-muted-foreground")}>{s.title}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{s.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Fix dialog                                                           */
/* ------------------------------------------------------------------ */

function FixRowDialog({ record, ctx, onClose, onSave }: { record: ValidatedRecord | null; ctx: ValidationContext; onClose: () => void; onSave: (v: Record<ProcessFieldKey, string>) => void }) {
  return (
    <Dialog open={Boolean(record)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        {record ? <FixForm key={record.rowNumber} record={record} ctx={ctx} onClose={onClose} onSave={onSave} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FixForm({ record, ctx, onClose, onSave }: { record: ValidatedRecord; ctx: ValidationContext; onClose: () => void; onSave: (v: Record<ProcessFieldKey, string>) => void }) {
  const { db } = ctx;
  const [draft, setDraft] = useState<Record<ProcessFieldKey, string>>({ ...record.values });
  const live = useMemo(() => validateRecords([{ rowNumber: record.rowNumber, values: draft, stepRows: record.stepRows }], ctx)[0], [record, draft, ctx]);

  const options: Partial<Record<ProcessFieldKey, string[]>> = {
    category: db.processCategories.filter((c) => c.status === "active").map((c) => c.name),
    department: ["Organization-wide", ...db.departments.filter((d) => d.status === "active").map((d) => d.name)],
    appliedAt: LEVELS,
    frequency: FREQUENCIES,
    priority: PRIORITIES,
    risk: RISKS,
    status: STATUSES,
    mandatory: YES_NO,
    approval: YES_NO,
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Correct row {record.rowNumber}</DialogTitle>
        <DialogDescription>Edit values and they are re-validated live. File-wide checks (duplicate names) are re-run when you save.</DialogDescription>
      </DialogHeader>
      {record.stepRows.length ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="mb-1 font-medium">{record.stepRows.length} step{record.stepRows.length === 1 ? "" : "s"} from the Steps sheet (edit them in the file):</div>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
            {record.stepRows.map((s) => (
              <li key={s.rowNumber}>{s.values.name || <em>(no name)</em>}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="space-y-4">
        {FIELD_GROUPS.filter((g) => PROCESS_FIELDS.some((f) => f.group === g)).map((g) => (
          <section key={g}>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROCESS_FIELDS.filter((f) => f.group === g).map((f) => {
                const err = live.errors[f.key];
                const sugg = live.suggestions[f.key];
                const opts = options[f.key];
                const wide = TEXTAREA_FIELDS.includes(f.key);
                return (
                  <div key={f.key} className={cn("space-y-1", wide && "sm:col-span-2")}>
                    <Label className="text-xs">
                      {f.header}
                      {f.required ? <span className="text-danger">*</span> : null}
                    </Label>
                    {opts ? (
                      <Select
                        value={opts.find((o) => o.toLowerCase() === draft[f.key].toLowerCase()) ?? (draft[f.key] ? `__raw__${draft[f.key]}` : EMPTY)}
                        onValueChange={(v) => setDraft({ ...draft, [f.key]: v === EMPTY ? "" : v.replace(/^__raw__/, "") })}
                      >
                        <SelectTrigger className="w-full" aria-invalid={Boolean(err)}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY}>— Empty (use default) —</SelectItem>
                          {draft[f.key] && !opts.some((o) => o.toLowerCase() === draft[f.key].toLowerCase()) ? <SelectItem value={`__raw__${draft[f.key]}`}>{draft[f.key]} (from file)</SelectItem> : null}
                          {opts.map((o) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : wide ? (
                      <Textarea rows={f.key === "steps" ? 4 : 2} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} aria-invalid={Boolean(err)} placeholder={f.key === "steps" ? "Step name | description | minutes | evidence Y/N | approval Y/N | mandatory Y/N" : undefined} />
                    ) : (
                      <Input value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} aria-invalid={Boolean(err)} placeholder={f.kind === "date" ? "yyyy-mm-dd" : f.kind === "list" ? "A, B, C" : undefined} />
                    )}
                    {err ? <p className="text-[11px] text-danger">{err}</p> : null}
                    {err && sugg?.length ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">Did you mean</span>
                        {sugg.map((s) => (
                          <button key={s.value} type="button" onClick={() => setDraft({ ...draft, [f.key]: s.value })} className="rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info hover:bg-info-soft/70">
                            {s.label}
                          </button>
                        ))}
                        <span className="text-[11px] text-muted-foreground">?</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(draft)}>
          <Check /> Save & re-validate
        </Button>
      </DialogFooter>
    </>
  );
}
