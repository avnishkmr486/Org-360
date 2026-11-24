/**
 * Turns an uploaded workbook (any layout) into: a processes table, an optional steps table,
 * and import records that link steps to processes. Pure functions — no React.
 */
import { detectHeaderRow, normalizeKey, pickBestSheet, scoreHeaderRow, tableFromMatrix, type RawSheet, type RawWorkbook, type SheetTable } from "@/lib/import/sheet-parser";
import { PROCESS_FIELDS, PROCESS_VOCABULARY, STEP_FIELDS, STEP_VOCABULARY, type Mapping, type ProcessFieldKey, type StepFieldKey } from "./fields";

export interface StepRow {
  /** 1-based data row number within the steps sheet. */
  rowNumber: number;
  values: Record<StepFieldKey, string>;
}

export interface ImportRecord {
  /** 1-based data row number within the processes sheet. */
  rowNumber: number;
  values: Record<ProcessFieldKey, string>;
  stepRows: StepRow[];
}

export interface PreparedImport {
  processSheet: number;
  /** null = no steps sheet. */
  stepsSheet: number | null;
  mainHeaderRow: number;
  stepsHeaderRow: number;
  main: SheetTable;
  steps: SheetTable | null;
  /** Detected automatically (true) or chosen by the user. */
  auto: { processSheet: boolean; stepsSheet: boolean };
}

export interface PrepareOptions {
  processSheet?: number;
  /** -1 = "no steps sheet", undefined = auto-detect. */
  stepsSheet?: number;
  mainHeaderRow?: number;
  stepsHeaderRow?: number;
}

const IGNORED_SHEET = /reference|instruction|readme|read me|lookup|legend|master data|valid values|help|cover/i;

type Role = "steps" | "process" | "ignore";

function classifySheet(sheet: RawSheet): Role {
  const hdr = detectHeaderRow(sheet.matrix, STEP_VOCABULARY);
  const row = sheet.matrix[hdr] ?? [];
  const stepScore = scoreHeaderRow(row, STEP_VOCABULARY);
  const procHdr = detectHeaderRow(sheet.matrix, PROCESS_VOCABULARY);
  const procScore = scoreHeaderRow(sheet.matrix[procHdr] ?? [], PROCESS_VOCABULARY);
  const hasStepHeader = row.some((c) => /\bstep\b/i.test(c)) || /^steps?$/i.test(sheet.name.trim());
  if (hasStepHeader && stepScore >= procScore * 0.9 && stepScore > 3) return "steps";
  if (IGNORED_SHEET.test(sheet.name) && sheet.matrix.length > 0) return "ignore";
  return "process";
}

export function prepareImport(wb: RawWorkbook, opts: PrepareOptions = {}): PreparedImport {
  const roles = wb.sheets.map(classifySheet);
  const processCandidates = wb.sheets.map((_, i) => i).filter((i) => roles[i] === "process");
  const pool = processCandidates.length ? processCandidates : wb.sheets.map((_, i) => i);

  let processSheet = opts.processSheet;
  const autoProcess = processSheet === undefined;
  if (processSheet === undefined) {
    const best = pickBestSheet(
      pool.map((i) => wb.sheets[i]),
      PROCESS_VOCABULARY,
    );
    processSheet = pool[best] ?? 0;
  }

  let stepsSheet: number | null;
  const autoSteps = opts.stepsSheet === undefined;
  if (opts.stepsSheet === undefined) {
    const idx = roles.findIndex((r, i) => r === "steps" && i !== processSheet);
    stepsSheet = idx >= 0 ? idx : null;
  } else stepsSheet = opts.stepsSheet < 0 || opts.stepsSheet === processSheet ? null : opts.stepsSheet;

  const mainMatrix = wb.sheets[processSheet].matrix;
  const mainHeaderRow = opts.mainHeaderRow ?? detectHeaderRow(mainMatrix, PROCESS_VOCABULARY);
  const main = tableFromMatrix(mainMatrix, mainHeaderRow);

  let steps: SheetTable | null = null;
  let stepsHeaderRow = 0;
  if (stepsSheet !== null) {
    const m = wb.sheets[stepsSheet].matrix;
    stepsHeaderRow = opts.stepsHeaderRow ?? detectHeaderRow(m, STEP_VOCABULARY);
    steps = tableFromMatrix(m, stepsHeaderRow);
  }
  return { processSheet, stepsSheet, mainHeaderRow, stepsHeaderRow, main, steps, auto: { processSheet: autoProcess, stepsSheet: autoSteps } };
}

const blankValues = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, ""])) as Record<K, string>;

export interface BuiltRecords {
  records: ImportRecord[];
  /** Step rows whose process name matched no process in the main sheet. */
  orphanSteps: StepRow[];
}

export function buildProcessRecords(main: SheetTable, mapping: Mapping<ProcessFieldKey>, steps: SheetTable | null, stepsMapping: Mapping<StepFieldKey> | null): BuiltRecords {
  const records: ImportRecord[] = main.rows.map((r, i) => {
    const values = blankValues(PROCESS_FIELDS.map((f) => f.key));
    for (const f of PROCESS_FIELDS) {
      const col = mapping[f.key];
      values[f.key] = col === null || col === undefined ? "" : (r[col] ?? "").trim();
    }
    return { rowNumber: i + 1, values, stepRows: [] };
  });

  const orphanSteps: StepRow[] = [];
  if (steps && stepsMapping && stepsMapping.processName !== null && stepsMapping.name !== null) {
    const byName = new Map<string, ImportRecord>();
    for (const rec of records) {
      const k = normalizeKey(rec.values.name);
      // For duplicate names the first occurrence receives the steps.
      if (k && !byName.has(k)) byName.set(k, rec);
    }
    steps.rows.forEach((r, i) => {
      const values = blankValues(STEP_FIELDS.map((f) => f.key));
      for (const f of STEP_FIELDS) {
        const col = stepsMapping[f.key];
        values[f.key] = col === null || col === undefined ? "" : (r[col] ?? "").trim();
      }
      const row: StepRow = { rowNumber: i + 1, values };
      const rec = byName.get(normalizeKey(values.processName));
      if (rec) rec.stepRows.push(row);
      else orphanSteps.push(row);
    });
    // Order by step number when present, otherwise keep file order.
    for (const rec of records) {
      rec.stepRows = rec.stepRows
        .map((s, idx) => ({ s, idx }))
        .sort((a, b) => {
          const an = Number(a.s.values.stepNo);
          const bn = Number(b.s.values.stepNo);
          if (!Number.isNaN(an) && !Number.isNaN(bn) && a.s.values.stepNo && b.s.values.stepNo && an !== bn) return an - bn;
          return a.idx - b.idx;
        })
        .map((x) => x.s);
    }
  }
  return { records, orphanSteps };
}
