/**
 * Employee-import file loading — a thin layer over the shared flexible reader
 * (src/lib/import/sheet-parser.ts): any sheet, any header row, any column order.
 */
import {
  detectHeaderRow,
  ImportParseError,
  pickBestSheet,
  readImportFile,
  tableFromMatrix,
  type RawWorkbook,
} from "@/lib/import/sheet-parser";
import { HEADER_VOCABULARY } from "./fields";

export { ImportParseError };
export type { RawWorkbook };

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  sheetName: string;
  /** 0-based header row within the sheet. */
  headerRowIndex: number;
}

export async function loadWorkbook(file: File): Promise<RawWorkbook> {
  return readImportFile(file);
}

/** Best sheet + header row for a freshly loaded workbook. */
export function initialSelection(wb: RawWorkbook): { sheetIndex: number; headerRow: number } {
  const sheetIndex = pickBestSheet(wb.sheets, HEADER_VOCABULARY);
  return { sheetIndex, headerRow: detectHeaderRow(wb.sheets[sheetIndex].matrix, HEADER_VOCABULARY) };
}

/** Detected header row for a specific sheet (used when the user switches sheets). */
export function headerRowFor(wb: RawWorkbook, sheetIndex: number): number {
  return detectHeaderRow(wb.sheets[sheetIndex].matrix, HEADER_VOCABULARY);
}

/** Re-derive the table when the user changes sheet or header row. */
export function tableFor(wb: RawWorkbook, sheetIndex: number, headerRow: number): ParsedSheet {
  const sheet = wb.sheets[sheetIndex];
  const t = tableFromMatrix(sheet.matrix, headerRow);
  if (!t.rows.length) throw new ImportParseError("No data rows found below the header row. Pick a different header row or sheet.");
  return { headers: t.headers, rows: t.rows, sheetName: sheet.name, headerRowIndex: t.headerRowIndex };
}

/** Convenience: parse in one go with automatic sheet + header detection. */
export async function parseImportFile(file: File): Promise<ParsedSheet> {
  const wb = await loadWorkbook(file);
  const { sheetIndex, headerRow } = initialSelection(wb);
  return tableFor(wb, sheetIndex, headerRow);
}
