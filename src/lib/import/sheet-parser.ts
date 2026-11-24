/**
 * Flexible spreadsheet reader shared by every import wizard (employees, processes).
 *
 * Goal: accept files "in any format" — whatever layout the user already has —
 * and turn them into a clean header + rows table that the wizard can map.
 *
 *  - Formats: .xlsx / .xlsm / .xltx (ExcelJS), .csv / .tsv / .txt / .psv (delimiter auto-detected).
 *    Legacy binary .xls cannot be read in the browser → clear instruction to re-save.
 *  - Multiple sheets: all are returned; helpers pick the one that looks most like the target.
 *  - Banner/title rows above the real header are skipped (header row is detected from vocabulary).
 *  - Blank / duplicate headers are repaired; empty rows and empty trailing columns dropped.
 *  - Pure functions only (no React, no storage).
 */

export class ImportParseError extends Error {}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export interface RawSheet {
  name: string;
  matrix: string[][];
}

export interface RawWorkbook {
  fileName: string;
  format: "xlsx" | "delimited";
  sheets: RawSheet[];
}

export interface SheetTable {
  headers: string[];
  rows: string[][];
  /** 0-based index of the header row within the original sheet matrix. */
  headerRowIndex: number;
}

/* ------------------------------------------------------------------ */
/* Reading files                                                       */
/* ------------------------------------------------------------------ */

const XLSX_EXT = [".xlsx", ".xlsm", ".xltx", ".xltm"];
const TEXT_EXT = [".csv", ".tsv", ".txt", ".psv", ".dat"];

export const ACCEPTED_IMPORT_EXTENSIONS = [...XLSX_EXT, ...TEXT_EXT];
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMPORT_EXTENSIONS.join(",");

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Convert an ExcelJS cell value to display text. */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const d = value;
    const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
  }
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: string; error?: string };
    if (v.richText) return v.richText.map((r) => r.text).join("").trim();
    if (v.result !== undefined) return cellToText(v.result);
    if (v.text !== undefined) return cellToText(v.text);
    if (v.hyperlink) return v.hyperlink;
    return "";
  }
  return String(value).trim();
}

/** RFC-4180-style parser: quotes, escaped quotes, CRLF/LF, embedded newlines, BOM. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(src);
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (inQuotes) throw new ImportParseError("The file has an unterminated quoted field — check for a stray \" character.");
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => l.split(d).length);
    const consistent = counts.every((c) => c === counts[0]);
    const score = (counts[0] - 1) * (consistent ? 2 : 1);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export async function readImportFile(file: File): Promise<RawWorkbook> {
  if (file.size === 0) throw new ImportParseError("The file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportParseError("The file is larger than 10 MB.");
  const lower = file.name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";

  if (ext === ".xls") {
    throw new ImportParseError("Legacy .xls files can't be read in the browser. Open it in Excel and use File → Save As → Excel Workbook (.xlsx) or CSV, then upload again.");
  }
  if (ext === ".ods" || ext === ".numbers") {
    throw new ImportParseError(`${ext} files aren't supported. Export the sheet as .xlsx or CSV first.`);
  }

  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 4));
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK" → xlsx container
  const isOle = head[0] === 0xd0 && head[1] === 0xcf; // legacy .xls

  if (isOle) throw new ImportParseError("This looks like a legacy Excel (.xls) file. Re-save it as .xlsx or CSV and upload again.");

  if (XLSX_EXT.includes(ext) || isZip) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new ImportParseError("The file could not be read as an Excel workbook. It may be corrupted or password-protected.");
    }
    const sheets: RawSheet[] = [];
    for (const ws of wb.worksheets) {
      const width = Math.max(ws.columnCount, 1);
      const matrix: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const vals: string[] = [];
        for (let c = 1; c <= width; c++) vals.push(cellToText(row.getCell(c).value));
        if (vals.some((v) => v !== "")) matrix.push(vals);
      });
      if (matrix.length) sheets.push({ name: ws.name, matrix });
    }
    if (!sheets.length) throw new ImportParseError("The workbook has no sheets with data.");
    return { fileName: file.name, format: "xlsx", sheets };
  }

  if (TEXT_EXT.includes(ext) || ext === "") {
    const matrix = parseDelimited(new TextDecoder("utf-8").decode(buffer));
    if (!matrix.length) throw new ImportParseError("The file is empty.");
    return { fileName: file.name, format: "delimited", sheets: [{ name: ext === ".tsv" ? "TSV" : "Data", matrix }] };
  }

  throw new ImportParseError(`Unsupported file type "${ext}". Upload an Excel workbook (.xlsx) or a text file (.csv, .tsv, .txt).`);
}

/* ------------------------------------------------------------------ */
/* Header detection & tables                                           */
/* ------------------------------------------------------------------ */

