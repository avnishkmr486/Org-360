/**
 * Branded Excel export using ExcelJS (lazy-loaded so it never bloats first paint).
 */
import { format } from "date-fns";
import { downloadBlob, safeFileName } from "./download";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number;
  /** Excel number format, e.g. '0.0"%"' */
  numFmt?: string;
}

export interface ExcelExportOptions<T> {
  organizationName: string;
  title: string;
  subtitle?: string;
  filters?: string[];
  sheetName?: string;
  fileName: string;
  columns: ExportColumn<T>[];
  rows: T[];
  summary?: { label: string; value: string | number }[];
  footer?: string;
}

const NAVY = "FF0B2454";
const TEAL = "FF0D9488";

export async function exportToExcel<T>(opts: ExcelExportOptions<T>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = `${opts.organizationName} — Organization 360`;
  wb.created = new Date();
  const ws = wb.addWorksheet((opts.sheetName ?? opts.title).slice(0, 31).replace(/[\\/?*[\]:]/g, " "), {
    views: [{ state: "frozen", ySplit: 0 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const colCount = Math.max(opts.columns.length, 2);

  const banner = (text: string, size: number, bold: boolean, color: string, fill?: string) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, colCount);
    row.getCell(1).font = { name: "Calibri", size, bold, color: { argb: color } };
    if (fill) row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    row.height = size + 10;
    return row;
  };

  banner(opts.organizationName, 16, true, "FFFFFFFF", NAVY);
  banner(`Organization 360  ·  ${opts.title}`, 12, true, "FFFFFFFF", NAVY);
  if (opts.subtitle) banner(opts.subtitle, 10, false, "FF334155");
  banner(`Generated ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 9, false, "FF64748B");
  for (const f of opts.filters ?? []) banner(f, 9, false, "FF64748B");

  if (opts.summary?.length) {
    ws.addRow([]);
    for (const s of opts.summary) {
      const r = ws.addRow([s.label, s.value]);
      r.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
      r.getCell(2).font = { bold: true, color: { argb: TEAL } };
    }
  }
  ws.addRow([]);

  const header = ws.addRow(opts.columns.map((c) => c.header));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  header.height = 20;
  const headerRowNo = header.number;

  opts.rows.forEach((row, i) => {
    const r = ws.addRow(opts.columns.map((c) => c.value(row) ?? ""));
    if (i % 2 === 1) r.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FA" } }));
    opts.columns.forEach((c, ci) => {
      if (c.numFmt) r.getCell(ci + 1).numFmt = c.numFmt;
    });
  });

  opts.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.min(48, Math.max(12, c.header.length + 4));
  });
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: opts.columns.length } };
  ws.views = [{ state: "frozen", ySplit: headerRowNo }];

  ws.addRow([]);
  const foot = ws.addRow([opts.footer ?? `© ${new Date().getFullYear()} ${opts.organizationName}. Confidential.`]);
  foot.getCell(1).font = { italic: true, size: 9, color: { argb: "FF94A3B8" } };

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(opts.fileName)}.xlsx`);
}
