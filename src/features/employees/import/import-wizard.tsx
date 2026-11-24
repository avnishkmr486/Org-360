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
  SlidersHorizontal,
  Sparkles,
  RefreshCcw,
  ShieldAlert,
  SkipForward,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { KpiCard } from "@/components/common/kpi-card";
import { EmptyState } from "@/components/common/states";
import { ToneBadge } from "@/components/common/badges";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser, useDatabase, useToday } from "@/hooks/use-data";
import { importEmployeesWithMaster, type ImportWithMasterResult, type MasterPlan } from "@/lib/repositories/employee-import";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE } from "@/lib/import/sheet-parser";
import { autoMapHeaders, IMPORT_FIELDS, MAPPING_LABELS, missingMinimum, type Confidence, type FieldMapping, type ImportFieldKey, type MappingConfidence, type MappingKey } from "./fields";
import { headerRowFor, ImportParseError, initialSelection, loadWorkbook, tableFor, type ParsedSheet, type RawWorkbook } from "./parse";
import { analyzeRecords, buildRecords, DEFAULT_OPTIONS, masterPlanFor, summarize, validateRecords, type ImportOptions, type ImportRecord, type RecordState, type ValidatedRecord, type ValueSource } from "./validate";
import { MASTER_FIELDS, MASTER_META, masterOptions, type MasterDecision, type MasterField, type UnknownMasterValue } from "./master-reconcile";
import { downloadEmployeeTemplate, downloadErrorReport } from "./workbooks";

const STEPS = [
  { n: 1, title: "Upload file", detail: "Any layout · XLSX / CSV" },
  { n: 2, title: "Map & defaults", detail: "Columns · blanks" },
  { n: 3, title: "Validate & correct", detail: "Errors · duplicates" },
  { n: 4, title: "Review & import", detail: "Create · update · skip" },
  { n: 5, title: "Summary", detail: "Results & reports" },
];

const STATE_META: Record<RecordState, { label: string; tone: "success" | "info" | "danger" | "warning" }> = {
  valid: { label: "New", tone: "success" },
  update: { label: "Existing ID", tone: "info" },
  invalid: { label: "Invalid", tone: "danger" },
  duplicate: { label: "Duplicate", tone: "warning" },
};

const NOT_MAPPED = "__none__";