export const normalizeKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isNumeric = (v: string) => /^-?[\d.,]+$/.test(v.trim());

/** How "header-like" is a row? Higher = more cells match the target vocabulary. */
export function scoreHeaderRow(row: string[], vocabulary: string[]): number {
  const cells = row.map((c) => c.trim()).filter(Boolean);
  if (cells.length < 2) return 0;
  let score = 0;
  for (const c of cells) {
    const n = normalizeKey(c);
    if (!n) continue;
    if (vocabulary.includes(n)) score += 3;
    else if (vocabulary.some((v) => v.length > 3 && (n.includes(v) || v.includes(n)))) score += 1.5;
    if (!isNumeric(c)) score += 0.25;
  }
  // Header rows are mostly text; data rows often contain numbers/dates.
  const numeric = cells.filter(isNumeric).length;
  return score - numeric * 0.5;
}

export function detectHeaderRow(matrix: string[][], vocabulary: string[]): number {
  const limit = Math.min(matrix.length, 40);
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const s = scoreHeaderRow(matrix[i], vocabulary);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  if (bestScore > 0) return best;
  // Nothing recognisable: first row with at least 2 filled cells.
  const idx = matrix.findIndex((r) => r.filter((c) => c.trim()).length >= 2);
  return idx < 0 ? 0 : idx;
}