export function ImportWizard() {
  const crumbs = [{ label: "Master Data" }, { label: "Employee Directory", href: "/employees" }, { label: "Import Employees" }];
  const db = useDatabase();
  const today = useToday();
  const { can } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<RawWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<FieldMapping | null>(null);
  const [confidence, setConfidence] = useState<MappingConfidence>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [optIn, setOptIn] = useState<Set<number>>(new Set());
  const [view, setView] = useState<RecordState | "all">("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "parse" | "import" | "template" | "report">(null);
  const [result, setResult] = useState<ImportWithMasterResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(() => analyzeRecords(records, db, today, options), [records, db, today, options]);
  const validated = analysis.rows;
  const counts = summarize(validated);
  const plan = useMemo(() => {
    const create = validated.filter((r) => r.state === "valid");
    const update = validated.filter((r) => r.state === "update" && optIn.has(r.rowNumber));
    const skipped = validated.filter((r) => r.state === "update" && !optIn.has(r.rowNumber));
    const failed = validated.filter((r) => r.state === "invalid" || r.state === "duplicate");
    return { create, update, skipped, failed };
  }, [validated, optIn]);
  /** Master data needed by the rows that will actually be imported. */
  const masterPlan = useMemo<MasterPlan>(() => masterPlanFor(analysis.planned, [...plan.create, ...plan.update]), [analysis.planned, plan]);

  if (!can("employees.import")) {
    return (
      <div>
        <PageHeader breadcrumbs={crumbs} title="Import Employees" />
        <EmptyState icon={<ShieldAlert className="size-5" />} title="Import is restricted" description="Only Super Admins and Administrators can import employees. Switch persona from the role switcher." />
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

  /** (Re)build the table for a sheet + header row and auto-map its columns. */
  const applyTable = (wb: RawWorkbook, si: number, hr: number) => {
    try {
      const table = tableFor(wb, si, hr);
      const auto = autoMapHeaders(table.headers, table.rows);
      setSheetIndex(si);
      setHeaderRow(hr);
      setSheet(table);
      setMapping(auto.mapping);
      setConfidence(auto.confidence);
      return table;
    } catch (err) {
      toast.error("Could not use that selection", { description: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await run("parse", async () => {
      try {
        const wb = await loadWorkbook(file);
        const sel = initialSelection(wb);
        const table = applyTable(wb, sel.sheetIndex, sel.headerRow);
        if (!table) return;
        setWorkbook(wb);
        setFileName(file.name);
        setOptions({ ...DEFAULT_OPTIONS, defaults: { status: "Active", dateOfJoining: today } });
        setRecords([]);
        setOptIn(new Set());
        setResult(null);
        setStep(2);
        toast.success(`Read ${table.rows.length} rows from ${file.name}`, { description: wb.sheets.length > 1 ? `Using sheet “${table.sheetName}” (${wb.sheets.length} sheets found)` : undefined });
      } catch (err) {
        toast.error("Could not read file", { description: err instanceof ImportParseError || err instanceof Error ? err.message : String(err) });
      }
    });
  };

  const reset = () => {
    setStep(1);
    setWorkbook(null);
    setSheet(null);
    setMapping(null);
    setConfidence({});
    setRecords([]);
    setOptIn(new Set());
    setResult(null);
    setFileName("");
    setView("all");
    setOptions(DEFAULT_OPTIONS);
    if (inputRef.current) inputRef.current.value = "";
  };

  const template = () =>
    run("template", async () => {
      try {
        await downloadEmployeeTemplate(db);
        toast.success("Template downloaded");
      } catch (err) {
        toast.error("Template download failed", { description: err instanceof Error ? err.message : String(err) });
      }
    });
  const errorReport = (list: ValidatedRecord[]) =>
    run("report", async () => {
      try {
        await downloadErrorReport(list, db.organization.name, fileName);
        toast.success("Error report downloaded");
      } catch (err) {
        toast.error("Report failed", { description: err instanceof Error ? err.message : String(err) });
      }
    });

  const doImport = () =>
    run("import", async () => {
      try {
        const rows = [...plan.create.map((r) => ({ employee: r.resolved!, action: "create" as const })), ...plan.update.map((r) => ({ employee: r.resolved!, action: "update" as const }))];
        const summary = await importEmployeesWithMaster(masterPlan, rows, { fileName, skipped: plan.skipped.length, failed: plan.failed.length });
        setResult(summary);
        setStep(5);
        const m = summary.createdMaster;
        const madeMaster = m.departments.length + m.bands.length;
        toast.success("Import complete", { description: `${summary.created} created · ${summary.updated} updated${madeMaster ? ` · ${madeMaster} master record(s) added` : ""}` });
      } catch (err) {
        toast.error("Import failed", { description: err instanceof Error ? err.message : String(err) });
      }
    });

  const missing = mapping ? missingMinimum(mapping) : [];
  const generatedIds = validated.filter((r) => r.idSource === "generated").length;
  const noIdentity = validated.filter((r) => r.warnings.length > 0 && (r.state === "valid" || r.state === "update")).length;
  const visible = validated.filter((r) => view === "all" || r.state === view);
  const problemRows = validated.filter((r) => r.state === "invalid" || r.state === "duplicate");

  const tagOf = (r: ValidatedRecord, ...keys: ImportFieldKey[]): ValueSource | undefined => keys.map((k) => r.sources[k]).find(Boolean);
  const recordCols: Column<ValidatedRecord>[] = [
    { id: "row", header: "Row", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.rowNumber}</span>, sortValue: (r) => r.rowNumber },
    { id: "state", header: "Result", cell: (r) => <ToneBadge tone={STATE_META[r.state].tone}>{STATE_META[r.state].label}</ToneBadge>, sortValue: (r) => r.state },
    { id: "id", header: "Employee ID", cell: (r) => <Cell value={r.effectiveId || r.values.id} error={r.errors.id} tag={r.idSource === "generated" ? "generated" : r.idSource === "email-match" ? "existing" : undefined} mono /> },
    { id: "name", header: "Name", cell: (r) => <Cell value={`${r.effective.firstName} ${r.effective.lastName}`.trim()} error={r.errors.firstName ?? r.errors.lastName} tag={tagOf(r, "firstName", "lastName")} /> },
    { id: "email", header: "Email", cell: (r) => <Cell value={r.effective.email || "—"} error={r.errors.email} tag={tagOf(r, "email")} /> },
    { id: "dept", header: "Department / Team", cell: (r) => <Cell value={[r.effective.department, r.effective.team].filter(Boolean).join(" / ")} error={r.errors.department ?? r.errors.team} tag={tagOf(r, "department", "team")} /> },
    { id: "band", header: "Band", cell: (r) => <Cell value={r.effective.band} error={r.errors.band} tag={tagOf(r, "band")} /> },
    {
      id: "issues",
      header: "Issues",
      cell: (r) => {
        const errs = Object.values(r.errors);
        if (!errs.length)
          return (
            <div className="space-y-1">
              {r.state === "update" ? (
                <span className="text-xs text-info">
                  Matches {r.existing?.firstName} {r.existing?.lastName}
                  {r.idSource === "email-match" ? " (by email)" : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <Check className="size-3.5" /> Ready
                </span>
              )}
              {r.warnings.map((w) => (
                <div key={w} className="flex max-w-[260px] items-start gap-1 text-[11px] text-warning">
                  <AlertTriangle className="mt-px size-3 shrink-0" /> {w}
                </div>
              ))}
            </div>
          );
        return (
          <ul className="max-w-[320px] space-y-0.5 text-xs text-danger">
            {errs.slice(0, 3).map((e) => (
              <li key={e}>• {e}</li>
            ))}
            {errs.length > 3 ? <li>+{errs.length - 3} more</li> : null}
          </ul>
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

  const updateCandidates = validated.filter((r) => r.state === "update");
  const allOptedIn = updateCandidates.length > 0 && updateCandidates.every((r) => optIn.has(r.rowNumber));

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={crumbs}
        title="Import Employees"
        description="Upload an Excel or CSV file in whatever layout you already have. Columns are matched automatically, blanks can use defaults, and Employee ID stays the unique key — existing records are only updated when you opt in and employees missing from the file are never deleted."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={template} disabled={busy === "template"}>
              {busy === "template" ? <Loader2 className="animate-spin" /> : <Download />} Download template
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/employees">
                <ArrowLeft /> Back to directory
              </Link>
            </Button>
          </>
        }
      />

      <Stepper step={step} />

      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div
              className={cn(
                "card-elevated flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors lg:col-span-2",
                dragOver ? "border-primary bg-info-soft/40" : "border-border",
              )}
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
                <p className="text-sm font-semibold">Upload your employee file — any layout</p>
                <p className="text-xs text-muted-foreground">Drag & drop an Excel (.xlsx, .xlsm) or text (.csv, .tsv, .txt) file, or browse. Max 10 MB.</p>
              </div>
              <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button onClick={() => inputRef.current?.click()} disabled={busy === "parse"}>
                {busy === "parse" ? <Loader2 className="animate-spin" /> : <Upload />} Browse files
              </Button>
              <p className="text-[11px] text-muted-foreground">Have an old .xls file? Open it in Excel and Save As .xlsx or CSV first.</p>
            </div>
            <div className="card-elevated space-y-3 p-5">
              <div className="flex size-10 items-center justify-center rounded-lg bg-teal-soft text-teal">
                <FileSpreadsheet className="size-5" />
              </div>
              <h3 className="text-sm font-semibold">Template (optional)</h3>
              <p className="text-xs text-muted-foreground">Prefer a ready-made layout? Download the standard template with all 14 fields (email is optional), a Reference sheet of valid master values, and instructions.</p>
              <Button variant="outline" size="sm" onClick={template} disabled={busy === "template"}>
                {busy === "template" ? <Loader2 className="animate-spin" /> : <Download />} Download template (.xlsx)
              </Button>
            </div>
          </div>
          <div className="card-elevated p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-info-soft text-info">
                <Sparkles className="size-4" />
              </span>
              <h3 className="text-sm font-semibold">Works with any layout</h3>
            </div>
            <ul className="grid gap-x-8 gap-y-2 text-xs text-muted-foreground md:grid-cols-2">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> Any sheet and any column order — the best sheet is picked for you, and you can switch.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> Title or note rows above the headers are skipped automatically (or choose the header row yourself).</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> One “Full Name” column is split into first and last name.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> Missing columns or blank cells can use defaults (department, band, joining date…).</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> Email is optional. No Employee ID? One is generated — or the employee is matched by email when you give one (updates still need your opt-in).</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> New Departments and Bands in your file can be added to Master Data automatically — you review them before importing.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> Dates like 20-Nov-2026, 20/11/2026 or Excel dates; “did you mean…?” suggestions for misspelt departments and teams.</li>
            </ul>
            <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">Minimum from your file: a name. Everything else is optional or can use defaults.</p>
          </div>
        </div>
      ) : null}

      {step === 2 && workbook && sheet && mapping ? (
        <div className="space-y-4">
          <SourceCard
            workbook={workbook}
            sheetIndex={sheetIndex}
            headerRow={headerRow}
            sheet={sheet}
            fileName={fileName}
            onSheet={(i) => applyTable(workbook, i, headerRowFor(workbook, i))}
            onHeaderRow={(r) => applyTable(workbook, sheetIndex, r)}
          />

          <div className="card-elevated p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Map file columns to employee fields</h3>
                <p className="text-xs text-muted-foreground">Columns were matched by header name and content. Adjust anything that looks wrong — unmapped fields use the defaults below.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const a = autoMapHeaders(sheet.headers, sheet.rows);
                  setMapping(a.mapping);
                  setConfidence(a.confidence);
                }}
              >
                <RefreshCcw /> Auto-map again
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(["fullName", ...IMPORT_FIELDS.map((f) => f.key)] as MappingKey[]).map((key) => {
                const field = IMPORT_FIELDS.find((f) => f.key === key);
                const col = mapping[key];
                const sample = col !== null ? sheet.rows.find((r) => r[col])?.[col] : undefined;
                const fallback = key !== "fullName" ? options.defaults[key as ImportFieldKey] : undefined;
                const fromFullName = (key === "firstName" || key === "lastName") && col === null && mapping.fullName !== null;
                const needsValue = Boolean(field?.required) && col === null && !fallback && !fromFullName && key !== "firstName";
                return (
                  <div key={key} className={cn("rounded-lg border p-3", key === "fullName" && "border-info/30 bg-info-soft/30", needsValue && "border-warning/50 bg-warning-soft/30")}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium">
                        {MAPPING_LABELS[key]}
                        {key === "id" ? <span className="ml-1 font-normal text-muted-foreground">(optional — generated if blank)</span> : null}
                        {key === "email" || key === "phone" || key === "team" || key === "reportingManagerId" || key === "status" ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : null}
                      </Label>
                      {col !== null && confidence[key] ? <ConfidenceBadge level={confidence[key]!} /> : null}
                    </div>
                    <Select value={col === null ? NOT_MAPPED : String(col)} onValueChange={(v) => setMapping({ ...mapping, [key]: v === NOT_MAPPED ? null : Number(v) })}>
                      <SelectTrigger size="sm" className="w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_MAPPED}>— Not mapped —</SelectItem>
                        {sheet.headers.map((h, i) => (
                          <SelectItem key={`${h}-${i}`} value={String(i)}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {col !== null && sample
                        ? `e.g. ${sample}`
                        : fromFullName
                          ? "Taken from the Full name column"
                          : col === null && fallback
                            ? `Not mapped — will use default “${fallback}”`
                            : needsValue
                              ? "Not mapped — set a default below, or rows will be flagged"
                              : key === "fullName"
                                ? "Use when one column holds “First Last”"
                                : (field?.description ?? "")}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <DefaultsCard options={options} setOptions={setOptions} />

          <div className="card-elevated overflow-hidden">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Preview (first 8 data rows as uploaded)</div>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                    {sheet.headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      {r.map((v, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-1.5">
                          {v || <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {missing.length ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 px-4 py-3 text-sm text-danger">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              Your file still needs {missing.join(" and ")}. Map a column above, or pick a different sheet / header row.
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              <ArrowLeft /> Choose another file
            </Button>
            <Button
              disabled={missing.length > 0}
              onClick={() => {
                setRecords(buildRecords(sheet.rows, mapping));
                setOptIn(new Set());
                setView("all");
                setStep(3);
              }}
            >
              Validate data <ArrowRight />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <FilterTile active={view === "all"} onClick={() => setView("all")} label="All rows" value={counts.total} icon={Users} tone="neutral" />
            <FilterTile active={view === "valid"} onClick={() => setView("valid")} label="New & valid" value={counts.valid} icon={UserPlus} tone="success" />
            <FilterTile active={view === "update"} onClick={() => setView("update")} label="Existing IDs" value={counts.update} icon={RefreshCcw} tone="info" />
            <FilterTile active={view === "invalid"} onClick={() => setView("invalid")} label="Invalid" value={counts.invalid} icon={XCircle} tone="danger" />
            <FilterTile active={view === "duplicate"} onClick={() => setView("duplicate")} label="Duplicate IDs" value={counts.duplicate} icon={Copy} tone="warning" />
          </div>

          {updateCandidates.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info-soft/50 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  {updateCandidates.length} row(s) match existing Employee IDs. They are <strong>skipped by default</strong> — opt in per row, or update all, to overwrite those records.
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium">
                <Switch checked={allOptedIn} onCheckedChange={(c) => setOptIn(c ? new Set(updateCandidates.map((r) => r.rowNumber)) : new Set())} />
                Update all existing employees
              </label>
            </div>
          ) : null}

          {analysis.unknown.length > 0 ? <MasterReconcilePanel unknown={analysis.unknown} options={options} setOptions={setOptions} /> : null}

          {noIdentity > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                {noIdentity} row(s) have neither an Employee ID nor an email. They are imported as new employees with a generated ID — uploading the same file again would create them again.
              </span>
            </div>
          ) : null}

          {generatedIds > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-teal" />
              <span>
                {generatedIds} row(s) have no Employee ID — new IDs (<span className="font-mono text-xs">EMP-####</span>) are generated and marked <em>generated</em>. Cells filled from defaults are marked <em>default</em>.
              </span>
            </div>
          ) : null}

          <DataTable columns={recordCols} rows={visible} getRowId={(r) => String(r.rowNumber)} pageSize={20} dense empty={<EmptyState title="No rows in this view" />} />

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
            <KpiCard label="Will be created" value={plan.create.length} icon={UserPlus} tone="success" hint="new Employee IDs" />
            <KpiCard label="Will be updated" value={plan.update.length} icon={RefreshCcw} tone="info" hint="explicitly opted in" />
            <KpiCard label="Will be skipped" value={plan.skipped.length} icon={SkipForward} tone="neutral" hint="existing, not opted in" />
            <KpiCard label="Will fail" value={plan.failed.length} icon={XCircle} tone="danger" hint="invalid or duplicate" />
          </div>
          {masterPlan.total > 0 ? <MasterPlanCard plan={masterPlan} /> : null}
          <div className="card-elevated space-y-2 p-5 text-sm">
            <h3 className="font-semibold">Before you import</h3>
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Employee ID is the unique identifier; no record is overwritten without your opt-in.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Employees not present in this file are left untouched — nothing is deleted.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> The import is recorded in Import History and the Audit Log.</li>
              {masterPlan.total > 0 ? (
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {masterPlan.total} new Department / Band record(s) are added to Master Data in the same step — if anything fails, nothing is changed.</li>
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
              {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />} Import {plan.create.length + plan.update.length} employee(s)
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
              <div className="text-sm text-muted-foreground">Employee data has been updated in the directory.</div>
            </div>
          </div>
          <MasterCreatedCard created={result.createdMaster} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label="Total records" value={result.total} icon={Users} tone="neutral" />
            <KpiCard label="Created" value={result.created} icon={UserPlus} tone="success" />
            <KpiCard label="Updated" value={result.updated} icon={RefreshCcw} tone="info" />
            <KpiCard label="Skipped" value={result.skipped} icon={SkipForward} tone="warning" />
            <KpiCard label="Failed" value={result.failed} icon={XCircle} tone="danger" />
          </div>
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
              <Link href="/employees">
                <Users /> Go to directory
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Import history</h3>
        <DataTable
          rows={db.importHistory}
          getRowId={(r) => r.id}
          pageSize={5}
          dense
          initialSort={{ id: "at", dir: "desc" }}
          empty={<EmptyState title="No imports yet" />}
          columns={[
            { id: "at", header: "Imported", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.importedAt)}</span>, sortValue: (r) => r.importedAt },
            { id: "file", header: "File", cell: (r) => <span className="font-medium">{r.fileName}</span>, sortValue: (r) => r.fileName },
            { id: "by", header: "Imported by", cell: (r) => r.importedBy, sortValue: (r) => r.importedBy },
            { id: "total", header: "Total", align: "right", cell: (r) => r.total, sortValue: (r) => r.total },
            { id: "created", header: "Created", align: "right", cell: (r) => <span className="text-success">{r.created}</span>, sortValue: (r) => r.created },
            { id: "updated", header: "Updated", align: "right", cell: (r) => <span className="text-info">{r.updated}</span>, sortValue: (r) => r.updated },
            { id: "skipped", header: "Skipped", align: "right", cell: (r) => r.skipped, sortValue: (r) => r.skipped },
            { id: "failed", header: "Failed", align: "right", cell: (r) => <span className={r.failed ? "text-danger" : ""}>{r.failed}</span>, sortValue: (r) => r.failed },
          ]}
        />
      </section>

      <FixRowDialog
        record={editing === null ? null : (validated.find((r) => r.rowNumber === editing) ?? null)}
        options={options}
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

const TAG_LABEL: Record<ValueSource, string> = { default: "default", existing: "from record", generated: "generated", split: "split", mapped: "mapped", new: "new in master" };

function Cell({ value, error, mono, tag }: { value: string; error?: string; mono?: boolean; tag?: ValueSource }) {
  return (
    <span className={cn("flex max-w-[220px] items-center gap-1.5", mono && "font-mono text-xs")} title={error ?? value}>
      <span className={cn("truncate", tag && !error && "italic text-muted-foreground", error && "rounded bg-danger-soft px-1.5 py-0.5 text-danger")}>{value || <span className="italic opacity-70">empty</span>}</span>
      {tag && !error ? <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-medium not-italic uppercase tracking-wide text-muted-foreground">{TAG_LABEL[tag]}</span> : null}
    </span>
  );
}

const CONFIDENCE_META: Record<Confidence, { label: string; tone: "success" | "info" | "warning" }> = {
  exact: { label: "Exact", tone: "success" },
  likely: { label: "Likely", tone: "info" },
  guessed: { label: "Guessed", tone: "warning" },
};

function ConfidenceBadge({ level }: { level: Confidence }) {
  return <ToneBadge tone={CONFIDENCE_META[level].tone}>{CONFIDENCE_META[level].label}</ToneBadge>;
}

/** Sheet + header row pickers with a raw view of the top rows. */
function SourceCard({
  workbook,
  sheetIndex,
  headerRow,
  sheet,
  fileName,
  onSheet,
  onHeaderRow,
}: {
  workbook: RawWorkbook;
  sheetIndex: number;
  headerRow: number;
  sheet: ParsedSheet;
  fileName: string;
  onSheet: (i: number) => void;
  onHeaderRow: (r: number) => void;
}) {
  const matrix = workbook.sheets[sheetIndex].matrix;
  const shown = matrix.slice(0, Math.min(30, Math.max(8, headerRow + 3)));
  const width = Math.min(Math.max(...shown.map((r) => r.length), 1), 8);
  return (
    <div className="card-elevated p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Your file</h3>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fileName}</span> · sheet “{sheet.sheetName}” · {sheet.headers.length} columns · {sheet.rows.length} data rows
          </p>
        </div>
        {workbook.sheets.length > 1 ? (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Sheet</Label>
            <Select value={String(sheetIndex)} onValueChange={(v) => onSheet(Number(v))}>
              <SelectTrigger size="sm" className="min-w-[180px] text-xs" aria-label="Sheet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workbook.sheets.map((s, i) => (
                  <SelectItem key={s.name + i} value={String(i)}>
                    {s.name} ({s.matrix.length} rows)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      <p className="mb-1.5 mt-3 text-xs text-muted-foreground">Header row — click the row that holds your column titles. Rows above it (titles, notes) are ignored.</p>
      <div className="scrollbar-thin overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={cn("border-t first:border-t-0", i === headerRow && "bg-info-soft/60 font-medium", i < headerRow && "text-muted-foreground/70")}>
                <td className="w-28 px-2 py-1">
                  <button type="button" onClick={() => onHeaderRow(i)} aria-pressed={i === headerRow} className={cn("rounded px-1.5 py-0.5 text-[11px] hover:bg-muted", i === headerRow ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground")}>
                    {i === headerRow ? "Header" : i < headerRow ? `Row ${i + 1} · skipped` : `Row ${i + 1}`}
                  </button>
                </td>
                {Array.from({ length: width }, (_, j) => (
                  <td key={j} className="max-w-[180px] truncate whitespace-nowrap px-3 py-1">
                    {r[j] || <span className="opacity-40">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const NONE = "__none__";

/** "Defaults for blank cells" — applied to unmapped columns and empty cells of NEW employees. */
function DefaultsCard({ options, setOptions }: { options: ImportOptions; setOptions: (o: ImportOptions) => void }) {
  const db = useDatabase();
  const set = (key: ImportFieldKey, value: string) => {
    const defaults = { ...options.defaults, [key]: value };
    if (!value) delete defaults[key];
    if (key === "department") delete defaults.team;
    setOptions({ ...options, defaults });
  };
  const deptDefault = db.departments.find((d) => d.name === options.defaults.department);
  const teams = db.teams.filter((t) => t.status === "active" && (!deptDefault || t.departmentId === deptDefault.id));
  const sel = (key: ImportFieldKey, label: string, values: string[]) => (
    <div className="space-y-1" key={key}>
      <Label className="text-xs">{label}</Label>
      <Select value={options.defaults[key] || NONE} onValueChange={(v) => set(key, v === NONE ? "" : v)}>
        <SelectTrigger size="sm" className="w-full text-xs" aria-label={`Default ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— None —</SelectItem>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="card-elevated p-5">
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal className="size-4 text-teal" />
        <h3 className="text-sm font-semibold">Defaults for blank cells</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Used for fields your file doesn&apos;t have, and for empty cells, on <strong>new</strong> employees. Existing employees keep their current values for blank cells. Defaulted cells are marked in the next step.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sel("department", "Department", db.departments.filter((d) => d.status === "active").map((d) => d.name))}
        {sel("team", "Team", teams.map((t) => t.name))}
        {sel("band", "Band", db.bands.filter((b) => b.status === "active").map((b) => b.code))}
        {sel("status", "Employment status", ["Active", "On Leave", "Inactive"])}
        <div className="space-y-1">
          <Label className="text-xs">Date of joining</Label>
          <Input type="date" value={options.defaults.dateOfJoining ?? ""} onChange={(e) => set("dateOfJoining", e.target.value)} className="h-8 text-xs" aria-label="Default date of joining" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 border-t pt-4">
        <label className="flex items-start gap-3 text-xs">
          <Switch checked={options.dayFirst} onCheckedChange={(c) => setOptions({ ...options, dayFirst: c })} />
          <span>
            <span className="block font-medium">Day-first dates</span>
            <span className="text-muted-foreground">Read 01/02/2026 as 1 February (off = January 2).</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function FilterTile({ active, onClick, label, value, icon: Icon, tone }: { active: boolean; onClick: () => void; label: string; value: number; icon: typeof Users; tone: "success" | "info" | "danger" | "warning" | "neutral" }) {
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
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-success bg-success text-white",
                current && "border-primary bg-primary text-primary-foreground",
                !done && !current && "text-muted-foreground",
              )}
            >
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

function FixRowDialog({ record, options, onClose, onSave }: { record: ValidatedRecord | null; options: ImportOptions; onClose: () => void; onSave: (v: Record<ImportFieldKey, string>) => void }) {
  const db = useDatabase();
  const today = useToday();
  const [draft, setDraft] = useState<Record<ImportFieldKey, string> | null>(null);
  const [key, setKey] = useState<number | null>(null);
  if (record && key !== record.rowNumber) {
    setKey(record.rowNumber);
    setDraft({ ...record.values });
  }
  if (!record && key !== null) {
    setKey(null);
    setDraft(null);
  }
  const live = useMemo(() => (record && draft ? validateRecords([{ rowNumber: record.rowNumber, values: draft, fullName: record.fullName }], db, today, options)[0] : null), [record, draft, db, today, options]);

  const lists: Partial<Record<ImportFieldKey, string[]>> = {
    department: db.departments.filter((d) => d.status === "active").map((d) => d.name),
    team: db.teams.filter((t) => t.status === "active" && (!live?.effective.department || db.departments.find((d) => d.name.toLowerCase() === live.effective.department.toLowerCase() || d.code.toLowerCase() === live.effective.department.toLowerCase())?.id === t.departmentId)).map((t) => t.name),
    band: db.bands.filter((b) => b.status === "active").map((b) => b.code),
    status: ["Active", "On Leave", "Inactive"],
  };

  return (
    <Dialog open={Boolean(record)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Correct row {record?.rowNumber}</DialogTitle>
          <DialogDescription>Edit values and they are re-validated live. Blank fields fall back to the defaults / existing record shown in grey. File-wide checks (duplicate IDs/emails) re-run when you save.</DialogDescription>
        </DialogHeader>
        {draft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => {
              const err = live?.errors[f.key];
              const opts = lists[f.key];
              const suggestions = live?.suggestions[f.key] ?? [];
              const effective = live?.effective[f.key] ?? "";
              const placeholder = f.key === "id" ? (live?.effectiveId ? `${live.effectiveId} (auto)` : "Auto-generated") : effective || (f.key === "dateOfJoining" ? "e.g. 20-Nov-2026" : undefined);
              return (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.header}</Label>
                  {opts ? (
                    <Select value={opts.find((o) => o.toLowerCase() === draft[f.key].toLowerCase()) ?? (draft[f.key] ? `__raw__${draft[f.key]}` : "__empty__")} onValueChange={(v) => setDraft({ ...draft, [f.key]: v === "__empty__" ? "" : v.replace(/^__raw__/, "") })}>
                      <SelectTrigger className="w-full" aria-invalid={Boolean(err)}>
                        <SelectValue placeholder={placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">{effective && !draft[f.key] ? `— Use ${effective} —` : "— Empty —"}</SelectItem>
                        {draft[f.key] && !opts.some((o) => o.toLowerCase() === draft[f.key].toLowerCase()) ? <SelectItem value={`__raw__${draft[f.key]}`}>{draft[f.key]} (from file)</SelectItem> : null}
                        {opts.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} aria-invalid={Boolean(err)} placeholder={placeholder} />
                  )}
                  {err ? <p className="text-[11px] text-danger">{err}</p> : null}
                  {err && suggestions.length ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">Did you mean:</span>
                      {suggestions.map((sg) => (
                        <Button key={sg} type="button" variant="outline" size="xs" onClick={() => setDraft({ ...draft, [f.key]: sg })}>
                          Use “{sg}”
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => draft && onSave(draft)}>
            <Check /> Save & re-validate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- master-data reconciliation ------------------------- */

const encodeDecision = (d: MasterDecision) => (d.action === "map" ? `map:${d.targetId}` : d.action);
const decodeDecision = (v: string): MasterDecision => (v.startsWith("map:") ? { action: "map", targetId: v.slice(4) } : { action: v as "create" | "skip" });

/** Unknown Department / Band values: create new, map to an existing record, or leave unresolved. */
function MasterReconcilePanel({ unknown, options, setOptions }: { unknown: UnknownMasterValue[]; options: ImportOptions; setOptions: (o: ImportOptions) => void }) {
  const db = useDatabase();
  const setDecision = (u: UnknownMasterValue, d: MasterDecision) => setOptions({ ...options, masterDecisions: { ...options.masterDecisions, [u.field]: { ...options.masterDecisions[u.field], [u.key]: d } } });
  const setSwitch = (field: MasterField, on: boolean) => setOptions({ ...options, createMaster: { ...options.createMaster, [field]: on } });
  const toCreate = unknown.filter((u) => u.decision.action === "create").length;
  const toMap = unknown.filter((u) => u.decision.action === "map").length;
  const unresolved = unknown.filter((u) => u.decision.action === "skip").length;

  return (
    <section className="card-elevated overflow-hidden" aria-label="Master data in your file">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal">
            <Layers className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Master data in your file</h3>
            <p className="text-xs text-muted-foreground">
              {unknown.length} Department / Band value(s) in the file are not in Master Data yet. Close matches (typos, abbreviations) are mapped to existing records; the rest can be created. Nothing is added until you import.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <ToneBadge tone="success">{toCreate} to create</ToneBadge>
          <ToneBadge tone="info">{toMap} mapped to existing</ToneBadge>
          <ToneBadge tone={unresolved ? "danger" : "neutral"}>{unresolved} unresolved</ToneBadge>
        </div>
      </div>
      {MASTER_FIELDS.map((field) => {
        const items = unknown.filter((u) => u.field === field);
        if (!items.length) return null;
        const meta = MASTER_META[field];
        const existing = masterOptions(field, db);
        return (
          <div key={field} className="border-b last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-5 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.plural}</span>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={options.createMaster[field]} onCheckedChange={(c) => setSwitch(field, c)} aria-label={`Create missing ${meta.plural}`} />
                <span className="font-medium">Create missing {meta.plural.toLowerCase()} in master data</span>
              </label>
            </div>
            <div className="divide-y">
              {items.map((u) => (
                <div key={u.key} className="grid items-center gap-x-4 gap-y-1.5 px-5 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_64px_minmax(0,1.2fr)_minmax(0,1.6fr)]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium" title={u.value}>
                      {u.value}
                    </div>
                    {u.variants.length > 1 ? <div className="truncate text-[11px] text-muted-foreground">also written: {u.variants.slice(1).join(", ")}</div> : null}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {u.rows} row{u.rows === 1 ? "" : "s"}
                  </div>
                  <div className="min-w-0 text-xs">
                    {u.suggestion ? (
                      <span>
                        Looks like <strong className="font-semibold">{u.suggestion.label}</strong> <span className="text-muted-foreground">({Math.round(u.suggestion.score * 100)}%)</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No close match</span>
                    )}
                  </div>
                  <Select value={encodeDecision(u.decision)} onValueChange={(v) => setDecision(u, decodeDecision(v))}>
                    <SelectTrigger size="sm" className="w-full text-xs" aria-label={`Action for ${u.value}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create" disabled={!options.createMaster[field]}>
                        Create new {meta.singular.toLowerCase()}
                      </SelectItem>
                      {existing.map((e) => (
                        <SelectItem key={e.id} value={`map:${e.id}`}>
                          Use existing: {e.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="skip">Leave unresolved (rows become invalid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** "Master data that will be created" (review step). */
function MasterPlanCard({ plan }: { plan: MasterPlan }) {
  const groups: { field: MasterField; items: MasterPlan["departments"] }[] = [
    { field: "department", items: plan.departments },
    { field: "band", items: plan.bands },
  ];
  return (
    <section className="card-elevated p-5" aria-label="Master data that will be created">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-teal-soft text-teal">
          <Layers className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Master data that will be created ({plan.total})</h3>
          <p className="text-xs text-muted-foreground">Added to Master Data → Departments / Employee Bands when you import.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(({ field, items }) =>
          items.length ? (
            <div key={field}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {MASTER_META[field].plural} · {items.length}
              </div>
              <ul className="space-y-1">
                {items.map((i) => (
                  <li key={i.syntheticId} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
                    <span className="truncate font-medium">
                      {i.name}
                      {i.code ? <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">{i.code}</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {i.rows} employee{i.rows === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

/** Summary step: what was added to Master Data. */
function MasterCreatedCard({ created }: { created: ImportWithMasterResult["createdMaster"] }) {
  const groups = [
    { field: "department" as const, items: created.departments.map((d) => `${d.name} (${d.code})`) },
    { field: "band" as const, items: created.bands.map((b) => `${b.code} · ${b.name}`) },
  ];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) return null;
  return (
    <section className="card-elevated p-5" aria-label="Master data created">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-success-soft text-success">
          <Layers className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Master data created ({total})</h3>
          <p className="text-xs text-muted-foreground">These records were added to Master Data during the import.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(({ field, items }) =>
          items.length ? (
            <div key={field}>
              <Link href={MASTER_META[field].href} className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary hover:underline">
                {MASTER_META[field].plural} · {items.length} <ArrowRight className="size-3" />
              </Link>
              <ul className="space-y-1">
                {items.map((n) => (
                  <li key={n} className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm font-medium">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}