/** Which sheet looks most like the target? Returns an index into `sheets`. */
export function pickBestSheet(sheets: RawSheet[], vocabulary: string[]): number {
  let best = 0;
  let bestScore = -1;
  sheets.forEach((sh, i) => {
    const hdr = detectHeaderRow(sh.matrix, vocabulary);
    const score = scoreHeaderRow(sh.matrix[hdr] ?? [], vocabulary) * 10 + Math.min(sh.matrix.length, 200) / 20;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

const colLetter = (i: number) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export function tableFromMatrix(matrix: string[][], headerRowIndex: number): SheetTable {
  const width = Math.max(...matrix.map((r) => r.length), 0);
  const rawHeaders = Array.from({ length: width }, (_, i) => (matrix[headerRowIndex]?.[i] ?? "").trim());
  const body = matrix.slice(headerRowIndex + 1).map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()));

  // Drop trailing columns that have no header and no data.
  let lastCol = width - 1;
  while (lastCol >= 0 && !rawHeaders[lastCol] && body.every((r) => !r[lastCol])) lastCol--;
  const keep = lastCol + 1;

  const seen = new Map<string, number>();
  const headers = rawHeaders.slice(0, keep).map((h, i) => {
    const base = h || `Column ${colLetter(i)}`;
    const key = base.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count > 1 ? `${base} (${count})` : base;
  });
  const rows = body.map((r) => r.slice(0, keep)).filter((r) => r.some((v) => v !== ""));
  return { headers, rows, headerRowIndex };
}

/* ------------------------------------------------------------------ */
/* Fuzzy matching                                                      */
/* ------------------------------------------------------------------ */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity — exact = 1; containment and edit distance both considered. */
export function similarity(a: string, b: string): number {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ed = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const contain = x.includes(y) || y.includes(x) ? 0.85 * (Math.min(x.length, y.length) / Math.max(x.length, y.length)) + 0.15 : 0;
  const xt = new Set(x.split(" "));
  const yt = new Set(y.split(" "));
  const inter = [...xt].filter((t) => yt.has(t)).length;
  const tokens = inter / Math.max(xt.size, yt.size);
  return Math.max(ed, contain, tokens * 0.9);
}

export interface Candidate {
  id: string;
  label: string;
  /** Extra strings that also identify the candidate (codes, aliases). */
  aliases?: string[];
}

/** Best candidates for a free-text value, e.g. "Engg" → "Engineering". */
export function closestMatches(value: string, candidates: Candidate[], limit = 3, min = 0.6): { candidate: Candidate; score: number }[] {
  const scored = candidates.map((c) => ({ candidate: c, score: Math.max(similarity(value, c.label), ...(c.aliases ?? []).map((a) => similarity(value, a))) }));
  return scored
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Exact (normalized) lookup across label + aliases. */
export function findExact(value: string, candidates: Candidate[]): Candidate | undefined {
  const n = normalizeKey(value);
  if (!n) return undefined;
  return candidates.find((c) => normalizeKey(c.label) === n || normalizeKey(c.id) === n || (c.aliases ?? []).some((a) => normalizeKey(a) === n));
}

/* ------------------------------------------------------------------ */
/* Value inference & parsing                                           */
/* ------------------------------------------------------------------ */

export type ColumnKind = "email" | "phone" | "date" | "number" | "id" | "boolean" | "text" | "empty";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function inferColumnKind(values: string[]): ColumnKind {
  const sample = values.map((v) => v.trim()).filter(Boolean).slice(0, 60);
  if (!sample.length) return "empty";
  const ratio = (fn: (v: string) => boolean) => sample.filter(fn).length / sample.length;
  if (ratio((v) => EMAIL.test(v)) >= 0.8) return "email";
  if (ratio((v) => /^([A-Za-z]{2,5}[-_ ]?\d{2,}|\d{2,}-\d{2,})$/.test(v)) >= 0.8) return "id";
  if (ratio((v) => parseFlexibleDate(v) !== null && !/^\d+$/.test(v)) >= 0.8) return "date";
  if (ratio((v) => /^\+?[\d\s().-]{7,}$/.test(v) && v.replace(/\D/g, "").length >= 7) >= 0.8) return "phone";
  if (ratio((v) => /^(yes|no|y|n|true|false|mandatory|optional)$/i.test(v)) >= 0.8) return "boolean";
  if (ratio((v) => /^-?\d+([.,]\d+)?$/.test(v)) >= 0.8) return "number";
  return "text";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2200 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse almost any human date: 2026-11-20, 20/11/2026, 20-Nov-2026, Nov 20 2026,
 * 20 November 2026, 11/20/2026 (when unambiguous) and Excel serial numbers.
 * Day-first is assumed for ambiguous numeric dates (01/02/2026 = 1 Feb).
 */
export function parseFlexibleDate(input: string, opts: { dayFirst?: boolean } = {}): string | null {
  const dayFirst = opts.dayFirst ?? true;
  const v = input.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, "");
  if (!v) return null;
  let m: RegExpMatchArray | null;

  if ((m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/))) {
    let a = +m[1];
    let b = +m[2];
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (a > 12 && b <= 12) return iso(y, b, a);
    if (b > 12 && a <= 12) return iso(y, a, b);
    if (!dayFirst) [a, b] = [b, a];
    return iso(y, b, a);
  }
  if ((m = v.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]{3,9})\.?,?[-/. ]+(\d{2,4})$/))) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (mon >= 0) return iso(y, mon + 1, +m[1]);
  }
  if ((m = v.match(/^([A-Za-z]{3,9})\.?[-/. ]+(\d{1,2})(?:st|nd|rd|th)?,?[-/. ]+(\d{2,4})$/))) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (mon >= 0) return iso(y, mon + 1, +m[2]);
  }
  // Excel serial date (days since 1899-12-30).
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return null;
}

/** "Priya Nair" → Priya / Nair; "Nair, Priya" → Priya / Nair; single token → first only. */
export function splitFullName(full: string): { first: string; last: string } {
  const v = full.trim().replace(/\s+/g, " ");
  if (!v) return { first: "", last: "" };
  if (v.includes(",")) {
    const [last, first] = v.split(",").map((s) => s.trim());
    return { first: first ?? "", last: last ?? "" };
  }
  const parts = v.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Split a cell holding several values: "A, B; C | D" or one per line. */
export function parseList(text: string): string[] {
  return text
    .split(/[\n;,|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseBoolean(v: string): boolean | null {
  const n = v.trim().toLowerCase();
  if (["yes", "y", "true", "1", "mandatory", "required", "x", "✓"].includes(n)) return true;
  if (["no", "n", "false", "0", "optional", "not required", ""].includes(n)) return false;
  return null;
}
